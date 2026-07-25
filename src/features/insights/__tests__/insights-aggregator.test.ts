import {
  averagePostureScore,
  averageSessionDuration,
  blinkConsistency,
  compareMetric,
  dailySeries,
  headSteadiness,
  previousRangeBounds,
  rangeBounds,
  rangeMetrics,
  sessionsInRange,
  timeOfDayBucket,
  timeOfDayPattern,
} from '@/features/insights/insights-aggregator';
import type { Session } from '@/lib/supabase/database.types';

const NOW = new Date('2026-07-21T15:00:00');

let nextId = 0;

/** A measured session; every field the aggregator reads is overridable. */
function session(overrides: Partial<Session> & { started_at: string }): Session {
  return {
    id: `session-${nextId++}`,
    user_id: 'user-1',
    ended_at: null,
    duration_seconds: 120,
    blink_count: 30,
    blinks_per_minute: 15,
    mean_blink_duration_ms: 110,
    mean_yaw: 0,
    mean_pitch: 0,
    mean_roll: 0,
    posture_score: 90,
    created_at: overrides.started_at,
    ...overrides,
  };
}

describe('rangeBounds', () => {
  it('starts at local midnight so day buckets stay whole', () => {
    const { start, end } = rangeBounds('W', NOW);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end).toEqual(NOW);
  });

  it('spans the documented number of days', () => {
    expect(rangeBounds('W', NOW).start).toEqual(new Date('2026-07-15T00:00:00'));
    expect(rangeBounds('M', NOW).start).toEqual(new Date('2026-06-22T00:00:00'));
  });

  it('places the previous window immediately before the current one', () => {
    const current = rangeBounds('W', NOW);
    const previous = previousRangeBounds('W', NOW);
    expect(previous.end).toEqual(current.start);
    expect(previous.start).toEqual(new Date('2026-07-08T00:00:00'));
  });
});

describe('sessionsInRange', () => {
  it('includes the start boundary and excludes the end', () => {
    const bounds = rangeBounds('W', NOW);
    const inside = session({ started_at: bounds.start.toISOString() });
    const after = session({ started_at: new Date(NOW.getTime() + 1000).toISOString() });
    const before = session({
      started_at: new Date(bounds.start.getTime() - 1000).toISOString(),
    });

    const result = sessionsInRange([inside, after, before], bounds);
    expect(result).toEqual([inside]);
  });
});

describe('blinkConsistency', () => {
  it('scores identical rates as perfectly consistent', () => {
    const sessions = [15, 15, 15].map((rate) =>
      session({ started_at: '2026-07-20T10:00:00', blinks_per_minute: rate })
    );
    expect(blinkConsistency(sessions)).toBe(100);
  });

  it('falls as spread grows', () => {
    const tight = [14, 15, 16].map((rate) =>
      session({ started_at: '2026-07-20T10:00:00', blinks_per_minute: rate })
    );
    const loose = [5, 15, 25].map((rate) =>
      session({ started_at: '2026-07-20T10:00:00', blinks_per_minute: rate })
    );
    expect(blinkConsistency(tight)!).toBeGreaterThan(blinkConsistency(loose)!);
  });

  it('needs two readings — one has no spread to describe', () => {
    expect(blinkConsistency([session({ started_at: '2026-07-20T10:00:00' })])).toBeNull();
    expect(blinkConsistency([])).toBeNull();
  });

  it('ignores unmeasured sessions', () => {
    const sessions = [
      session({ started_at: '2026-07-20T10:00:00', blinks_per_minute: 15 }),
      session({ started_at: '2026-07-20T11:00:00', duration_seconds: 0, blinks_per_minute: 99 }),
    ];
    expect(blinkConsistency(sessions)).toBeNull();
  });
});

