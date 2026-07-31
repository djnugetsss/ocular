import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { InfoRow } from '@/components/ui/InfoRow';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { useRecordOnboardingStep } from '@/features/onboarding/use-onboarding-step';
import { PRIVACY_PROMISES } from '@/features/privacy/privacy-content';
import { LEGAL_URLS, openLegalPage } from '@/lib/legal';

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
        <>
          <Button
            label="I understand"
            onPress={() => router.push('/(onboarding)/camera-permission')}
          />

          {/* In the pinned footer rather than under the rows above: the CTA
              here is literally "I understand", and the document backing that
              statement should not be something the user has to scroll to find
              — which is exactly what happens to content on this screen at
              large Dynamic Type sizes. */}
          <Pressable
            accessibilityRole="link"
            accessibilityHint="Opens the full policy in a browser sheet"
            onPress={() => void openLegalPage(LEGAL_URLS.privacyPolicy)}
            hitSlop={8}
            className="min-h-11 items-center justify-center"
          >
            <Text maxFontSizeMultiplier={2} className="text-xs text-ink-faint underline">
              Read the full Privacy Policy
            </Text>
          </Pressable>
        </>
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
