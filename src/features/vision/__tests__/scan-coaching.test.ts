import { CoachingMonitor, type CoachingObservation } from '@/features/vision/scan-coaching';

/** A well-positioned, well-lit frame at `t` milliseconds. */
function frame(
  timestampMs: number,
  overrides: Partial<CoachingObservation> = {}
): CoachingObservation {
  return {
    timestampMs,
    hasFace: true,
    confidence: 0.95,
    faceWidthFraction: 0.35,
    ...overrides,
  };
}

/** Feeds frames at ~15 fps between two times, returning the last hint. */
function run(
  monitor: CoachingMonitor,
  fromMs: number,
  toMs: number,
  overrides: Partial<CoachingObservation> = {}
) {
  let hint: ReturnType<CoachingMonitor['observe']> = null;
  for (let t = fromMs; t <= toMs; t += 66) {
    hint = monitor.observe(frame(t, overrides));
  }
  return hint;
}

describe('CoachingMonitor — distance', () => {
  it('says nothing for a well-positioned face', () => {
    const monitor = new CoachingMonitor();
    expect(run(monitor, 0, 5000)).toBeNull();
  });

  it('raises too-close only after the zone holds for the debounce window', () => {
    const monitor = new CoachingMonitor();
    expect(run(monitor, 0, 900, { faceWidthFraction: 0.7 })).toBeNull();
    expect(run(monitor, 966, 1200, { faceWidthFraction: 0.7 })).toBe('too-close');
  });

  it('ignores a momentary lean-in', () => {
    const monitor = new CoachingMonitor();
    run(monitor, 0, 2000);
    // Half a second of leaning close, then back — under the 1 s debounce.
    expect(run(monitor, 2066, 2500, { faceWidthFraction: 0.7 })).toBeNull();
    expect(run(monitor, 2566, 6000)).toBeNull();
  });

  it('raises too-far for a small face', () => {
    const monitor = new CoachingMonitor();
    expect(run(monitor, 0, 1500, { faceWidthFraction: 0.1 })).toBe('too-far');
  });

  it('clears only after a full second back in band', () => {
    const monitor = new CoachingMonitor();
    run(monitor, 0, 1500, { faceWidthFraction: 0.7 });
    // Back in band, but not yet for a second — the hint must hold.
    expect(run(monitor, 1566, 2400)).toBe('too-close');
    expect(run(monitor, 2466, 2800)).toBeNull();
  });

  it('switches between zones once the new zone earns its debounce', () => {
    const monitor = new CoachingMonitor();
    expect(run(monitor, 0, 1500, { faceWidthFraction: 0.7 })).toBe('too-close');
    expect(run(monitor, 1566, 3000, { faceWidthFraction: 0.1 })).toBe('too-far');
  });

  it('suppresses distance advice once the face is gone', () => {
    const monitor = new CoachingMonitor();
    expect(run(monitor, 0, 1500, { faceWidthFraction: 0.7 })).toBe('too-close');
    // Face lost: "come closer" advice about a face that isn't there is noise
    // (and the searching state owns the pill then anyway).
    expect(
      run(monitor, 1566, 4000, { hasFace: false, confidence: 0, faceWidthFraction: null })
    ).toBeNull();
  });
});

describe('CoachingMonitor — visibility proxy', () => {
  it('raises low-visibility after sustained low confidence with a face still found', () => {
    const monitor = new CoachingMonitor();
    expect(run(monitor, 0, 2900, { confidence: 0.2 })).toBeNull();
    expect(run(monitor, 2966, 3500, { confidence: 0.2 })).toBe('low-visibility');
  });

  it('does not diagnose visibility when no face has been seen at all', () => {
    const monitor = new CoachingMonitor();
    const hint = run(monitor, 0, 5000, {
      hasFace: false,
      confidence: 0,
      faceWidthFraction: null,
    });
    // A fully absent face is the searching state, not a lighting problem.
    expect(hint).toBeNull();
  });

  it('clears as soon as confidence recovers', () => {
    const monitor = new CoachingMonitor();
    expect(run(monitor, 0, 3500, { confidence: 0.2 })).toBe('low-visibility');
    expect(run(monitor, 3566, 3700)).toBeNull();
  });

  it('does not fire from the first frame even if it starts dark', () => {
    const monitor = new CoachingMonitor();
    // First-ever frame at a large timestamp: the sustain clock must start
    // here, not at zero.
    expect(monitor.observe(frame(50_000, { confidence: 0.2 }))).toBeNull();
  });

  it('yields to distance advice when both apply', () => {
    const monitor = new CoachingMonitor();
    const hint = run(monitor, 0, 4000, { confidence: 0.2, faceWidthFraction: 0.7 });
    expect(hint).toBe('too-close');
  });
});

describe('CoachingMonitor — reset', () => {
  it('forgets prior state entirely', () => {
    const monitor = new CoachingMonitor();
    expect(run(monitor, 0, 1500, { faceWidthFraction: 0.7 })).toBe('too-close');

    monitor.reset();
    // A fresh session: the old hint must not survive, and debounce restarts.
    expect(run(monitor, 10_000, 10_900, { faceWidthFraction: 0.7 })).toBeNull();
  });
});