describe('headSteadiness', () => {
  it('scores a perfectly centered head at 100', () => {
    expect(headSteadiness([session({ started_at: '2026-07-20T10:00:00' })])).toBe(100);
  });

  it('scores at or past the ceiling as 0 rather than negative', () => {
    const sessions = [
      session({ started_at: '2026-07-20T10:00:00', mean_yaw: 40, mean_pitch: 0, mean_roll: 0 }),
    ];
    expect(headSteadiness(sessions)).toBe(0);
  });

  it('combines axes the same way the posture score does', () => {
    const sessions = [
      session({ started_at: '2026-07-20T10:00:00', mean_yaw: 3, mean_pitch: 4, mean_roll: 0 }),
    ];
    // magnitude 5 of a 30-degree ceiling.
    expect(headSteadiness(sessions)).toBeCloseTo(100 * (1 - 5 / 30));
  });

  it('returns null when pose was never recorded', () => {
    const sessions = [
      session({
        started_at: '2026-07-20T10:00:00',
        mean_yaw: null,
        mean_pitch: null,
        mean_roll: null,
      }),
    ];
    expect(headSteadiness(sessions)).toBeNull();
  });
});

describe('averageSessionDuration', () => {
  it('averages measured durations only', () => {
    const sessions = [
      session({ started_at: '2026-07-20T10:00:00', duration_seconds: 60 }),
      session({ started_at: '2026-07-20T11:00:00', duration_seconds: 180 }),
      session({ started_at: '2026-07-20T12:00:00', duration_seconds: null }),
    ];
    expect(averageSessionDuration(sessions)).toBe(120);
  });

  it('returns null with nothing measured', () => {
    expect(averageSessionDuration([])).toBeNull();
  });
});

describe('averagePostureScore', () => {
  it('weights by duration, not by session', () => {
    const sessions = [
      session({ started_at: '2026-07-20T10:00:00', duration_seconds: 60, posture_score: 100 }),
      session({ started_at: '2026-07-20T11:00:00', duration_seconds: 180, posture_score: 60 }),
    ];
    // (100*1 + 60*3) / 4 = 70
    expect(averagePostureScore(sessions)).toBe(70);
  });

  it('skips sessions with no posture score', () => {
    const sessions = [
      session({ started_at: '2026-07-20T10:00:00', posture_score: null }),
      session({ started_at: '2026-07-20T11:00:00', posture_score: 80 }),
    ];
    expect(averagePostureScore(sessions)).toBe(80);
  });
});

describe('rangeMetrics', () => {
  it('reports every headline figure together', () => {
    const sessions = [
      session({ started_at: '2026-07-20T10:00:00', duration_seconds: 120, blink_count: 30 }),
      session({ started_at: '2026-07-20T11:00:00', duration_seconds: 120, blink_count: 20 }),
    ];
    const metrics = rangeMetrics(sessions);

    expect(metrics.sessionCount).toBe(2);
    expect(metrics.totalMinutes).toBe(4);
    expect(metrics.blinkRate).toBe(12.5);
    expect(metrics.meanDurationSeconds).toBe(120);
    expect(metrics.headSteadiness).toBe(100);
  });

  it('survives an empty window without throwing', () => {
    const metrics = rangeMetrics([]);
    expect(metrics.sessionCount).toBe(0);
    expect(metrics.blinkRate).toBeNull();
    expect(metrics.blinkConsistency).toBeNull();
    expect(metrics.headSteadiness).toBeNull();
    expect(metrics.meanDurationSeconds).toBeNull();
  });
});

describe('compareMetric', () => {
  it('reports a signed percent change', () => {
    expect(compareMetric(12, 10, 8)).toEqual({
      percent: 20,
      direction: 'up',
      label: '20% higher',
    });
    expect(compareMetric(8, 10, 8)).toEqual({
      percent: -20,
      direction: 'down',
      label: '20% lower',
    });
  });

  it('calls small changes flat rather than news', () => {
    expect(compareMetric(10.2, 10, 8)?.direction).toBe('flat');
    expect(compareMetric(10.2, 10, 8)?.label).toBe('about the same');
  });

  it('refuses a comparison the previous window cannot support', () => {
    expect(compareMetric(12, 10, 4)).toBeNull();
  });

  it('refuses when either side is missing or the baseline is zero', () => {
    expect(compareMetric(null, 10, 8)).toBeNull();
    expect(compareMetric(12, null, 8)).toBeNull();
    expect(compareMetric(12, 0, 8)).toBeNull();
  });
});

