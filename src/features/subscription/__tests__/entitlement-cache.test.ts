import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearCachedEntitlement,
  readCachedEntitlement,
  writeCachedEntitlement,
} from '@/features/subscription/entitlement-cache';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

beforeEach(() => jest.clearAllMocks());

describe('entitlement cache', () => {
  it('round-trips a verified tier under a per-user key', async () => {
    await writeCachedEntitlement('user-1', 'pro_annual', 999);
    const [key, value] = storage.setItem.mock.calls[0]!;
    // Keyed by user so a shared device cannot leak one account's Pro to another.
    expect(key).toBe('ocular.entitlement.cache.user-1');

    storage.getItem.mockResolvedValue(value);
    await expect(readCachedEntitlement('user-1')).resolves.toEqual({
      tier: 'pro_annual',
      verifiedAt: 999,
    });
  });

  it('reads null for an empty slot', async () => {
    storage.getItem.mockResolvedValue(null);
    await expect(readCachedEntitlement('user-1')).resolves.toBeNull();
  });

  it('rejects a payload with an unrecognized tier', async () => {
    // A value from an older build must fail closed, not grant a defunct tier.
    storage.getItem.mockResolvedValue(JSON.stringify({ tier: 'lifetime', verifiedAt: 1 }));
    await expect(readCachedEntitlement('user-1')).resolves.toBeNull();
  });

  it('rejects a payload missing its verification timestamp', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({ tier: 'pro_monthly' }));
    await expect(readCachedEntitlement('user-1')).resolves.toBeNull();
  });

  it('treats corrupt JSON as absent rather than throwing', async () => {
    storage.getItem.mockResolvedValue('{not json');
    await expect(readCachedEntitlement('user-1')).resolves.toBeNull();
  });

  it('reads null when storage itself throws', async () => {
    storage.getItem.mockRejectedValue(new Error('unavailable'));
    await expect(readCachedEntitlement('user-1')).resolves.toBeNull();
  });

  it('clears a user’s cache line', async () => {
    await clearCachedEntitlement('user-1');
    expect(storage.removeItem).toHaveBeenCalledWith('ocular.entitlement.cache.user-1');
  });

  it('never throws out of a write, even when storage fails', async () => {
    storage.setItem.mockRejectedValue(new Error('disk full'));
    await expect(writeCachedEntitlement('user-1', 'free', 0)).resolves.toBeUndefined();
  });
});
