import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import {
  clearCachedEntitlement,
  readCachedEntitlement,
  writeCachedEntitlement,
} from '@/features/subscription/entitlement-cache';
import { asSubscriptionTier, type SubscriptionTier } from '@/features/subscription/entitlements';
import {
  getEntitlement,
  identifyUser,
  isPurchasesAvailable,
  signOutPurchases,
  tierFromEntitlement,
  type RcEntitlement,
} from '@/features/subscription/revenue-cat';

/**
 * EntitlementService — where a tier comes from.
 *
 * The seam between the app and RevenueCat. The provider treats the tier as
 * something it is *told*, never something it computes, so all the reasoning
 * about verification, offline fallback, identity, and account changes lives
 * here and everything above stays declarative. It maps a normalized
 * `RcEntitlement` to a `SubscriptionTier`; it never decides what a tier
 * *grants* — that is `entitlements.ts` and `feature-flags.ts`.
 *
 * Resolution precedence:
 *   1. signed out            → free (entitlement follows an account)
 *   2. mock override         → dev/preview only, an explicit developer switch
 *   3. RevenueCat (live)     → the authority; overwrites the offline cache
 *   4. offline cache         → last verified tier, when the store is unreachable
 *   5. default               → free
 *
 * Entitlement is deliberately *not* a `profiles` column: a client-settable
 * `is_pro` would make the paywall bypassable with the anon key that ships in
 * the binary. RevenueCat verifies receipts server-side and keys them on the
 * Supabase user id we pass as its app-user id.
 */

export type EntitlementOrigin = 'signed-out' | 'mock' | 'store' | 'cache' | 'default';

export interface EntitlementSnapshot {
  tier: SubscriptionTier;
  origin: EntitlementOrigin;
  /**
   * `production`, `sandbox`, or null. Surfaced so the UI can label a
   * non-production entitlement instead of passing a sandbox subscription off
   * as a real one.
   */
  environment?: string | null;
}

const MOCK_TIER_KEY = 'ocular.subscription.mock-tier';

const variant = Constants.expoConfig?.extra?.variant;

/**
 * Whether the tier can be switched by hand.
 *
 * Development and preview builds only. A production build ignores any stored
 * override entirely — a debug affordance that survives into the App Store is a
 * free subscription for anyone who finds it, and "we'll remember to remove it"
 * is not a control.
 */
export const IS_MOCK_TIER_ENABLED = __DEV__ || variant === 'development' || variant === 'preview';

/**
 * Resolves the current entitlement (startup verification + offline fallback).
 *
 * Runs at launch and on every account change. It attaches the account to
 * RevenueCat (`identifyUser`) and reads the resulting entitlement in one round
 * trip, so identity and verification cannot get out of order. RevenueCat
 * answers from its own on-device cache when offline; the JS cache below only
 * carries the app across the window before that responds and the case where the
 * SDK is unreachable entirely. Every failure degrades toward the last known
 * good tier, then to free — never toward an exception on a cold launch.
 */
export async function resolveEntitlement(userId: string | null): Promise<EntitlementSnapshot> {
  if (!userId) return { tier: 'free', origin: 'signed-out' };

  if (IS_MOCK_TIER_ENABLED) {
    const mocked = await readMockTier();
    if (mocked) return { tier: mocked, origin: 'mock' };
  }

  if (isPurchasesAvailable()) {
    try {
      // `identifyUser` logs the account in and returns its entitlement; if that
      // path is ever skipped, `getEntitlement` is the same read for the current
      // identity. Either way the answer is authoritative.
      const entitlement = (await identifyUser(userId)) ?? (await getEntitlement());
      const tier = tierFromEntitlement(entitlement);
      // The store is authoritative: its answer overwrites the cache even when
      // it is `free`, so an expired or revoked subscription actually lapses
      // rather than lingering behind a stale cache line.
      await writeCachedEntitlement(userId, tier, entitlement?.verifiedAt ?? Date.now());
      return { tier, origin: 'store', environment: entitlement?.environment ?? null };
    } catch {
      // The store calls are contractually forgiving, but a bridge-level failure
      // still falls through to the durable cache rather than up.
    }
  }

  const cached = await readCachedEntitlement(userId);
  if (cached) return { tier: cached.tier, origin: 'cache' };

  return { tier: 'free', origin: 'default' };
}

/**
 * Adopts an entitlement pushed by RevenueCat's live listener — a renewal, an
 * expiration, a revocation, or an Ask-to-Buy approval that arrives while the
 * app is running. Maps it to a tier and refreshes the cache so the next cold
 * launch already agrees.
 */
export async function adoptEntitlementChange(
  userId: string | null,
  entitlement: RcEntitlement
): Promise<SubscriptionTier> {
  const tier = tierFromEntitlement(entitlement);
  if (userId) {
    await writeCachedEntitlement(userId, tier, entitlement.verifiedAt);
  }
  return tier;
}

// ── Dev mock override ──────────────────────────────────────────────────────────

/** Reads the development override, treating anything unrecognized as absent. */
export async function readMockTier(): Promise<SubscriptionTier | null> {
  if (!IS_MOCK_TIER_ENABLED) return null;
  try {
    return asSubscriptionTier(await AsyncStorage.getItem(MOCK_TIER_KEY));
  } catch {
    return null;
  }
}

/**
 * Persists the development override so a reload keeps the chosen tier.
 *
 * Passing `null` clears it, which is how a tester returns to the real
 * resolution path. No-ops outside development builds.
 */
export async function writeMockTier(tier: SubscriptionTier | null): Promise<void> {
  if (!IS_MOCK_TIER_ENABLED) return;
  try {
    if (tier === null) {
      await AsyncStorage.removeItem(MOCK_TIER_KEY);
      return;
    }
    await AsyncStorage.setItem(MOCK_TIER_KEY, tier);
  } catch {
    // Losing the override costs one re-tap on the next launch; surfacing a
    // storage failure from a debug switch would be noise.
  }
}

/**
 * Drops the account's cached entitlement and returns RevenueCat to an anonymous
 * id — called on sign-out, so nothing leaks into the next sign-in on a shared
 * device.
 */
export async function forgetEntitlement(userId: string): Promise<void> {
  await clearCachedEntitlement(userId);
  await signOutPurchases();
}
