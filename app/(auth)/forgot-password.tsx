import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { describeAuthError, useAuthStore } from '@/features/auth/auth-store';

export default function ForgotPasswordScreen() {
  const resetPassword = useAuthStore((state) => state.resetPassword);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit() {
    if (email.trim().length === 0 || isSubmitting) return;
    setError(null);
    try {
      await resetPassword(email);
      setIsSent(true);
    } catch (cause) {
      setError(describeAuthError(cause));
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      {/* Grabber: this screen presents as a modal sheet, and iOS sheets
          announce their dismissability with one. Decorative only. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="mt-2 h-1 w-9 self-center rounded-full bg-canvas-overlay"
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Scrollable for the same reason sign-in and sign-up are: at
            accessibility text sizes this sheet's header, body, field, and two
            56 pt buttons exceed a small device's remaining height once the
            keyboard is up, and a fixed container would simply clip the
            "Cancel" button off the bottom with no way to reach it. */}
        <ScrollView
          contentContainerClassName="flex-grow px-6 pb-6 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.4}
            className="text-title2 font-semibold text-ink"
          >
            Reset your password
          </Text>

          {isSent ? (
            <>
              <Text maxFontSizeMultiplier={2} className="mt-3 text-base leading-6 text-ink-muted">
                If an account exists for{' '}
                <Text maxFontSizeMultiplier={2} className="font-medium text-ink">
                  {email.trim()}
                </Text>
                , a reset link is on its way.
              </Text>
              <Button
                label="Done"
                variant="secondary"
                onPress={() => router.back()}
                className="mt-8"
              />
            </>
          ) : (
            <>
              <Text maxFontSizeMultiplier={2} className="mt-3 text-base leading-6 text-ink-muted">
                Enter your email and we&apos;ll send a link to set a new password.
              </Text>

              <View className="mt-8 gap-4">
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit}
                  placeholder="you@example.com"
                  error={error}
                  autoFocus
                />

                <Button
                  label="Send reset link"
                  onPress={handleSubmit}
                  isLoading={isSubmitting}
                  disabled={email.trim().length === 0 || isSubmitting}
                />
                <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
