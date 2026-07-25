import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { colors, duration } from '@/theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  /** 0–1; values outside the range are clamped. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  /** Centered inside the ring. */
  children?: ReactNode;
}

/**
 * An animated circular progress ring (DESIGN_REVIEW.md §5).
 *
 * Fills from empty over `duration.fill` (600 ms, ease-out) starting 150 ms
 * after mount — the §5.4 motion table's "ring fills from 0" entry — and
 * animates between values on later data changes with the same tween. Under
 * Reduce Motion the fill snaps to its resting value.
 *
 * Pure presentation: knows nothing about sessions or targets. The stroke
 * starts at 12 o'clock (the SVG is rotated −90°, where SVG circles begin at
 * 3 o'clock) and hides entirely at zero progress — a round line cap would
 * otherwise leave a dot where the arc should not exist yet.
 */
export function ProgressRing({
  progress,
  size = 140,
  strokeWidth = 10,
  color = colors.accent.DEFAULT,
  trackColor = colors.hairline,
  children,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(progress, 1));

  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withDelay(
      150,
      withTiming(clamped, {
        duration: duration.fill,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      })
    );
  }, [clamped, fill]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - fill.value),
    opacity: fill.value > 0.001 ? 1 : 0,
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          animatedProps={animatedProps}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          fill="none"
        />
      </Svg>
      <View className="absolute inset-0 items-center justify-center">{children}</View>
    </View>
  );
}
