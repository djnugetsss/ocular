import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { InfoRow } from '@/components/ui/InfoRow';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { useRecordOnboardingStep } from '@/features/onboarding/use-onboarding-step';
import { PRIVACY_PROMISES } from '@/features/privacy/privacy-content';

/**
 * The privacy contract (PRODUCT_SPEC.md §4.1.3).
 *
 * The most important screen in onboarding, and the one step no user may reach
 * the app without seeing. The promises themselves live in
 * `features/privacy/privacy-content.ts` because Profile states the same
 * contract — the two had already drifted into different words, which for
 * commitments about user data is a correctness problem, not a copy nit.
 */
export default function PrivacyScreen() {
  const router = useRouter();
  useRecordOnboardingStep(2);

  return (
    <OnboardingPage
      step={2}
      title="Your camera data never leaves your phone"
      onBack={() => router.back()}
      footer={
        <Button
          label="I understand"
          onPress={() => router.push('/(onboarding)/camera-permission')}
        />
      }
    >
      <View className="gap-6">
        {PRIVACY_PROMISES.map((promise) => (
          <InfoRow key={promise.title} tone="ok" {...promise} />
        ))}
      </View>
    </OnboardingPage>
  );
}
