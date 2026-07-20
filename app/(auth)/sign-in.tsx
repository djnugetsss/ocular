import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { describeAuthError, useAuthStore } from '@/features/auth/auth-store';

export default function SignInScreen() {
  const signIn = useAuthStore((state) => state.signIn);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await signIn(email, password);
      // No navigation here: the root layout redirects when the auth store's
      // session becomes non-null. Pushing a route as well would race that
      // redirect and can leave a dead screen on the stack.
    } catch (cause) {
      setError(describeAuthError(cause));
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-12"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-10">
            <Text accessibilityRole="header" className="text-title1 font-semibold text-ink">
              Welcome back
            </Text>
            <Text className="mt-2 text-base text-ink-muted">
              Sign in to pick up your check-in history.
            </Text>
          </View>

          <View className="gap-4">
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder="you@example.com"
            />

            <TextField
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              placeholder="••••••••"
            />

            <Link href="/(auth)/forgot-password" className="self-end py-2 text-sm text-accent">
              Forgot password?
            </Link>

            {/* Form-level slot: a sign-in failure rarely belongs to one field,
                and pinning it to the password input visually blamed the wrong
                one for email-shaped errors. */}
            {error ? (
              <Text accessibilityLiveRegion="polite" className="text-sm leading-5 text-signal-bad">
                {error}
              </Text>
            ) : null}

            <Button
              label="Sign in"
              onPress={handleSubmit}
              isLoading={isSubmitting}
              disabled={!canSubmit}
              className="mt-2"
            />
          </View>

          {/* One Text run rather than siblings in a flex-row: nested text
              shares a single baseline, so the label and link cannot render
              vertically offset from each other. */}
          <Text className="mt-8 text-center text-sm text-ink-muted">
            New to Ocular?{' '}
            <Link href="/(auth)/sign-up" className="font-medium text-accent">
              Create an account
            </Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
