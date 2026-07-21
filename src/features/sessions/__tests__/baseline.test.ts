import {
  MIN_BASELINE_SESSIONS,
  TRAILING_BASELINE_COUNT,
  blinkRateDelta,
  durationWeightedBlinkRate,
  sessionVerdict,
  trailingBaseline,
  verdictWithoutBaseline,
  type BaselineSourceSession,
} from '@/features/sessions/baseline';

let idCounter = 0;

/** A prior session: `minutesAgo` before the fixed "current" start below. */
function priorSession(
  overrides: Partial<BaselineSourceSession> & { minutesAgo?: number } = {}
): BaselineSourceSession {
  const { minutesAgo = 60, ...rest } = overrides;
  idCounter += 1;
  return {
    id: `session-${idCounter}`,
    started_at: new Date(CURRENT_START.getTime() - minutesAgo * 60_000).toISOString(),
    duration_seconds: 120,
    blink_count: 30, // 15/min over 2 minutes
    ...rest,
  };
}

const CURRENT_START = new Date('2026-07-20T12:00:00Z');
const CURRENT = { id: 'current', startedAt: CURRENT_START };

describe('durationWeightedBlinkRate', () => {
  it('weights by duration instead of averaging per-session rates', () => {
    // 1 min at 30/min plus 9 min at 10/min: a naive average of rates says 20,
    // but 120 blinks over 10 minutes is 12.
    const rate = durationWeightedBlinkRate([
      { duration_seconds: 60, blink_count: 30 },
      { duration_seconds: 540, blink_count: 90 },
    ]);
    expect(rate).toBe(12);
  });

  it('ignores sessions without measured time', () => {
    const rate = durationWeightedBlinkRate([
      { duration_seconds: null, blink_count: 99 },
      { duration_seconds: 0, blink_count: 99 },
      { duration_seconds: 60, blink_count: 15 },
    ]);
    expect(rate).toBe(15);
  });

  it('returns null when no session has measured time', () => {
    expect(durationWeightedBlinkRate([{ duration_seconds: null, blink_count: 5 }])).toBeNull();
    expect(durationWeightedBlinkRate([])).toBeNull();
  });
});

describe('trailingBaseline', () => {
  it('returns null for a first-ever session', () => {
    expect(trailingBaseline([], CURRENT)).toBeNull();
  });

  it('excludes the session under review by id', () => {
    // The current session is in the list (it was just saved); a baseline that
    // included it would be circular.
    const rows = [
      { ...priorSession({ minutesAgo: 30 }), id: 'current' },
      priorSession({ minutesAgo: 60 }),
    ];
    const baseline = trailingBaseline(rows, CURRENT);
    expect(baseline?.sessionCount).toBe(1);
  });

  it('excludes sessions that started at or after the current one', () => {
    const later = priorSession({ minutesAgo: -30 }); // started after
    const before = priorSession({ minutesAgo: 30 });
    const baseline = trailingBaseline([later, before], CURRENT);
    expect(baseline?.sessionCount).toBe(1);
  });

  it('caps the window at the trailing count, keeping the newest', () => {
    const old = priorSession({ minutesAgo: 10_000, blink_count: 240 }); // 120/min outlier
    const recent = Array.from({ length: TRAILING_BASELINE_COUNT }, (_, index) =>
      priorSession({ minutesAgo: index + 1 })
    );
    const baseline = trailingBaseline([old, ...recent], CURRENT);

    expect(baseline?.sessionCount).toBe(TRAILING_BASELINE_COUNT);
    // The outlier fell outside the window, so the rate stays at the recent 15.
    expect(baseline?.blinksPerMinute).toBe(15);
  });

  it('is order-independent even though the repository sorts newest-first', () => {
    const outlier = priorSession({ minutesAgo: 10_000, blink_count: 240 });
    const recent = Array.from({ length: TRAILING_BASELINE_COUNT }, (_, index) =>
      priorSession({ minutesAgo: index + 1 })
    );
    // Oldest first — the reverse of the repository's guarantee.
    const baseline = trailingBaseline([outlier, ...recent].reverse(), CURRENT);
    expect(baseline?.blinksPerMinute).toBe(15);
  });

  it('skips unmeasured sessions rather than counting them', () => {
    const rows = [priorSession({ duration_seconds: null }), priorSession()];
    expect(trailingBaseline(rows, CURRENT)?.sessionCount).toBe(1);
  });
});

