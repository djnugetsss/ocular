import type { BlinkEvent, FaceDetectionEvent } from 'ocular-vision';

import { SessionAggregator, scorePose } from '@/features/vision/session-aggregator';

function frame(overrides: Partial<FaceDetectionEvent> = {}): FaceDetectionEvent {
  return {
    timestamp: 0,
    hasFace: true,
    confidence: 0.95,
    boundingBox: null,
    headPose: { yaw: 0, pitch: 0, roll: 0, stability: 1 },
    blink: null,
    landmarks: null,
    processedFps: 30,
    ...overrides,
  };
}

function blink(durationMs: number): BlinkEvent {
  return { timestamp: 0, durationMs, eye: 'both', blinkCount: 1, blinksPerMinute: 0 };
}

describe('scorePose', () => {
  it('scores a neutral head at 1', () => {
    expect(scorePose(0, 0, 0)).toBe(1);
  });

  it('scores at or past the deviation ceiling as 0', () => {
    expect(scorePose(30, 0, 0)).toBe(0);
    expect(scorePose(90, 0, 0)).toBe(0);
  });

  it('treats combined deviation as worse than a single axis', () => {
    expect(scorePose(15, 15, 0)).toBeLessThan(scorePose(15, 0, 0));
  });
});

describe('SessionAggregator', () => {
  it('reports no data before any frames arrive', () => {
    expect(new SessionAggregator().hasData).toBe(false);
  });

  it('computes blink rate from session duration, not the native window', () => {
    const startedAt = new Date('2026-07-18T10:00:00Z');
    const aggregator = new SessionAggregator(startedAt);

    aggregator.addFrame(frame());
    for (let i = 0; i < 10; i += 1) aggregator.addBlink(blink(120));

    // 10 blinks over exactly 2 minutes is 5/min.
    const summary = aggregator.summarize(new Date('2026-07-18T10:02:00Z'));

    expect(summary.blinkCount).toBe(10);
    expect(summary.blinksPerMinute).toBe(5);
    expect(summary.meanBlinkDurationMs).toBe(120);
    expect(summary.durationSeconds).toBe(120);
  });

  it('excludes unstable frames from pose averages', () => {
    const aggregator = new SessionAggregator(new Date());

    // A steady neutral pose, then a wild reading taken mid-motion.
    aggregator.addFrame(frame({ headPose: { yaw: 0, pitch: 0, roll: 0, stability: 1 } }));
    aggregator.addFrame(frame({ headPose: { yaw: 60, pitch: 60, roll: 60, stability: 0.1 } }));

    const summary = aggregator.summarize();

    // The unstable sample must not drag the average off neutral.
    expect(summary.meanYaw).toBe(0);
  });

  it('scores posture as drift from the session baseline, not the camera', () => {
    const aggregator = new SessionAggregator(new Date());
    const slumped = { yaw: 10, pitch: -8, roll: 3, stability: 1 };

    // A user who starts off-axis and holds that position has not drifted —
    // the score measures change within the session, not camera alignment.
    for (let i = 0; i < 40; i += 1) aggregator.addFrame(frame({ headPose: slumped }));

    expect(aggregator.summarize().postureScore).toBe(100);
  });

  it('penalizes drift away from the starting pose', () => {
    const aggregator = new SessionAggregator(new Date());

    // Baseline window at neutral, then a slump past the deviation ceiling.
    for (let i = 0; i < 30; i += 1)
      aggregator.addFrame(frame({ headPose: { yaw: 0, pitch: 0, roll: 0, stability: 1 } }));
    for (let i = 0; i < 10; i += 1)
      aggregator.addFrame(frame({ headPose: { yaw: 0, pitch: -35, roll: 0, stability: 1 } }));

    expect(aggregator.summarize().postureScore).toBe(0);
  });

  it('returns null posture for sessions shorter than the baseline window', () => {
    const aggregator = new SessionAggregator(new Date());
    for (let i = 0; i < 10; i += 1) aggregator.addFrame(frame());

    const summary = aggregator.summarize();

    // Too short to establish what the user drifted *from* — no honest score
    // exists, though the descriptive angle means are still reported.
    expect(summary.postureScore).toBeNull();
    expect(summary.meanYaw).toBe(0);
  });

  it('ignores pose but still counts coverage for faceless frames', () => {
    const aggregator = new SessionAggregator(new Date());

    aggregator.addFrame(frame());
    aggregator.addFrame(frame({ hasFace: false, headPose: null }));

    const summary = aggregator.summarize();

    expect(summary.trackingCoverage).toBe(0.5);
    expect(summary.meanYaw).toBe(0);
  });

  it('returns null pose metrics when no usable pose was ever seen', () => {
    const aggregator = new SessionAggregator(new Date());
    aggregator.addFrame(frame({ hasFace: false, headPose: null }));

    const summary = aggregator.summarize();

    // Null rather than 0: a missing measurement is not a neutral head, and
    // storing 0 would show up as perfect posture on the dashboard.
    expect(summary.meanYaw).toBeNull();
    expect(summary.postureScore).toBeNull();
    expect(summary.meanBlinkDurationMs).toBeNull();
  });

  it('excludes interrupted time from duration and blink rate', () => {
    const aggregator = new SessionAggregator(new Date('2026-07-18T10:00:00Z'));
    aggregator.addFrame(frame());
    for (let i = 0; i < 5; i += 1) aggregator.addBlink(blink(120));

    // One minute measured, one minute backgrounded, then ended.
    aggregator.pause(new Date('2026-07-18T10:01:00Z'));
    aggregator.resume(new Date('2026-07-18T10:02:00Z'));

    const summary = aggregator.summarize(new Date('2026-07-18T10:02:00Z'));

    // 5 blinks over 1 measured minute — not 2.5 over 2 wall-clock minutes.
    expect(summary.durationSeconds).toBe(60);
    expect(summary.blinksPerMinute).toBe(5);
  });

  it('counts a still-open interruption up to the end time', () => {
    const aggregator = new SessionAggregator(new Date('2026-07-18T10:00:00Z'));
    aggregator.addFrame(frame());

    // Session ends while still interrupted (stopped from the background).
    aggregator.pause(new Date('2026-07-18T10:01:00Z'));

    const summary = aggregator.summarize(new Date('2026-07-18T10:03:00Z'));
    expect(summary.durationSeconds).toBe(60);
  });

  it('treats repeated pause and stray resume calls as no-ops', () => {
    const aggregator = new SessionAggregator(new Date('2026-07-18T10:00:00Z'));
    aggregator.addFrame(frame());

    aggregator.resume(new Date('2026-07-18T10:00:30Z')); // never paused
    aggregator.pause(new Date('2026-07-18T10:01:00Z'));
    aggregator.pause(new Date('2026-07-18T10:01:30Z')); // must keep the first start
    aggregator.resume(new Date('2026-07-18T10:02:00Z'));

    const summary = aggregator.summarize(new Date('2026-07-18T10:02:00Z'));
    expect(summary.durationSeconds).toBe(60);
  });

  it('stays usable after summarizing', () => {
    const aggregator = new SessionAggregator(new Date());
    aggregator.addFrame(frame());
    aggregator.summarize();
    aggregator.addBlink(blink(100));

    expect(aggregator.summarize().blinkCount).toBe(1);
  });
});
