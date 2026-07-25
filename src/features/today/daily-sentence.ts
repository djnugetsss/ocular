import type { BlinkDelta } from '@/features/sessions/baseline';
import { thresholds } from '@/theme/tokens';

/**
 * The Today hero sentence (PRODUCT_SPEC.md §4.2 "sentence logic").
 *
 * Deterministic and pure: one sentence from today's aggregates, no LLM, no
 * network, no randomness — the same day always reads the same way. Tone
 * rules: behavioral, never diagnostic ("your eyes may feel it later," never
 * "abnormal"), invitational when nothing is measured yet, and celebration
 * never outranks a genuinely low reading — a met target with strained eyes
 * is not a win worth claiming.
 */
export interface DailySentenceInput {
  /** Sessions recorded today. */
  todayCount: number;
  /** The profile's `daily_target_sessions`. */
  targetCount: number;
  /** Today's duration-weighted blink rate, `null` when nothing measured. */
  todayRate: number | null;
  /** Yesterday's duration-weighted rate, `null` when yesterday had none. */
  yesterdayRate: number | null;
  /** Whether any session exists at all, ever. */
  hasHistory: boolean;
  /** Today vs. the trailing baseline, `null` when the comparison is unearned. */
  delta: BlinkDelta | null;
}

export function dailySentence(input: DailySentenceInput): string {
  const { todayCount, targetCount, todayRate, yesterdayRate, hasHistory, delta } = input;

  // First-ever state: the ring is empty and so is the promise of a baseline.
  if (!hasHistory) return 'Run your first scan to see your baseline.';

  // Nothing today yet. Reference yesterday when it produced a number —
  // continuity is the hook — otherwise a plain invitation.
  if (todayCount === 0) {
    if (yesterdayRate != null) {
      return `Yesterday you averaged ${Math.round(yesterdayRate)}/min — ready when you are.`;
    }
    return 'First check-in of the day is ready when you are.';
  }

  // A notably low day outranks everything below, including a met target
  // (mirrors §4.2's recommendation precedence).
  if (todayRate != null && todayRate < thresholds.blinkRate.low) {
    return 'Blinking is running low today — your eyes may feel it later.';
  }

  if (todayCount >= targetCount) {
    if (delta?.direction === 'near') {
      return 'Target met — your blink rate is holding near your usual.';
    }
    return 'Target met for today. Nice, steady rhythm.';
  }

  if (delta) {
    switch (delta.direction) {
      case 'near':
        return 'Your blink rate is holding near your baseline.';
      case 'below':
        return 'Blinking a little below your usual — a screen break may help.';
      case 'above':
        return 'Blinking comfortably above your usual today.';
    }
  }

  // No baseline to compare against (young history): read the absolute band.
  if (todayRate != null && todayRate < thresholds.blinkRate.good) {
    return 'Blink rate is a touch low so far — a short break may help.';
  }
  return 'Off to a steady start today.';
}
