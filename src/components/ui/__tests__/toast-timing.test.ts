import { holdFor, HOLD_MS, MAX_HOLD_MS } from '../toast-timing';

describe('toast hold duration', () => {
  it('holds the §6 baseline for the notices that exist today', () => {
    // The two scan toasts. Neither may drift from the spec'd 3 s.
    expect(holdFor('Under 10 seconds — too short to measure.')).toBe(HOLD_MS);
    expect(holdFor('This check-in ended unexpectedly.')).toBe(HOLD_MS);
  });

  it('holds the baseline for anything at or under the reference length', () => {
    expect(holdFor('')).toBe(HOLD_MS);
    expect(holdFor('a'.repeat(44))).toBe(HOLD_MS);
  });

  it('extends the hold for longer notices rather than imposing a deadline', () => {
    const short = holdFor('a'.repeat(44));
    const long = holdFor('a'.repeat(84));

    expect(long).toBeGreaterThan(short);
    // 40 characters past the baseline at 45 ms each.
    expect(long).toBe(HOLD_MS + 40 * 45);
  });

  it('caps the hold so a notice can never camp on screen', () => {
    expect(holdFor('a'.repeat(1000))).toBe(MAX_HOLD_MS);
  });

  it('never returns a hold shorter than the baseline', () => {
    const samples = ['', 'x', 'a'.repeat(200), 'a'.repeat(5000)];
    for (const sample of samples) {
      expect(holdFor(sample)).toBeGreaterThanOrEqual(HOLD_MS);
    }
  });
});
