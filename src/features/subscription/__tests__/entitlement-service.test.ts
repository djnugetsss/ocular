import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  readCachedEntitlement,
  writeCachedEntitlement,
} from '@/features/subscription/entitlement-cache';
import {
  adoptEntitlementChange,
  forgetEntitlement,
  resolveEntitlement,
  writeMockTier,
} from '@/features/subscription/entitlement-service';
import {
  getEntitlement,
  identifyUser,
  isPurchasesAvailable,
  signOutPurchases,
  type RcEntitlement,
} from '@/features/subscription/revenue-cat';

/**
 * The EntitlementService is tested against a mocked RevenueCat adapter and a
 * mocked cache, so every branch of the resolution precedence — mock override,
 * live store, offline fallback, bridge failure — is exercised deterministically
 * with no device. The real security collapse (`tierFromEntitlement`) is kept
 * unmocked; this file owns the policy that stitches it to identity and caching.
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
    isPurchasesAvailable: jest.fn(() => false),
    identifyUser: jest.fn(),
    getEntitlement: jest.fn(),
    signOutPurchases: jest.fn(async () => undefined),
  };
});

jest.mock('@/features/subscription/entitlement-cache', () => ({
  readCachedEntitlement: jest.fn(async () => null),
  writeCachedEntitlement: jest.fn(async () => undefined),
  clearCachedEntitlement: jest.fn(async () => undefined),
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockAvailable = isPurchasesAvailable as jest.Mock;
const mockIdentify = identifyUser as jest.Mock;
const mockGetEntitlement = getEntitlement as jest.Mock;
const mockSignOut = signOutPurchases as jest.Mock;
const mockReadCache = readCachedEntitlement as jest.Mock;
const mockWriteCache = writeCachedEntitlement as jest.Mock;

function rcEntitlement(over: Partial<RcEntitlement> = {}): RcEntitlement {
  return {
    isActive: true,
    productId: 'ocular.yearly',
    willRenew: true,
    expiresAt: Date.now() + 1_000_000,
    environment: 'production',
    verifiedAt: 1_700_000_000_000,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  storage.getItem.mockResolvedValue(null);
  mockAvailable.mockReturnValue(false);
  mockReadCache.mockResolvedValue(null);
});

describe('resolveEntitlement — precedence', () => {
  it('resolves a signed-out device to free without touching storage or the store', async () => {
    await expect(resolveEntitlement(null)).resolves.toEqual({ tier: 'free', origin: 'signed-out' });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('honors a dev override above the store', async () => {
    storage.getItem.mockResolvedValue('pro_annual');
    mockAvailable.mockReturnValue(true);
    await expect(resolveEntitlement('user-1')).resolves.toEqual({
      tier: 'pro_annual',
      origin: 'mock',
    });
    // The override short-circuits: the store is never consulted.
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('identifies the user, verifies, and caches the verified tier', async () => {
    mockAvailable.mockReturnValue(true);
    mockIdentify.mockResolvedValue(rcEntitlement({ productId: 'ocular.yearly' }));

    await expect(resolveEntitlement('user-1')).resolves.toEqual({
      tier: 'pro_annual',
      origin: 'store',
      environment: 'production',
    });
    expect(mockIdentify).toHaveBeenCalledWith('user-1');
    expect(mockWriteCache).toHaveBeenCalledWith('user-1', 'pro_annual', 1_700_000_000_000);
  });

  it('falls back to a direct entitlement read when identify returns nothing', async () => {
    mockAvailable.mockReturnValue(true);
    mockIdentify.mockResolvedValue(null);
    mockGetEntitlement.mockResolvedValue(rcEntitlement({ productId: 'ocular.monthly' }));

    await expect(resolveEntitlement('user-1')).resolves.toMatchObject({
      tier: 'pro_monthly',
      origin: 'store',
    });
  });

  it('overwrites the cache with free when the store reports no active entitlement', async () => {
    mockAvailable.mockReturnValue(true);
    mockIdentify.mockResolvedValue(rcEntitlement({ isActive: false, productId: null }));

    const result = await resolveEntitlement('user-1');
    expect(result.tier).toBe('free');
    expect(result.origin).toBe('store');
    expect(mockWriteCache).toHaveBeenCalledWith('user-1', 'free', expect.any(Number));
  });

  it('falls back to the offline cache when the store is unavailable', async () => {
    mockAvailable.mockReturnValue(false);
    mockReadCache.mockResolvedValue({ tier: 'pro_monthly', verifiedAt: 123 });

    await expect(resolveEntitlement('user-1')).resolves.toEqual({
      tier: 'pro_monthly',
      origin: 'cache',
    });
  });

  it('falls back to the cache when a store call throws (bridge failure)', async () => {
    mockAvailable.mockReturnValue(true);
    mockIdentify.mockRejectedValue(new Error('bridge exploded'));
    mockReadCache.mockResolvedValue({ tier: 'pro_annual', verifiedAt: 1 });

    await expect(resolveEntitlement('user-1')).resolves.toEqual({
      tier: 'pro_annual',
      origin: 'cache',
    });
  });

  it('defaults to free when neither store nor cache has anything', async () => {
    await expect(resolveEntitlement('user-1')).resolves.toEqual({
      tier: 'free',
      origin: 'default',
    });
  });
});

describe('adoptEntitlementChange', () => {
  it('maps a live revocation to free and refreshes the cache', async () => {
    const tier = await adoptEntitlementChange(
      'user-1',
      rcEntitlement({ isActive: false, productId: null })
    );
    expect(tier).toBe('free');
    expect(mockWriteCache).toHaveBeenCalledWith('user-1', 'free', expect.any(Number));
  });

  it('maps a renewal to its tier', async () => {
    const tier = await adoptEntitlementChange(
      'user-1',
      rcEntitlement({ productId: 'ocular.monthly' })
    );
    expect(tier).toBe('pro_monthly');
  });

  it('does not write a cache line for a signed-out user', async () => {
    await adoptEntitlementChange(null, rcEntitlement());
    expect(mockWriteCache).not.toHaveBeenCalled();
  });
});

describe('writeMockTier', () => {
  it('persists and clears the dev override', async () => {
    await writeMockTier('pro_monthly');
    expect(storage.setItem).toHaveBeenCalledWith('ocular.subscription.mock-tier', 'pro_monthly');
    await writeMockTier(null);
    expect(storage.removeItem).toHaveBeenCalledWith('ocular.subscription.mock-tier');
  });

  it('swallows storage failures — a debug switch must not throw', async () => {
    storage.setItem.mockRejectedValue(new Error('disk full'));
    await expect(writeMockTier('pro_annual')).resolves.toBeUndefined();
  });
});

describe('forgetEntitlement', () => {
  it('clears the cache and returns RevenueCat to an anonymous id', async () => {
    await forgetEntitlement('user-1');
    expect(mockSignOut).toHaveBeenCalled();
  });
});
