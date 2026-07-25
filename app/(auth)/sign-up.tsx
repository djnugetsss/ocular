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

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { describeAuthError, useAuthStore } from '@/features/auth/auth-store';
import { LEGAL_URLS, openLegalPage } from '@/lib/legal';

/** Mirrors the Supabase project's minimum; enforced here for instant feedback. */
const MIN_PASSWORD_LENGTH = 8;

export default function SignUpScreen() {
  const signUp = useAuthStore((state) => state.signUp);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const passwordError =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      : null;

  const canSubmit =
    displayName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await signUp(email, password, displayName);
      // With email confirmation enabled, signUp succeeds without producing a
      // session — so the root layout will not redirect. Say so explicitly
      // rather than leaving the user on a form that appears to have done nothing.
      setNeedsConfirmation(true);
    } catch (cause) {
      setError(describeAuthError(cause));
    }
  }

  if (needsConfirmation) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View className="flex-1 justify-center px-6">
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.4}
            className="text-title1 font-semibold text-ink"
          >
            Confirm your email
          </Text>
          <Text maxFontSizeMultiplier={2} className="mt-3 text-base leading-6 text-ink-muted">
            We sent a confirmation link to{' '}
            <Text maxFontSizeMultiplier={2} className="font-medium text-ink">
              {email.trim()}
            </Text>
            . Open it on this device to finish setting up your account.
          </Text>
          <Link href="/(auth)/sign-in" className="mt-8 text-base font-medium text-accent">
            Back to sign in
          </Link>
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
          <View className="mb-10">
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={1.4}
              className="text-title1 font-semibold text-ink"
            >
              Create your account
            </Text>
            <Text maxFontSizeMultiplier={2} className="mt-2 text-base text-ink-muted">
              Ocular measures blink rate and posture on-device. Video never leaves your phone.
            </Text>
          </View>

          <View className="gap-4">
            <TextField
              label="Name"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              placeholder="Ada Lovelace"
            />

            <TextField
              ref={emailRef}
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
              // `new-password` is what lets iOS offer to generate and save a
              // strong password rather than autofilling an existing one.
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              placeholder="At least 8 characters"
              // Only the local validation hint belongs to this field; server
              // failures get the form-level slot below so they don't blame the
              // password for, say, an already-registered email.
              error={passwordError}
            />

            {error ? (
              <Text
                maxFontSizeMultiplier={2}
                accessibilityLiveRegion="polite"
                className="text-sm leading-5 text-signal-bad"
              >
                {error}
              </Text>
            ) : null}

            <Button
              label="Create account"
              onPress={handleSubmit}
              isLoading={isSubmitting}
              disabled={!canSubmit}
              className="mt-2"
            />

            {/* Consent stated at the moment of consent, in one Text run so the
                links share the sentence's baseline. Pressable spans rather
                than Links: these open in an in-app browser sheet, so a
                half-filled form is still here on return. */}
            <Text
              maxFontSizeMultiplier={2}
              className="text-center text-xs leading-5 text-ink-faint"
            >
              By creating an account you agree to our{' '}
              <Text
                maxFontSizeMultiplier={2}
                accessibilityRole="link"
                className="font-medium text-ink-muted underline"
                onPress={() => void openLegalPage(LEGAL_URLS.terms)}
              >
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text
                maxFontSizeMultiplier={2}
                accessibilityRole="link"
                className="font-medium text-ink-muted underline"
                onPress={() => void openLegalPage(LEGAL_URLS.privacyPolicy)}
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </View>

          {/* Single Text run for shared baseline — see the sign-in footer. */}
          <Text maxFontSizeMultiplier={2} className="mt-8 text-center text-sm text-ink-muted">
            Already have an account?{' '}
            <Link href="/(auth)/sign-in" className="font-medium text-accent">
              Sign in
            </Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
