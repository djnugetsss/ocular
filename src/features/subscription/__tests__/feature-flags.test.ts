import {
  entitlementsFor,
  PENDING_ENTITLEMENTS,
  SUBSCRIPTION_TIERS,
  type Entitlements,
} from '@/features/subscription/entitlements';
import {
  canUseFeature,
  featureAccess,
  FEATURE_FLAGS,
  type Feature,
} from '@/features/subscription/feature-flags';

/**
 * FeatureGate policy: does a plan grant a named capability, and if not, why —
 * "upgrade to unlock" versus "coming soon". The distinction still matters even
 * though nothing is sold any more: `coming_soon` is what keeps an unbuilt
 * feature unreachable while its entitlement reads true.
 */

const SHIPPED = entitlementsFor('free');
const PRO = entitlementsFor('pro_annual');

/**
 * A plan that withholds things, hand-built — no tier resolves to one now. It
 * keeps the `requires_pro` branch of `featureAccess` under test for a revert.
 */
const WITHHOLDING: Entitlements = {
  ...SHIPPED,
  isPro: false,
  planLabel: 'Metered',
  dailyCheckInLimit: 3,
  visibleSessionLimit: 10,
  hasFullInsights: false,
  hasTrendAnalytics: false,
  hasBackgroundTracking: false,
};

const LIVE_GATED_FEATURES: Feature[] = [
  'unlimited_check_ins',
  'unlimited_history',
  'insights',
  'trend_analytics',
];

/**
 * Live features that were never gated at all. `export` is here because a
 * user's own measurements are not a paid capability — Profile's "Export my
 * data" has always been ungated, and the entitlement record says so too.
 */
const LIVE_UNIVERSAL_FEATURES: Feature[] = ['export'];

describe('featureAccess — shipped free', () => {
  it('allows every live feature on every tier', () => {
    // The assertion that matters for a free app: no tier, and no resolution
    // state, can produce `requires_pro` for something that has shipped.
    for (const tier of SUBSCRIPTION_TIERS) {
      const entitlements = entitlementsFor(tier);
      for (const feature of [...LIVE_GATED_FEATURES, ...LIVE_UNIVERSAL_FEATURES]) {
        expect(featureAccess(entitlements, feature)).toEqual({ allowed: true, reason: 'ok' });
      }
    }
  });

  it('never reports requires_pro for a live feature', () => {
    for (const entitlements of [SHIPPED, PRO, PENDING_ENTITLEMENTS]) {
      for (const feature of [...LIVE_GATED_FEATURES, ...LIVE_UNIVERSAL_FEATURES]) {
        expect(featureAccess(entitlements, feature).reason).not.toBe('requires_pro');
      }
    }
  });
});

describe('featureAccess — the withholding branch, kept for a revert', () => {
  it('still locks a gated feature when a plan does not grant it', () => {
    for (const feature of LIVE_GATED_FEATURES) {
      expect(featureAccess(WITHHOLDING, feature)).toEqual({
        allowed: false,
        reason: 'requires_pro',
      });
    }
  });

  it('still grants the universal features to a withholding plan', () => {
    for (const feature of LIVE_UNIVERSAL_FEATURES) {
      expect(featureAccess(WITHHOLDING, feature)).toEqual({ allowed: true, reason: 'ok' });
    }
  });
});

describe('featureAccess — coming-soon entitlements', () => {
  it('keeps background tracking unreachable even though every plan entitles it', () => {
    // The load-bearing one for shipping free: `hasBackgroundTracking` is now
    // true for everybody, and availability — not entitlement — is what keeps
    // an unbuilt feature inert. It must read coming_soon, never ok.
    for (const entitlements of [SHIPPED, PRO, PENDING_ENTITLEMENTS]) {
      expect(featureAccess(entitlements, 'background_tracking')).toEqual({
        allowed: false,
        reason: 'coming_soon',
      });
      expect(canUseFeature(entitlements, 'background_tracking')).toBe(false);
    }
  });

  it('reports a missing grant before availability, for a plan without one', () => {
    expect(featureAccess(WITHHOLDING, 'background_tracking')).toEqual({
      allowed: false,
      reason: 'requires_pro',
    });
  });
});

describe('canUseFeature', () => {
  it('is the boolean of allowed', () => {
    expect(canUseFeature(PRO, 'insights')).toBe(true);
    expect(canUseFeature(SHIPPED, 'insights')).toBe(true);
    expect(canUseFeature(WITHHOLDING, 'insights')).toBe(false);
    // Entitled but not shipped is still not usable.
    expect(canUseFeature(PRO, 'background_tracking')).toBe(false);
  });
});

describe('pending entitlements', () => {
  it('leaves live gates open while the tier resolves', () => {
    // A cold launch must never render a locked frame before the first
    // resolution lands.
    for (const feature of LIVE_GATED_FEATURES) {
      expect(canUseFeature(PENDING_ENTITLEMENTS, feature)).toBe(true);
    }
    // A not-yet-shipped feature stays coming_soon regardless of resolution.
    expect(featureAccess(PENDING_ENTITLEMENTS, 'background_tracking').reason).toBe('coming_soon');
  });
});

describe('registry integrity', () => {
  it('defines exactly one flag per feature, each entitled-checked', () => {
    for (const feature of Object.keys(FEATURE_FLAGS) as Feature[]) {
      const definition = FEATURE_FLAGS[feature];
      expect(typeof definition.entitled).toBe('function');
      expect(['live', 'coming_soon']).toContain(definition.availability);
    }
  });
});
