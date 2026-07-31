import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuthStore } from '@/features/auth/auth-store';
import { supabase } from '@/lib/supabase/client';
import { colors } from '@/theme/tokens';

/**
 * Where Supabase's email links land (`ocular://callback`).
 *
 * The client runs the PKCE flow with `detectSessionInUrl: false` — correct for
 * React Native, which has no URL bar for the library to read — so the exchange
 * has to happen somewhere explicit. This is that place, and it is the only one.
 *
 * Two link types arrive here:
 *
 * - **confirmation** (a new account): exchange the code and stop. This screen
 *   deliberately does *not* navigate afterwards — the root layout's gate is
 *   already watching the session and sends the user to onboarding or the tabs
 *   depending on their profile. Navigating here as well is the classic double
 *   -navigation bug: two replaces race and one leaves a dead route behind.
 * - **recovery** (a password reset): the same exchange signs the user in, so
 *   `beginRecovery()` is set *before* it to suspend that gate, and this screen
 *   hands off to the reset form.
 *
 * Everything is guarded by a ref rather than state: the exchange consumes a
 * single-use code, and running it twice — which a re-render or a redelivered
 * link would otherwise do — fails the second time and would show a working
 * link as broken.
 */

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    flow?: string;
    type?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
  }>();

  const beginRecovery = useAuthStore((state) => state.beginRecovery);

  // Supabase reports an expired or already-used link as query parameters on the
  // redirect rather than as a failed exchange, so that case is *derived* here
  // rather than pushed into state from the effect — it is knowable at render.
  const linkError =
    typeof params.error === 'string'
      ? (typeof params.error_description === 'string' && params.error_description) ||
        'That link is no longer valid. Request a new one and try again.'
      : null;

  // Only the exchange's own outcome needs state, and it is written from a
  // promise continuation rather than synchronously in the effect body.
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current || linkError) return;

    // Expo Router mounts this route before the deep link's search params are
    // necessarily populated. Waiting for the code keeps the single-use value
    // from being consumed against an empty string on the first pass.
    const code = typeof params.code === 'string' ? params.code : null;
    if (!code) return;

    hasRunRef.current = true;

    const isRecovery = params.flow === 'recovery' || params.type === 'recovery';
    // Set before the exchange, not after: the exchange fires `SIGNED_IN`, and
    // a gate that observed that session without this flag already set would
    // redirect into the app between the two statements.
    if (isRecovery) beginRecovery();

    void (async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        // A dropped connection and a spent link are different problems with
        // different fixes, and only one of them is the user's link. Offline,
        // the code is *not* consumed, so telling them to open it again is
        // both true and actionable — whereas "it expired" would send them to
        // request a replacement they do not need.
        setExchangeError(
          /network|fetch|connection|timeout/i.test(error.message)
            ? 'Could not reach the server. Check your connection and open the link again.'
            : 'That link could not be verified. It may have expired or already been used.'
        );
        return;
      }

      if (isRecovery) {
        router.replace('/(auth)/reset-password');
      }
      // Confirmation: nothing further. The gate owns the destination.
    })();
  }, [params, linkError, beginRecovery, router]);

  const failure = linkError ?? exchangeError;

  if (failure) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View className="flex-1 justify-center gap-4 px-6">
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.4}
            className="text-title2 font-semibold text-ink"
          >
            This link didn&apos;t work
          </Text>
          <Text maxFontSizeMultiplier={2} className="text-base leading-6 text-ink-muted">
            {failure}
          </Text>
          <Button
            label="Back to sign in"
            variant="secondary"
            onPress={() => router.replace('/(auth)/sign-in')}
            className="mt-4"
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View accessible accessibilityLabel="Signing you in" className="flex-1 justify-center gap-4">
        <ActivityIndicator color={colors.accent.DEFAULT} />
        <Text maxFontSizeMultiplier={2} className="text-center text-base text-ink-muted">
          Signing you in…
        </Text>
      </View>
    </Screen>
  );
}
