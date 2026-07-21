/**
 * Date and duration formatting shared by every screen that renders sessions.
 *
 * Extracted (DESIGN_REVIEW.md §4) because Today, Insights, and Session
 * Results each need the same three ideas — "is this today?", a human day
 * title, a compact duration — and three private copies had already started
 * to drift. Pure functions; `now` is a parameter so behavior at day
 * boundaries is testable instead of depending on when the test suite runs.
 */

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date: Date, now: Date = new Date()): boolean {
  return isSameDay(date, now);
}

/**
 * "Today", "Yesterday", or a localized weekday-and-date — the section titles
 * Insights uses and the header the results screen shows for a past session.
 */
export function formatDayTitle(date: Date, now: Date = new Date()): string {
  if (isSameDay(date, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/** Localized clock time, e.g. "4:32 PM". */
export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Compact duration: "45s", "2m 10s", "1h 4m".
 *
 * Seconds are dropped once hours appear — at that magnitude they are noise,
 * and the strings must stay short enough for a metric card. Negative or
 * missing input renders as an em dash rather than throwing: a malformed row
 * should degrade to "unmeasured", never crash a results screen.
 */
/**
 * Live-timer format: "0:07", "1:23", "12:05". Minutes unpadded (Apple's
 * clock idiom); seconds always two digits so the string width is stable
 * under tabular-nums. For *completed* durations use `formatDuration`.
 */
export function formatTimer(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || totalSeconds < 0 || !Number.isFinite(totalSeconds)) return '—';

  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
  return `${rest}s`;
}
