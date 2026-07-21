import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/lib/cn';

interface ToastProps {
  /**
   * The notice to show, or `null` for nothing. The parent must keep the
   * message set for the whole cycle and clear it in `onHide` — the toast
   * animates out *before* asking to be cleared, so the text never vanishes
   * mid-fade. Setting a different message restarts the cycle.
   */
  message: string | null;
  /** Called after the exit animation. Clear the message here. */
  onHide: () => void;
  className?: string;
}

/** 250 ms in, 3 s hold, 200 ms out (DESIGN_REVIEW.md §6 motion table). */
const ENTER_MS = 250;
const HOLD_MS = 3000;
const EXIT_MS = 200;

/**
 * The third notice tier (DESIGN_REVIEW.md §4): `ErrorState` for a screen with
 * nothing to show, `InlineError` for a failure over readable data, and this —
 * a transient, self-dismissing notice for moments that deserve acknowledgment
 * but not interruption ("too short to measure"). It exists so the scan screen
 * never has to raise a native alert over a live camera.
 *
 * Renders positioned at the bottom of its nearest relative container, above
 * the tab bar. Not pressable and hidden from the touch plane entirely —
 * a notice that steals taps from the button under it is worse than none.
 */
export function Toast({ message, onHide, className }: ToastProps) {
  const progress = useSharedValue(0);

  // The parent's `onHide` identity may change between renders; the timers
  // must always call the latest one without restarting the cycle.
  const onHideRef = useRef(onHide);
  useEffect(() => {
    onHideRef.current = onHide;
  }, [onHide]);

  useEffect(() => {
    if (!message) return;

    progress.value = withTiming(1, {
      duration: ENTER_MS,
      easing: Easing.out(Easing.ease),
      reduceMotion: ReduceMotion.System,
    });

    // The hold is a JS timer rather than a worklet chain so the whole cycle
    // survives Reduce Motion (which snaps the tweens but not the dwell time).
    const exitTimer = setTimeout(() => {
      progress.value = withTiming(0, {
        duration: EXIT_MS,
        easing: Easing.in(Easing.ease),
        reduceMotion: ReduceMotion.System,
      });
    }, ENTER_MS + HOLD_MS);

    const hideTimer = setTimeout(
      () => onHideRef.current(),
      ENTER_MS + HOLD_MS + EXIT_MS + 50
    );

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(hideTimer);
    };
  }, [message, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 16 }],
  }));

  if (!message) return null;

  return (
    <View pointerEvents="none" className={cn('absolute inset-x-4 bottom-4 items-center', className)}>
      <Animated.View
        style={animatedStyle}
        className="max-w-full rounded-full border border-hairline bg-canvas-overlay px-5 py-3"
      >
        <Text accessibilityLiveRegion="polite" className="text-center text-sm text-ink">
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}
