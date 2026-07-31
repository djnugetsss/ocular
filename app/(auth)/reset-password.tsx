import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { describeAuthError, useAuthStore } from '@/features/auth/auth-store';

/**
 * Setting a new password, reached only from a recovery link via `/callback`.
 *
 * The user is already signed in by the time they get here — that session is
 * what authorizes `updateUser` — so the root gate is held by `isRecovering`
 * until the write lands. Cancelling signs them out rather than dropping them
 * into the app, because a reset email must not double as a way in.
 *
 * Supabase enforces the password rule server-side; the local minimum below
 * only exists so the user is told before a round trip, and matches the message
 * `describeAuthError` maps for the server's own rejection.
 */

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const completeRecovery = useAuthStore((state) => state.completeRecovery);
  const cancelRecovery = useAuthStore((state) => state.cancelRecovery);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const session = useAuthStore((state) => state.session);

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirmationRef = useRef<TextInput>(null);

  const isLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const matches = password === confirmation;
  const canSubmit = isLongEnough && matches && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await completeRecovery(password);
      // No navigation: clearing `isRecovering` releases the gate, which routes
      // to onboarding or the tabs depending on the profile. Replacing here as
      // well would race it.
    } catch (cause) {
      setError(describeAuthError(cause));
    }
  }

  async function handleCancel() {
    await cancelRecovery();
    router.replace('/(auth)/sign-in');
  }

  // A recovery session that expired while this screen sat open cannot authorize
  // the change, and `updateUser` would fail with a message that explains none of
  // that. Say so plainly and send them back for a fresh link.
  if (!session) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View className="flex-1 justify-center gap-4 px-6">
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.4}
            className="text-title2 font-semibold text-ink"
          >
            Your reset link expired
          </Text>
          <Text maxFontSizeMultiplier={2} className="text-base leading-6 text-ink-muted">
            Request a new password reset email and open it from this device.
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
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-12"
          keyboardShouldPersistTaps="handled"
        >
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.4}
            className="text-title1 font-semibold text-ink"
          >
            Set a new password
          </Text>
          <Text maxFontSizeMultiplier={2} className="mt-2 text-base text-ink-muted">
            Choose a password you haven&apos;t used before. You&apos;ll stay signed in on this
            device.
          </Text>

          <View className="mt-8 gap-4">
            <TextField
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect={false}
              textContentType="newPassword"
              returnKeyType="next"
              onSubmitEditing={() => confirmationRef.current?.focus()}
              error={password.length > 0 && !isLongEnough ? 'At least 8 characters.' : error}
              autoFocus
            />

            <TextField
              ref={confirmationRef}
              label="Confirm new password"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect={false}
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              error={confirmation.length > 0 && !matches ? 'Passwords do not match.' : null}
            />

            <Button
              label="Save new password"
              onPress={handleSubmit}
              isLoading={isSubmitting}
              disabled={!canSubmit}
              className="mt-2"
            />
            <Button label="Cancel" variant="ghost" onPress={() => void handleCancel()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
