import { durationWeightedBlinkRate } from '@/features/sessions/baseline';
import type { Session } from '@/lib/supabase/database.types';

/**
 * The columns this module reads — structurally the repository's list
 * projection. Declared as a `Pick` rather than taking a whole `Session` so
 * the aggregator cannot silently start depending on a column the list query
 * does not fetch: adding a field here is a type error until the projection
 * fetches it.
 */
export type AnalyzableSession = Pick<
  Session,
  | 'id'
  | 'started_at'
  | 'duration_seconds'
  | 'blink_count'
  | 'blinks_per_minute'
  | 'mean_yaw'
  | 'mean_pitch'
  | 'mean_roll'
  | 'posture_score'
>;

/**
 * Longitudinal aggregation for the Insights tab (PRODUCT_SPEC.md §4.5).
 *
 * Pure functions over plain session rows — no React, no Supabase, no clock
 * of its own (`now` is always a parameter). This mirrors `session-aggregator`
 * and `baseline`: the math that decides what the user is told about their own
 * body is the part that must be unit-testable, so none of it may hide inside
 * a component.
 *
 * Two rules run through everything here:
 *
 * 1. **Gaps are not zeros.** A day without a check-in is missing data, not a
 *    day of zero blinking. It is absent from the series; it never averages in.
 * 2. **No fake precision.** Every derived figure returns `null` when its
 *    inputs cannot support it, and comparisons refuse to render below a
 *    minimum sample. An honest blank beats a confident wrong number.
 */

export type InsightsRange = 'W' | 'M' | '6M';

/** Window length in days. 6M is 182 days — half of 365, not six calendar months. */
export const RANGE_DAYS: Record<InsightsRange, number> = { W: 7, M: 30, '6M': 182 };

export const RANGE_DESCRIPTIONS: Record<InsightsRange, string> = {
  W: 'Past week',
  M: 'Past month',
  '6M': 'Past six months',
};

/**
 * Sessions the previous window must contain before a comparison is shown
 * (spec §4.5: "suppressed when the previous range has < 5 sessions").
 */
export const MIN_COMPARISON_SESSIONS = 5;

/** Sessions required before the time-of-day pattern card renders at all. */
export const MIN_PATTERN_SESSIONS = 10;

/** Sessions required before any chart or trend renders (spec §4.5 empty state). */
export const MIN_SESSIONS_FOR_TRENDS = 3;

/**
 * Angular deviation, in degrees, treated as fully unsteady. Mirrors the
 * `POSTURE_DEVIATION_CEILING` the session aggregator scores frames against,
 * so a head-steadiness figure and a posture score cannot tell contradictory
 * stories about the same sessions.
 */
const HEAD_DEVIATION_CEILING = 30;

/**
 * Coefficient of variation treated as fully inconsistent. A CV of 0.5 means
 * session-to-session blink rates swing by roughly half the mean, which is as
 * scattered as a real user's readings get before something is wrong with the
 * measurement rather than the user.
 */
const CONSISTENCY_CV_CEILING = 0.5;

export interface RangeBounds {
  /** Inclusive, at local midnight. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

/**
 * The window for a range, ending *now* and starting at local midnight
 * `RANGE_DAYS` ago. Starting at midnight rather than an exact 168-hour offset
 * keeps day buckets whole — a chart whose leftmost column is a partial day
 * would show an artificial dip every time the user opened the app in the
 * evening.
 */
export function rangeBounds(range: InsightsRange, now: Date = new Date()): RangeBounds {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (RANGE_DAYS[range] - 1));
  return { start, end: now };
}

/** The equal-length window immediately before `rangeBounds`, for comparisons. */
export function previousRangeBounds(range: InsightsRange, now: Date = new Date()): RangeBounds {
  const current = rangeBounds(range, now);
  const end = current.start;
  const start = new Date(end);
  start.setDate(start.getDate() - RANGE_DAYS[range]);
  return { start, end };
}

export function sessionsInRange(
  sessions: readonly AnalyzableSession[],
  bounds: RangeBounds
): AnalyzableSession[] {
  const startMs = bounds.start.getTime();
  const endMs = bounds.end.getTime();
  return sessions.filter((session) => {
    const at = new Date(session.started_at).getTime();
    return at >= startMs && at < endMs;
  });
}

/** Sessions that carry usable measured time; everything below ignores the rest. */
function measured(sessions: readonly AnalyzableSession[]): AnalyzableSession[] {
  return sessions.filter(
    (session) => session.duration_seconds != null && session.duration_seconds > 0
  );
}

