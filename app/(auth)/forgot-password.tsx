import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
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
    <SafeAreaView className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        className="flex-1 px-6 pt-8"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text className="text-2xl font-semibold text-ink">Reset your password</Text>

        {isSent ? (
          <>
            <Text className="mt-3 text-base leading-6 text-ink-muted">
              If an account exists for <Text className="font-medium text-ink">{email.trim()}</Text>,
              a reset link is on its way.
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
            <Text className="mt-3 text-base leading-6 text-ink-muted">
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
