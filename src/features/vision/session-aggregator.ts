import type { FaceDetectionEvent, BlinkEvent } from 'ocular-vision';

import type { SessionInsert } from '@/lib/supabase/database.types';

/**
 * Accumulates a tracking session into the summary that gets persisted.
 *
 * Kept as a plain class with no React or native dependencies so the scoring
 * logic can be unit tested against synthetic frame streams — which is the only
 * practical way to test it, since the alternative is blinking at a phone.
 *
 * Memory is bounded by design: a 30-minute session at 15 events/sec is 27,000
 * frames, and retaining those would be tens of megabytes for numbers that only
 * ever get averaged. Running sums are kept instead.
 */

/**
 * Angular deviation, in degrees, treated as fully bad posture.
 *
 * Chosen from the ergonomics literature on neck flexion: sustained deviation
 * past roughly 25-30 degrees is where cervical load rises sharply. A user held
 * at 30 degrees off their baseline scores 0 for those frames; holding the
 * baseline exactly scores 100.
 */
const POSTURE_DEVIATION_CEILING = 30;

/**
 * Stable pose samples averaged into the session's baseline before scoring
 * starts — roughly two seconds at the default 15 events/sec.
 *
 * Posture is scored as *drift from how the session started*, not as alignment
 * with the camera. Camera-relative scoring pinned everyone near 100: holding
 * the phone in front of your face is, by definition, near 0° on every axis.
 * Drift scoring measures the thing the product actually cares about — the
 * slow slump during focus. Known trade-off, accepted deliberately: a user who
 * starts slumped and stays slumped scores well; what is measured is change
 * within the session, and the copy must not claim more than that.
 */
const BASELINE_SAMPLE_COUNT = 30;

export interface SessionSummary {
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  blinkCount: number;
  blinksPerMinute: number;
  meanBlinkDurationMs: number | null;
  meanYaw: number | null;
  meanPitch: number | null;
  meanRoll: number | null;
  postureScore: number | null;
  /** Fraction of frames in which a face was found, `0..1`. */
  trackingCoverage: number;
}

export class SessionAggregator {
  private readonly startedAt: Date;
  private readonly startedAtMs: number;

  // Interruption bookkeeping. While the capture session is interrupted (call,
  // backgrounding, Split View) no frames arrive, so counting that wall time as
  // session duration would deflate the blink rate — a 2-minute measurement
  // with 1 minute backgrounded is a 1-minute measurement.
  private pausedMsTotal = 0;
  private pauseStartedAtMs: number | null = null;

  private frameCount = 0;
  private facedFrameCount = 0;

  private yawSum = 0;
  private pitchSum = 0;
  private rollSum = 0;
  private poseSampleCount = 0;

  // Baseline accumulation, then drift scoring against it.
  private baselineYawSum = 0;
  private baselinePitchSum = 0;
  private baselineRollSum = 0;
  private baselineCount = 0;
  private baseline: { yaw: number; pitch: number; roll: number } | null = null;

  private postureSum = 0;
  private scoredSampleCount = 0;

  private blinkCount = 0;
  private blinkDurationSum = 0;

  constructor(startedAt: Date = new Date()) {
    this.startedAt = startedAt;
    this.startedAtMs = startedAt.getTime();
  }

  /** Feeds in one per-frame event. Safe to call at full event rate. */
  addFrame(event: FaceDetectionEvent): void {
    this.frameCount += 1;
    if (!event.hasFace) return;
    this.facedFrameCount += 1;

    const pose = event.headPose;
    if (!pose) return;

    // Only use frames where the head was reasonably still. During fast motion
    // the pose reading is mid-transition and does not describe a posture the
    // user actually held, so including it would drag both the baseline and the
    // score toward whatever angles they happened to sweep through.
    if (pose.stability < 0.5) return;

    this.yawSum += pose.yaw;
    this.pitchSum += pose.pitch;
    this.rollSum += pose.roll;
    this.poseSampleCount += 1;

    if (this.baseline === null) {
      // Still establishing where this session started; these samples are the
      // reference, so they are not scored against themselves.
      this.baselineYawSum += pose.yaw;
      this.baselinePitchSum += pose.pitch;
      this.baselineRollSum += pose.roll;
      this.baselineCount += 1;

      if (this.baselineCount === BASELINE_SAMPLE_COUNT) {
        this.baseline = {
          yaw: this.baselineYawSum / this.baselineCount,
          pitch: this.baselinePitchSum / this.baselineCount,
          roll: this.baselineRollSum / this.baselineCount,
        };
      }
      return;
    }

    this.postureSum += scorePose(
      pose.yaw - this.baseline.yaw,
      pose.pitch - this.baseline.pitch,
      pose.roll - this.baseline.roll
    );
    this.scoredSampleCount += 1;
  }

