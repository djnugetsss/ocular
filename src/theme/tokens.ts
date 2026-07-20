/**
 * Design tokens as JavaScript values (PRODUCT_SPEC.md §5).
 *
 * NativeWind classes are the primary styling mechanism and should be preferred
 * everywhere they work. This file exists for the places they cannot reach:
 *
 * - React Navigation options (tab bar tints, scene backgrounds)
 * - `react-native-svg` props, which take color strings not classes
 * - Reanimated interpolations, which need raw values to animate between
 * - `ActivityIndicator` / `RefreshControl`, whose color props are imperative
 *
 * These values are duplicated in `tailwind.config.js` by necessity — Tailwind's
 * config is not importable at runtime under Metro without pulling the whole
 * config graph into the bundle. The two must be changed together; that pairing
 * is the cost of having tokens available in both worlds.
 */

export const colors = {
  canvas: {
    DEFAULT: '#0B0B0F',
    raised: '#14141B',
    overlay: '#1D1D27',
  },
  ink: {
    DEFAULT: '#F5F5F7',
    muted: '#A0A0AE',
    // Lightened from #6B6B7B (≈3.6:1 on canvas — below WCAG AA) to ≈4.6:1,
    // since this token is used for caption-size text (DESIGN_REVIEW.md §1).
    faint: '#7E7E8F',
  },
  accent: {
    DEFAULT: '#5B8DEF',
    strong: '#3D6FD9',
    soft: '#1B2740',
  },
  signal: {
    ok: '#3DD68C',
    warn: '#F5B942',
    bad: '#F26D6D',
  },
  hairline: '#262631',
} as const;

/** 4-point base scale (§5.3). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  card: 18,
  sheet: 24,
  pill: 999,
} as const;

/** Motion durations in milliseconds (§5.4). */
export const duration = {
  /** Onboarding page transitions. */
  page: 250,
  /** Ring and chart fills on appear. */
  fill: 600,
  /** Face guide acquire/lose. */
  state: 300,
  /** Blink pulse. */
  pulse: 120,
} as const;

/**
 * Thresholds that turn a measurement into a tone.
 *
 * Centralized because they appear in at least four places (Today's cards, the
 * scan band, session results, insights bands) and drifting copies would mean
 * the same number rendering amber on one screen and green on another.
 *
 * The blink figures come from the resting-rate literature referenced in
 * PLAN.md §5 — a relaxed adult averages roughly 15-20/min, and sustained screen
 * focus commonly halves that. They are deliberately conservative: this app
 * flags "notably below typical," never "abnormal."
 */
export const thresholds = {
  blinkRate: {
    /** At or above this reads as healthy. */
    good: 12,
    /** Below this reads as notably low. */
    low: 8,
  },
  postureScore: {
    good: 80,
    low: 60,
  },
} as const;

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad';

/**
 * Maps a blink rate to a tone. Returns `neutral` for a missing measurement —
 * an absent value is not a bad one, and coloring it would invent a finding.
 */
export function blinkRateTone(rate: number | null | undefined): Tone {
  if (rate == null) return 'neutral';
  if (rate < thresholds.blinkRate.low) return 'bad';
  if (rate < thresholds.blinkRate.good) return 'warn';
  return 'ok';
}

/** Maps a 0-100 posture score to a tone. `neutral` when unmeasured. */
export function postureTone(score: number | null | undefined): Tone {
  if (score == null) return 'neutral';
  if (score < thresholds.postureScore.low) return 'bad';
  if (score < thresholds.postureScore.good) return 'warn';
  return 'ok';
}
