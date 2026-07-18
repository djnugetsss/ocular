import { useEffect } from 'react';
import { View, type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  ReduceMotion,
} from 'react-native-reanimated';

import { cn } from '@/lib/cn';

interface SkeletonProps extends ViewProps {
  className?: string;
}

/**
 * Shimmer placeholder for content that is loading.
 *
 * Used instead of a centered spinner wherever the shape of the incoming content
 * is known (PRODUCT_SPEC.md §4). A skeleton communicates *what* is arriving and
 * keeps layout stable, so the screen does not jump when data lands — a spinner
 * does neither.
 *
 * The pulse is opacity-only. A shimmer that sweeps a gradient across the
 * surface would need a masked gradient per instance, which is a real cost at
 * the six-or-more skeletons a dashboard shows at once.
 */
export function Skeleton({ className, style, ...props }: SkeletonProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.75, {
        duration: 900,
        easing: Easing.inOut(Easing.ease),
        // Honors the system Reduce Motion setting: the value snaps to its
        // resting state instead of animating, so the placeholder is still
        // visible but no longer pulses.
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      // Hidden from assistive tech: a placeholder has no content to announce,
      // and VoiceOver reading a row of empty boxes is pure noise. The screen
      // announces its own loading state instead.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[animatedStyle, style]}
      className={cn('rounded-card bg-canvas-overlay', className)}
      {...props}
    />
  );
}

/** Convenience: a run of text-line skeletons at descending widths. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <View className={cn('gap-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn('h-4 rounded-md', index === lines - 1 ? 'w-1/2' : 'w-full')}
        />
      ))}
    </View>
  );
}
