/**
 * What each plan grants — the single source of truth for every feature gate.
 *
 * Pure by construction: no React, no storage, no clock, no network. The
 * provider decides *which* tier the user is on; this module decides what that
 * tier means, and it is the only place that decision is written down. A screen
 * that hardcodes "10" or "3" has forked the policy, which is exactly how a
 * paying subscriber ends up gated by a list nobody remembered to update.
 *
 * Two invariants run through everything here, and they are product rules, not
 * implementation details:
 *
 * 1. **Limits are presentational, never destructive.** `visibleSessionLimit`
 *    bounds what a list *renders*. Every session the user has ever recorded
 *    stays in the database, keeps counting toward aggregates, and reappears in
 *    full the moment they upgrade. Nothing in this file — or anything reading
 *    it — may delete, stop writing, or stop fetching a session.
 * 2. **A gate that cannot decide stays open.** Unknown usage and an unresolved
 *    tier both grant access. Wrongly allowing one check-in costs nothing;
 *    wrongly blocking one costs the user the measurement they opened the app
 *    to take.
 */

export type SubscriptionTier = 'free' | 'pro_monthly' | 'pro_annual';

/** A tier that can be bought. `purchase()` takes this, so "buy free" cannot typecheck. */
export type PaidTier = Exclude<SubscriptionTier, 'free'>;

/** Every tier, in upgrade order. Used to validate persisted values. */
export const SUBSCRIPTION_TIERS = ['free', 'pro_monthly', 'pro_annual'] as const;

/** Completed check-ins a free user may record per device-local day. */
export const FREE_DAILY_CHECK_IN_LIMIT = 3;

/**
 * How many sessions a free user's history lists render.
 *
 * Presentation only. The repository still fetches, and the aggregators still
 * average, everything within their windows — hiding a session from a list is
 * not the same as pretending it never happened, and a free user's Today ring
 * and Insights averages stay honest because of that distinction.
 */
export const FREE_VISIBLE_SESSION_LIMIT = 10;

export interface Entitlements {
  tier: SubscriptionTier;
  isPro: boolean;
  /** Human-readable plan name, for Profile and any upgrade copy. */
  planLabel: string;
  /** Completed check-ins per local day; `null` means unlimited. */
  dailyCheckInLimit: number | null;
  /** Sessions a history list may render; `null` means unlimited. */
  visibleSessionLimit: number | null;
  /** Charts, previous-range comparisons, and time-of-day patterns. */
  hasFullInsights: boolean;
  /** Trend charts specifically — the sparklines and range lines on Insights. */
  hasTrendAnalytics: boolean;
  /**
   * Exporting the full session history.
   *
   * True on **every** plan, and deliberately so. Profile's "Export my data" has
   * never been gated, and it should not be: the export is the user's own
   * measurements, and a plan that could withhold them would make the free tier a
   * place data goes in and cannot come out of. The flag stays on the record
   * rather than being deleted so `feature-flags.ts` keeps one uniform way to ask
   * about a capability — see the note in `premium-content.ts`, whose comparison
   * table now agrees with this.
   */
  hasExport: boolean;
  /**
   * Whether the plan *entitles* opt-in ambient measurement. Distinct from
   * whether it has shipped: Pro is entitled today, but the feature is still
   * "Coming Soon", which `feature-flags.ts` — not this record — decides. Kept
   * here so the entitlement and the availability stay separable.
   */
  hasBackgroundTracking: boolean;
}

const FREE: Entitlements = {
  tier: 'free',
  isPro: false,
  planLabel: 'Free',
  dailyCheckInLimit: FREE_DAILY_CHECK_IN_LIMIT,
  visibleSessionLimit: FREE_VISIBLE_SESSION_LIMIT,
  hasFullInsights: false,
  hasTrendAnalytics: false,
  // Not a paid capability — see the field's doc comment. Your data is yours on
  // every plan, and the paywall says so.
  hasExport: true,
  hasBackgroundTracking: false,
};

const PRO: Omit<Entitlements, 'tier' | 'planLabel'> = {
  isPro: true,
  dailyCheckInLimit: null,
  visibleSessionLimit: null,
  hasFullInsights: true,
  hasTrendAnalytics: true,
  hasExport: true,
  hasBackgroundTracking: true,
};

const BY_TIER: Record<SubscriptionTier, Entitlements> = {
  free: FREE,
  pro_monthly: { ...PRO, tier: 'pro_monthly', planLabel: 'Pro Monthly' },
  pro_annual: { ...PRO, tier: 'pro_annual', planLabel: 'Pro Annual' },
};

