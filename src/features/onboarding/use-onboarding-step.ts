import { useEffect } from 'react';

import { useProfileStore } from '@/features/profile/profile-store';

/**
 * Records that the user has reached a given onboarding screen.
 *
 * Only ever advances. Navigating backwards through the flow must not rewind the
 * stored value, because it represents the furthest point reached — a user who
 * steps back to re-read the privacy screen and then force-quits should resume
 * where they actually were, not where they were browsing.
 *
 * The write is fire-and-forget (`saveInBackground`), so a slow or failed
 * network never delays the transition.
 */
export function useRecordOnboardingStep(step: number): void {
  const saveInBackground = useProfileStore((state) => state.saveInBackground);
  const furthestStep = useProfileStore((state) => state.profile?.onboarding_step ?? 0);

  useEffect(() => {
    if (step > furthestStep) {
      saveInBackground({ onboarding_step: step });
    }
  }, [step, furthestStep, saveInBackground]);
}
