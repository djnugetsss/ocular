import * as Linking from 'expo-linking';
import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase/client';

/**
 * Where Supabase's email links come back to.
 *
 * Built from the app's own scheme (`ocular://` in production, `ocular-dev://`
 * and `ocular-preview://` in the other variants — see `app.config.ts`), so a
 * side-by-side install returns to the build that sent the mail rather than
 * whichever one iOS happens to pick.
 *
 * **Every variant's URL must be listed in Supabase → Authentication → URL
 * Configuration → Redirect URLs.** An unlisted redirect is silently replaced
 * with the project's Site URL, which is how "the link opens a browser and
 * never reaches the app" happens.
 *
 * `/callback` is `app/(auth)/callback.tsx` — route groups do not appear in the
 * URL, so the path has no `(auth)` segment in it.
 *
 * Computed per call rather than once at module scope: `createURL` *throws* when
 * the expo-constants manifest is not resolvable, and at module scope that turns
 * a configuration problem into an unrecoverable crash the moment anything
 * imports this store — which, via the routing gate, is app launch. Called from
 * inside the two auth requests instead, it can only fail where there is already
 * a `try`/`catch` and a user to tell.
 *
 * `flow` is the app's own marker rather than a Supabase-forwarded `type`: the
 * callback has to know whether to hand the user to the app or to the "set a new
 * password" screen, and getting that wrong strands them signed in with the
 * password they could not remember.
 */
export function authRedirectUrl(flow?: 'recovery'): string {
  return Linking.createURL('/callback', flow ? { queryParams: { flow } } : undefined);
}

/**
 * Authentication state.
 *
 * Supabase's `onAuthStateChange` is the single source of truth. Sign-in and
 * sign-out methods deliberately do *not* set `session` themselves — they call
 * Supabase and let the resulting event update the store. Writing state in both
 * places is how you get a UI that briefly shows a signed-in shell before the
 * listener corrects it, or worse, a signed-in UI after a token refresh silently
 * failed.
 */
interface AuthState {
  session: Session | null;
  user: User | null;
  /**
   * True until the persisted session has been read from the Keychain. The
   * router blocks on this: navigating before it resolves flashes the sign-in
   * screen at every cold start for users who are already authenticated.
   */
  isInitializing: boolean;
  /** True while a sign-in/up/out request is in flight. */
  isSubmitting: boolean;
  /**
   * True between opening a password-recovery link and setting the new password.
   *
   * A recovery link signs the user *in* — that is how Supabase authorizes the
   * password change. The routing gate would normally see that session and send
   * them straight into the app, replacing the reset screen out from under them
   * and spending the single-use link for nothing. This flag suspends that one
   * rule, and nothing else.
   */
  isRecovering: boolean;

  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Marks a recovery session as in progress. Called by the callback route. */
  beginRecovery: () => void;
  /** Sets the new password and ends the recovery hold. */
  completeRecovery: (password: string) => Promise<void>;
  /** Abandons a recovery without changing the password; signs the user out. */
  cancelRecovery: () => Promise<void>;
}

/**
 * Turns a Supabase auth error into something worth showing a user.
 *
 * Supabase returns deliberately vague messages for credential failures to avoid
 * leaking whether an account exists. That vagueness is correct and is preserved
 * here; the mapping exists to replace genuinely unhelpful strings and to give
 * network failures an actionable message.
 */
export function describeAuthError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Something went wrong. Please try again.';
  }

  const message = error.message.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return 'That email and password combination did not match an account.';
  }
  if (message.includes('email not confirmed')) {
    return 'Check your inbox and confirm your email address before signing in.';
  }
  if (message.includes('user already registered')) {
    return 'An account already exists for that email. Try signing in instead.';
  }
  if (message.includes('password should be at least')) {
    return 'Passwords must be at least 8 characters.';
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  return error.message;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isInitializing: true,
  isSubmitting: false,
  isRecovering: false,

  /**
   * Subscribes to auth changes and resolves the persisted session.
   *
   * - Returns: an unsubscribe function for the caller's cleanup.
   */
  initialize: () => {
    // Registered before `getSession()` so that a refresh completing mid-call
    // cannot slip through between the read and the subscription.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
        isInitializing: false,
        // Losing the session ends any recovery hold with it — otherwise a
        // sign-out mid-reset would leave the gate suspended and strand the app
        // on a screen it can no longer authorize.
        ...(session ? null : { isRecovering: false }),
      });
    });

    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        set({ session, user: session?.user ?? null, isInitializing: false });
      })
      .catch(() => {
        // A failed read means no usable session — most often a Keychain miss
        // after a restore onto a new device. Fall through to signed-out rather
        // than leaving the app stuck on the splash screen.
        set({ session: null, user: null, isInitializing: false });
      });

    return () => data.subscription.unsubscribe();
  },

  signIn: async (email, password) => {
    set({ isSubmitting: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } finally {
      set({ isSubmitting: false });
    }
  },

  signUp: async (email, password, displayName) => {
    set({ isSubmitting: true });
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Read by the handle_new_user() trigger to seed the profile row.
          data: { display_name: displayName.trim() },
          // Without this the confirmation link resolves to the project's Site
          // URL — a web address this app does not serve — and the account can
          // never be confirmed from a phone.
          emailRedirectTo: authRedirectUrl(),
        },
      });
      if (error) throw error;
    } finally {
      set({ isSubmitting: false });
    }
  },

  signOut: async () => {
    set({ isSubmitting: true });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } finally {
      set({ isSubmitting: false });
    }
  },

  resetPassword: async (email) => {
    set({ isSubmitting: true });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: authRedirectUrl('recovery'),
      });
      if (error) throw error;
    } finally {
      set({ isSubmitting: false });
    }
  },

  beginRecovery: () => set({ isRecovering: true }),

  completeRecovery: async (password) => {
    set({ isSubmitting: true });
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Released only after the write succeeds. Clearing it first would let
      // the gate navigate away while the request was still in flight, hiding
      // a failure the user needs to see and act on.
      set({ isRecovering: false });
    } finally {
      set({ isSubmitting: false });
    }
  },

  cancelRecovery: async () => {
    // Sign out rather than simply dropping the flag: the recovery session was
    // granted to authorize one password change, and letting it fall through
    // into the app would turn a password-reset email into a way to enter an
    // account without knowing its password.
    set({ isRecovering: false });
    if (!get().session) return;
    try {
      await supabase.auth.signOut();
    } catch {
      // The gate keys off the session, and a failed sign-out leaves it intact;
      // the listener corrects the store either way. Nothing to surface here.
    }
  },
}));
