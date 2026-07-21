import '../global.css';

import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { useAuthStore } from '@/features/auth/auth-store';
import { useProfileStore } from '@/features/profile/profile-store';
import { stepRoute } from '@/features/onboarding/steps';
import { colors } from '@/theme/tokens';

// Held until both the persisted session and the profile resolve, so the app
// never flashes the wrong destination on cold start.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const initialize = useAuthStore((state) => state.initialize);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const session = useAuthStore((state) => state.session);
  const userId = useAuthStore((state) => state.user?.id);

  const loadProfile = useProfileStore((state) => state.load);
  const clearProfile = useProfileStore((state) => state.clear);
  const profileStatus = useProfileStore((state) => state.status);
  const onboardedAt = useProfileStore((state) => state.profile?.onboarded_at ?? null);
  const onboardingStep = useProfileStore((state) => state.profile?.onboarding_step ?? 0);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => initialize(), [initialize]);

  // The profile is keyed to the user, so it loads when one appears and is
  // dropped when they sign out — leaving a previous user's preferences in
  // memory across an account switch would leak their choices into the next
  // session's UI.
  useEffect(() => {
    if (userId) {
      void loadProfile(userId);
    } else {
      clearProfile();
    }
  }, [userId, loadProfile, clearProfile]);

  // Routing can only be decided once auth has resolved and, when signed in,
  // the profile has settled. `error` counts as settled: if the profile cannot
  // be read we still have to put the user somewhere, and the app shell can
  // surface the failure far better than a splash screen held forever.
  const isProfileSettled = profileStatus === 'ready' || profileStatus === 'error';
  const isRoutingReady = !isInitializing && (!session || isProfileSettled);

  useEffect(() => {
    if (!isRoutingReady) return;
    void SplashScreen.hideAsync();
  }, [isRoutingReady]);

  useEffect(() => {
    if (!isRoutingReady) return;

    const group = segments[0];
    const inAuthGroup = group === '(auth)';
    const inOnboardingGroup = group === '(onboarding)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      return;
    }

    // A profile that failed to load has an unknown onboarding state. Sending
    // the user back through onboarding on a transient read failure would be
    // worse than letting them into an app that can show them the error, so an
    // unreadable profile is treated as onboarded.
    const needsOnboarding = profileStatus === 'ready' && onboardedAt === null;

    if (needsOnboarding) {
      // Resume where they left off rather than restarting the flow, but only
      // when entering the group — redirecting on every segment change would
      // pin them to one screen and make the flow untraversable.
      if (!inOnboardingGroup) router.replace(stepRoute(onboardingStep));
      return;
    }

    if (inAuthGroup || inOnboardingGroup) {
      router.replace('/(app)/(tabs)');
    }
  }, [isRoutingReady, session, profileStatus, onboardedAt, onboardingStep, segments, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.canvas.DEFAULT },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
