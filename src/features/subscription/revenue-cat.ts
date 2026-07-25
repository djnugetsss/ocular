import Constants from 'expo-constants';
import { Linking } from 'react-native';

import type { PaidTier, SubscriptionTier } from '@/features/subscription/entitlements';
import {
  PRO_ENTITLEMENT_ID,
  productIdForTier,
  tierForProductId,
} from '@/features/subscription/products';

/**
 * The typed, null-safe boundary between the app and RevenueCat.
 *
 * `react-native-purchases` is loaded through a guarded `require`, so it is
 * `null` in every context without the native SDK linked: Expo Go, web, Jest,
 * or a misconfigured build with no API key. Payments are the one subsystem
 * where "not installed" has to degrade to a readable screen rather than a
 * crash, so that absence is handled here, once, behind `isPurchasesAvailable`.
 * Everything above this file gets a store that is either fully present or
 * cleanly absent.
 *
 * This file adds no policy — it does not decide what an entitlement *means*,
 * only what RevenueCat reported, normalized to `RcEntitlement`. `entitlements.ts`
 * owns meaning; `feature-flags.ts` owns capability; this owns the wire.
 *
 * Why RevenueCat rather than the raw StoreKit module: it gives us one
 * cross-store entitlement model, server-verified receipts, and a single
 * `CustomerInfo` update stream — so the app never has to be the transaction
 * observer itself. The custom `ocular-store` StoreKit module it supersedes is
 * left in the repo but no longer on the entitlement path.
 */

// ── Native SDK, optionally present ────────────────────────────────────────────

/**
 * The slice of the `react-native-purchases` surface this app uses. Declared
 * locally (rather than imported) so the file type-checks and the tests run
 * whether or not the package is installed — the `require` below is guarded and
 * returns `null` when it cannot resolve, exactly like Expo Go.
 */
interface PurchasesEntitlementInfo {
  identifier: string;
  isActive: boolean;
  willRenew: boolean;
  productIdentifier: string;
  /** ISO-8601, or null for a non-expiring entitlement. */
  expirationDate: string | null;
  store: string;
  isSandbox: boolean;
}

interface CustomerInfo {
  entitlements: { active: Record<string, PurchasesEntitlementInfo> };
  /** Deep link to Apple's manage-subscriptions screen; null when there is none. */
  managementURL: string | null;
}

interface PurchasesStoreProduct {
  identifier: string;
  title: string;
  description: string;
  /** Localized, currency-formatted, storefront-correct. Display verbatim. */
  priceString: string;
  price: number;
  currencyCode: string;
  productType?: string;
}

interface PurchasesPackage {
  identifier: string;
  packageType: string;
  product: PurchasesStoreProduct;
}

interface PurchasesOffering {
  identifier: string;
  availablePackages: PurchasesPackage[];
}

interface PurchasesOfferings {
  current: PurchasesOffering | null;
  all: Record<string, PurchasesOffering>;
}

interface MakePurchaseResult {
  customerInfo: CustomerInfo;
  productIdentifier: string;
}

interface PurchasesError {
  code?: string | number;
  readableErrorCode?: string;
  message?: string;
  underlyingErrorMessage?: string;
  userCancelled?: boolean;
}

type CustomerInfoUpdateListener = (info: CustomerInfo) => void;

interface PurchasesStatic {
  configure(options: { apiKey: string; appUserID?: string | null }): void;
  isConfigured?(): boolean;
  logIn(appUserID: string): Promise<{ customerInfo: CustomerInfo; created: boolean }>;
  logOut(): Promise<CustomerInfo>;
  getCustomerInfo(): Promise<CustomerInfo>;
  getOfferings(): Promise<PurchasesOfferings>;
  purchasePackage(pkg: PurchasesPackage): Promise<MakePurchaseResult>;
  restorePurchases(): Promise<CustomerInfo>;
  addCustomerInfoUpdateListener(listener: CustomerInfoUpdateListener): void;
  removeCustomerInfoUpdateListener(listener: CustomerInfoUpdateListener): void;
}

