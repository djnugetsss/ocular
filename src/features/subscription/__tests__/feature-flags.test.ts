import { entitlementsFor, PENDING_ENTITLEMENTS } from '@/features/subscription/entitlements';
import {
  canUseFeature,
  featureAccess,
  FEATURE_FLAGS,
  type Feature,
} from '@/features/subscription/feature-flags';

/**
 * FeatureGate policy: does a plan grant a named capability, and if not, why —
 * "upgrade to unlock" versus "coming soon". The distinction is what lets the UI
 * show an upgrade CTA in one case and a quiet "Coming soon" note in the other,
 * so it is pinned here rather than left to each screen.
 */

const FREE = entitlementsFor('free');
const PRO = entitlementsFor('pro_annual');

const LIVE_PRO_FEATURES: Feature[] = [
  'unlimited_check_ins',
  'unlimited_history',
  'insights',
  'trend_analytics',
];

/**
 * Live features every plan gets. `export` is here rather than above because a
 * user's own measurements are not a paid capability — Profile's "Export my
 * data" has always been ungated, and the entitlement record now says so too.
 */
const LIVE_UNIVERSAL_FEATURES: Feature[] = ['export'];

describe('featureAccess — live Pro features', () => {
  it('locks every paid feature behind an upgrade for a free user', () => {
    for (const feature of LIVE_PRO_FEATURES) {
      expect(featureAccess(FREE, feature)).toEqual({ allowed: false, reason: 'requires_pro' });
    }
  });

  it('grants every live paid feature to a Pro user', () => {
    for (const feature of [...LIVE_PRO_FEATURES, ...LIVE_UNIVERSAL_FEATURES]) {
      expect(featureAccess(PRO, feature)).toEqual({ allowed: true, reason: 'ok' });
    }
  });

  it('grants the universal features to a free user too', () => {
    for (const feature of LIVE_UNIVERSAL_FEATURES) {
      expect(featureAccess(FREE, feature)).toEqual({ allowed: true, reason: 'ok' });
    }
  });
});

describe('featureAccess — coming-soon entitlements', () => {
  it('resolves background tracking to coming_soon for an entitled Pro user', () => {
    // Pro is *entitled*, but the feature has not shipped — it must read as
    // coming_soon, never ok, and never an upgrade prompt.
    expect(featureAccess(PRO, 'background_tracking')).toEqual({
      allowed: false,
      reason: 'coming_soon',
    });
  });

  it('still tells a free user to upgrade first for a coming-soon Pro feature', () => {
    expect(featureAccess(FREE, 'background_tracking')).toEqual({
      allowed: false,
      reason: 'requires_pro',
    });
  });
});

describe('canUseFeature', () => {
  it('is the boolean of allowed', () => {
    expect(canUseFeature(PRO, 'insights')).toBe(true);
    expect(canUseFeature(FREE, 'insights')).toBe(false);
    // Entitled but not shipped is still not usable.
    expect(canUseFeature(PRO, 'background_tracking')).toBe(false);
  });
});

describe('pending entitlements', () => {
  it('leaves live gates open while the tier resolves, without inventing pro-ness', () => {
    // Matches the permissive PENDING policy: a subscriber is never briefly
    // locked out on a cold launch.
    for (const feature of LIVE_PRO_FEATURES) {
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
