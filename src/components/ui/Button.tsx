import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

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

const SPINNER: Record<Variant, string> = {
  primary: '#FFFFFF',
  secondary: colors.ink.muted,
  ghost: colors.ink.muted,
  danger: colors.ink.muted,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Press-scale spring (DESIGN_REVIEW.md §6): quick in, relaxed out. */
const PRESS_SPRING = { damping: 15, stiffness: 400, reduceMotion: ReduceMotion.System };

export function Button({
  label,
  variant = 'primary',
  isLoading = false,
  disabled,
  className,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  // The spring is driven from React state in an effect rather than written
  // directly in the press handlers: the React Compiler treats shared values as
  // immutable during render scope, and this is the same pattern the welcome
  // screen's blink loop already established.
  const [isPressed, setIsPressed] = useState(false);
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(isPressed ? 0.97 : 1, PRESS_SPRING);
  }, [isPressed, scale]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function handlePressIn(event: GestureResponderEvent) {
    setIsPressed(true);
    onPressIn?.(event);
  }

  function handlePressOut(event: GestureResponderEvent) {
    setIsPressed(false);
    onPressOut?.(event);
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      // Announce the busy state rather than only showing a spinner, so the
      // control is not silently unresponsive to VoiceOver users.
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={pressStyle}
      className={cn(
        // min-h rather than a fixed height so the label can wrap instead of
        // clipping at accessibility text sizes.
        'min-h-14 flex-row items-center justify-center rounded-card px-6 py-3',
        CONTAINER[variant],
        isDisabled && 'opacity-50',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={SPINNER[variant]} />
      ) : (
        <Text className={cn('text-center text-base font-semibold', LABEL[variant])}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}
