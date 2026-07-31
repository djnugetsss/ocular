import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas.DEFAULT },
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" options={{ presentation: 'modal' }} />
      {/* Both are reached from an email link, never from in-app navigation.
          `gestureEnabled: false` on the callback stops a swipe-back from
          interrupting the code exchange mid-flight. */}
      <Stack.Screen name="callback" options={{ gestureEnabled: false }} />
      <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
