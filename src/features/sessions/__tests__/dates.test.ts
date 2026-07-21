import {
  formatDayTitle,
  formatDuration,
  formatTimer,
  isSameDay,
  isToday,
} from '@/features/sessions/dates';

// Local-time constructors on purpose: the functions reason about calendar
// days in the user's zone, so the tests must not depend on the runner's UTC
// offset the way ISO-string fixtures would.
const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month, day, hour);

describe('isSameDay / isToday', () => {
  it('compares calendar days, not 24-hour windows', () => {
    expect(isSameDay(at(2026, 6, 20, 0), at(2026, 6, 20, 23))).toBe(true);
    expect(isSameDay(at(2026, 6, 20, 23), at(2026, 6, 21, 0))).toBe(false);
  });

  it('distinguishes the same date across months and years', () => {
    expect(isSameDay(at(2026, 5, 20), at(2026, 6, 20))).toBe(false);
    expect(isSameDay(at(2025, 6, 20), at(2026, 6, 20))).toBe(false);
  });

  it('isToday accepts an explicit now for determinism', () => {
    expect(isToday(at(2026, 6, 20, 8), at(2026, 6, 20, 22))).toBe(true);
    expect(isToday(at(2026, 6, 19), at(2026, 6, 20))).toBe(false);
  });
});

describe('formatDayTitle', () => {
  const now = at(2026, 6, 20);

  it('says Today and Yesterday for the two most recent days', () => {
    expect(formatDayTitle(at(2026, 6, 20, 9), now)).toBe('Today');
    expect(formatDayTitle(at(2026, 6, 19, 23), now)).toBe('Yesterday');
  });

  it('crosses month boundaries when resolving Yesterday', () => {
    expect(formatDayTitle(at(2026, 5, 30), at(2026, 6, 1))).toBe('Yesterday');
  });

  it('falls back to a dated title beyond yesterday', () => {
    const title = formatDayTitle(at(2026, 6, 15), now);
    expect(title).not.toBe('Today');
    expect(title).not.toBe('Yesterday');
    expect(title).toContain('15');
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes, and hours compactly', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(130)).toBe('2m 10s');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(3_840)).toBe('1h 4m');
  });

  it('drops seconds once hours appear', () => {
    expect(formatDuration(3_659)).toBe('1h 0m');
  });

  it('renders missing or malformed input as an em dash, never throwing', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });

  it('treats zero as a real, measured zero', () => {
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('formatTimer', () => {
  it('renders m:ss with two-digit seconds', () => {
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(7)).toBe('0:07');
    expect(formatTimer(83)).toBe('1:23');
    expect(formatTimer(725)).toBe('12:05');
  });

  it('floors fractional seconds so the display never jumps ahead', () => {
    expect(formatTimer(59.9)).toBe('0:59');
  });

  it('clamps negatives to zero', () => {
    expect(formatTimer(-3)).toBe('0:00');
  });
});