/**
 * Consistency of blink rate across sessions, 0–100 (higher is steadier).
 *
 * Built from the coefficient of variation rather than raw standard deviation
 * so it is comparable between a 6/min user and an 18/min user — the same
 * absolute spread means something very different at those two levels.
 *
 * Needs at least two measured sessions with a positive mean; a single reading
 * has no spread to describe, and reporting 100 for it would be a lie of
 * omission.
 */
export function blinkConsistency(sessions: readonly AnalyzableSession[]): number | null {
  const rates = measured(sessions)
    .map((session) => session.blinks_per_minute)
    .filter((rate): rate is number => rate != null);

  if (rates.length < 2) return null;

  const mean = rates.reduce((total, rate) => total + rate, 0) / rates.length;
  if (mean <= 0) return null;

  const variance =
    rates.reduce((total, rate) => total + (rate - mean) ** 2, 0) / (rates.length - 1);
  const cv = Math.sqrt(variance) / mean;

  return clampScore(100 * (1 - cv / CONSISTENCY_CV_CEILING));
}

/**
 * How still the head was held across sessions, 0–100.
 *
 * Uses each session's mean yaw/pitch/roll magnitude — the same Euclidean
 * combination the per-frame posture score uses — averaged over sessions. This
 * describes *position*, not drift: a user who sits at a consistent angle to
 * their camera scores lower here while still scoring well on posture, and the
 * copy in the UI must not conflate the two.
 */
export function headSteadiness(sessions: readonly AnalyzableSession[]): number | null {
  const magnitudes = measured(sessions)
    .map((session) => {
      const { mean_yaw: yaw, mean_pitch: pitch, mean_roll: roll } = session;
      if (yaw == null || pitch == null || roll == null) return null;
      return Math.sqrt(yaw * yaw + pitch * pitch + roll * roll);
    })
    .filter((magnitude): magnitude is number => magnitude != null);

  if (magnitudes.length === 0) return null;

  const mean = magnitudes.reduce((total, value) => total + value, 0) / magnitudes.length;
  return clampScore(100 * (1 - mean / HEAD_DEVIATION_CEILING));
}

/** Mean measured session length in seconds. */
export function averageSessionDuration(sessions: readonly AnalyzableSession[]): number | null {
  const durations = measured(sessions).map((session) => session.duration_seconds!);
  if (durations.length === 0) return null;
  return durations.reduce((total, value) => total + value, 0) / durations.length;
}

/** Duration-weighted mean posture score, or `null` when none was recorded. */
export function averagePostureScore(sessions: readonly AnalyzableSession[]): number | null {
  let weighted = 0;
  let minutes = 0;
  for (const session of measured(sessions)) {
    if (session.posture_score == null) continue;
    const sessionMinutes = session.duration_seconds! / 60;
    weighted += session.posture_score * sessionMinutes;
    minutes += sessionMinutes;
  }
  return minutes > 0 ? weighted / minutes : null;
}

export interface RangeMetrics {
  sessionCount: number;
  /** Total measured time in the window, in minutes. */
  totalMinutes: number;
  /** Duration-weighted blinks per minute. */
  blinkRate: number | null;
  blinkConsistency: number | null;
  headSteadiness: number | null;
  /** Mean session length, seconds. */
  meanDurationSeconds: number | null;
  postureScore: number | null;
}

/** Every headline figure for one window, computed in a single pass per metric. */
export function rangeMetrics(sessions: readonly AnalyzableSession[]): RangeMetrics {
  const usable = measured(sessions);
  return {
    sessionCount: sessions.length,
    totalMinutes: usable.reduce((total, session) => total + session.duration_seconds! / 60, 0),
    blinkRate: durationWeightedBlinkRate(sessions),
    blinkConsistency: blinkConsistency(sessions),
    headSteadiness: headSteadiness(sessions),
    meanDurationSeconds: averageSessionDuration(sessions),
    postureScore: averagePostureScore(sessions),
  };
}

export type ComparisonDirection = 'up' | 'down' | 'flat';

export interface MetricComparison {
  /** Signed percent change vs. the previous window, rounded. */
  percent: number;
  direction: ComparisonDirection;
  /** Chip-ready, e.g. "12% higher" / "unchanged". */
  label: string;
}

/** Below this the change is noise, not news. */
const FLAT_PERCENT = 5;

/**
 * Percent change between two windows, or `null` when the comparison would be
 * dishonest: a missing figure on either side, a zero baseline (percent change
 * from nothing is undefined), or too few sessions behind the previous number.
 */
