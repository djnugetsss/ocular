import {
  FREE_DAILY_CHECK_IN_LIMIT,
  FREE_VISIBLE_SESSION_LIMIT,
  PENDING_ENTITLEMENTS,
  SUBSCRIPTION_TIERS,
  asSubscriptionTier,
  checkInAllowance,
  entitlementsFor,
  isProTier,
  visibleSessions,
  type Entitlements,
  type SubscriptionTier,
} from '@/features/subscription/entitlements';

const SHIPPED = entitlementsFor('free');
const PRO_MONTHLY = entitlementsFor('pro_monthly');
const PRO_ANNUAL = entitlementsFor('pro_annual');

/**
 * A metered plan, built here rather than read from `entitlementsFor`.
 *
 * Ocular ships free, so no tier resolves to limits any more — but the gate
 * functions below still implement them, and they must keep working for the day
 * a plan comes back. These fixtures test the *machinery* (does a limit close a
 * gate, is the arithmetic right) independently of whether any tier currently
 * hands one out, which is what stops the revert from landing on untested code.
 */
const LIMITED: Entitlements = {
  tier: 'free',
  isPro: false,
  planLabel: 'Metered',
  dailyCheckInLimit: FREE_DAILY_CHECK_IN_LIMIT,
  visibleSessionLimit: FREE_VISIBLE_SESSION_LIMIT,
  hasFullInsights: false,
  hasTrendAnalytics: false,
  hasExport: true,
  hasBackgroundTracking: false,
};

/** The other half of the machinery: `null` limits hide and block nothing. */
const UNLIMITED: Entitlements = PRO_ANNUAL;

describe('entitlementsFor', () => {
  it('grants every capability on every tier, because the app ships free', () => {
    // The inverse of this assertion is the bug that matters: a tier that
    // resolved to a limit would hide Insights from every user of a free app.
    for (const tier of SUBSCRIPTION_TIERS) {
      const entitlements = entitlementsFor(tier);
      expect(entitlements.isPro).toBe(true);
      expect(entitlements.dailyCheckInLimit).toBeNull();
      expect(entitlements.visibleSessionLimit).toBeNull();
      expect(entitlements.hasFullInsights).toBe(true);
      expect(entitlements.hasTrendAnalytics).toBe(true);
      expect(entitlements.hasExport).toBe(true);
      expect(entitlements.hasBackgroundTracking).toBe(true);
    }
  });

  it('gives an unverified account the same access as a paid one', () => {
    // No signed-in user resolves to anything but `free`, so this is the record
    // essentially everyone runs on. It must be indistinguishable from Pro.
    const { tier: _freeTier, planLabel: _freeLabel, ...shipped } = SHIPPED;
    const { tier: _annualTier, planLabel: _annualLabel, ...annual } = PRO_ANNUAL;
    expect(shipped).toEqual(annual);
  });

  it('grants both paid tiers identical capabilities', () => {
    // Monthly and annual differ in price and renewal, never in what they
    // unlock. A gate that could tell them apart would be a bug.
    const { tier: _monthlyTier, planLabel: _monthlyLabel, ...monthly } = PRO_MONTHLY;
    const { tier: _annualTier, planLabel: _annualLabel, ...annual } = PRO_ANNUAL;
    expect(monthly).toEqual(annual);
  });

  it('lets every user export their own data', () => {
    // Export was never a paid capability even when there was a paywall:
    // Profile's "Export my data" has always been ungated.
    expect(SHIPPED.hasExport).toBe(true);
  });

  it('reports its own tier and label back, which full access must not clobber', () => {
    // `tier` and `planLabel` survive the grant spread — the provider still
    // shows what was actually verified, and Profile still names the plan.
    for (const tier of SUBSCRIPTION_TIERS) {
      expect(entitlementsFor(tier).tier).toBe(tier);
    }
    expect(SHIPPED.planLabel).toBe('Ocular');
    expect(PRO_ANNUAL.planLabel).toBe('Pro Annual');
  });

  it('keeps the suspended limits on record for a future revert', () => {
    // The constants are the policy full access is standing in front of, not
    // dead numbers: nothing reads them as a gate today, and restoring one is
    // meant to be deleting a spread, not reinventing these.
    expect(FREE_DAILY_CHECK_IN_LIMIT).toBe(3);
    expect(FREE_VISIBLE_SESSION_LIMIT).toBe(10);
  });
});

describe('isProTier', () => {
  it('treats every non-free tier as pro', () => {
    expect(isProTier('free')).toBe(false);
    expect(isProTier('pro_monthly')).toBe(true);
    expect(isProTier('pro_annual')).toBe(true);
  });
});

describe('asSubscriptionTier', () => {
  it('accepts known tiers', () => {
    expect(asSubscriptionTier('pro_annual')).toBe('pro_annual');
  });

  it('rejects anything else, so a stale stored value cannot grant Pro', () => {
    for (const value of ['pro', 'PRO_ANNUAL', '', null, undefined, 3, {}]) {
      expect(asSubscriptionTier(value)).toBeNull();
    }
  });
});

describe('PENDING_ENTITLEMENTS', () => {
  it('leaves every gate open while the tier is unknown', () => {
    expect(PENDING_ENTITLEMENTS.dailyCheckInLimit).toBeNull();
    expect(PENDING_ENTITLEMENTS.visibleSessionLimit).toBeNull();
    expect(PENDING_ENTITLEMENTS.hasFullInsights).toBe(true);
    expect(PENDING_ENTITLEMENTS.hasTrendAnalytics).toBe(true);
  });

  it('is indistinguishable from a resolved record, so nothing flickers', () => {
    // While the app ships free there is no state — pending or ready — where a
    // capability is withheld, so a cold launch cannot render a locked frame
    // before the first resolution lands.
    const { tier: _pendingTier, planLabel: _pendingLabel, ...pending } = PENDING_ENTITLEMENTS;
    const { tier: _shippedTier, planLabel: _shippedLabel, ...shipped } = SHIPPED;
    expect(pending).toEqual(shipped);
  });

  it('still reports the tier as unverified', () => {
    // Access is granted, but `tier` stays the honest answer to "what has been
    // proven?" — the provider's diagnostics and the cache both depend on it.
    expect(PENDING_ENTITLEMENTS.tier).toBe<SubscriptionTier>('free');
  });
});

