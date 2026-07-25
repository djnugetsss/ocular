/**
 * Wire types for the `ocular-store` native module.
 *
 * These mirror the payloads constructed in `ios/OcularStorePayload.swift`. Any
 * change here needs a matching change there; the two files are the contract
 * between the React Native layer and StoreKit 2.
 *
 * Dates cross the bridge as milliseconds since the epoch — `Date` has no
 * bridge representation, and a number is what `new Date(...)` wants anyway.
 */

/**
 * Mirrors `Product.SubscriptionInfo.RenewalState`, plus `none` for "this user
 * has never subscribed".
 *
 * - `subscribed` — active and paid.
 * - `inGracePeriod` — payment failed but Apple is retrying *and* the developer
 *   enabled a billing grace period: access continues.
 * - `inBillingRetry` — payment failed with no grace period: access has lapsed,
 *   but the subscription may recover on its own.
 * - `expired` — ended, normally after a cancellation.
 * - `revoked` — refunded or removed from Family Sharing. Access ends at once.
 */
export type EntitlementState =
  'none' | 'subscribed' | 'expired' | 'inBillingRetry' | 'inGracePeriod' | 'revoked';

export interface NativeEntitlement {
  /** The only field a gate should need. True for `subscribed` and `inGracePeriod`. */
  isActive: boolean;
  state: EntitlementState;
  /** The App Store product id backing this entitlement, if any. */
  productId: string | null;
  /** Milliseconds since epoch, or `null` for a non-expiring/absent entitlement. */
  expiresAt: number | null;
  /** False once the user cancels — they keep access until `expiresAt`. */
  willAutoRenew: boolean;
  /** Stable across renewals; what a server-side receipt check keys on. */
  originalTransactionId: string | null;
  /** `production`, `sandbox`, or `xcode`. */
  environment: string | null;
  /** When StoreKit last verified this, in milliseconds since epoch. */
  verifiedAt: number;
}

/** Why the entitlement changed while the app was running. */
export type EntitlementChangeReason = 'updated' | 'revoked';

export interface NativeEntitlementChange extends NativeEntitlement {
  reason: EntitlementChangeReason;
}

export interface SubscriptionPeriod {
  unit: 'day' | 'week' | 'month' | 'year' | 'unknown';
  value: number;
}

export interface IntroductoryOffer {
  displayPrice: string;
  paymentMode: 'freeTrial' | 'payAsYouGo' | 'payUpFront' | 'unknown';
  period: SubscriptionPeriod;
  periodCount: number;
}

export interface NativeProduct {
  id: string;
  displayName: string;
  description: string;
  /**
   * Localized, currency-formatted, and storefront-correct — display this
   * verbatim. Hand-formatting a price is wrong in most storefronts on earth
   * and is an App Review rejection in all of them.
   */
  displayPrice: string;
  /** The raw amount, for savings math only. Never render this directly. */
  price: number;
  currencyCode: string;
  period?: SubscriptionPeriod;
  introductoryOffer?: IntroductoryOffer;
}

/**
 * Outcomes of `product.purchase(...)`.
 *
 * `pending` covers Ask to Buy and Strong Customer Authentication: the purchase
 * is neither done nor failed, and its resolution arrives later through the
 * transaction-update event.
 *
 * `unverified` means StoreKit could not check Apple's signature on the
 * transaction. It grants nothing, ever.
 */
export type NativePurchaseOutcome =
  'success' | 'userCancelled' | 'pending' | 'unverified' | 'productUnavailable';

export interface NativePurchaseResult {
  outcome: NativePurchaseOutcome;
  /** Present only for `success`. */
  entitlement?: NativeEntitlement;
}

/**
 * A `type` rather than an `interface` on purpose: Expo's `NativeModule<T>`
 * constrains `T` to `EventsMap` (an index-signature record), and a type alias
 * satisfies that constraint where an augmentable interface does not.
 */
export type OcularStoreEvents = {
  /** Renewals, expirations, revocations, refunds, and Ask-to-Buy approvals. */
  onEntitlementChange: (change: NativeEntitlementChange) => void;
};
