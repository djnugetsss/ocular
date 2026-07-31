/**
 * How long a toast holds before it starts leaving.
 *
 * Extracted from the component so the rule can be tested without a renderer —
 * the same pure-logic pattern `session-aggregator` and `scan-coaching` follow.
 */

/** 250 ms in, 3 s hold, 200 ms out (DESIGN_REVIEW.md §6 motion table). */
export const ENTER_MS = 250;
export const HOLD_MS = 3000;
export const EXIT_MS = 200;

/**
 * §6's 3 s was written against the scan toasts, the longest of which
 * ("Under 10 seconds — too short to measure.") is 40 characters. A flat hold is
 * really a reading deadline, and any notice appreciably longer would inherit a
 * deadline it was never measured against — the reader would still be mid-
 * sentence when it began to fade.
 *
 * Past a 44-character baseline the hold grows ~45 ms per character, which
 * tracks unhurried reading (~13 characters/second at the caption size this
 * renders at). The baseline is set just above today's longest notice, so this
 * changes the timing of nothing currently in the app — it only stops a future
 * longer string from being under-held. Capped so a notice can never camp on
 * screen over a live camera.
 */
const BASELINE_CHARS = 44;
const MS_PER_EXTRA_CHAR = 45;
export const MAX_HOLD_MS = 6000;

export function holdFor(message: string): number {
  const overflow = Math.max(0, message.length - BASELINE_CHARS);
  return Math.min(HOLD_MS + overflow * MS_PER_EXTRA_CHAR, MAX_HOLD_MS);
}
