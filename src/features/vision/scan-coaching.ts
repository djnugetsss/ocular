/**
 * Positioning and visibility coaching for the scan screen
 * (DESIGN_REVIEW.md §3, states 8–9).
 *
 * Derives gentle guidance — too close, too far, hard to see — from signals
 * the pipeline already produces. Two hard rules from the design:
 *
 * - **Advice, not a gate.** A hint never blocks or stops measurement;
 *   callers only use it to swap the status pill's copy.
 * - **No flashing.** Every hint is debounced on the way in *and* out, so a
 *   momentary lean or a single dark frame cannot make the pill nag.
 *
 * Kept as a plain class with no React dependencies (the
 * `session-aggregator` precedent) so the debounce rules are unit-testable
 * against synthetic frame streams with explicit timestamps.
 */

export type CoachingHint = 'too-close' | 'too-far' | 'low-visibility';

export interface CoachingObservation {
  /** Monotonic timestamp in milliseconds (the frame event's own clock). */
  timestampMs: number;
  hasFace: boolean;
  /** Vision's detection confidence `0..1`; meaningless when `hasFace` is false. */
  confidence: number;
  /** Face box width as a fraction of the preview width; null without a face. */
  faceWidthFraction: number | null;
}

/** Face wider than this fraction of the preview reads as "too close". */
const TOO_CLOSE_FRACTION = 0.55;

/** Face narrower than this fraction reads as "too far". */
const TOO_FAR_FRACTION = 0.18;

/**
 * A distance zone must hold this long to raise a hint, and the in-band zone
 * must hold this long to clear one (§3: "debounced 1 s so momentary
 * lean-ins don't nag").
 */
const DISTANCE_DEBOUNCE_MS = 1000;

/** Confidence below this counts toward the visibility proxy. */
const LOW_CONFIDENCE = 0.4;

/**
 * How long confidence must stay low — with a face still intermittently
 * found — before visibility coaching appears. Vision reports no lux, so
 * this is a proxy and the copy must stay phrased as visibility, never as a
 * confident diagnosis of lighting.
 */
const LOW_VISIBILITY_SUSTAIN_MS = 3000;

/** A face older than this is "gone", not "intermittent". */
const FACE_FRESHNESS_MS = 3000;

type DistanceZone = 'too-close' | 'too-far' | 'in-band';

export class CoachingMonitor {
  private activeDistance: 'too-close' | 'too-far' | null = null;
  private candidateZone: DistanceZone | null = null;
  private candidateSince = 0;

  private lastFaceAt: number | null = null;
  private lastConfidentAt: number | null = null;

  /**
   * Feeds one frame; returns the hint that should be showing after it.
   * Safe to call at full event rate.
   */
  observe(observation: CoachingObservation): CoachingHint | null {
    const now = observation.timestampMs;

    // The confidence clock starts at the first frame, not at zero — otherwise
    // the first observed frame of a session could instantly claim "sustained"
    // low visibility.
    if (this.lastConfidentAt === null) this.lastConfidentAt = now;

    if (observation.hasFace) this.lastFaceAt = now;
    if (observation.confidence >= LOW_CONFIDENCE) this.lastConfidentAt = now;

    this.updateDistance(observation, now);

    // Distance advice is only meaningful while the face is actually current;
    // a lost face is the searching state's business (state 10), not ours.
    const faceIsCurrent =
      this.lastFaceAt !== null && now - this.lastFaceAt <= DISTANCE_DEBOUNCE_MS;

    if (this.activeDistance !== null && faceIsCurrent) return this.activeDistance;

    const lowVisibility =
      now - this.lastConfidentAt > LOW_VISIBILITY_SUSTAIN_MS &&
      this.lastFaceAt !== null &&
      now - this.lastFaceAt <= FACE_FRESHNESS_MS;

    return lowVisibility ? 'low-visibility' : null;
  }

  /** Forgets everything. Call when a session starts. */
  reset(): void {
    this.activeDistance = null;
    this.candidateZone = null;
    this.candidateSince = 0;
    this.lastFaceAt = null;
    this.lastConfidentAt = null;
  }

  private updateDistance(observation: CoachingObservation, now: number): void {
    if (!observation.hasFace || observation.faceWidthFraction === null) {
      // No face: freeze the debounce rather than counting absence as a zone.
      this.candidateZone = null;
      return;
    }

    const zone: DistanceZone =
      observation.faceWidthFraction > TOO_CLOSE_FRACTION
        ? 'too-close'
        : observation.faceWidthFraction < TOO_FAR_FRACTION
          ? 'too-far'
          : 'in-band';

    if (zone !== this.candidateZone) {
      this.candidateZone = zone;
      this.candidateSince = now;
      return;
    }

    if (now - this.candidateSince < DISTANCE_DEBOUNCE_MS) return;

    this.activeDistance = zone === 'in-band' ? null : zone;
  }
}