describe('blinkRateDelta', () => {
  const baselineOf = (rate: number, sessionCount = MIN_BASELINE_SESSIONS) => ({
    blinksPerMinute: rate,
    sessionCount,
  });

  it('is null without a rate or baseline', () => {
    expect(blinkRateDelta(null, baselineOf(15))).toBeNull();
    expect(blinkRateDelta(15, null)).toBeNull();
  });

  it('is null below the minimum session count — no fake precision', () => {
    expect(blinkRateDelta(15, baselineOf(15, MIN_BASELINE_SESSIONS - 1))).toBeNull();
  });

  it('is null for a zero baseline rather than dividing by it', () => {
    expect(blinkRateDelta(15, baselineOf(0))).toBeNull();
  });

  it('labels small deltas as near usual', () => {
    const delta = blinkRateDelta(15.3, baselineOf(15));
    expect(delta).toEqual({ percent: 2, direction: 'near', label: 'near your usual' });
  });

  it('labels directional deltas with rounded percentages', () => {
    expect(blinkRateDelta(12, baselineOf(15))).toEqual({
      percent: -20,
      direction: 'below',
      label: '20% below usual',
    });
    expect(blinkRateDelta(18, baselineOf(15))).toEqual({
      percent: 20,
      direction: 'above',
      label: '20% above usual',
    });
  });
});

describe('sessionVerdict', () => {
  const settledBaseline = { blinksPerMinute: 15, sessionCount: 10 };

  it('never scores a missing rate', () => {
    const verdict = sessionVerdict({ blinksPerMinute: null }, settledBaseline);
    expect(verdict.tone).toBe('neutral');
    expect(verdict.sentence).toMatch(/not enough face time/i);
  });

  it('declares the first-ever session to be the baseline', () => {
    const verdict = sessionVerdict({ blinksPerMinute: 14 }, null);
    expect(verdict.sentence).toBe('This is your baseline. Future check-ins compare against it.');
    expect(verdict.tone).toBe('neutral');
  });

  it('defers comparison while history is thin', () => {
    const verdict = sessionVerdict(
      { blinksPerMinute: 14 },
      { blinksPerMinute: 15, sessionCount: MIN_BASELINE_SESSIONS - 1 }
    );
    expect(verdict.sentence).toMatch(/still building your baseline/i);
    expect(verdict.tone).toBe('neutral');
  });

  it('lets an absolutely low rate outrank "near your usual"', () => {
    // Usual is 7/min: today's 7 is near baseline but far below typical, and
    // the honest sentence is the absolute one.
    const verdict = sessionVerdict(
      { blinksPerMinute: 7 },
      { blinksPerMinute: 7, sessionCount: 10 }
    );
    expect(verdict.tone).toBe('bad');
    expect(verdict.sentence).toMatch(/below typical/i);
  });

  it('calls out a significant drop against baseline', () => {
    const verdict = sessionVerdict({ blinksPerMinute: 11 }, settledBaseline);
    expect(verdict.tone).toBe('warn');
    expect(verdict.sentence).toBe('Blink rate 27% below your usual — a sign of hard focus.');
  });

  it('calls out a significant rise against baseline', () => {
    const verdict = sessionVerdict({ blinksPerMinute: 18 }, settledBaseline);
    expect(verdict.tone).toBe('ok');
    expect(verdict.sentence).toBe('Blink rate 20% above your usual — relaxed eyes this session.');
  });

  it('reads steady sessions as holding near usual', () => {
    const verdict = sessionVerdict({ blinksPerMinute: 15 }, settledBaseline);
    expect(verdict.tone).toBe('ok');
    expect(verdict.sentence).toBe('Blink rate holding near your usual.');
  });
});

describe('verdictWithoutBaseline', () => {
  it('never claims anything about "your usual"', () => {
    for (const rate of [null, 5, 10, 16]) {
      expect(verdictWithoutBaseline({ blinksPerMinute: rate }).sentence).not.toMatch(/usual/i);
    }
  });

  it('grades against absolute thresholds only', () => {
    expect(verdictWithoutBaseline({ blinksPerMinute: 5 }).tone).toBe('bad');
    expect(verdictWithoutBaseline({ blinksPerMinute: 10 }).tone).toBe('warn');
    expect(verdictWithoutBaseline({ blinksPerMinute: 16 }).tone).toBe('ok');
    expect(verdictWithoutBaseline({ blinksPerMinute: null }).tone).toBe('neutral');
  });
});
