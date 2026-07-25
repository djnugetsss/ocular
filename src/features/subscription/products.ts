import type { PaidTier } from '@/features/subscription/entitlements';

/**
 * The App Store products, and the only place a product id is written down.
 *
 * These strings must match App Store Connect exactly. Everything else in the
 * app — the paywall, the native module's `configure`, entitlement resolution —
 * reads them from here, so a renamed product is a one-line change and a typo
 * is impossible to make in two places.
 *
 * The map runs both ways on purpose. Purchasing needs tier → id; interpreting
 * an entitlement (or a renewal arriving at 3 a.m. through the transaction
 * observer) needs id → tier. A hand-written `if (productId === 'ocular.monthly')`
 * anywhere in the app is the failure this module exists to prevent.
 */

export const PRODUCT_IDS: Record<PaidTier, string> = {
  pro_monthly: 'ocular.monthly',
  pro_annual: 'ocular.yearly',
};

/** Every id this app sells, in upgrade order. Passed to the store as-is. */
export const ALL_PRODUCT_IDS: string[] = [PRODUCT_IDS.pro_monthly, PRODUCT_IDS.pro_annual];

/**
 * The RevenueCat *entitlement* identifier — the dashboard concept that both
 * products attach to, distinct from an App Store product id.
 *
 * A single "pro" entitlement backs every paid tier: the monthly and annual
 * products each grant it, and the app reads `customerInfo.entitlements.active`
 * under this key to decide access, then narrows monthly vs. annual from the
 * *product* id behind that entitlement (`tierForProductId`). Configured once in
 * the RevenueCat dashboard; this string must match it exactly.
 */
export const PRO_ENTITLEMENT_ID = 'pro';

/**
 * Resolves an App Store product id to the tier it grants.
 *
 * Returns `null` for anything unrecognized — a product from a future build, a
 * discontinued id still live in someone's transaction history, or garbage.
 * An unknown id must never be *assumed* to be Pro: that would let a stale
 * receipt for a product we no longer sell unlock the app forever.
 */
export function tierForProductId(productId: string | null | undefined): PaidTier | null {
  if (!productId) return null;
  const match = (Object.keys(PRODUCT_IDS) as PaidTier[]).find(
    (tier) => PRODUCT_IDS[tier] === productId
  );
  return match ?? null;
}

export function productIdForTier(tier: PaidTier): string {
  return PRODUCT_IDS[tier];
}
