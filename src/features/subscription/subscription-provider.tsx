import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuthStore } from '@/features/auth/auth-store';
import {
  IS_MOCK_TIER_ENABLED,
  adoptEntitlementChange,
  forgetEntitlement,
  resolveEntitlement,
  writeMockTier,
  type EntitlementOrigin,
} from '@/features/subscription/entitlement-service';
import {
  PENDING_ENTITLEMENTS,
  entitlementsFor,
  type Entitlements,
  type PaidTier,
  type SubscriptionTier,
} from '@/features/subscription/entitlements';
import {
  featureAccess,
  type Feature,
  type FeatureAccess,
} from '@/features/subscription/feature-flags';
import {
  purchaseTier,
  restorePurchases,
  type PurchaseOutcome,
  type RestoreOutcome,
} from '@/features/subscription/purchase-manager';
import { addEntitlementListener, isPurchasesAvailable } from '@/features/subscription/revenue-cat';

/**
 * The app's entitlement layer (PLAN.md §3 feature-slice rules).
 *
 * A React context rather than another zustand store on purpose: unlike auth
 * and profile, which are read by module-level code and by the routing gate,
 * entitlement is only ever read *during render*, and every read must come
 * from one resolved snapshot. A provider makes that structural — there is no
 * way to reach the tier without being inside the tree that resolved it, so a
 * screen cannot accidentally gate itself against a stale global.
 *
 * Responsibilities, kept deliberately narrow:
 *
 * - Verify the tier at startup and re-verify on every account change, through
 *   the `EntitlementService` (RevenueCat, then the offline cache fallback).
 * - Listen for live entitlement updates — renewals, expirations, revocations,
 *   Ask-to-Buy approvals — and adopt them without a relaunch.
 * - Expose the *derived* entitlements, so no consumer ever branches on the
 *   tier string. `tier === 'pro_annual'` scattered across screens is the bug
 *   this layer exists to prevent; `entitlements.hasFullInsights` is not.
 * - Drive purchase and restore through the `PurchaseManager` and adopt their
 *   results in the same render pass the paywall celebrates in.
 *
 * No `if (productId === …)` and no store type reaches a screen: everything a
 * component sees is the resolved `Entitlements` shape.
 */

export type SubscriptionStatus = 'resolving' | 'ready';

interface SubscriptionContextValue {
  /** The verified tier. `free` until something proves otherwise. */
  tier: SubscriptionTier;
  entitlements: Entitlements;
  status: SubscriptionStatus;
  /** Where the tier came from — surfaced in Profile's diagnostics. */
  origin: EntitlementOrigin;
  /** `sandbox`/`xcode` for a non-production entitlement; null otherwise. */
  environment: string | null;
  /** True in development and preview builds, where the tier can be forced. */
  isMockEnabled: boolean;
  /** Development only: switch tiers without StoreKit. No-ops in production. */
  setMockTier: (tier: SubscriptionTier) => void;
  /**
   * Runs Apple's purchase sheet and adopts a verified grant immediately, so
   * every gate reopens in the render the paywall celebrates in. Cancel and
   * pending come back as outcomes, not throws.
   */
  purchase: (tier: PaidTier) => Promise<PurchaseOutcome>;
  /** Restore behind an explicit tap; adopts a restored subscription. */
  restore: () => Promise<RestoreOutcome>;
  /** Re-verifies against RevenueCat — e.g. after returning from Manage Subscriptions. */
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const userId = useAuthStore((state) => state.user?.id ?? null);

  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [origin, setOrigin] = useState<EntitlementOrigin>('default');
  const [environment, setEnvironment] = useState<string | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus>('resolving');

