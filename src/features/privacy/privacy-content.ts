import type { SFSymbol } from 'expo-symbols';

/**
 * The privacy contract, in one place (PRODUCT_SPEC.md §4.6, DESIGN_REVIEW.md §5).
 *
 * Onboarding and Profile previously stated the same three promises in
 * different words. That is worse than it sounds: these are *commitments about
 * user data*, and a user who reads one wording at signup and a different one
 * six weeks later has no way to tell whether the product changed or the copy
 * merely drifted. One source means a change to what the app does forces a
 * change to what it says, everywhere, at once.
 *
 * Every claim below is a literal description of the implementation — frames
 * are analyzed on the capture queue and discarded, and only the scalars in the
 * `sessions` table are written. **If that stops being true, this file must
 * change before the code ships.**
 */

export interface PrivacyPromise {
  symbol: SFSymbol;
  title: string;
  body: string;
}

export const PRIVACY_PROMISES: readonly PrivacyPromise[] = [
  {
    symbol: 'cpu',
    title: 'Analyzed, then discarded',
    body: "Frames are analyzed in your iPhone's memory and immediately discarded. Nothing is recorded.",
  },
  {
    symbol: 'icloud.slash',
    title: 'Nothing is uploaded',
    body: 'No image, video, or face geometry is ever stored or uploaded.',
  },
  {
    symbol: 'checkmark.shield',
    title: 'You own the numbers',
    body: 'Only summary numbers — blink counts, rates, head angles — sync to your account. Export or delete them anytime in Profile, including your whole account.',
  },
] as const;

/**
 * The same contract as one paragraph, for surfaces with no room for the
 * three-row treatment. Says nothing the rows do not.
 */
export const PRIVACY_SUMMARY =
  'Camera frames are analyzed entirely on this device and immediately discarded. No image, video, or face geometry is ever recorded or uploaded — only summary numbers like blink counts and head angles sync to your account.';
