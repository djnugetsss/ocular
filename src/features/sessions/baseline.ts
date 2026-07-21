import type { SFSymbol } from 'expo-symbols';

import { thresholds, type Tone } from '@/theme/tokens';
import type { Session } from '@/lib/supabase/database.types';

/**
 * Trailing-baseline math for session results (PRODUCT_SPEC.md §4.4).
 *
 * Pure functions with no React or network dependencies, following the
 * `session-aggregator` precedent: everything here is decidable from its
 * arguments, so the verdict a user reads can be pinned down in a unit test
 * instead of discovered on a device.
 *
 * "Baseline" here means *the user's own recent history*, not a population
 * norm — the app compares you with you. Absolute thresholds from the theme
 * are used only when history is missing or comparison would be dishonest.
 */

/** Sessions the trailing baseline averages over, newest first. */
export const TRAILING_BASELINE_COUNT = 14;

/**
 * Prior sessions required before a percent-comparison is spoken. Below this,
 * "20% below your usual" would be precision invented from two data points.
 */
export const MIN_BASELINE_SESSIONS = 3;

/** Deltas smaller than this read as "near your usual", not a change. */
const NEAR_BASELINE_PERCENT = 5;

/** Deltas at or past this are worth a sentence — and a toned chip — of their own. */
export const SIGNIFICANT_DELTA_PERCENT = 20;

/** The minimal slice of a session row the baseline math reads. */
export type BaselineSourceSession = Pick<
  Session,
  'id' | 'started_at' | 'duration_seconds' | 'blink_count'
>;

export interface TrailingBaseline {
  /** Duration-weighted blinks per minute across the window. */
  blinksPerMinute: number;
  /** How many sessions the figure is built from (≤ TRAILING_BASELINE_COUNT). */
  sessionCount: number;
}

/**
 * Duration-weighted blink rate across a set of sessions, or `null` when no
 * measured time exists. Weighted rather than averaged per-session so a
 * 30-second check-in cannot count as much as a 20-minute one — the same rule
 * the Today screen applies to its daily figure.
 */
export function durationWeightedBlinkRate(
  sessions: readonly Pick<Session, 'duration_seconds' | 'blink_count'>[]
): number | null {
  let blinks = 0;
  let minutes = 0;
  for (const session of sessions) {
    if (session.duration_seconds == null || session.duration_seconds <= 0) continue;
    blinks += session.blink_count;
    minutes += session.duration_seconds / 60;
  }
  return minutes > 0 ? blinks / minutes : null;
}

/**
 * Computes the trailing baseline for a session: the duration-weighted blink
 * rate over up to `TRAILING_BASELINE_COUNT` sessions that *precede* it.
 *
 * The session under review is excluded — by id and by start time — because a
 * baseline that includes the measurement being judged is circular: every
 * session would be pulled toward "usual" by its own contribution.
 *
 * Returns `null` when no usable prior session exists (the first-ever
 * check-in), which callers must treat as "this session IS the baseline".
 */
export function trailingBaseline(
  sessions: readonly BaselineSourceSession[],
  current: { id?: string | null; startedAt: Date }
): TrailingBaseline | null {
  const cutoff = current.startedAt.getTime();

  const prior = sessions
    .filter(
      (session) =>
        session.id !== current.id &&
        new Date(session.started_at).getTime() < cutoff &&
        session.duration_seconds != null &&
        session.duration_seconds > 0
    )
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, TRAILING_BASELINE_COUNT);

  const rate = durationWeightedBlinkRate(prior);
  if (rate === null) return null;

  return { blinksPerMinute: rate, sessionCount: prior.length };
}

export interface BlinkDelta {
  /** Signed percent change vs. baseline, rounded to an integer. */
  percent: number;
  direction: 'above' | 'below' | 'near';
  /** Chip-ready text, e.g. "12% below usual". */
  label: string;
}

/**
 * The session's blink rate relative to baseline, or `null` when the
 * comparison should not be shown at all: no rate, no baseline, too few prior
 * sessions for honest precision, or a zero baseline (a percent of zero is
 * not a number a person can use).
 */
