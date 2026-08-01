import { useCallback, useEffect, useState } from 'react';

import type { PaidTier } from '@/features/subscription/entitlements';
import { PRICING } from '@/features/subscription/premium-content';
import {
  getProducts,
  isPurchasesAvailable,
  type StoreProduct,
} from '@/features/subscription/revenue-cat';

/**
 * Live, localized products for the paywall — prices from RevenueCat's current
 * offering, with the static labels as a graceful floor.
 *
 * App Review rejects hardcoded prices, and a hand-formatted number is wrong in
 * most storefronts on earth, so a real device *must* display the store's
 * localized `displayPrice`. But product loading needs the network and can
 * genuinely fail, and a paywall that renders nothing on a flaky connection is
 * worse than one showing the developer's reference USD price. So: prefer live,
 * fall back to `PRICING`, and tell the caller which it got (`isLive`) so the
 * CTA can be disabled when a purchase would only fail anyway.
 */

export interface DisplayPlan {
  tier: PaidTier;
  /** Localized when live; the static USD label otherwise. */
  priceLabel: string;
  period: 'month' | 'year';
}

export interface ProductsState {
  monthly: DisplayPlan;
  annual: DisplayPlan;
  /** True once StoreKit's real prices are in hand. */
  isLive: boolean;
  isLoading: boolean;
  /** True when the store exists but products could not be fetched (offline). */
  didFail: boolean;
  /**
   * Whether this build can transact at all. False on Simulator, Expo Go, and
   * any build without a RevenueCat key — where the static labels below are the
   * honest and final answer rather than a stand-in for a price we failed to
   * fetch. The paywall needs the distinction: "no store here" is a development
   * state, "store present, prices missing" is a condition in which it must not
   * quote a price or offer to charge one.
   */
  hasStore: boolean;
  /** Re-fetches after a failure, for the paywall's retry. */
  reload: () => void;
}

const FALLBACK: Pick<ProductsState, 'monthly' | 'annual'> = {
  monthly: {
    tier: 'pro_monthly',
    priceLabel: PRICING.monthly.priceLabel,
    period: 'month',
  },
  annual: { tier: 'pro_annual', priceLabel: PRICING.annual.priceLabel, period: 'year' },
};

type ProductsData = Pick<ProductsState, 'monthly' | 'annual' | 'isLive' | 'isLoading' | 'didFail'>;

export function useProducts(): ProductsState {
  const hasStore = isPurchasesAvailable();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ProductsData>({
    ...FALLBACK,
    isLive: false,
    // Only "loading" when there is a store to load from; otherwise the static
    // labels are the final answer and the paywall renders them at once.
    isLoading: hasStore,
    didFail: false,
  });

  const reload = useCallback(() => {
    if (!isPurchasesAvailable()) return;
    setState((prev) => ({ ...prev, isLoading: true, didFail: false }));
    setAttempt((count) => count + 1);
  }, []);

  useEffect(() => {
    if (!isPurchasesAvailable()) return;
    let cancelled = false;

    getProducts()
      .then((products) => {
        if (cancelled) return;
        const monthly = products.find((p) => p.tier === 'pro_monthly');
        const annual = products.find((p) => p.tier === 'pro_annual');
        // A partial fetch (one product missing from App Store Connect) is a
        // misconfiguration, not a user problem — fall back rather than render
        // half a paywall.
        if (!monthly || !annual) {
          setState((prev) => ({ ...prev, isLoading: false, didFail: true }));
          return;
        }
        setState({
          monthly: planFrom(monthly),
          annual: planFrom(annual),
          isLive: true,
          isLoading: false,
          didFail: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, isLoading: false, didFail: true }));
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, hasStore, reload };
}

function planFrom(product: StoreProduct): DisplayPlan {
  return {
    tier: product.tier,
    priceLabel: product.displayPrice,
    period: product.period,
  };
}
