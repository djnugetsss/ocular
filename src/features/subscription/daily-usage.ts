import { isSameDay } from '@/features/sessions/dates';

/**
 * Daily check-in counting, in the user's own day.
 *
 * "Per calendar day" means the **device-local** day — the one the user is
 * living in — not UTC and not the account's creation timezone. Sessions are
 * stored as UTC instants; `new Date(iso)` converts to local time, and
 * `isSameDay` (shared with Today's aggregates, so the two can never disagree
 * about what "today" contains) compares local calendar fields.
 *
 * Pure and clock-free: `now`/`day` are always parameters, which is what makes
 * midnight and month boundaries testable rather than a property of when the
 * suite happens to run.
 *
 * A "completed check-in" is a *persisted* session. The repository refuses to
 * write anything under ten seconds, so every stored row is a real measurement
 * and the count needs no separate notion of completeness.
 */

/** The instant the local day containing `now` began. */
export function startOfLocalDay(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** The next local midnight — when a free user's allowance resets. */
export function nextLocalDayStart(now: Date = new Date()): Date {
  const next = startOfLocalDay(now);
  next.setDate(next.getDate() + 1);
  return next;
}

/** Only the field this module reads, so it accepts any session row shape. */
export interface CountableSession {
  started_at: string;
}

/**
 * How many of these sessions started on `day`, in local time.
 *
 * Rows with an unparseable timestamp are skipped rather than throwing: a
 * malformed row should cost its own place in the count, never the user's
 * ability to start a check-in.
 */
export function countCheckInsOnDay(
  sessions: readonly CountableSession[],
  day: Date = new Date()
): number {
  let count = 0;
  for (const session of sessions) {
    const startedAt = new Date(session.started_at);
    if (Number.isNaN(startedAt.getTime())) continue;
    if (isSameDay(startedAt, day)) count += 1;
  }
  return count;
}

/** Convenience alias for the common case; `now` stays injectable for tests. */
export function countCheckInsToday(
  sessions: readonly CountableSession[],
  now: Date = new Date()
): number {
  return countCheckInsOnDay(sessions, now);
}