function loadPurchases(): PurchasesStatic | null {
  try {
    // A `require` (not an `import`) so TypeScript never tries to resolve the
    // module specifier at compile time — the package is a device-only native
    // dependency and is legitimately absent under Node and Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases') as { default?: PurchasesStatic };
    return mod?.default ?? null;
  } catch {
    return null;
  }
}

const Purchases = loadPurchases();

/**
 * The RevenueCat public SDK key. Safe to ship in the binary (it is a
 * publishable key, like the Supabase anon key), so it lives in
 * `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and is mirrored into `extra` for
 * discoverability. Absent → the store is treated as unavailable rather than
 * configured with a broken key, so a misconfigured build degrades to the
 * offline/free path instead of crashing.
 */
const API_KEY: string | null =
  (Constants.expoConfig?.extra?.revenueCatIosKey as string | undefined) ??
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ??
  null;

let configured = false;

/**
 * Configures the SDK exactly once with an anonymous app user; identity is
 * attached later via `identifyUser`. Idempotent and safe to call before any
 * other entry point, so ordering between the provider's one-time configure and
 * a racing account resolution never matters.
 */
function ensureConfigured(): PurchasesStatic | null {
  if (!Purchases || !API_KEY) return null;
  if (!configured && !(Purchases.isConfigured?.() ?? false)) {
    Purchases.configure({ apiKey: API_KEY });
  }
  configured = true;
  return Purchases;
}

/** Whether real RevenueCat purchases can run: SDK linked *and* a key present. */
export function isPurchasesAvailable(): boolean {
  return Purchases != null && API_KEY != null;
}

// ── Normalized entitlement ────────────────────────────────────────────────────

/**
 * A verified RevenueCat entitlement, collapsed to the fields the app reasons
 * about. `isActive` already accounts for grace periods (RevenueCat keeps it
 * true through billing grace), matching the StoreKit semantic the old module
 * used, so no caller needs to know the difference.
 */
export interface RcEntitlement {
  isActive: boolean;
  /** The store product id backing the entitlement; null when inactive. */
  productId: string | null;
  willRenew: boolean;
  /** Milliseconds since epoch, or null for non-expiring/absent. */
  expiresAt: number | null;
  /** `sandbox` or `production` — surfaced so the UI can label a test purchase. */
  environment: string | null;
  /** When the app last read this, in milliseconds since epoch. */
  verifiedAt: number;
}

/**
 * Maps a `CustomerInfo` to the app's normalized entitlement. Pure and
 * exported so the security-critical read — "is the pro entitlement active, and
 * for which product?" — is unit-tested against synthetic customer info with no
 * device.
 */
export function entitlementFromCustomerInfo(info: CustomerInfo | null): RcEntitlement | null {
  if (!info) return null;
  const active = info.entitlements.active[PRO_ENTITLEMENT_ID] ?? null;
  const verifiedAt = Date.now();

  if (!active || !active.isActive) {
    return {
      isActive: false,
      productId: null,
      willRenew: false,
      expiresAt: null,
      environment: null,
      verifiedAt,
    };
  }

  const expiresMs = active.expirationDate ? Date.parse(active.expirationDate) : NaN;
  return {
    isActive: true,
    productId: active.productIdentifier,
    willRenew: active.willRenew,
    expiresAt: Number.isNaN(expiresMs) ? null : expiresMs,
    environment: active.isSandbox ? 'sandbox' : 'production',
    verifiedAt,
  };
}

/**
 * Collapses a verified entitlement to the tier the app should grant — the
 * single security decision of the whole layer.
 *
 * Strict in one direction: Pro only when the entitlement is *active* **and** its
 * product id is one this build still recognizes. Everything else — inactive,
 * or an active entitlement for a product we no longer sell — collapses to
 * `free`. That is what makes a lapsed subscription actually lock the app, and
 * what stops a stale receipt for a discontinued product from granting Pro
 * forever.
 */
