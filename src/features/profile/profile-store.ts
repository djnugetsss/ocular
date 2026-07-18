import { create } from 'zustand';

import { getProfile, updateProfile } from '@/features/profile/profile-repository';
import type { Profile, ProfileUpdate } from '@/lib/supabase/database.types';

/**
 * The signed-in user's profile and preferences.
 *
 * Separate from `auth-store` on purpose: authentication is about *whether* the
 * user is signed in, and Supabase owns that. This is about *who they are and
 * what they chose*, which lives in our own table and has its own loading and
 * failure modes. Merging them would make every auth state change wait on a
 * database round trip.
 *
 * The root layout's routing gate reads `status` and `profile.onboarded_at`, so
 * the state machine here is deliberately explicit — an ambiguous
 * "loaded or not?" is what produces a flash of the wrong screen at launch.
 */
export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ProfileState {
  profile: Profile | null;
  status: ProfileStatus;
  error: string | null;

  load: (userId: string) => Promise<void>;
  /** Awaits the write and throws on failure. For user-initiated saves. */
  save: (patch: ProfileUpdate) => Promise<void>;
  /**
   * Applies locally at once and writes in the background, ignoring failures.
   * For incidental state like onboarding progress, where blocking navigation on
   * a network round trip would be worse than losing the write.
   */
  saveInBackground: (patch: ProfileUpdate) => void;
  clear: () => void;
}

/**
 * Retries for the signup race.
 *
 * The profile row is created by a database trigger on `auth.users` insert. Just
 * after signup that trigger may not have committed by the time the client asks
 * for the row, which reads as a legitimate `null` rather than an error. Without
 * a retry, a brand-new user lands on a broken screen on the single most
 * important launch of their relationship with the app.
 */
const MISSING_ROW_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 250;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  status: 'idle',
  error: null,

  load: async (userId) => {
    set({ status: 'loading', error: null });

    for (let attempt = 0; attempt <= MISSING_ROW_RETRIES; attempt += 1) {
      try {
        const profile = await getProfile(userId);

        if (profile) {
          set({ profile, status: 'ready', error: null });
          return;
        }

        // Row genuinely absent. Back off and look again — unless we are out of
        // attempts, in which case this is a real problem worth surfacing.
        if (attempt < MISSING_ROW_RETRIES) {
          await wait(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }

        set({
          profile: null,
          status: 'error',
          error: 'Your profile could not be found. Try signing out and back in.',
        });
        return;
      } catch (cause) {
        // A thrown error is a transport or permission failure, not a missing
        // row; retrying will not help, so fail immediately with the message.
        set({
          profile: null,
          status: 'error',
          error: cause instanceof Error ? cause.message : 'Could not load your profile.',
        });
        return;
      }
    }
  },

  save: async (patch) => {
    const current = get().profile;
    if (!current) {
      throw new Error('Cannot save preferences before the profile has loaded.');
    }

    const updated = await updateProfile(current.id, patch);
    set({ profile: updated });
  },

  saveInBackground: (patch) => {
    const current = get().profile;
    if (!current) return;

    // Local first: the UI reflects the change immediately and never waits.
    set({ profile: { ...current, ...patch } as Profile });

    void updateProfile(current.id, patch).catch(() => {
      // Intentionally silent. This path carries only recoverable, low-stakes
      // state (onboarding progress); the worst case is that a user who force
      // -quits mid-flow resumes one screen earlier than they left off.
    });
  },

  clear: () => set({ profile: null, status: 'idle', error: null }),
}));
