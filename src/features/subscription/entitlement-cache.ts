import AsyncStorage from '@react-native-async-storage/async-storage';

import { asSubscriptionTier, type SubscriptionTier } from '@/features/subscription/entitlements';

/**
 * A durable copy of the last entitlement StoreKit verified, per account.
 *
 * StoreKit's own `currentEntitlements` is already an offline-capable local
 * cache, so this is not a substitute for it — it is the answer for the window
 * *before* StoreKit responds on a cold launch, and the fallback when the
 * native module is unreachable entirely (a JS-only reload, a module that
 * failed to link). Without it, every launch would flash Free until StoreKit
 * resolved, gating a paying subscriber out of their own app for that beat.
 *
 * Keyed by user id: entitlement follows an Apple account, but the app scopes
 * everything to a Supabase account, and caching one user's Pro under a shared
 * key would leak it across an account switch on a shared device.
 *
 * This is a *cache*, never the authority. StoreKit overwrites it on every
 * successful resolution, and a tampered value can at most grant a brief,
 * offline, unverified Pro that the next online resolution corrects — the same
 * exposure Apple's own on-device cache already carries, and far short of a
 * server-trusted flag.
 */

interface CachedEntitlement {
  tier: SubscriptionTier;
  /** Milliseconds since epoch, from StoreKit's verification. */
  verifiedAt: number;
}

const KEY_PREFIX = 'ocular.entitlement.cache.';

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/**
 * Reads the cached tier for a user, or `null` when there is nothing usable.
 *
 * A malformed or unrecognized payload reads as absent rather than throwing:
 * the resolver's next step is to ask StoreKit, and a corrupt cache line should
 * degrade to "ask" rather than crash a launch. `asSubscriptionTier` is what
 * makes an unknown stored string fail closed to `null` instead of granting a
 * tier that no longer exists.
 */
export async function readCachedEntitlement(userId: string): Promise<CachedEntitlement | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;

    const tier = asSubscriptionTier((parsed as { tier?: unknown }).tier);
    const verifiedAt = (parsed as { verifiedAt?: unknown }).verifiedAt;
    if (!tier || typeof verifiedAt !== 'number') return null;

    return { tier, verifiedAt };
  } catch {
    return null;
  }
}

/** Persists the verified tier for a user. Failures are swallowed — a lost
 *  cache write only costs the next launch one flash, never correctness. */
export async function writeCachedEntitlement(
  userId: string,
  tier: SubscriptionTier,
  verifiedAt: number
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify({ tier, verifiedAt }));
  } catch {
    // See above.
  }
}

/** Drops a user's cached entitlement. Used on sign-out to avoid cross-account leak. */
export async function clearCachedEntitlement(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // A stale cache line is scoped to its own user key and overwritten on that
    // user's next resolution; failing to clear it is not worth surfacing.
  }
}
