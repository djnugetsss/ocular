import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import type { TrackingStatus } from '@/features/vision/use-face-tracking';
import type { CoachingHint } from '@/features/vision/scan-coaching';

interface StatusPillProps {
  status: TrackingStatus;
  isCalibrated: boolean;
  /** Positioning/visibility coaching (§3 states 8–9). Advice, never a gate. */
  coaching?: CoachingHint | null;
  error?: string | null;
  className?: string;
}

/**
 * The scan screen's single line of narration.
 *
 * Extracted from `scan.tsx` and typed against `TrackingStatus` rather than a
 * bare string, so a new tracking state cannot be added without the compiler
 * pointing here — the previous inline version silently fell through to
 * "Tracking" for anything unrecognized.
 *
 * Copy is behavioral and never alarming: this pill sits over a live image of
 * the user's face, and anything that reads as a verdict on their body belongs
 * nowhere near it. Coaching copy is neutral guidance, never `signal-warn`
 * chrome (§3: guidance is not an error).
 *
 * During settled tracking the pill fades out after 3 s — a good scan should
 * recede so the user doesn't feel watched by their own UI — and returns the
 * moment the text has something new to say.
 */
export function StatusPill({ status, isCalibrated, coaching, error, className }: StatusPillProps) {
  const { text, tone } = describe(status, isCalibrated, coaching ?? null, error);

  const opacity = useSharedValue(1);

  useEffect(() => {
    // Any text change brings the pill back first; only settled "Tracking" is
    // allowed to recede. Reduce Motion turns the fades into snaps, but the
    // 3 s dwell is part of the tween's delay and survives either way.
    if (text === 'Tracking') {
      opacity.value = withTiming(1, { duration: 150, reduceMotion: ReduceMotion.System });
      opacity.value = withDelay(
        3000,
        withTiming(0, {
          duration: 300,
          easing: Easing.out(Easing.ease),
          reduceMotion: ReduceMotion.System,
        })
      );
    } else {
      opacity.value = withTiming(1, { duration: 150, reduceMotion: ReduceMotion.System });
    }
  }, [text, opacity]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={fadeStyle}
      className={cn('rounded-full px-4 py-2', TONES[tone].container, className)}
    >
      <Text
        // Announced on change so a user who cannot see the preview still learns
        // that tracking was acquired, lost, or has finished calibrating.
        accessibilityLiveRegion="polite"
        className={cn('text-sm font-medium', TONES[tone].text)}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

const TONES = {
  neutral: { container: 'bg-black/50', text: 'text-ink' },
  active: { container: 'bg-signal-ok/20', text: 'text-signal-ok' },
  error: { container: 'bg-signal-bad/20', text: 'text-signal-bad' },
} as const;

/** Coaching copy: visibility phrased as observation, never a diagnosis (§3). */
const COACHING_TEXT: Record<CoachingHint, string> = {
  'too-close': 'A little farther back',
  'too-far': 'Come a bit closer',
  'low-visibility': 'Having trouble seeing you — a bit more light will help',
};

function describe(
  status: TrackingStatus,
  isCalibrated: boolean,
  coaching: CoachingHint | null,
  error?: string | null
) {
  switch (status) {
    case 'error':
      return { text: error ?? 'Tracking stopped', tone: 'error' as const };
    case 'idle':
      return { text: 'Ready when you are', tone: 'neutral' as const };
    case 'starting':
      return { text: 'Starting camera…', tone: 'neutral' as const };
    case 'interrupted':
      // Calm and truthful: iOS has suspended the camera (call, backgrounding,
      // Split View). Not an error tone — nothing is broken, and the session
      // clock is paused rather than counting the gap. The copy names no
      // specific cause because the native reasons vary and guessing wrong
      // would be worse than being general.
      return { text: 'Paused — camera unavailable', tone: 'neutral' as const };
    case 'searching':
      // Visibility coaching may apply here too: a face intermittently found
      // in the dark oscillates between searching and tracking.
      if (coaching === 'low-visibility') {
        return { text: COACHING_TEXT[coaching], tone: 'neutral' as const };
      }
      return { text: 'Looking for you', tone: 'neutral' as const };
    case 'tracking':
      if (!isCalibrated) {
        return { text: 'Calibrating — keep your eyes open', tone: 'neutral' as const };
      }
      if (coaching) {
        return { text: COACHING_TEXT[coaching], tone: 'neutral' as const };
      }
      return { text: 'Tracking', tone: 'active' as const };
  }
}
