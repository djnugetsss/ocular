import AsyncStorage from '@react-native-async-storage/async-storage';

import { writeCachedEntitlement } from '@/features/subscription/entitlement-cache';
import { purchaseTier, restorePurchases } from '@/features/subscription/purchase-manager';
import {
  isPurchasesAvailable,
  purchase as storePurchase,
  restore as storeRestore,
  STORE_ERROR,
  type RcEntitlement,
} from '@/features/subscription/revenue-cat';

/**
 * The PurchaseManager is tested against a mocked RevenueCat adapter, so every
 * outcome — verified grant, cancellation, pending, unavailable, thrown network
 * error, and the Simulator mock path — is exercised deterministically. The real
 * error classifier and tier collapse are kept unmocked; this file owns the
 * policy that turns a store result into an app outcome and the offline cache
 * write that goes with a grant.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('@/features/subscription/revenue-cat', () => {
  const actual = jest.requireActual('@/features/subscription/revenue-cat');
  return {
    ...actual,
    isPurchasesAvailable: jest.fn(() => true),
    purchase: jest.fn(),
    restore: jest.fn(),
  };
});

jest.mock('@/features/subscription/entitlement-cache', () => ({
  writeCachedEntitlement: jest.fn(async () => undefined),
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockAvailable = isPurchasesAvailable as jest.Mock;
const mockPurchase = storePurchase as jest.Mock;
const mockRestore = storeRestore as jest.Mock;
const mockWriteCache = writeCachedEntitlement as jest.Mock;

/** A RevenueCat error: an object carrying `userCancelled` and a readable code. */
function purchasesError(over: { userCancelled?: boolean; readableErrorCode?: string }): object {
  return { userCancelled: false, ...over };
}

function rcEntitlement(over: Partial<RcEntitlement> = {}): RcEntitlement {
  return {
    isActive: true,
    productId: 'ocular.yearly',
    willRenew: true,
    expiresAt: Date.now() + 1_000_000,
    environment: 'production',
    verifiedAt: 42,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  storage.getItem.mockResolvedValue(null);
  mockAvailable.mockReturnValue(true);
});

describe('purchaseTier', () => {
  it('grants and caches a verified purchase, clearing any dev override', async () => {
    mockPurchase.mockResolvedValue({
      outcome: 'success',
      entitlement: rcEntitlement({ productId: 'ocular.monthly', verifiedAt: 99 }),
    });

    await expect(purchaseTier('pro_monthly', 'user-1')).resolves.toEqual({
      status: 'granted',
      tier: 'pro_monthly',
    });
    expect(mockWriteCache).toHaveBeenCalledWith('user-1', 'pro_monthly', 99);
    // A real grant clears the dev override so it can't revert the purchase.
    expect(storage.removeItem).toHaveBeenCalledWith('ocular.subscription.mock-tier');
  });

  it('reports an unavailable product (no package in the current offering)', async () => {
    mockPurchase.mockResolvedValue({ outcome: 'unavailable' });
    await expect(purchaseTier('pro_annual', 'user-1')).resolves.toEqual({ status: 'unavailable' });
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('maps a user cancellation to a non-error outcome', async () => {
    mockPurchase.mockRejectedValue(purchasesError({ userCancelled: true }));
    await expect(purchaseTier('pro_annual', 'user-1')).resolves.toEqual({ status: 'cancelled' });
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('maps Ask-to-Buy / SCA to pending', async () => {
    mockPurchase.mockRejectedValue(purchasesError({ readableErrorCode: 'PaymentPendingError' }));
    await expect(purchaseTier('pro_annual', 'user-1')).resolves.toEqual({ status: 'pending' });
  });

  it('maps an unavailable-product error to unavailable', async () => {
    mockPurchase.mockRejectedValue(
      purchasesError({ readableErrorCode: 'ProductNotAvailableForPurchaseError' })
    );
    await expect(purchaseTier('pro_annual', 'user-1')).resolves.toEqual({ status: 'unavailable' });
  });

  it('classifies a thrown network error by its code', async () => {
    mockPurchase.mockRejectedValue(purchasesError({ readableErrorCode: 'NetworkError' }));
    await expect(purchaseTier('pro_annual', 'user-1')).resolves.toMatchObject({
      status: 'failed',
      code: STORE_ERROR.network,
    });
  });

  it('guards a success for an unknown product as a failure, never a grant', async () => {
    mockPurchase.mockResolvedValue({
      outcome: 'success',
      entitlement: rcEntitlement({ productId: 'ocular.lifetime' }),
    });
    const result = await purchaseTier('pro_annual', 'user-1');
    expect(result.status).toBe('failed');
    expect(mockWriteCache).not.toHaveBeenCalled();
  });

  it('simulates a grant when the store is absent but the dev override is enabled', async () => {
    mockAvailable.mockReturnValue(false);
    await expect(purchaseTier('pro_annual', 'user-1')).resolves.toEqual({
      status: 'granted',
      tier: 'pro_annual',
    });
    expect(storage.setItem).toHaveBeenCalledWith('ocular.subscription.mock-tier', 'pro_annual');
  });
});

describe('restorePurchases', () => {
  it('restores an active subscription', async () => {
    mockRestore.mockResolvedValue(rcEntitlement({ productId: 'ocular.yearly' }));
    await expect(restorePurchases('user-1')).resolves.toEqual({
      status: 'restored',
      tier: 'pro_annual',
    });
  });

  it('reports nothing to restore when no active entitlement comes back', async () => {
    mockRestore.mockResolvedValue(rcEntitlement({ isActive: false, productId: null }));
    await expect(restorePurchases('user-1')).resolves.toEqual({ status: 'none' });
  });

  it('maps a dismissed sign-in prompt to a cancellation', async () => {
    mockRestore.mockRejectedValue(purchasesError({ userCancelled: true }));
    await expect(restorePurchases('user-1')).resolves.toEqual({ status: 'cancelled' });
  });

  it('reports a network failure distinctly', async () => {
    mockRestore.mockRejectedValue(purchasesError({ readableErrorCode: 'NetworkError' }));
    await expect(restorePurchases('user-1')).resolves.toMatchObject({
      status: 'failed',
      code: STORE_ERROR.network,
    });
  });
});
