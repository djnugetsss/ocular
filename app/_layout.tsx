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
import { SubscriptionProvider } from '@/features/subscription/subscription-provider';
import { colors } from '@/theme/tokens';

// Held until both the persisted session and the profile resolve, so the app
// never flashes the wrong destination on cold start.
//
// Both splash calls swallow their rejection. They reject benignly when the
// splash is already hidden or was never shown (a Fast Refresh, a re-entered
// module), and an unhandled rejection at module scope is reported as a red-box
// error in development and a stray log line in production — noise for a call
// whose failure changes nothing.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const initialize = useAuthStore((state) => state.initialize);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const session = useAuthStore((state) => state.session);
  const userId = useAuthStore((state) => state.user?.id);
  const isRecovering = useAuthStore((state) => state.isRecovering);

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
    SplashScreen.hideAsync().catch(() => undefined);
  }, [isRoutingReady]);

  useEffect(() => {
    if (!isRoutingReady) return;
    // A password-recovery link signs the user in so they can authorize the
    // change. Until the new password is written, "signed in means go to the
    // app" would replace the reset form out from under them and spend the
    // single-use link for nothing. This is the one rule recovery suspends.
    if (isRecovering) return;

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
  }, [
    isRoutingReady,
    isRecovering,
    session,
    profileStatus,
    onboardedAt,
    onboardingStep,
    segments,
    router,
  ]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {/* Above the router so every screen reads one resolved entitlement,
            and below the auth store it keys off — signing out drops the tier
            to free without any screen having to remember to ask. Resolution
            is a local read, so it settles well inside the splash window the
            profile fetch already imposes. */}
        <SubscriptionProvider>
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
        </SubscriptionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