describe('dailySeries', () => {
  it('buckets by local day, oldest first, duration-weighted', () => {
    const sessions = [
      session({ started_at: '2026-07-20T09:00:00', duration_seconds: 60, blink_count: 20 }),
      session({ started_at: '2026-07-20T21:00:00', duration_seconds: 180, blink_count: 30 }),
      session({ started_at: '2026-07-18T09:00:00', duration_seconds: 60, blink_count: 10 }),
    ];
    const points = dailySeries(sessions);

    expect(points).toHaveLength(2);
    expect(points[0]!.date).toEqual(new Date('2026-07-18T00:00:00'));
    expect(points[0]!.value).toBe(10);
    // 50 blinks over 4 minutes on the 20th.
    expect(points[1]!.value).toBe(12.5);
    expect(points[1]!.sessionCount).toBe(2);
  });

  it('omits empty days entirely — a gap is not a zero', () => {
    const sessions = [
      session({ started_at: '2026-07-15T09:00:00' }),
      session({ started_at: '2026-07-20T09:00:00' }),
    ];
    const points = dailySeries(sessions);
    expect(points).toHaveLength(2);
    expect(points.every((point) => point.value > 0)).toBe(true);
  });

  it('charts posture when asked', () => {
    const sessions = [
      session({ started_at: '2026-07-20T09:00:00', posture_score: 55 }),
      session({ started_at: '2026-07-20T10:00:00', posture_score: 65 }),
    ];
    expect(dailySeries(sessions, 'posture')[0]!.value).toBe(60);
  });

  it('drops days whose sessions carry no value for the chosen metric', () => {
    const sessions = [session({ started_at: '2026-07-20T09:00:00', posture_score: null })];
    expect(dailySeries(sessions, 'posture')).toHaveLength(0);
  });
});

describe('timeOfDayBucket', () => {
  it('splits the day at noon and 5pm', () => {
    expect(timeOfDayBucket(new Date('2026-07-20T08:00:00'))).toBe('morning');
    expect(timeOfDayBucket(new Date('2026-07-20T12:00:00'))).toBe('afternoon');
    expect(timeOfDayBucket(new Date('2026-07-20T17:00:00'))).toBe('evening');
    expect(timeOfDayBucket(new Date('2026-07-20T23:00:00'))).toBe('evening');
  });
});

describe('timeOfDayPattern', () => {
  /** `count` sessions in one bucket at a fixed rate. */
  function bucket(hour: number, count: number, rate: number): Session[] {
    return Array.from({ length: count }, (_, index) =>
      session({
        started_at: `2026-07-${String(10 + index).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00`,
        duration_seconds: 60,
        blink_count: rate,
        blinks_per_minute: rate,
      })
    );
  }

  it('stays silent below the minimum sample', () => {
    expect(timeOfDayPattern([...bucket(9, 3, 18), ...bucket(15, 3, 9)])).toBeNull();
  });

  it('names the weakest bucket when the spread is real', () => {
    const pattern = timeOfDayPattern([...bucket(9, 5, 18), ...bucket(15, 5, 9)]);
    expect(pattern?.worst).toBe('afternoon');
    expect(pattern?.best).toBe('morning');
    expect(pattern?.text).toBe('Your blink rate drops most in the afternoon.');
  });

  it('declines to invent a pattern from a small spread', () => {
    const pattern = timeOfDayPattern([...bucket(9, 5, 15), ...bucket(15, 5, 14)]);
    expect(pattern?.text).toBe('No strong time-of-day pattern yet.');
  });

  it('needs two populated buckets, not one busy one', () => {
    expect(timeOfDayPattern(bucket(9, 12, 15))).toBeNull();
  });

  it('ignores buckets holding a single anecdote', () => {
    const sessions = [...bucket(9, 10, 18), ...bucket(15, 1, 4)];
    // The lone afternoon session cannot drag the story; morning alone remains.
    expect(timeOfDayPattern(sessions)).toBeNull();
  });
});
