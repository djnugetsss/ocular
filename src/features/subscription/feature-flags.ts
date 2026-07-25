import type { Entitlements } from '@/features/subscription/entitlements';

/**
 * FeatureGate — the one place a screen asks "can this user use X, and if not,
 * why not?" for a named capability.
 *
 * Two axes, kept separate on purpose:
 *
 * - **Entitlement** — does the user's plan grant it? Read from the resolved
 *   `Entitlements` record, which `entitlements.ts` owns. This module never
 *   re-derives Pro-ness; it reads the boolean already decided there.
 * - **Availability** — has the feature shipped at all? A capability can be
 *   entitled to Pro yet still `coming_soon` (background tracking today). The
 *   registry below is the single source of that truth, so the paywall's
 *   "Coming soon" chip and a gate's decision cannot drift.
 *
 * Adding a future premium feature is a one-line entry here plus its entitlement
 * boolean — no screen learns a plan name, and nothing gates on `tier ===`.
 */

export type Feature =
  | 'unlimited_check_ins'
  | 'unlimited_history'
  | 'insights'
  | 'trend_analytics'
  | 'export'
  | 'background_tracking';

/** Whether a shipped-and-live feature is reachable, or why it is not. */
export type FeatureAvailability = 'live' | 'coming_soon';

/**
 * Why a gate resolved the way it did:
 * - `ok` — allowed.
 * - `requires_pro` — the plan does not grant it; the upgrade path applies.
 * - `coming_soon` — the plan grants it, but it has not shipped yet; show a
 *   "Coming soon" affordance, never an upgrade prompt.
 */
export type FeatureReason = 'ok' | 'requires_pro' | 'coming_soon';

export interface FeatureAccess {
  allowed: boolean;
  reason: FeatureReason;
}

interface FeatureDefinition {
  /** Reads the plan's grant for this feature from the resolved entitlements. */
  entitled: (entitlements: Entitlements) => boolean;
  availability: FeatureAvailability;
}

/**
 * The registry. Each feature names the entitlement boolean it reads and its
 * shipping state. The booleans live on `Entitlements` so tier policy stays in
 * one file; availability lives here so "built vs. planned" stays in one file.
 */
export const FEATURE_FLAGS: Record<Feature, FeatureDefinition> = {
  unlimited_check_ins: {
    entitled: (e) => e.dailyCheckInLimit === null,
    availability: 'live',
  },
  unlimited_history: {
    entitled: (e) => e.visibleSessionLimit === null,
    availability: 'live',
  },
  insights: {
    entitled: (e) => e.hasFullInsights,
    availability: 'live',
  },
  trend_analytics: {
    entitled: (e) => e.hasTrendAnalytics,
    availability: 'live',
  },
  export: {
    entitled: (e) => e.hasExport,
    availability: 'live',
  },
  background_tracking: {
    // Entitled to Pro today, but not yet shipped — the "Coming Soon
    // entitlement". Even an entitled user resolves to `coming_soon`, never
    // `ok`, until this flips to `live`.
    entitled: (e) => e.hasBackgroundTracking,
    availability: 'coming_soon',
  },
};

/**
 * Resolves access to a feature for a plan.
 *
 * `allowed` is true only when the plan grants it *and* it has shipped. The
 * `reason` distinguishes the two failure modes so the UI responds correctly:
 * an upgrade CTA for `requires_pro`, a "Coming soon" note for `coming_soon`.
 */
export function featureAccess(entitlements: Entitlements, feature: Feature): FeatureAccess {
  const definition = FEATURE_FLAGS[feature];
  if (!definition.entitled(entitlements)) {
    return { allowed: false, reason: 'requires_pro' };
  }
  if (definition.availability !== 'live') {
    return { allowed: false, reason: 'coming_soon' };
  }
  return { allowed: true, reason: 'ok' };
}

/** The boolean shorthand, for the common `if (canUse(...))` gate. */
export function canUseFeature(entitlements: Entitlements, feature: Feature): boolean {
  return featureAccess(entitlements, feature).allowed;
}
