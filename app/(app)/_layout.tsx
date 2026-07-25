import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

/**
 * The signed-in area: a stack whose base is the four-tab group.
 *
 * Session results push *over* the tabs from here (PRODUCT_SPEC.md §3) — they
 * are the consequence of ending a scan, not a destination, so they cover the
 * tab bar the way a workout summary does in Apple Fitness rather than living
 * inside any one tab.
 */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas.DEFAULT },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="session/[id]" />
      {/* The premium sheet: an iOS card modal, so it slides over whichever
          surface invited it and swipes away without disturbing that surface's
          state. Presented only by explicit taps — see premium.tsx. */}
      <Stack.Screen name="premium" options={{ presentation: 'modal', animation: 'default' }} />
    </Stack>
  );
}
