import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  NativeEntitlement,
  NativeProduct,
  NativePurchaseResult,
  OcularStoreEvents,
} from './OcularStore.types';

declare class OcularStoreModuleDefinition extends NativeModule<OcularStoreEvents> {
  /** True where StoreKit only has a local `.storekit` configuration behind it. */
  readonly isSimulator: boolean;

  /**
   * Registers the product ids this app sells. Called once at startup; the
   * transaction observer uses them to scope entitlements to our products.
   */
  configure(productIds: string[]): Promise<void>;

  /** Localized products, in the order requested. Requires the network. */
  getProducts(productIds: string[]): Promise<NativeProduct[]>;

  /**
   * The current verified entitlement. Answers from StoreKit's local signed
   * cache, so it is correct offline and never throws.
   */
  getEntitlement(): Promise<NativeEntitlement>;

  /**
   * Presents Apple's purchase sheet. `appAccountToken` must be a UUID (our
   * Supabase user id) or `null`; it attributes the transaction for a future
   * server-side receipt check.
   */
  purchase(productId: string, appAccountToken: string | null): Promise<NativePurchaseResult>;

  /**
   * `AppStore.sync()` — prompts for the App Store password, so this belongs
   * behind an explicit "Restore Purchases" tap and nowhere else.
   */
  restore(): Promise<NativeEntitlement>;

  /** Apple's manage-subscriptions sheet, where cancellation actually happens. */
  presentManageSubscriptions(): Promise<void>;
}

/**
 * `requireOptionalNativeModule`, not `requireNativeModule`: this returns
 * `null` instead of throwing when the native module is absent — Expo Go, a
 * stale build predating this module, or a web/test context. Payments are the
 * one subsystem where "not installed" must degrade to a readable screen
 * rather than a redbox, so the JS adapter treats `null` as a first-class state
 * (`src/features/subscription/store-kit.ts`).
 */
export default requireOptionalNativeModule<OcularStoreModuleDefinition>('OcularStore');
