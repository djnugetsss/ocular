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
 * at 30 degrees off-neutral scores 0 for those frames; dead-on neutral scores 100.
 */
const POSTURE_DEVIATION_CEILING = 30;

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

  private frameCount = 0;
  private facedFrameCount = 0;

  private yawSum = 0;
  private pitchSum = 0;
  private rollSum = 0;
  private postureSum = 0;
  private poseSampleCount = 0;

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

    // Only score frames where the head was reasonably still. During fast motion
    // the pose reading is mid-transition and does not describe a posture the
    // user actually held, so including it would drag the score toward whatever
    // angles they happened to sweep through.
    if (pose.stability < 0.5) return;

    this.yawSum += pose.yaw;
    this.pitchSum += pose.pitch;
    this.rollSum += pose.roll;
    this.postureSum += scorePose(pose.yaw, pose.pitch, pose.roll);
    this.poseSampleCount += 1;
  }

  /** Feeds in one completed blink. */
  addBlink(event: BlinkEvent): void {
    this.blinkCount += 1;
    this.blinkDurationSum += event.durationMs;
  }

  get hasData(): boolean {
    return this.frameCount > 0;
  }

  /** Builds the summary. Non-destructive — the aggregator stays usable after. */
  summarize(endedAt: Date = new Date()): SessionSummary {
    const durationMs = Math.max(0, endedAt.getTime() - this.startedAtMs);
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
      postureScore:
        this.poseSampleCount > 0 ? round((this.postureSum / this.poseSampleCount) * 100, 2) : null,
      trackingCoverage: this.frameCount > 0 ? round(this.facedFrameCount / this.frameCount, 4) : 0,
    };
  }
}

/**
 * Scores a single pose sample from 0 (poor) to 1 (neutral).
 *
 * Uses the Euclidean magnitude of the three angles rather than penalizing each
 * axis separately: a head that is 15 degrees off in yaw *and* 15 off in pitch is
 * further from neutral than one 15 degrees off in yaw alone, and summing
 * independent penalties would not capture that.
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
