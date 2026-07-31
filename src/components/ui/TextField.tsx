import { forwardRef, useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Text, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  className?: string;
}

// Derived from the props rather than imported by name: React Native renamed
// these payloads in 0.86, and deriving them means this file cannot drift from
// whatever the installed version calls them.
type FocusEventArg = Parameters<NonNullable<TextInputProps['onFocus']>>[0];
type BlurEventArg = Parameters<NonNullable<TextInputProps['onBlur']>>[0];

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, className, onFocus, onBlur, ...props },
  ref
) {
  // React Native paints no focus ring of its own, so on a dark canvas the
  // active field was indistinguishable from the three inactive ones around it.
  // Sighted keyboard users (and anyone returning to a half-filled form) had to
  // infer focus from the caret alone.
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = useCallback(
    (event: FocusEventArg) => {
      setIsFocused(true);
      onFocus?.(event);
    },
    [onFocus]
  );

  const handleBlur = useCallback(
    (event: BlurEventArg) => {
      setIsFocused(false);
      onBlur?.(event);
    },
    [onBlur]
  );

  // `accessibilityLiveRegion` on the error below is Android-only, so a
  // validation message appearing after a failed submit was silent on iOS —
  // the user heard nothing and the field looked unchanged to them. Announced
  // imperatively instead, without moving focus, so the user keeps their place
  // in the form and can swipe to the message when ready.
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(`${label}: ${error}`);
  }, [error, label]);

  return (
    <View className={cn('gap-2', className)}>
      <Text maxFontSizeMultiplier={2} className="text-sm font-medium text-ink-muted">
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        // Errors are conveyed by a red border as well as by text; the hint
        // makes the reason available to VoiceOver, which cannot see the border.
        accessibilityHint={error ?? undefined}
        maxFontSizeMultiplier={2}
        placeholderTextColor={colors.ink.faint}
        // The app is dark-only; without this iOS shows a light keyboard that
        // flashbangs the canvas every time a field focuses.
        keyboardAppearance="dark"
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          'min-h-14 rounded-card border bg-canvas-raised px-4 text-base text-ink',
          // Error outranks focus: a field can be both, and the problem is the
          // more urgent of the two things to communicate.
          error ? 'border-signal-bad' : isFocused ? 'border-accent' : 'border-hairline'
        )}
        {...props}
      />
      {error ? (
        <Text
          // Kept for Android parity; iOS is served by the announcement above.
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={2}
          className="text-sm text-signal-bad"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
});
