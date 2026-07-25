import {
  STORE_ERROR,
  classifyPurchaseError,
  entitlementFromCustomerInfo,
  tierFromEntitlement,
  type RcEntitlement,
} from '@/features/subscription/revenue-cat';

/**
 * The pure mappings that decide access from RevenueCat data — the
 * security-critical core of the subscription layer. If `tierFromEntitlement`
 * says Pro when it should say Free, the paywall is bypassed; if
 * `entitlementFromCustomerInfo` reads the wrong entitlement, everything
 * downstream is wrong. These run with no device: RevenueCat's own verification
 * is server-side, and these cases pin how the app interprets its answer.
 *
 * `revenue-cat.ts` loads with the native SDK absent under Jest (mocked to
 * null), so only these pure exports are exercised here — the SDK-touching
 * functions are covered through the service and manager suites.
 */

interface ActiveOverrides {
  productIdentifier?: string;
  isActive?: boolean;
  isSandbox?: boolean;
  willRenew?: boolean;
  expirationDate?: string | null;
}

/** A CustomerInfo carrying an active `pro` entitlement, unless overridden. */
function customerInfoWithPro(over: ActiveOverrides = {}) {
  return {
    entitlements: {
      active: {
        pro: {
          identifier: 'pro',
          isActive: over.isActive ?? true,
          willRenew: over.willRenew ?? true,
          productIdentifier: over.productIdentifier ?? 'ocular.yearly',
          // `in` rather than `??` so an intentional null expiration survives.
          expirationDate:
            'expirationDate' in over ? (over.expirationDate ?? null) : '2099-01-01T00:00:00Z',
          store: 'APP_STORE',
          isSandbox: over.isSandbox ?? false,
        },
      },
    },
    managementURL: null,
  };
}

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

describe('entitlementFromCustomerInfo', () => {
  it('reads the active pro entitlement and its product', () => {
    const result = entitlementFromCustomerInfo(
      customerInfoWithPro({ productIdentifier: 'ocular.monthly' })
    );
    expect(result).toMatchObject({
      isActive: true,
      productId: 'ocular.monthly',
      willRenew: true,
      environment: 'production',
    });
    expect(result?.expiresAt).toBe(Date.parse('2099-01-01T00:00:00Z'));
  });

  it('labels a sandbox entitlement so a tester is never misled', () => {
    const result = entitlementFromCustomerInfo(customerInfoWithPro({ isSandbox: true }));
    expect(result?.environment).toBe('sandbox');
  });

  it('reports no active entitlement when the pro key is absent', () => {
    const result = entitlementFromCustomerInfo({
      entitlements: { active: {} },
      managementURL: null,
    });
    expect(result).toMatchObject({ isActive: false, productId: null });
  });

  it('treats an inactive pro entitlement as not active', () => {
    const result = entitlementFromCustomerInfo(customerInfoWithPro({ isActive: false }));
    expect(result?.isActive).toBe(false);
    expect(result?.productId).toBeNull();
  });

  it('tolerates a null/absent expiration', () => {
    const result = entitlementFromCustomerInfo(customerInfoWithPro({ expirationDate: null }));
    expect(result?.expiresAt).toBeNull();
  });

  it('returns null for null customer info', () => {
    expect(entitlementFromCustomerInfo(null)).toBeNull();
  });
});

describe('tierFromEntitlement', () => {
  it('grants the matching tier for an active subscription', () => {
    expect(tierFromEntitlement(rcEntitlement({ productId: 'ocular.monthly' }))).toBe('pro_monthly');
    expect(tierFromEntitlement(rcEntitlement({ productId: 'ocular.yearly' }))).toBe('pro_annual');
  });

  it('treats a null entitlement as free', () => {
    expect(tierFromEntitlement(null)).toBe('free');
  });

  it('collapses an inactive entitlement to free', () => {
    expect(tierFromEntitlement(rcEntitlement({ isActive: false, productId: null }))).toBe('free');
  });

  it('refuses to grant pro for an active entitlement on an unknown product', () => {
    // A stale receipt for a discontinued product is active but unmappable;
    // granting from it would be a forever-unlock. It must collapse to free.
    expect(tierFromEntitlement(rcEntitlement({ productId: 'ocular.lifetime' }))).toBe('free');
    expect(tierFromEntitlement(rcEntitlement({ productId: null }))).toBe('free');
  });
});

describe('classifyPurchaseError', () => {
  it('maps a user cancellation from the boolean RevenueCat always sets', () => {
    expect(classifyPurchaseError({ userCancelled: true })).toBe(STORE_ERROR.cancelled);
  });

  it('classifies by the readable code, not message text', () => {
    expect(classifyPurchaseError({ readableErrorCode: 'NetworkError' })).toBe(STORE_ERROR.network);
    expect(classifyPurchaseError({ readableErrorCode: 'PaymentPendingError' })).toBe(
      STORE_ERROR.pending
    );
    expect(classifyPurchaseError({ readableErrorCode: 'PurchaseNotAllowedError' })).toBe(
      STORE_ERROR.notAllowed
    );
    expect(
      classifyPurchaseError({ readableErrorCode: 'ProductNotAvailableForPurchaseError' })
    ).toBe(STORE_ERROR.unavailable);
    expect(classifyPurchaseError({ readableErrorCode: 'ProductAlreadyPurchasedError' })).toBe(
      STORE_ERROR.unavailable
    );
  });

  it('falls back to the numeric/string code field when no readable code is present', () => {
    expect(classifyPurchaseError({ code: 'NETWORK_ERROR' })).toBe(STORE_ERROR.network);
  });

  it('is unknown for anything unrecognized — never a silent grant or cancel', () => {
    expect(classifyPurchaseError({ readableErrorCode: 'StoreProblemError' })).toBe(
      STORE_ERROR.unknown
    );
    expect(classifyPurchaseError(null)).toBe(STORE_ERROR.unknown);
    expect(classifyPurchaseError('offline')).toBe(STORE_ERROR.unknown);
  });
});
