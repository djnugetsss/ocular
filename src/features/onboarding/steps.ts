import type { SFSymbol } from 'expo-symbols';

import type { ProfileGoal } from '@/lib/supabase/database.types';

/**
 * The onboarding flow, as data.
 *
 * Order lives here rather than being implied by file names so that the progress
 * dots, the resume logic, and the routing all read from one list. Reordering
 * the flow is then a single edit, and the persisted `onboarding_step` index
 * keeps its meaning because it is resolved through `stepRoute` rather than
 * being trusted as an absolute position.
 */
export const ONBOARDING_ROUTES = [
  '/(onboarding)/welcome',
  '/(onboarding)/how-it-works',
  '/(onboarding)/privacy',
  '/(onboarding)/camera-permission',
  '/(onboarding)/goals',
] as const;

export type OnboardingRoute = (typeof ONBOARDING_ROUTES)[number];

export const ONBOARDING_STEP_COUNT = ONBOARDING_ROUTES.length;

/**
 * Resolves a persisted step index to a route.
 *
 * Clamps rather than throwing: a stored index can outlive the flow it was
 * written against — a user who onboarded through a five-step flow and returns
 * after an update that shortened it to four should resume at the last screen,
 * not crash.
 */
export function stepRoute(step: number): OnboardingRoute {
  const index = Number.isFinite(step) ? Math.trunc(step) : 0;
  const clamped = Math.min(Math.max(index, 0), ONBOARDING_STEP_COUNT - 1);
  return ONBOARDING_ROUTES[clamped]!;
}

/** Goal options for step 5. `value` matches the `profiles.goal` constraint. */
export interface GoalOption {
  value: ProfileGoal;
  label: string;
  description: string;
  symbol: SFSymbol;
}

export const GOAL_OPTIONS: GoalOption[] = [
  {
    value: 'eye_comfort',
    label: 'Reduce eye tiredness',
    description: 'Dry, gritty, or aching eyes',
    symbol: 'eye',
  },
  {
    value: 'posture',
    label: 'Improve posture',
    description: 'Neck and shoulder tension',
    symbol: 'figure.stand',
  },
  {
    value: 'habit',
    label: 'Build a check-in habit',
    description: 'A regular moment to reset',
    symbol: 'calendar',
  },
  {
    value: 'curiosity',
    label: 'Just curious',
    description: 'Show me what you measure',
    symbol: 'sparkles',
  },
];

/** Allowed daily check-in targets, matching the `daily_target_sessions` check. */
export const DAILY_TARGET_OPTIONS = [1, 2, 3] as const;

export const DEFAULT_GOAL: ProfileGoal = 'eye_comfort';
export const DEFAULT_DAILY_TARGET = 2;
