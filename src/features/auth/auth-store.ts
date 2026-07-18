import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase/client';

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

  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
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

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isInitializing: true,
  isSubmitting: false,

  /**
   * Subscribes to auth changes and resolves the persisted session.
   *
   * - Returns: an unsubscribe function for the caller's cleanup.
   */
  initialize: () => {
    // Registered before `getSession()` so that a refresh completing mid-call
    // cannot slip through between the read and the subscription.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, isInitializing: false });
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
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
    } finally {
      set({ isSubmitting: false });
    }
  },
}));
