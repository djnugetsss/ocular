import {
  countCheckInsOnDay,
  countCheckInsToday,
  nextLocalDayStart,
  startOfLocalDay,
} from '@/features/subscription/daily-usage';

/**
 * Local-time fixtures: the constructor form `new Date(y, m, d, h, m)` builds
 * an instant in the runner's zone, which is exactly the frame of reference the
 * daily limit is defined in. Using ISO strings with a `Z` here would test UTC
 * boundaries instead, which is the bug this module exists to avoid.
 */
function at(year: number, month: number, day: number, hour: number, minute = 0) {
  return new Date(year, month - 1, day, hour, minute);
}

function session(startedAt: Date) {
  return { started_at: startedAt.toISOString() };
}

describe('startOfLocalDay', () => {
  it('returns local midnight of the given instant', () => {
    const start = startOfLocalDay(at(2026, 7, 22, 23, 59));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(22);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it('does not mutate its argument', () => {
    const now = at(2026, 7, 22, 14, 30);
    startOfLocalDay(now);
    expect(now.getHours()).toBe(14);
  });
});

describe('nextLocalDayStart', () => {
  it('is the following local midnight', () => {
    const next = nextLocalDayStart(at(2026, 7, 22, 23, 59));
    expect(next.getDate()).toBe(23);
    expect(next.getHours()).toBe(0);
  });

  it('rolls over month ends', () => {
    const next = nextLocalDayStart(at(2026, 7, 31, 12));
    expect(next.getMonth()).toBe(7); // August
    expect(next.getDate()).toBe(1);
  });
});

describe('countCheckInsOnDay', () => {
  const day = at(2026, 7, 22, 12);

  it('counts every session started on that local day', () => {
    const sessions = [
      session(at(2026, 7, 22, 0, 1)),
      session(at(2026, 7, 22, 9, 30)),
      session(at(2026, 7, 22, 23, 58)),
    ];
    expect(countCheckInsOnDay(sessions, day)).toBe(3);
  });

  it('excludes the days on either side', () => {
    const sessions = [
      session(at(2026, 7, 21, 23, 59)),
      session(at(2026, 7, 22, 8)),
      session(at(2026, 7, 23, 0, 1)),
    ];
    expect(countCheckInsOnDay(sessions, day)).toBe(1);
  });

  it('does not confuse the same date in another month or year', () => {
    const sessions = [
      session(at(2026, 6, 22, 12)),
      session(at(2025, 7, 22, 12)),
      session(at(2026, 7, 22, 12)),
    ];
    expect(countCheckInsOnDay(sessions, day)).toBe(1);
  });

  it('returns zero for an empty history', () => {
    expect(countCheckInsOnDay([], day)).toBe(0);
  });

  it('skips unparseable timestamps rather than throwing', () => {
    // A malformed row costs its own place in the count, never the user's
    // ability to start a check-in.
    const sessions = [{ started_at: 'not-a-date' }, session(at(2026, 7, 22, 10))];
    expect(countCheckInsOnDay(sessions, day)).toBe(1);
  });
});

describe('countCheckInsToday', () => {
  it('reads the day from the injected clock', () => {
    const now = at(2026, 7, 22, 16);
    const sessions = [session(at(2026, 7, 22, 7)), session(at(2026, 7, 21, 7))];
    expect(countCheckInsToday(sessions, now)).toBe(1);
  });
});
