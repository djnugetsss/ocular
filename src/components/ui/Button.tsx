import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  isLoading?: boolean;
  className?: string;
}

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-accent active:bg-accent-strong',
  secondary: 'bg-canvas-overlay active:bg-canvas-raised border border-hairline',
  ghost: 'bg-transparent active:bg-canvas-raised',
  danger: 'bg-signal-bad/15 active:bg-signal-bad/25 border border-signal-bad/40',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-ink',
  ghost: 'text-ink-muted',
  danger: 'text-signal-bad',
};

export function Button({
  label,
  variant = 'primary',
  isLoading = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <Pressable
      accessibilityRole="button"
      // Announce the busy state rather than only showing a spinner, so the
      // control is not silently unresponsive to VoiceOver users.
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      className={cn(
        'h-14 flex-row items-center justify-center rounded-card px-6',
        CONTAINER[variant],
        isDisabled && 'opacity-50',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : '#A0A0AE'} />
      ) : (
        <Text className={cn('text-base font-semibold', LABEL[variant])}>{label}</Text>
      )}
    </Pressable>
  );
}