  /** Feeds in one completed blink. */
  addBlink(event: BlinkEvent): void {
    this.blinkCount += 1;
    this.blinkDurationSum += event.durationMs;
  }

  /**
   * Marks the start of an interruption. Idempotent: a second pause while
   * already paused keeps the original start, since the earlier moment is when
   * measurement actually stopped.
   */
  pause(at: Date = new Date()): void {
    if (this.pauseStartedAtMs !== null) return;
    this.pauseStartedAtMs = at.getTime();
  }

  /** Marks the end of an interruption. Safe to call when not paused. */
  resume(at: Date = new Date()): void {
    if (this.pauseStartedAtMs === null) return;
    this.pausedMsTotal += Math.max(0, at.getTime() - this.pauseStartedAtMs);
    this.pauseStartedAtMs = null;
  }

  get hasData(): boolean {
    return this.frameCount > 0;
  }

  /** Builds the summary. Non-destructive — the aggregator stays usable after. */
  summarize(endedAt: Date = new Date()): SessionSummary {
    // An interruption still open when the session ends (stopped while
    // backgrounded) is counted up to the end time without mutating state,
    // keeping summarize non-destructive.
    const openPauseMs =
      this.pauseStartedAtMs !== null ? Math.max(0, endedAt.getTime() - this.pauseStartedAtMs) : 0;
    const pausedMs = this.pausedMsTotal + openPauseMs;

    const durationMs = Math.max(0, endedAt.getTime() - this.startedAtMs - pausedMs);
    const durationSeconds = Math.round(durationMs / 1000);
    const durationMinutes = durationMs / 60_000;

    const mean = (sum: number): number | null =>
      this.poseSampleCount > 0 ? round(sum / this.poseSampleCount, 2) : null;

    return {
      startedAt: this.startedAt,
      endedAt,
      durationSeconds,
      blinkCount: this.blinkCount,
      // Computed from the session's own duration rather than carried over from
      // the native rolling window, so the stored figure describes the whole
      // session instead of its final minute.
      blinksPerMinute: durationMinutes > 0 ? round(this.blinkCount / durationMinutes, 2) : 0,
      meanBlinkDurationMs:
        this.blinkCount > 0 ? round(this.blinkDurationSum / this.blinkCount, 2) : null,
      meanYaw: mean(this.yawSum),
      meanPitch: mean(this.pitchSum),
      meanRoll: mean(this.rollSum),
      // Null until the session outlasted its baseline window: a score needs
      // something to have drifted *from*, and a session too short to establish
      // that reference has no honest posture finding.
      postureScore:
        this.scoredSampleCount > 0
          ? round((this.postureSum / this.scoredSampleCount) * 100, 2)
          : null,
      trackingCoverage: this.frameCount > 0 ? round(this.facedFrameCount / this.frameCount, 4) : 0,
    };
  }
}

/**
 * Scores a per-axis angular deviation from 1 (no deviation) down to 0.
 *
 * Callers pass deviations — since the drift-scoring change, that means angles
 * relative to the session baseline rather than to the camera. Uses the
 * Euclidean magnitude of the three axes rather than penalizing each
 * separately: a head 15 degrees off in yaw *and* 15 off in pitch has drifted
 * further than one 15 degrees off in yaw alone, and summing independent
 * penalties would not capture that.
 */
export function scorePose(yaw: number, pitch: number, roll: number): number {
  const magnitude = Math.sqrt(yaw * yaw + pitch * pitch + roll * roll);
  return Math.max(0, Math.min(1, 1 - magnitude / POSTURE_DEVIATION_CEILING));
}

/** Maps a summary onto the `sessions` insert shape. */
export function toSessionInsert(summary: SessionSummary, userId: string): SessionInsert {
  return {
    user_id: userId,
    started_at: summary.startedAt.toISOString(),
    ended_at: summary.endedAt.toISOString(),
    duration_seconds: summary.durationSeconds,
    blink_count: summary.blinkCount,
    blinks_per_minute: summary.blinksPerMinute,
    mean_blink_duration_ms: summary.meanBlinkDurationMs,
    mean_yaw: summary.meanYaw,
    mean_pitch: summary.meanPitch,
    mean_roll: summary.meanRoll,
    posture_score: summary.postureScore,
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
