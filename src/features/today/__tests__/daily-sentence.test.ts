import { dailySentence, type DailySentenceInput } from '@/features/today/daily-sentence';
import type { BlinkDelta } from '@/features/sessions/baseline';

const near: BlinkDelta = { percent: 3, direction: 'near', label: 'near your usual' };
const below: BlinkDelta = { percent: -25, direction: 'below', label: '25% below usual' };
const above: BlinkDelta = { percent: 24, direction: 'above', label: '24% above usual' };

/** A typical mid-day state; tests override what each rule cares about. */
const base: DailySentenceInput = {
  todayCount: 1,
  targetCount: 3,
  todayRate: 14,
  yesterdayRate: null,
  hasHistory: true,
  delta: null,
};

describe('dailySentence', () => {
  it('invites the first-ever scan when no history exists', () => {
    expect(dailySentence({ ...base, todayCount: 0, todayRate: null, hasHistory: false })).toBe(
      'Run your first scan to see your baseline.'
    );
  });

  it('references yesterday when today is empty and yesterday measured', () => {
    expect(dailySentence({ ...base, todayCount: 0, todayRate: null, yesterdayRate: 11.4 })).toBe(
      'Yesterday you averaged 11/min — ready when you are.'
    );
  });

  it('rounds the yesterday rate', () => {
    expect(
      dailySentence({ ...base, todayCount: 0, todayRate: null, yesterdayRate: 11.5 })
    ).toContain('12/min');
  });

  it('falls back to a plain invitation when yesterday has no rate', () => {
    expect(dailySentence({ ...base, todayCount: 0, todayRate: null })).toBe(
      'First check-in of the day is ready when you are.'
    );
  });

  it('flags a notably low day', () => {
    expect(dailySentence({ ...base, todayRate: 6 })).toBe(
      'Blinking is running low today — your eyes may feel it later.'
    );
  });

  it('lets a low reading outrank a met target', () => {
    expect(dailySentence({ ...base, todayCount: 3, todayRate: 6, delta: near })).toBe(
      'Blinking is running low today — your eyes may feel it later.'
    );
  });

  it('affirms a met target, mentioning baseline when near it', () => {
    expect(dailySentence({ ...base, todayCount: 3, delta: near })).toBe(
      'Target met — your blink rate is holding near your usual.'
    );
    expect(dailySentence({ ...base, todayCount: 4 })).toBe(
      'Target met for today. Nice, steady rhythm.'
    );
  });

  it('describes the baseline comparison mid-day', () => {
    expect(dailySentence({ ...base, delta: near })).toBe(
      'Your blink rate is holding near your baseline.'
    );
    expect(dailySentence({ ...base, delta: below })).toBe(
      'Blinking a little below your usual — a screen break may help.'
    );
    expect(dailySentence({ ...base, delta: above })).toBe(
      'Blinking comfortably above your usual today.'
    );
  });

  it('reads the absolute band when no baseline comparison is earned', () => {
    expect(dailySentence({ ...base, todayRate: 10 })).toBe(
      'Blink rate is a touch low so far — a short break may help.'
    );
    expect(dailySentence({ ...base, todayRate: 15 })).toBe('Off to a steady start today.');
  });

  it('stays calm when sessions exist but produced no rate', () => {
    // Zero-duration edge: a count without a measurement still reads as a day
    // in progress, never as an error.
    expect(dailySentence({ ...base, todayRate: null })).toBe('Off to a steady start today.');
  });
});
