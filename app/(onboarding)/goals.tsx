import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { GoalCard } from '@/features/onboarding/GoalCard';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import {
  DAILY_TARGET_OPTIONS,
  DEFAULT_DAILY_TARGET,
  DEFAULT_GOAL,
  GOAL_OPTIONS,
} from '@/features/onboarding/steps';
import { useRecordOnboardingStep } from '@/features/onboarding/use-onboarding-step';
import { useProfileStore } from '@/features/profile/profile-store';
import type { ProfileGoal } from '@/lib/supabase/database.types';

/** After this many failures, offer to proceed without a confirmed write. */
const FAILURES_BEFORE_ESCAPE_HATCH = 2;

export default function GoalsScreen() {
  const router = useRouter();
  const { cameraDenied } = useLocalSearchParams<{ cameraDenied?: string }>();

  const save = useProfileStore((state) => state.save);
  const saveInBackground = useProfileStore((state) => state.saveInBackground);

  const [goal, setGoal] = useState<ProfileGoal>(DEFAULT_GOAL);
  const [dailyTarget, setDailyTarget] = useState<number>(DEFAULT_DAILY_TARGET);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failureCount, setFailureCount] = useState(0);

  useRecordOnboardingStep(4);

  const completion = {
    goal,
    daily_target_sessions: dailyTarget,
    onboarded_at: new Date().toISOString(),
  };

  async function handleSubmit() {
    setIsSaving(true);
    setError(null);
    try {
      await save(completion);
      // No explicit navigation: writing `onboarded_at` flips the root gate,
      // which redirects to the tabs. Pushing here as well would race it.
    } catch (cause) {
      setFailureCount((count) => count + 1);
      setError(
        cause instanceof Error && cause.message.toLowerCase().includes('network')
          ? "Couldn't save — check your connection."
          : "Couldn't save — check your connection and try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Proceeds with the choices applied locally and the write retried in the
   * background. A user who finished onboarding on a bad connection has earned
   * their way into the app; blocking them on a round trip we can retry is
   * punishing them for our infrastructure.
   *
   * The honest limitation: if the write never lands, the gate will show
   * onboarding again on the next launch, because `onboarded_at` is the source
   * of truth and it was never persisted.
   */
  function handleContinueAnyway() {
    saveInBackground(completion);
  }

  return (
    <OnboardingPage
      step={4}
      title="What brings you here?"
      subtitle="This shapes the guidance you see. You can change it later in Profile."
      onBack={() => router.back()}
      footer={
        <>
          {error ? (
            <Text accessibilityLiveRegion="polite" className="text-center text-sm text-signal-bad">
              {error}
            </Text>
          ) : null}

          <Button label="Start using Ocular" onPress={handleSubmit} isLoading={isSaving} />

          {failureCount >= FAILURES_BEFORE_ESCAPE_HATCH ? (
            <Button label="Continue anyway" variant="ghost" onPress={handleContinueAnyway} />
          ) : null}
        </>
      }
    >
      <View className="gap-6">
        <View accessibilityRole="radiogroup" className="gap-3">
          <View className="flex-row gap-3">
            {GOAL_OPTIONS.slice(0, 2).map((option) => (
              <GoalCard
                key={option.value}
                option={option}
                isSelected={goal === option.value}
                onPress={() => setGoal(option.value)}
              />
            ))}
          </View>
          <View className="flex-row gap-3">
            {GOAL_OPTIONS.slice(2, 4).map((option) => (
              <GoalCard
                key={option.value}
                option={option}
                isSelected={goal === option.value}
                onPress={() => setGoal(option.value)}
              />
            ))}
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-sm font-medium text-ink-muted">Daily check-ins</Text>
          <SegmentedControl
            options={DAILY_TARGET_OPTIONS.map((count) => ({
              value: count,
              label: String(count),
              accessibilityLabel: `${count} check-${count === 1 ? 'in' : 'ins'} per day`,
            }))}
            value={dailyTarget}
            onChange={setDailyTarget}
          />
          <Text className="text-xs leading-5 text-ink-faint">
            You start every check-in yourself — Ocular never measures on its own. A realistic target
            beats an ambitious one.
          </Text>
        </View>

        {cameraDenied === '1' ? (
          <View className="rounded-card border border-hairline bg-canvas-raised p-4">
            <Text className="text-[13px] leading-5 text-ink-muted">
              Camera access is off. You can turn it on anytime from Profile — scans need it, but
              nothing else does.
            </Text>
          </View>
        ) : null}
      </View>
    </OnboardingPage>
  );
}