/**
 * Granted while the real tier is still being read.
 *
 * Deliberately permissive per invariant 2. The window is short — resolution is
 * a local storage read that completes while the splash screen is still up —
 * and the failure it prevents (a subscriber blocked from starting a scan on a
 * cold launch) is far worse than the one it allows.
 *
 * `tier` stays `free` because that is the honest answer to "what has been
 * verified?"; UI that must not flash an upgrade prompt should read
 * `status` from `useSubscription` rather than inferring it from here.
 */
export const PENDING_ENTITLEMENTS: Entitlements = {
  tier: 'free',
  isPro: false,
  planLabel: 'Free',
  dailyCheckInLimit: null,
  visibleSessionLimit: null,
  hasFullInsights: true,
  hasTrendAnalytics: true,
  hasExport: true,
  hasBackgroundTracking: true,
};

export function isProTier(tier: SubscriptionTier): boolean {
  return tier !== 'free';
}

/** Narrows an untrusted string (persisted value, future receipt) to a tier. */
export function asSubscriptionTier(value: unknown): SubscriptionTier | null {
  return SUBSCRIPTION_TIERS.includes(value as SubscriptionTier)
    ? (value as SubscriptionTier)
    : null;
}

export function entitlementsFor(tier: SubscriptionTier): Entitlements {
  return BY_TIER[tier];
}

// ── Gate: daily check-ins ────────────────────────────────────────────────────

export interface CheckInAllowance {
  /** Whether a new check-in may be started right now. */
  isAllowed: boolean;
  /** Per-day ceiling; `null` when unlimited. */
  limit: number | null;
  /** Completed check-ins counted for today; 0 when usage is unknown. */
  used: number;
  /** Check-ins left today; `null` when unlimited. */
  remaining: number | null;
  isUnlimited: boolean;
  /**
   * True when the count could not be established (offline, still loading). The
   * gate is open in this state — surfacing it lets the UI decline to make
   * promises ("2 left") it cannot keep.
   */
  isUsageUnknown: boolean;
}

/**
 * Resolves the daily check-in gate.
 *
 * `completedToday` is the number of *persisted* sessions started on the
 * device-local day (see `daily-usage.ts`). Sessions under the repository's
 * 10-second floor are never persisted and so never consume the allowance — a
 * mis-tap does not cost a free user a third of their day.
 */
export function checkInAllowance(
  entitlements: Entitlements,
  completedToday: number | null
): CheckInAllowance {
  const limit = entitlements.dailyCheckInLimit;

  if (limit === null) {
    return {
      isAllowed: true,
      limit: null,
      used: completedToday ?? 0,
      remaining: null,
      isUnlimited: true,
      isUsageUnknown: completedToday === null,
    };
  }

  if (completedToday === null) {
    return {
      isAllowed: true,
      limit,
      used: 0,
      remaining: null,
      isUnlimited: false,
      isUsageUnknown: true,
    };
  }

  const used = Math.max(0, completedToday);
  return {
    isAllowed: used < limit,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    isUnlimited: false,
    isUsageUnknown: false,
  };
}

// ── Gate: visible history ────────────────────────────────────────────────────

export interface VisibleSessions<T> {
  /** The slice a list may render, newest-first order preserved. */
  visible: T[];
  /** How many stored sessions this plan is not rendering. Never deleted. */
  hiddenCount: number;
  /** True when the plan actually withheld something. */
  isLimited: boolean;
  limit: number | null;
}

/**
 * Applies the plan's visible-history ceiling to an already-ordered list.
 *
 * Takes and returns opaque items so it works for any row shape (Today's recent
 * list, an Insights range, a future grouped view) without this module learning
 * the session type. `slice` copies — the input is never mutated, and callers
 * keep the full array for aggregation.
 *
 * `totalCount` lets a caller report an accurate `hiddenCount` when `sessions`
 * is only a *window* of the full history. Today fetches the newest ~30 for its
 * aggregates but a free user has hundreds; passing the exact total (from the
 * same round trip — see `listRecentSessionsPage`) makes "N older kept" honest
 * instead of capped at the window size. Omit it when the array *is* the whole
 * set (an Insights range), and the length is used directly. A `null` limit
 * (Pro) always hides nothing, regardless of the window or total.
 */
export function visibleSessions<T>(
  sessions: readonly T[],
  entitlements: Entitlements,
  totalCount?: number | null
): VisibleSessions<T> {
  const limit = entitlements.visibleSessionLimit;

  if (limit === null) {
    return { visible: sessions.slice(), hiddenCount: 0, isLimited: false, limit };
  }

  const visible = sessions.slice(0, limit);
  const total = Math.max(totalCount ?? sessions.length, visible.length);
  const hiddenCount = total - visible.length;

  return {
    visible,
    hiddenCount,
    isLimited: hiddenCount > 0,
    limit,
  };
}