export function tierFromEntitlement(entitlement: RcEntitlement | null): SubscriptionTier {
  if (!entitlement || !entitlement.isActive) return 'free';
  return tierForProductId(entitlement.productId) ?? 'free';
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * The current verified entitlement, or `null` when RevenueCat is unavailable.
 * A `null` means "no store to ask" — the caller treats it as "fall back to
 * cache", never as "not subscribed".
 */
export async function getEntitlement(): Promise<RcEntitlement | null> {
  const sdk = ensureConfigured();
  if (!sdk) return null;
  return entitlementFromCustomerInfo(await sdk.getCustomerInfo());
}

/**
 * Attaches the Supabase user id as the RevenueCat app-user id and returns the
 * entitlement from the resulting `CustomerInfo` — so identity and the first
 * read happen in a single network round trip. `null` when the store is absent.
 */
export async function identifyUser(userId: string): Promise<RcEntitlement | null> {
  const sdk = ensureConfigured();
  if (!sdk) return null;
  const { customerInfo } = await sdk.logIn(userId);
  return entitlementFromCustomerInfo(customerInfo);
}

/** Returns RevenueCat to an anonymous id on sign-out. Swallows the anonymous-logout throw. */
export async function signOutPurchases(): Promise<void> {
  const sdk = ensureConfigured();
  if (!sdk) return;
  try {
    await sdk.logOut();
  } catch {
    // RevenueCat throws if the current user is already anonymous; that is the
    // exact state sign-out wants, so it is success, not an error.
  }
}

/** A no-op subscription shape, so callers need no branch when the store is absent. */
export interface EntitlementSubscription {
  remove: () => void;
}

/**
 * Subscribes to entitlement changes RevenueCat pushes — renewals, expirations,
 * refunds, Ask-to-Buy approvals — mapped to the normalized shape. Returns a
 * no-op unsubscribe when the store is absent.
 */
export function addEntitlementListener(
  listener: (entitlement: RcEntitlement) => void
): EntitlementSubscription {
  const sdk = ensureConfigured();
  if (!sdk) return { remove: () => {} };
  const handler: CustomerInfoUpdateListener = (info) => {
    const entitlement = entitlementFromCustomerInfo(info);
    if (entitlement) listener(entitlement);
  };
  sdk.addCustomerInfoUpdateListener(handler);
  return { remove: () => sdk.removeCustomerInfoUpdateListener(handler) };
}

// ── Products ──────────────────────────────────────────────────────────────────

export interface StoreProduct {
  tier: PaidTier;
  /** Localized, currency-formatted price. Never hand-format this. */
  displayPrice: string;
  price: number;
  currencyCode: string;
  period: 'month' | 'year';
}

/**
 * Loads the current offering's packages, tagged with the tier each grants.
 *
 * Requires the network — prices are fetched live, and App Review rejects
 * hardcoded ones. A failure or missing offering returns an empty array rather
 * than throwing, so the paywall degrades to reference prices instead of a
 * redbox. A product whose id we do not recognize is dropped, never assumed Pro.
 */
export async function getProducts(): Promise<StoreProduct[]> {
  const sdk = ensureConfigured();
  if (!sdk) return [];
  const offerings = await sdk.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  const tagged: StoreProduct[] = [];
  for (const pkg of packages) {
    const tier = tierForProductId(pkg.product.identifier);
    if (!tier) continue;
    tagged.push({
      tier,
      displayPrice: pkg.product.priceString,
      price: pkg.product.price,
      currencyCode: pkg.product.currencyCode,
      period: tier === 'pro_annual' ? 'year' : 'month',
    });
  }
  return tagged;
}

// ── Purchase / restore ────────────────────────────────────────────────────────

export type RcPurchaseOutcome = 'success' | 'unavailable';

export interface RcPurchaseResult {
  outcome: RcPurchaseOutcome;
  entitlement?: RcEntitlement | null;
}

/**
 * Presents RevenueCat's purchase flow for a tier.
 *
 * Resolves with `success` (entitlement verified) or `unavailable` (no package
 * for the tier in the current offering — a store misconfiguration). Every
 * *expected* non-success path RevenueCat raises — cancellation, Ask-to-Buy
 * pending, network — is thrown as a `PurchasesError`, so the caller classifies
 * them in one catch rather than confusing a user choice with a failure.
 */
export async function purchase(tier: PaidTier): Promise<RcPurchaseResult> {
  const sdk = ensureConfigured();
  if (!sdk) return { outcome: 'unavailable' };

  const targetProductId = productIdForTier(tier);
  const offerings = await sdk.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  const pkg = packages.find((candidate) => candidate.product.identifier === targetProductId);
  if (!pkg) return { outcome: 'unavailable' };

  const result = await sdk.purchasePackage(pkg);
  return { outcome: 'success', entitlement: entitlementFromCustomerInfo(result.customerInfo) };
}

/**
 * Restores purchases via RevenueCat. Only ever called from an explicit
 * "Restore Purchases" tap. Returns `null` when the store is unavailable.
 */
export async function restore(): Promise<RcEntitlement | null> {
  const sdk = ensureConfigured();
  if (!sdk) return null;
  return entitlementFromCustomerInfo(await sdk.restorePurchases());
}

/**
 * Opens Apple's manage-subscriptions screen — the only place a cancellation can
 * actually happen, and required by App Review. Uses the deep link RevenueCat
 * provides, falling back to the system subscriptions URL.
 */
export async function presentManageSubscriptions(): Promise<void> {
  const sdk = ensureConfigured();
  const url =
    (sdk ? (await sdk.getCustomerInfo()).managementURL : null) ??
    'https://apps.apple.com/account/subscriptions';
  await Linking.openURL(url);
}

// ── Error codes ───────────────────────────────────────────────────────────────

/**
 * The stable codes the purchase layer classifies RevenueCat failures into.
 * Branch on these, never on message text — RevenueCat's messages are localized.
 */
export const STORE_ERROR = {
  network: 'ERR_STORE_NETWORK',
  cancelled: 'ERR_STORE_CANCELLED',
  pending: 'ERR_STORE_PENDING',
  unavailable: 'ERR_STORE_UNAVAILABLE',
  notAllowed: 'ERR_STORE_NOT_ALLOWED',
  unknown: 'ERR_STORE_UNKNOWN',
} as const;

export type StoreErrorCode = (typeof STORE_ERROR)[keyof typeof STORE_ERROR];

/**
 * Classifies a thrown `PurchasesError` into one of our stable codes.
 *
 * Pure and exported for testing. Reads `userCancelled` first (a boolean
 * RevenueCat always sets), then matches the human-readable code by substring so
 * the mapping survives the SDK's numeric/string code differences across
 * versions. Anything unrecognized is `unknown` — never silently treated as a
 * grant or a cancellation.
 */
export function classifyPurchaseError(error: unknown): StoreErrorCode {
  if (!error || typeof error !== 'object') return STORE_ERROR.unknown;
  const err = error as PurchasesError;

  if (err.userCancelled) return STORE_ERROR.cancelled;

  const code = `${err.readableErrorCode ?? ''} ${err.code ?? ''}`.toLowerCase();
  if (code.includes('cancel')) return STORE_ERROR.cancelled;
  if (code.includes('network')) return STORE_ERROR.network;
  if (code.includes('pending')) return STORE_ERROR.pending;
  if (code.includes('notallowed') || code.includes('not_allowed')) return STORE_ERROR.notAllowed;
  if (
    code.includes('notavailable') ||
    code.includes('not_available') ||
    code.includes('alreadypurchased') ||
    code.includes('already_purchased') ||
    code.includes('productnotavailable')
  ) {
    return STORE_ERROR.unavailable;
  }
  return STORE_ERROR.unknown;
}
