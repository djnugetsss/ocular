import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { InfoRow } from '@/components/ui/InfoRow';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { useRecordOnboardingStep } from '@/features/onboarding/use-onboarding-step';
import { useCameraPermission } from '@/features/vision/use-camera-permission';

/**
 * Permission priming (PRODUCT_SPEC.md §4.1.4).
 *
 * iOS shows its camera prompt exactly once per install. Asking cold — before
 * the user knows why — converts a distracted tap into a permanent denial that
 * can only be undone in Settings. So this screen explains first, and then
 * *always advances* regardless of the answer: a denial is a valid choice, and
 * the Scan tab is built to handle it indefinitely.
 */
export default function CameraPermissionScreen() {
  const router = useRouter();
  const { request } = useCameraPermission();
  const [isRequesting, setIsRequesting] = useState(false);

  useRecordOnboardingStep(3);

  function advance(cameraDenied: boolean) {
    router.push({
      pathname: '/(onboarding)/goals',
      // The next screen surfaces a quiet reminder rather than this one showing
      // a modal. Scolding a user for a choice we just told them was optional
      // would undo the trust the previous screen spent.
      params: cameraDenied ? { cameraDenied: '1' } : {},
    });
  }

  async function handleAllow() {
    setIsRequesting(true);
    try {
      const result = await request();
      advance(!result.granted);
    } catch {
      // The module only rejects in situations that cannot occur on a real
      // device. Treat it as "not now" and keep the flow moving — being stuck
      // here is a far worse outcome than a missing permission.
      advance(true);
    } finally {
      setIsRequesting(false);
    }
  }

  return (
    <OnboardingPage
      step={3}
      title="Ocular needs the front camera — only while you scan"
      onBack={() => router.back()}
      footer={
        <>
          <Button label="Allow camera" onPress={handleAllow} isLoading={isRequesting} />
          <Button label="Maybe later" variant="ghost" onPress={() => advance(false)} />
        </>
      }
    >
      <View className="gap-6">
        <InfoRow
          glyph="▶"
          tone="accent"
          title="Only during a check-in"
          body="The camera turns on when you start a scan and turns off the moment it ends. Never in the background."
        />
        <InfoRow
          glyph="◉"
          tone="accent"
          title="Always visible"
          body="An on-device badge shows whenever the camera is active, and iOS shows its own green dot as independent proof."
        />
        <InfoRow
          glyph="⚙"
          tone="neutral"
          title="Change it anytime"
          body="You can grant or revoke camera access later from Profile, or from iOS Settings."
        />
      </View>
    </OnboardingPage>
  );
}
