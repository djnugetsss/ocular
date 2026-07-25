import type { PaidTier } from '@/features/subscription/entitlements';

/**
 * Everything the premium sheet says — copy, pricing, and the plan comparison —
 * kept out of the component so the words can be tested and the sheet stays
 * composition (PLAN.md §3 rule: screens compose; content is data).
 *
 * Voice rules, inherited from the product spec and enforced by test here:
 * behavioral, never medical; honest about what is future ("Coming soon" means
 * not built, not "rolling out"); no urgency, no countdowns, no exaggerated
 * claims; and never a word that implies the free plan loses data — it
 * doesn't, and the copy leans on that fact as the trust move.
 *
 * Prices are USD literals for now. RevenueCat is the source of truth for
 * localized prices; `useProducts` prefers its `displayPrice` and falls back to
 * these labels offline. The literals and numbers must agree — a test checks it.
 */

export const PAYWALL_HEADLINE = 'Build healthier screen habits.';

export const PAYWALL_SUBHEADLINE =
  'Ocular quietly measures your blink habits while you work—privately, entirely on your device.';

export const PRICING = {
  monthly: {
    tier: 'pro_monthly' as PaidTier,
    amountUsd: 3.99,
    priceLabel: '$3.99',
    period: 'month' as const,
  },
  annual: {
    tier: 'pro_annual' as PaidTier,
    amountUsd: 39.99,
    priceLabel: '$39.99',
    period: 'year' as const,
  },
} as const;

/** The annual card's badge. A statement of arithmetic, not a nudge. */
export const ANNUAL_BADGE = 'Best Value';

/**
 * How much the annual plan saves against twelve months of monthly, floored —
 * a marketing number this app refuses to round *up*. 39.99 vs 47.88 → 16%.
 */
export function annualSavingsPercent(): number {
  const yearOfMonthly = PRICING.monthly.amountUsd * 12;
  return Math.floor((1 - PRICING.annual.amountUsd / yearOfMonthly) * 100);
}

// ── Plan comparison ──────────────────────────────────────────────────────────

/**
 * One row of the Free/Pro comparison.
 *
 * A cell is a short string ("3", "Unlimited"), `true` for "included"
 * (rendered as a checkmark), or `false` for "not included" (rendered as a
 * quiet dash — absence is stated, never dramatized). `upcoming` marks a Pro
 * capability that has not shipped; it renders as "Coming soon", and the
 * FeatureGate (`feature-flags.ts`) is what actually keeps it locked.
 */
export interface ComparisonRow {
  label: string;
  free: string | boolean;
  pro: string | true;
  upcoming?: boolean;
}

/**
 * The comparison, in reading order.
 *
 * Two honesty rules, both tested:
 * - "Session summaries" is included on *both* sides — the free plan keeps
 *   complete per-session results, and a comparison that pretended otherwise
 *   to sharpen the sell would be a lie about our own product.
 * - The numbers here are presentation of `entitlements.ts`; a test pins them
 *   to the real limits so the sales page cannot drift from the policy.
 */
export const PLAN_COMPARISON: ComparisonRow[] = [
  { label: 'Daily check-ins', free: '3', pro: 'Unlimited' },
  { label: 'Session history', free: 'Last 10', pro: 'Unlimited' },
  { label: 'Session summaries', free: true, pro: true },
  { label: 'Full Insights', free: false, pro: true },
  { label: 'Trend analytics', free: false, pro: true },
  { label: 'Data export', free: false, pro: true },
  { label: 'Background tracking', free: false, pro: true, upcoming: true },
];

/** What free keeps, stated on the sheet so the upgrade never reads as a threat. */
export const FREE_KEEPS =
  'Free stores every measurement, keeps Today and Session Results complete, and never deletes a thing. Pro changes what you can see — never what is saved.';
