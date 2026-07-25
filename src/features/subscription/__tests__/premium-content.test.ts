import {
  FREE_DAILY_CHECK_IN_LIMIT,
  FREE_VISIBLE_SESSION_LIMIT,
} from '@/features/subscription/entitlements';
import {
  ANNUAL_BADGE,
  FREE_KEEPS,
  PAYWALL_HEADLINE,
  PAYWALL_SUBHEADLINE,
  PLAN_COMPARISON,
  PRICING,
  annualSavingsPercent,
} from '@/features/subscription/premium-content';

/** Every string the paywall shows, for the voice rules that apply to all of it. */
const ALL_MARKETING_TEXT = [
  PAYWALL_HEADLINE,
  PAYWALL_SUBHEADLINE,
  FREE_KEEPS,
  ANNUAL_BADGE,
  ...PLAN_COMPARISON.flatMap((row) => [
    row.label,
    typeof row.free === 'string' ? row.free : '',
    typeof row.pro === 'string' ? row.pro : '',
  ]),
].join(' ');

describe('PRICING', () => {
  it('prices monthly at $3.99 and annual at $39.99', () => {
    expect(PRICING.monthly.amountUsd).toBe(3.99);
    expect(PRICING.annual.amountUsd).toBe(39.99);
  });

  it('keeps the display labels and the numbers in agreement', () => {
    // RevenueCat owns the localized label at runtime; these static labels are
    // the offline floor, and one drifting from the number it claims is a lie.
    expect(PRICING.monthly.priceLabel).toBe(`$${PRICING.monthly.amountUsd.toFixed(2)}`);
    expect(PRICING.annual.priceLabel).toBe(`$${PRICING.annual.amountUsd.toFixed(2)}`);
  });

  it('maps each option to the tier it purchases', () => {
    expect(PRICING.monthly.tier).toBe('pro_monthly');
    expect(PRICING.annual.tier).toBe('pro_annual');
  });

  it('makes annual genuinely cheaper than a year of monthly', () => {
    expect(PRICING.annual.amountUsd).toBeLessThan(PRICING.monthly.amountUsd * 12);
  });
});

describe('annualSavingsPercent', () => {
  it('floors rather than rounds up — a savings claim may never overstate', () => {
    // 39.99 against 47.88 is a 16.48% saving; the honest figure is 16.
    expect(annualSavingsPercent()).toBe(16);
  });
});

describe('paywall hero copy', () => {
  it('uses the specified headline and subheadline verbatim', () => {
    expect(PAYWALL_HEADLINE).toBe('Build healthier screen habits.');
    expect(PAYWALL_SUBHEADLINE).toBe(
      'Ocular quietly measures your blink habits while you work—privately, entirely on your device.'
    );
  });

  it('leads with privacy and on-device in the subheadline', () => {
    expect(PAYWALL_SUBHEADLINE).toMatch(/privately/i);
    expect(PAYWALL_SUBHEADLINE).toMatch(/on your device/i);
  });

  it('badges the annual plan as best value, the only nudge allowed', () => {
    expect(ANNUAL_BADGE).toBe('Best Value');
  });
});

describe('PLAN_COMPARISON', () => {
  const byLabel = (needle: RegExp) => PLAN_COMPARISON.find((row) => needle.test(row.label));

  it('states the free limits exactly as the entitlement policy defines them', () => {
    // The sales page cannot drift from the real gate: 3 check-ins, last 10.
    expect(byLabel(/check-ins/i)?.free).toBe(String(FREE_DAILY_CHECK_IN_LIMIT));
    expect(byLabel(/history/i)?.free).toContain(String(FREE_VISIBLE_SESSION_LIMIT));
  });

  it('gives both paid limits as Unlimited', () => {
    expect(byLabel(/check-ins/i)?.pro).toBe('Unlimited');
    expect(byLabel(/history/i)?.pro).toBe('Unlimited');
  });

  it('shows session summaries as included on BOTH plans', () => {
    // Free keeps complete per-session results; a comparison that hid this to
    // sharpen the sell would lie about our own product.
    const summaries = byLabel(/summaries|summary/i);
    expect(summaries?.free).toBe(true);
    expect(summaries?.pro).toBe(true);
  });

  it('lists the four gated Pro capabilities as free-excluded, pro-included', () => {
    for (const needle of [/insights/i, /trend/i, /export/i, /background/i]) {
      const row = byLabel(needle);
      expect(row?.free).toBe(false);
      expect(row?.pro).toBe(true);
    }
  });

  it('marks background tracking as upcoming, never shipped', () => {
    // Selling an unbuilt feature as current is the one dishonesty App Review
    // and users agree on.
    expect(byLabel(/background/i)?.upcoming).toBe(true);
    const shipped = PLAN_COMPARISON.filter((row) => !row.upcoming);
    expect(shipped.length).toBeGreaterThanOrEqual(6);
  });

  it('never marks a Pro cell as excluded — Pro has everything free has', () => {
    for (const row of PLAN_COMPARISON) {
      expect(row.pro).not.toBe(false);
    }
  });
});

describe('voice', () => {
  it('never uses medical or exaggerated-health framing', () => {
    expect(ALL_MARKETING_TEXT).not.toMatch(
      /diagnos|disease|syndrome|medical|symptom|treat|cure|prevent|clinical|doctor/i
    );
  });

  it('manufactures no urgency — no countdowns, no scarcity, no pressure', () => {
    expect(ALL_MARKETING_TEXT).not.toMatch(
      /hurry|limited time|today only|act now|last chance|don.t miss|expires|countdown|ends soon/i
    );
  });

  it('never blames the user or implies free loses data', () => {
    expect(ALL_MARKETING_TEXT).not.toMatch(/ran out|too many|exceeded|over the limit/i);
    expect(FREE_KEEPS).toMatch(/never deletes/i);
  });
});