  // Monotonic request id: an account switch can overlap an in-flight
  // resolution, and a slow answer for the previous user must never install
  // itself over the current one. Same guard `useSessionList` documents.
  const requestRef = useRef(0);
  // Latest user id for the transaction observer, which outlives any one
  // render and must always cache against the account signed in *now*. Synced
  // in an effect rather than during render — the observer's callbacks are
  // async and only ever read it after commit.
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const resolve = useCallback(async () => {
    const requestId = ++requestRef.current;
    const snapshot = await resolveEntitlement(userId);
    if (requestId !== requestRef.current) return;
    setTier(snapshot.tier);
    setOrigin(snapshot.origin);
    setEnvironment(snapshot.environment ?? null);
    setStatus('ready');
  }, [userId]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  // RevenueCat's live update stream. Renewals at 3 a.m., a revoked refund, an
  // Ask-to-Buy approval — each arrives here without a relaunch. The listener
  // is a no-op subscription when the store is absent, so this needs no guard.
  useEffect(() => {
    const subscription = addEntitlementListener((change) => {
      void (async () => {
        const nextTier = await adoptEntitlementChange(userIdRef.current, change);
        // Adopt only for the account still signed in — an update racing an
        // account switch must not repaint the new user's plan.
        requestRef.current += 1;
        setTier(nextTier);
        setOrigin('store');
        setEnvironment(change.environment ?? null);
        setStatus('ready');
      })();
    });
    return () => subscription.remove();
  }, []);

  // Drop the previous account's cached entitlement on sign-out so it cannot
  // leak into the next sign-in on a shared device.
  const previousUserRef = useRef(userId);
  useEffect(() => {
    const previous = previousUserRef.current;
    if (previous && previous !== userId) {
      void forgetEntitlement(previous);
    }
    previousUserRef.current = userId;
  }, [userId]);

  const setMockTier = useCallback((next: SubscriptionTier) => {
    if (!IS_MOCK_TIER_ENABLED) return;
    // Applied locally at once so the switch feels instant, then persisted —
    // the same optimistic pattern the profile store uses for preferences.
    // A superseded write cannot resurrect an old tier because the id below
    // also invalidates any resolution still in flight.
    requestRef.current += 1;
    setTier(next);
    setOrigin('mock');
    setEnvironment(null);
    setStatus('ready');
    void writeMockTier(next);
  }, []);

  const adopt = useCallback((next: PaidTier) => {
    // Adopt immediately and invalidate any resolution in flight, exactly like
    // the mock switch — a slow earlier read must not undo a fresh grant.
    requestRef.current += 1;
    setTier(next);
    setOrigin('store');
    setStatus('ready');
  }, []);

  const purchase = useCallback(
    async (next: PaidTier): Promise<PurchaseOutcome> => {
      const outcome = await purchaseTier(next, userIdRef.current);
      if (outcome.status === 'granted') adopt(outcome.tier);
      return outcome;
    },
    [adopt]
  );

  const restore = useCallback(async (): Promise<RestoreOutcome> => {
    const outcome = await restorePurchases(userIdRef.current);
    if (outcome.status === 'restored') adopt(outcome.tier);
    return outcome;
  }, [adopt]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      tier,
      // While the first resolution is in flight the gates stay open. See
      // PENDING_ENTITLEMENTS for why that direction is the safe one.
      entitlements: status === 'ready' ? entitlementsFor(tier) : PENDING_ENTITLEMENTS,
      status,
      origin,
      environment,
      isMockEnabled: IS_MOCK_TIER_ENABLED,
      setMockTier,
      purchase,
      restore,
      refresh: resolve,
    }),
    [tier, status, origin, environment, setMockTier, purchase, restore, resolve]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

/** Plan state and controls. For Profile; screens usually want `useEntitlements`. */
export function useSubscription(): SubscriptionContextValue {
  const value = useContext(SubscriptionContext);
  if (!value) {
    throw new Error('useSubscription must be used inside <SubscriptionProvider>.');
  }
  return value;
}

/**
 * What this user is allowed to do — the hook every feature gate reads.
 *
 * Returns capabilities, never a plan name, so call sites stay declarative
 * ("is this list limited?") instead of encoding the price list.
 */
export function useEntitlements(): Entitlements {
  return useSubscription().entitlements;
}

/**
 * Resolves a named capability to `{ allowed, reason }` — the hook a screen uses
 * when it needs to distinguish "upgrade to unlock" from "coming soon", not just
 * a boolean. For the boolean, read the matching field off `useEntitlements`.
 */
export function useFeatureAccess(feature: Feature): FeatureAccess {
  const entitlements = useEntitlements();
  return useMemo(() => featureAccess(entitlements, feature), [entitlements, feature]);
}

/** Whether real RevenueCat purchases can run in this build (false: Expo Go, web). */
export function useIsStoreAvailable(): boolean {
  return isPurchasesAvailable();
}
