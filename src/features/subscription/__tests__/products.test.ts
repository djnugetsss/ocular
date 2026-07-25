import {
  ALL_PRODUCT_IDS,
  PRODUCT_IDS,
  productIdForTier,
  tierForProductId,
} from '@/features/subscription/products';

describe('product ids', () => {
  it('match the App Store Connect identifiers exactly', () => {
    // These strings are the contract with App Store Connect; a typo here is a
    // paywall that sells nothing. Pinned so a rename is a deliberate diff.
    expect(PRODUCT_IDS.pro_monthly).toBe('ocular.monthly');
    expect(PRODUCT_IDS.pro_annual).toBe('ocular.yearly');
  });

  it('lists every sellable id', () => {
    expect(ALL_PRODUCT_IDS).toEqual(['ocular.monthly', 'ocular.yearly']);
  });
});

describe('tierForProductId', () => {
  it('resolves each id to its tier', () => {
    expect(tierForProductId('ocular.monthly')).toBe('pro_monthly');
    expect(tierForProductId('ocular.yearly')).toBe('pro_annual');
  });

  it('returns null for an unknown, discontinued, or empty id', () => {
    // The security-critical direction: an id we do not sell must never be
    // assumed to be Pro, or a stale receipt for a removed product would
    // unlock the app forever.
    for (const value of ['ocular.lifetime', 'com.other.app', '', null, undefined]) {
      expect(tierForProductId(value)).toBeNull();
    }
  });

  it('round-trips with productIdForTier', () => {
    expect(tierForProductId(productIdForTier('pro_monthly'))).toBe('pro_monthly');
    expect(tierForProductId(productIdForTier('pro_annual'))).toBe('pro_annual');
  });
});
