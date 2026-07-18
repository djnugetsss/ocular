import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

/**
 * Linear onboarding stack.
 *
 * The header is hidden because `OnboardingPage` draws its own chrome (progress
 * dots plus a back affordance), and gestures are disabled so the flow can only
 * be traversed through its own controls — a swipe-back past the privacy screen
 * would defeat the gate described in PRODUCT_SPEC.md §3.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: colors.canvas.DEFAULT },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="how-it-works" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="camera-permission" />
      <Stack.Screen name="goals" />
    </Stack>
  );
}
