import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { InfoRow } from '@/components/ui/InfoRow';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { useRecordOnboardingStep } from '@/features/onboarding/use-onboarding-step';

export default function HowItWorksScreen() {
  const router = useRouter();
  useRecordOnboardingStep(1);

  return (
    <OnboardingPage
      step={1}
      title="Two signals, measured in seconds"
      subtitle="Ocular watches for the two habits that quietly wear your eyes out during screen work."
      onBack={() => router.back()}
      footer={<Button label="Continue" onPress={() => router.push('/(onboarding)/privacy')} />}
    >
      <View className="gap-6">
        <InfoRow
          symbol="eye"
          tone="accent"
          title="Blinking"
          body="You blink around 15 times a minute at rest. Screen focus can cut that in half, which dries and tires your eyes."
        />
        <InfoRow
          symbol="level"
          tone="accent"
          title="Head position"
          body="Your head drifts forward and down during long focus. Ocular measures its angle, so you can feel what neutral is."
        />

        <View className="mt-2 rounded-card border border-hairline bg-canvas-raised p-4">
          <Text className="text-[13px] leading-5 text-ink-faint">
            Ocular is a wellness tool, not a medical device. It measures habits, not health
            conditions.
          </Text>
        </View>
      </View>
    </OnboardingPage>
  );
}