export function blinkRateDelta(
  blinksPerMinute: number | null,
  baseline: TrailingBaseline | null
): BlinkDelta | null {
  if (blinksPerMinute == null || baseline == null) return null;
  if (baseline.sessionCount < MIN_BASELINE_SESSIONS) return null;
  if (baseline.blinksPerMinute <= 0) return null;

  const percent = Math.round(
    ((blinksPerMinute - baseline.blinksPerMinute) / baseline.blinksPerMinute) * 100
  );

  if (Math.abs(percent) < NEAR_BASELINE_PERCENT) {
    return { percent, direction: 'near', label: 'near your usual' };
  }
  return {
    percent,
    direction: percent > 0 ? 'above' : 'below',
    label: `${Math.abs(percent)}% ${percent > 0 ? 'above' : 'below'} usual`,
  };
}

export interface SessionVerdict {
  /** One plain-English sentence. Behavioral, never alarmist, never medical. */
  sentence: string;
  tone: Tone;
  symbol: SFSymbol;
}

/**
 * The hero verdict: one sentence describing this session against the user's
 * own history.
 *
 * Rule order matters and is part of the contract:
 * 1. No measurable rate — say so; a missing measurement is never scored.
 * 2. No prior history — this session *is* the baseline.
 * 3. Too little history — comparisons are deferred, not faked.
 * 4. Absolutely low rate — takes precedence over relative deltas, because
 *    "near your usual" is cold comfort when usual is far below typical.
 * 5./6. Significant delta below/above baseline.
 * 7. Holding steady.
 */
export function sessionVerdict(
  metrics: { blinksPerMinute: number | null },
  baseline: TrailingBaseline | null
): SessionVerdict {
  const rate = metrics.blinksPerMinute;

  if (rate == null) {
    return {
      sentence: 'Not enough face time this session to measure a blink rate.',
      tone: 'neutral',
      symbol: 'questionmark.circle',
    };
  }

  if (baseline === null) {
    return {
      sentence: 'This is your baseline. Future check-ins compare against it.',
      tone: 'neutral',
      symbol: 'sparkles',
    };
  }

  if (baseline.sessionCount < MIN_BASELINE_SESSIONS) {
    return {
      sentence: 'Still building your baseline — comparisons sharpen after a few more check-ins.',
      tone: 'neutral',
      symbol: 'sparkles',
    };
  }

  if (rate < thresholds.blinkRate.low) {
    return {
      sentence: 'Blink rate ran well below typical — your eyes may feel it later.',
      tone: 'bad',
      symbol: 'eye',
    };
  }

  const delta = blinkRateDelta(rate, baseline);

  if (delta && delta.percent <= -SIGNIFICANT_DELTA_PERCENT) {
    return {
      sentence: `Blink rate ${Math.abs(delta.percent)}% below your usual — a sign of hard focus.`,
      tone: 'warn',
      symbol: 'arrow.down.right',
    };
  }

  if (delta && delta.percent >= SIGNIFICANT_DELTA_PERCENT) {
    return {
      sentence: `Blink rate ${delta.percent}% above your usual — relaxed eyes this session.`,
      tone: 'ok',
      symbol: 'arrow.up.right',
    };
  }

  return {
    sentence: 'Blink rate holding near your usual.',
    tone: 'ok',
    symbol: 'checkmark.circle',
  };
}

/**
 * Fallback verdict for when the baseline could not be *loaded* (as opposed to
 * not existing). Compares against the absolute thresholds only, and never
 * claims anything about "your usual" — a network failure must not be
 * mistaken for a first-ever session.
 */
export function verdictWithoutBaseline(metrics: {
  blinksPerMinute: number | null;
}): SessionVerdict {
  const rate = metrics.blinksPerMinute;

  if (rate == null) {
    return {
      sentence: 'Not enough face time this session to measure a blink rate.',
      tone: 'neutral',
      symbol: 'questionmark.circle',
    };
  }
  if (rate < thresholds.blinkRate.low) {
    return {
      sentence: 'Blink rate ran well below typical — your eyes may feel it later.',
      tone: 'bad',
      symbol: 'eye',
    };
  }
  if (rate < thresholds.blinkRate.good) {
    return {
      sentence: 'Blink rate came in on the low side of typical.',
      tone: 'warn',
      symbol: 'eye',
    };
  }
  return {
    sentence: 'Blink rate in the typical resting range.',
    tone: 'ok',
    symbol: 'checkmark.circle',
  };
}
