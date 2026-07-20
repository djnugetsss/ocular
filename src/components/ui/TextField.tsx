import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  className?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, className, ...props },
  ref
) {
  return (
    <View className={cn('gap-2', className)}>
      <Text className="text-sm font-medium text-ink-muted">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        // Errors are conveyed by a red border as well as by text; the hint
        // makes the reason available to VoiceOver, which cannot see the border.
        accessibilityHint={error ?? undefined}
        placeholderTextColor={colors.ink.faint}
        // The app is dark-only; without this iOS shows a light keyboard that
        // flashbangs the canvas every time a field focuses.
        keyboardAppearance="dark"
        className={cn(
          'min-h-14 rounded-card border bg-canvas-raised px-4 text-base text-ink',
          error ? 'border-signal-bad' : 'border-hairline'
        )}
        {...props}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-signal-bad">
          {error}
        </Text>
      ) : null}
    </View>
  );
});
