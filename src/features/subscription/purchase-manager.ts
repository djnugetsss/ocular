import { writeCachedEntitlement } from '@/features/subscription/entitlement-cache';
import { IS_MOCK_TIER_ENABLED, writeMockTier } from '@/features/subscription/entitlement-service';
import { isProTier, type PaidTier } from '@/features/subscription/entitlements';
import {
  classifyPurchaseError,
  isPurchasesAvailable,
  purchase as storePurchase,
  restore as storeRestore,
  tierFromEntitlement,
  STORE_ERROR,
  type StoreErrorCode,
} from '@/features/subscription/revenue-cat';

/**
 * PurchaseManager — buying and restoring, with every RevenueCat outcome mapped
 * to an explicit result.
 *
 * Cancel and pending are normal user choices, not exceptions, so no non-success
 * path reaches a caller as a thrown error: the provider and the paywall branch
 * on a discriminated union instead of a try/catch. On a build with no store
 * (Simulator, Expo Go) a dev/preview build *simulates* a grant through the mock
 * tier, so the whole upgrade flow stays walkable without an App Store account.
 *
 * This module writes the offline cache on a verified grant so the next launch
 * already agrees, and clears any dev override a real purchase supersedes. It
 * never decides what a tier grants — that stays in `entitlements.ts`.
 */

export type PurchaseOutcome =
  /** Verified and granted; the provider should adopt the tier. */
  | { status: 'granted'; tier: PaidTier }
  /** The user dismissed the purchase sheet. Not an error. */
  | { status: 'cancelled' }
  /** Ask to Buy / SCA — resolves later through the entitlement listener. */
  | { status: 'pending' }
  /** No store in this build, or the product is not available. */
  | { status: 'unavailable' }
  /** A genuine failure (network, verification, system). */
  | { status: 'failed'; code: StoreErrorCode; message?: string };

/**
 * Buys a paid tier.
 *
 * Everywhere with a real store this is a RevenueCat purchase; every non-success
 * path RevenueCat can raise is mapped to an explicit outcome. `userId` is not
 * forwarded per-call because RevenueCat already carries the account as its
 * app-user id (set by `identifyUser`); it is kept in the signature so the mock
 * path and any future server attribution have it.
 */
export async function purchaseTier(
  tier: PaidTier,
  userId: string | null
): Promise<PurchaseOutcome> {
  if (!isPurchasesAvailable()) {
    if (IS_MOCK_TIER_ENABLED) {
      await writeMockTier(tier);
      return { status: 'granted', tier };
    }
    return { status: 'unavailable' };
  }

  try {
    const result = await storePurchase(tier);
    if (result.outcome === 'unavailable') return { status: 'unavailable' };

    const grantedTier = tierFromEntitlement(result.entitlement ?? null);
    // Pro for any product we recognize; guard the impossible case (a success
    // for an unknown product) as a failure that grants nothing and writes
    // nothing, rather than claiming — or caching — a tier we cannot name.
    if (!isProTier(grantedTier)) return { status: 'failed', code: STORE_ERROR.unknown };

    if (userId && result.entitlement) {
      await writeCachedEntitlement(userId, grantedTier, result.entitlement.verifiedAt);
    }
    // A real purchase supersedes any dev override, so the forced tier does not
    // silently revert the just-bought subscription on relaunch.
    if (IS_MOCK_TIER_ENABLED) await writeMockTier(null);
    return { status: 'granted', tier: grantedTier as PaidTier };
  } catch (error) {
    const code = classifyPurchaseError(error);
    if (code === STORE_ERROR.cancelled) return { status: 'cancelled' };
    if (code === STORE_ERROR.pending) return { status: 'pending' };
    if (code === STORE_ERROR.unavailable) return { status: 'unavailable' };
    return {
      status: 'failed',
      code,
      message: error instanceof Error ? error.message : undefined,
    };
  }
}

export type RestoreOutcome =
  /** A live subscription was restored. */
  | { status: 'restored'; tier: PaidTier }
  /** Nothing to restore on this account. */
  | { status: 'none' }
  /** The user dismissed the store sign-in prompt. */
  | { status: 'cancelled' }
  /** No store in this build. */
  | { status: 'unavailable' }
  | { status: 'failed'; code: StoreErrorCode; message?: string };

/**
 * Restores purchases through RevenueCat. Only ever called from an explicit
 * "Restore Purchases" tap — it can prompt for the store password.
 */
export async function restorePurchases(userId: string | null): Promise<RestoreOutcome> {
  if (!isPurchasesAvailable()) {
    return IS_MOCK_TIER_ENABLED ? { status: 'none' } : { status: 'unavailable' };
  }

  try {
    const entitlement = await storeRestore();
    const tier = tierFromEntitlement(entitlement);
    if (userId && entitlement) {
      await writeCachedEntitlement(userId, tier, entitlement.verifiedAt);
    }
    if (isProTier(tier)) {
      if (IS_MOCK_TIER_ENABLED) await writeMockTier(null);
      return { status: 'restored', tier: tier as PaidTier };
    }
    return { status: 'none' };
  } catch (error) {
    const code = classifyPurchaseError(error);
    if (code === STORE_ERROR.cancelled) return { status: 'cancelled' };
    return {
      status: 'failed',
      code,
      message: error instanceof Error ? error.message : undefined,
    };
  }
}