export function compareMetric(
  current: number | null,
  previous: number | null,
  previousSessionCount: number
): MetricComparison | null {
  if (current == null || previous == null) return null;
  if (previousSessionCount < MIN_COMPARISON_SESSIONS) return null;
  if (previous <= 0) return null;

  const percent = Math.round(((current - previous) / previous) * 100);
  if (Math.abs(percent) < FLAT_PERCENT) {
    return { percent, direction: 'flat', label: 'about the same' };
  }
  return {
    percent,
    direction: percent > 0 ? 'up' : 'down',
    label: `${Math.abs(percent)}% ${percent > 0 ? 'higher' : 'lower'}`,
  };
}

export interface DailyPoint {
  /** Local midnight of the day this point summarizes. */
  date: Date;
  value: number;
  sessionCount: number;
}

export type DailyMetric = 'blinkRate' | 'posture';

/**
 * One point per day that actually has data, oldest first.
 *
 * Days without sessions are simply absent — the chart draws a gap, never a
 * zero. Within a day the figure is duration-weighted, so a 20-minute check-in
 * outweighs a 40-second one exactly as it does everywhere else in the app.
 */
export function dailySeries(
  sessions: readonly AnalyzableSession[],
  metric: DailyMetric = 'blinkRate'
): DailyPoint[] {
  const byDay = new Map<number, AnalyzableSession[]>();

  for (const session of measured(sessions)) {
    const day = new Date(session.started_at);
    day.setHours(0, 0, 0, 0);
    const key = day.getTime();
    const bucket = byDay.get(key);
    if (bucket) bucket.push(session);
    else byDay.set(key, [session]);
  }

  const points: DailyPoint[] = [];
  for (const [key, daySessions] of byDay) {
    const value =
      metric === 'blinkRate'
        ? durationWeightedBlinkRate(daySessions)
        : averagePostureScore(daySessions);
    if (value == null) continue;
    points.push({ date: new Date(key), value, sessionCount: daySessions.length });
  }

  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export type TimeOfDayBucket = 'morning' | 'afternoon' | 'evening';

export const BUCKET_LABELS: Record<TimeOfDayBucket, string> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
};

/** Local-hour boundaries; evening absorbs night, where check-ins are rare. */
export function timeOfDayBucket(date: Date): TimeOfDayBucket {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export interface TimeOfDayPattern {
  worst: TimeOfDayBucket;
  best: TimeOfDayBucket;
  /** How far the worst bucket falls below the best, as a percent. */
  spreadPercent: number;
  text: string;
}

/** A pattern claim needs this much separation before it is worth making. */
const PATTERN_SPREAD_PERCENT = 20;

/**
 * A simple, honest time-of-day reading.
 *
 * Requires `MIN_PATTERN_SESSIONS` overall and at least two measured sessions
 * in each of the two buckets being compared — a "pattern" resting on one
 * morning check-in is an anecdote. Returns a neutral no-pattern sentence
 * rather than `null` when the data is sufficient but unremarkable, and `null`
 * only when there is not enough to speak at all.
 */
export function timeOfDayPattern(sessions: readonly AnalyzableSession[]): TimeOfDayPattern | null {
  const usable = measured(sessions);
  if (usable.length < MIN_PATTERN_SESSIONS) return null;

  const buckets = new Map<TimeOfDayBucket, AnalyzableSession[]>();
  for (const session of usable) {
    const bucket = timeOfDayBucket(new Date(session.started_at));
    const existing = buckets.get(bucket);
    if (existing) existing.push(session);
    else buckets.set(bucket, [session]);
  }

  const rates: { bucket: TimeOfDayBucket; rate: number }[] = [];
  for (const [bucket, bucketSessions] of buckets) {
    if (bucketSessions.length < 2) continue;
    const rate = durationWeightedBlinkRate(bucketSessions);
    if (rate != null && rate > 0) rates.push({ bucket, rate });
  }

  if (rates.length < 2) return null;

  rates.sort((a, b) => a.rate - b.rate);
  const worst = rates[0]!;
  const best = rates[rates.length - 1]!;
  const spreadPercent = Math.round(((best.rate - worst.rate) / best.rate) * 100);

  if (spreadPercent < PATTERN_SPREAD_PERCENT) {
    return {
      worst: worst.bucket,
      best: best.bucket,
      spreadPercent,
      text: 'No strong time-of-day pattern yet.',
    };
  }

  return {
    worst: worst.bucket,
    best: best.bucket,
    spreadPercent,
    text: `Your blink rate drops most in the ${BUCKET_LABELS[worst.bucket]}.`,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}
