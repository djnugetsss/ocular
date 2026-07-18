import {
  DAILY_TARGET_OPTIONS,
  DEFAULT_DAILY_TARGET,
  DEFAULT_GOAL,
  GOAL_OPTIONS,
  ONBOARDING_ROUTES,
  ONBOARDING_STEP_COUNT,
  stepRoute,
} from '@/features/onboarding/steps';

describe('stepRoute', () => {
  it('resolves each step to its route', () => {
    ONBOARDING_ROUTES.forEach((route, index) => {
      expect(stepRoute(index)).toBe(route);
    });
  });

  it('clamps a step past the end of a shortened flow', () => {
    // A stored index can outlive the flow it was written against. Resuming at
    // the last screen beats crashing on an undefined route.
    expect(stepRoute(99)).toBe(ONBOARDING_ROUTES[ONBOARDING_STEP_COUNT - 1]);
  });

  it('clamps negative and non-finite values to the first screen', () => {
    expect(stepRoute(-3)).toBe(ONBOARDING_ROUTES[0]);
    expect(stepRoute(Number.NaN)).toBe(ONBOARDING_ROUTES[0]);
  });

  it('truncates fractional steps rather than rounding past the flow', () => {
    expect(stepRoute(1.9)).toBe(ONBOARDING_ROUTES[1]);
  });
});

describe('onboarding options', () => {
  it('offers a default goal that is actually selectable', () => {
    expect(GOAL_OPTIONS.map((option) => option.value)).toContain(DEFAULT_GOAL);
  });

  it('offers a default daily target within the allowed range', () => {
    // Mirrors the daily_target_sessions CHECK constraint; a default outside it
    // would fail the insert on the very first save.
    expect(DAILY_TARGET_OPTIONS).toContain(DEFAULT_DAILY_TARGET);
  });

  it('has unique goal values', () => {
    const values = GOAL_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
