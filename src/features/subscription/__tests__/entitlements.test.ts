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
  type SubscriptionTier,
} from '@/features/subscription/entitlements';

const FREE = entitlementsFor('free');
const PRO_MONTHLY = entitlementsFor('pro_monthly');
const PRO_ANNUAL = entitlementsFor('pro_annual');

describe('entitlementsFor', () => {
  it('limits free users to three check-ins a day and ten visible sessions', () => {
    expect(FREE.dailyCheckInLimit).toBe(FREE_DAILY_CHECK_IN_LIMIT);
    expect(FREE.dailyCheckInLimit).toBe(3);
    expect(FREE.visibleSessionLimit).toBe(FREE_VISIBLE_SESSION_LIMIT);
    expect(FREE.visibleSessionLimit).toBe(10);
    expect(FREE.hasFullInsights).toBe(false);
    expect(FREE.isPro).toBe(false);
  });

  it('grants both paid tiers identical capabilities', () => {
    // Monthly and annual differ in price and renewal, never in what they
    // unlock. A gate that could tell them apart would be a bug.
    const { tier: _monthlyTier, planLabel: _monthlyLabel, ...monthly } = PRO_MONTHLY;
    const { tier: _annualTier, planLabel: _annualLabel, ...annual } = PRO_ANNUAL;
    expect(monthly).toEqual(annual);
  });

  it('removes every limit for pro users', () => {
    for (const pro of [PRO_MONTHLY, PRO_ANNUAL]) {
      expect(pro.isPro).toBe(true);
      expect(pro.dailyCheckInLimit).toBeNull();
      expect(pro.visibleSessionLimit).toBeNull();
      expect(pro.hasFullInsights).toBe(true);
      expect(pro.hasTrendAnalytics).toBe(true);
      expect(pro.hasExport).toBe(true);
      expect(pro.hasBackgroundTracking).toBe(true);
    }
  });

  it('grants a free user none of the paid capabilities', () => {
    expect(FREE.hasTrendAnalytics).toBe(false);
    expect(FREE.hasExport).toBe(false);
    expect(FREE.hasBackgroundTracking).toBe(false);
  });

  it('reports its own tier back, so the provider cannot mislabel a plan', () => {
    for (const tier of SUBSCRIPTION_TIERS) {
      expect(entitlementsFor(tier).tier).toBe(tier);
    }
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
  });

  it('still reports an unverified account as free', () => {
    // The permissiveness is about not punishing the user mid-resolution; it
    // must never read back as "this user has paid".
    expect(PENDING_ENTITLEMENTS.isPro).toBe(false);
    expect(PENDING_ENTITLEMENTS.tier).toBe<SubscriptionTier>('free');
  });
});

describe('checkInAllowance', () => {
  it('allows a free user their first three check-ins of the day', () => {
    expect(checkInAllowance(FREE, 0).isAllowed).toBe(true);
    expect(checkInAllowance(FREE, 1).isAllowed).toBe(true);
    expect(checkInAllowance(FREE, 2).isAllowed).toBe(true);
  });

  it('closes the gate exactly at the limit', () => {
    const spent = checkInAllowance(FREE, 3);
    expect(spent.isAllowed).toBe(false);
    expect(spent.remaining).toBe(0);
    expect(spent.limit).toBe(3);
  });

  it('counts down the remaining check-ins', () => {
    expect(checkInAllowance(FREE, 0).remaining).toBe(3);
    expect(checkInAllowance(FREE, 2).remaining).toBe(1);
  });

  it('never reports negative remaining when usage overshoots the limit', () => {
    // Two devices can both pass an open gate before either count refreshes.
    // The overshoot is real data and is reported as-is; the *promise* to the
    // user is clamped, because "-1 left" is not a thing.
    const overshot = checkInAllowance(FREE, 5);
    expect(overshot.isAllowed).toBe(false);
    expect(overshot.used).toBe(5);
    expect(overshot.remaining).toBe(0);
  });

  it('never limits a pro user', () => {
    const allowance = checkInAllowance(PRO_MONTHLY, 42);
    expect(allowance.isAllowed).toBe(true);
    expect(allowance.isUnlimited).toBe(true);
    expect(allowance.limit).toBeNull();
    expect(allowance.remaining).toBeNull();
    expect(allowance.used).toBe(42);
  });

  it('fails open when usage is unknown', () => {
    // An offline count must not cost the user a measurement.
    const unknown = checkInAllowance(FREE, null);
    expect(unknown.isAllowed).toBe(true);
    expect(unknown.isUsageUnknown).toBe(true);
    // No claim is made about what is left, so no UI can promise one.
    expect(unknown.remaining).toBeNull();
    expect(unknown.used).toBe(0);
  });

  it('marks unknown usage for pro users too, without changing the outcome', () => {
    const unknown = checkInAllowance(PRO_ANNUAL, null);
    expect(unknown.isAllowed).toBe(true);
    expect(unknown.isUsageUnknown).toBe(true);
  });
});

describe('visibleSessions', () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ id: `session-${index}` }));

  it('shows a free user their ten newest sessions', () => {
    const result = visibleSessions(rows, FREE);
    expect(result.visible).toHaveLength(10);
    expect(result.visible[0]).toBe(rows[0]);
    expect(result.visible[9]).toBe(rows[9]);
    expect(result.hiddenCount).toBe(15);
    expect(result.isLimited).toBe(true);
  });

  it('hides nothing when the history is under the limit', () => {
    const result = visibleSessions(rows.slice(0, 4), FREE);
    expect(result.visible).toHaveLength(4);
    expect(result.hiddenCount).toBe(0);
    expect(result.isLimited).toBe(false);
  });

  it('shows a pro user everything', () => {
    const result = visibleSessions(rows, PRO_ANNUAL);
    expect(result.visible).toHaveLength(25);
    expect(result.hiddenCount).toBe(0);
    expect(result.limit).toBeNull();
  });

  it('never mutates or discards the caller’s history', () => {
    // The whole point of the limit being presentational: the array the
    // aggregates read is untouched, and the hidden rows still exist.
    const source = rows.slice();
    const result = visibleSessions(source, FREE);
    expect(source).toHaveLength(25);
    expect(result.visible).not.toBe(source);
    result.visible.push({ id: 'mutation' });
    expect(source).toHaveLength(25);
  });

  it('handles an empty history', () => {
    const result = visibleSessions([], FREE);
    expect(result.visible).toEqual([]);
    expect(result.hiddenCount).toBe(0);
    expect(result.isLimited).toBe(false);
  });

  it('counts hidden sessions from the true total when given only a window', () => {
    // Today fetches the newest 30 for its aggregates but the user has 100.
    // Without the total, "N older kept" would cap at 20; with it, it is honest.
    const window = rows.slice(0, 30);
    const result = visibleSessions(window, FREE, 100);
    expect(result.visible).toHaveLength(10);
    expect(result.hiddenCount).toBe(90);
    expect(result.isLimited).toBe(true);
  });

  it('never lets the total imply hidden rows for a pro user', () => {
    const result = visibleSessions(rows, PRO_ANNUAL, 100);
    expect(result.visible).toHaveLength(rows.length);
    expect(result.hiddenCount).toBe(0);
    expect(result.isLimited).toBe(false);
  });

  it('never reports a negative or under-count when the total lags the window', () => {
    // A stale total below what was actually fetched must not produce nonsense.
    const result = visibleSessions(rows.slice(0, 10), FREE, 4);
    expect(result.hiddenCount).toBe(0);
    expect(result.isLimited).toBe(false);
  });
});
