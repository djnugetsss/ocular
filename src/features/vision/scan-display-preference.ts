import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Whether the scan shows the live camera preview or covers it.
 *
 * Purely a *display* choice: both modes run the identical capture and Vision
 * pipeline, and the scan screen enforces that by never touching `isActive` —
 * it paints an opaque cover over a preview that keeps running underneath.
 * Blink rate, fatigue, and head posture are measured the same either way.
 *
 * - `face` — the live preview stays visible for the whole session. This is
 *   the behavior the app has always had, so it is the default.
 * - `hidden` — the preview is covered for the whole session, leaving the
 *   privacy badge, the status pill, and the footer clock.
 */
export type ScanDisplayMode = 'face' | 'hidden';

/**
 * Device-local rather than a `profiles` column.
 *
 * The sibling preferences on this screen (`default_session_seconds`,
 * `show_landmarks`) live in Supabase, but those describe how a *session* is
 * measured and are worth syncing. This one describes what a particular phone
 * on a particular desk shows while it sits there — the answer can reasonably
 * differ between a private desk and a shared space, and it should not need a
 * network round trip or a migration to change.
 */
const STORAGE_KEY = 'ocular.scan.displayMode';

/** Unknown stored strings fail back to the default rather than propagating. */
function asDisplayMode(value: unknown): ScanDisplayMode | null {
  return value === 'face' || value === 'hidden' ? value : null;
}

interface ScanDisplayPreferenceState {
  mode: ScanDisplayMode;
  /**
   * False until the stored value has been read once. The scan screen does not
   * gate on this — it renders the default immediately — but it exists so a
   * late read cannot be mistaken for a user choice.
   */
  isLoaded: boolean;
  load: () => Promise<void>;
  setMode: (mode: ScanDisplayMode) => void;
}

export const useScanDisplayPreference = create<ScanDisplayPreferenceState>((set, get) => ({
  mode: 'face',
  isLoaded: false,

  /**
   * Reads the stored choice. Safe to call on every mount: once loaded it
   * never re-reads, so returning to the tab mid-app cannot clobber a choice
   * made a moment ago with a slower disk read.
   */
  load: async () => {
    if (get().isLoaded) return;
    try {
      const stored = asDisplayMode(await AsyncStorage.getItem(STORAGE_KEY));
      // Re-checked after the await: a tap that landed while the read was in
      // flight is the newer intent and must win.
      if (get().isLoaded) return;
      set({ mode: stored ?? 'face', isLoaded: true });
    } catch {
      // A failed read is not a failed scan — fall back to the default and
      // let the next write repair the stored value.
      set({ isLoaded: true });
    }
  },

  /**
   * Applies at once and writes in the background, mirroring the profile
   * store's `saveInBackground`: blocking a toggle on storage would make the
   * control feel broken for a preference that costs nothing to lose.
   */
  setMode: (mode) => {
    set({ mode, isLoaded: true });
    void AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  },
}));