/**
 * The gate functions themselves. These run on the hand-built fixtures above,
 * never on `entitlementsFor`, so they keep asserting real limit behaviour
 * while every shipped tier resolves to unlimited.
 */
describe('checkInAllowance', () => {
  it('allows the first check-ins up to a metered limit', () => {
    expect(checkInAllowance(LIMITED, 0).isAllowed).toBe(true);
    expect(checkInAllowance(LIMITED, 1).isAllowed).toBe(true);
    expect(checkInAllowance(LIMITED, 2).isAllowed).toBe(true);
  });

  it('closes the gate exactly at the limit', () => {
    const spent = checkInAllowance(LIMITED, 3);
    expect(spent.isAllowed).toBe(false);
    expect(spent.remaining).toBe(0);
    expect(spent.limit).toBe(3);
  });

  it('counts down the remaining check-ins', () => {
    expect(checkInAllowance(LIMITED, 0).remaining).toBe(3);
    expect(checkInAllowance(LIMITED, 2).remaining).toBe(1);
  });

  it('never reports negative remaining when usage overshoots the limit', () => {
    // Two devices can both pass an open gate before either count refreshes.
    // The overshoot is real data and is reported as-is; the *promise* to the
    // user is clamped, because "-1 left" is not a thing.
    const overshot = checkInAllowance(LIMITED, 5);
    expect(overshot.isAllowed).toBe(false);
    expect(overshot.used).toBe(5);
    expect(overshot.remaining).toBe(0);
  });

  it('never limits a plan with no ceiling', () => {
    const allowance = checkInAllowance(UNLIMITED, 42);
    expect(allowance.isAllowed).toBe(true);
    expect(allowance.isUnlimited).toBe(true);
    expect(allowance.limit).toBeNull();
    expect(allowance.remaining).toBeNull();
    expect(allowance.used).toBe(42);
  });

  it('fails open when usage is unknown', () => {
    // An offline count must not cost the user a measurement.
    const unknown = checkInAllowance(LIMITED, null);
    expect(unknown.isAllowed).toBe(true);
    expect(unknown.isUsageUnknown).toBe(true);
    // No claim is made about what is left, so no UI can promise one.
    expect(unknown.remaining).toBeNull();
    expect(unknown.used).toBe(0);
  });

  it('marks unknown usage on an unlimited plan too, without changing the outcome', () => {
    const unknown = checkInAllowance(UNLIMITED, null);
    expect(unknown.isAllowed).toBe(true);
    expect(unknown.isUsageUnknown).toBe(true);
  });
});

describe('visibleSessions', () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ id: `session-${index}` }));

  it('shows a metered plan its newest sessions up to the limit', () => {
    const result = visibleSessions(rows, LIMITED);
    expect(result.visible).toHaveLength(10);
    expect(result.visible[0]).toBe(rows[0]);
    expect(result.visible[9]).toBe(rows[9]);
    expect(result.hiddenCount).toBe(15);
    expect(result.isLimited).toBe(true);
  });

  it('hides nothing when the history is under the limit', () => {
    const result = visibleSessions(rows.slice(0, 4), LIMITED);
    expect(result.visible).toHaveLength(4);
    expect(result.hiddenCount).toBe(0);
    expect(result.isLimited).toBe(false);
  });

  it('shows everything when the limit is null', () => {
    const result = visibleSessions(rows, UNLIMITED);
    expect(result.visible).toHaveLength(25);
    expect(result.hiddenCount).toBe(0);
    expect(result.limit).toBeNull();
  });

  it('never mutates or discards the caller’s history', () => {
    // The whole point of the limit being presentational: the array the
    // aggregates read is untouched, and the hidden rows still exist.
    const source = rows.slice();
    const result = visibleSessions(source, LIMITED);
    expect(source).toHaveLength(25);
    expect(result.visible).not.toBe(source);
    result.visible.push({ id: 'mutation' });
    expect(source).toHaveLength(25);
  });

  it('handles an empty history', () => {
    const result = visibleSessions([], LIMITED);
    expect(result.visible).toEqual([]);
    expect(result.hiddenCount).toBe(0);
    expect(result.isLimited).toBe(false);
  });

  it('counts hidden sessions from the true total when given only a window', () => {
    // Today fetches the newest 30 for its aggregates but the user has 100.
    // Without the total, "N older kept" would cap at 20; with it, it is honest.
    const window = rows.slice(0, 30);
    const result = visibleSessions(window, LIMITED, 100);
    expect(result.visible).toHaveLength(10);
    expect(result.hiddenCount).toBe(90);
    expect(result.isLimited).toBe(true);
  });

  it('never lets the total imply hidden rows when the limit is null', () => {
    const result = visibleSessions(rows, UNLIMITED, 100);
    expect(result.visible).toHaveLength(rows.length);
    expect(result.hiddenCount).toBe(0);
    expect(result.isLimited).toBe(false);
  });

  it('never reports a negative or under-count when the total lags the window', () => {
    // A stale total below what was actually fetched must not produce nonsense.
    const result = visibleSessions(rows.slice(0, 10), LIMITED, 4);
    expect(result.hiddenCount).toBe(0);
    expect(result.isLimited).toBe(false);
  });
});
