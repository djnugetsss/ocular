import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { InfoRow } from '@/components/ui/InfoRow';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { useRecordOnboardingStep } from '@/features/onboarding/use-onboarding-step';

/**
 * The privacy contract (PRODUCT_SPEC.md §4.1.3).
 *
 * The most important screen in onboarding, and the one step no user may reach
 * the app without seeing. The claims below are literal descriptions of how the
 * pipeline works — frames are analyzed in memory on the capture queue and
 * discarded, and only the derived scalars in the `sessions` table are ever
 * written. If that ever stops being true, this copy must change first.
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
        <InfoRow
          glyph="✓"
          tone="ok"
          title="Analyzed, then discarded"
          body="Frames are analyzed in your iPhone's memory and immediately discarded. Nothing is recorded."
        />
        <InfoRow
          glyph="✓"
          tone="ok"
          title="Nothing is uploaded"
          body="No image, video, or face geometry is ever stored or uploaded."
        />
        <InfoRow
          glyph="✓"
          tone="ok"
          title="You own the numbers"
          body="Only summary numbers — blink counts, rates, head angles — sync to your account, and you can delete them anytime."
        />
      </View>
    </OnboardingPage>
  );
}
