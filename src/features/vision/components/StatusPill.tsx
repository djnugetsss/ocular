import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
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
  /**
   * The focused phase of a scan (§3 state 7): settled tracking recedes to a
   * tiny dot instead of holding a pill on screen, and searching copy assumes
   * the user is *meant* to be looking away. Coaching still surfaces in full.
   */
  minimal?: boolean;
  /** Whether this session has ever calibrated — "face lost" vs. "looking". */
  hasEverTracked?: boolean;
  className?: string;
}

/** How long settled-good copy dwells before receding (§3 state 7). */
const RECEDE_DELAY_MS = 3000;
const RECEDE_FADE_MS = 300;

/**
 * The scan screen's single line of narration.
 *
 * Extracted from `scan.tsx` and typed against `TrackingStatus` rather than a
 * bare string, so a new tracking state cannot be added without the compiler
 * pointing here — the previous inline version silently fell through for
 * anything unrecognized.
 *
 * Copy is behavioral and never alarming: this pill sits over a live image of
 * the user's face, and anything that reads as a verdict on their body belongs
 * nowhere near it. Coaching copy is neutral guidance, never `signal-warn`
 * chrome (§3: guidance is not an error).
 *
 * When everything is going well the narration recedes: "Good tracking" holds
 * for 3 s, then fades. In `minimal` mode (the focused phase of a scan) what
 * remains is a tiny `signal-ok` dot — enough to confirm the session is alive
 * at a glance, small enough to forget — and the pill returns automatically,
 * with contextual coaching, the moment something needs attention.
 */
export function StatusPill({
  status,
  isCalibrated,
  coaching,
  error,
  minimal = false,
  hasEverTracked = false,
  className,
}: StatusPillProps) {
  const { text, tone, recedes } = describe(
    status,
    isCalibrated,
    coaching ?? null,
    hasEverTracked,
    error
  );

  // The rendered copy trails the derived copy by half a crossfade: §3's
  // transition rules ask for a 150 ms crossfade on every text change, and a
  // single Text node can only do that as fade-out → swap → fade-in. Text and
  // tone swap together, mid-fade, so a tone can never arrive on the old words.
  const [displayed, setDisplayed] = useState({ text, tone, recedes });
  // Fully receded: the pill unmounts and (in minimal mode) the dot takes over.
  // Flipped by a timer that matches the recede tween, since Reanimated fades
  // cannot unmount views themselves.
  const [isReceded, setIsReceded] = useState(false);
  const opacity = useSharedValue(1);

  // One effect owns the opacity track — two writers would race, and the
  // React Compiler rightly refuses a shared value modified from two effects.
  // Two jobs, mutually exclusive per run:
  //
  // 1. Derived copy differs from displayed copy → crossfade: fade out, swap,
  //    fade in. A change mid-crossfade restarts the cycle with the newest
  //    copy; the half-finished swap is abandoned, never shown.
  // 2. Copy is settled and marked `recedes` → dwell, fade, then flip to the
  //    receded render. Runs on mount too — a session that mounts straight
  //    into settled tracking (the intro overlay just dismissed) still
  //    recedes. The fade-in leg is part of the same sequence so a swap into
  //    receding copy cannot have its entrance cancelled by the recession.
  useEffect(() => {
    if (text !== displayed.text) {
      opacity.value = withTiming(0, {
        duration: 75,
        easing: Easing.in(Easing.ease),
        reduceMotion: ReduceMotion.System,
      });
      const timer = setTimeout(() => {
        setDisplayed({ text, tone, recedes });
        // Something new to say brings the pill back, wherever it was — set
        // after the fade-out, so a recede timer armed for the *old* copy
        // (cleared below, but possibly already fired) cannot leave a stale
        // `true` behind.
        setIsReceded(false);
        opacity.value = withTiming(1, {
          duration: 75,
          easing: Easing.out(Easing.ease),
          reduceMotion: ReduceMotion.System,
        });
      }, 75);
      return () => clearTimeout(timer);
    }

    if (!displayed.recedes) return;
    opacity.value = withSequence(
      withTiming(1, {
        duration: 75,
        easing: Easing.out(Easing.ease),
        reduceMotion: ReduceMotion.System,
      }),
      withDelay(
        RECEDE_DELAY_MS,
        withTiming(0, {
          duration: RECEDE_FADE_MS,
          easing: Easing.out(Easing.ease),
          reduceMotion: ReduceMotion.System,
        })
      )
    );
    const timer = setTimeout(() => setIsReceded(true), 75 + RECEDE_DELAY_MS + RECEDE_FADE_MS);
    return () => clearTimeout(timer);
  }, [text, tone, recedes, displayed, opacity]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (isReceded) {
    // The tiny status indicator (§3 state 7): alive, green, forgettable.
    // Decorative for assistive tech — the pill already announced the state
    // this dot abbreviates. Outside minimal mode, receding means receding
    // to nothing at all.
    return minimal ? (
      <Animated.View
        entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
        exiting={FadeOut.duration(200).reduceMotion(ReduceMotion.System)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={cn('mt-1.5 h-1.5 w-1.5 rounded-full bg-signal-ok/80', className)}
      />
    ) : null;
  }

  return (
    <Animated.View
      style={fadeStyle}
      className={cn('rounded-full px-4 py-2', TONES[displayed.tone].container, className)}
    >
      <Text
        // Announced on change so a user who cannot see the preview still learns
        // that tracking was acquired, lost, or has finished calibrating.
        accessibilityLiveRegion="polite"
        maxFontSizeMultiplier={2}
        className={cn('text-sm font-medium', TONES[displayed.tone].text)}
      >
        {displayed.text}
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
  'too-far': 'Move a little closer',
  'low-visibility': 'Having trouble seeing you — a bit more light will help',
};

function describe(
  status: TrackingStatus,
  isCalibrated: boolean,
  coaching: CoachingHint | null,
  hasEverTracked: boolean,
  error?: string | null
) {
  switch (status) {
    case 'error':
      return { text: error ?? 'Tracking stopped', tone: 'error' as const, recedes: false };
    case 'idle':
      return { text: 'Ready when you are', tone: 'neutral' as const, recedes: false };
    case 'starting':
      return { text: 'Starting camera…', tone: 'neutral' as const, recedes: false };
    case 'interrupted':
      // Calm and truthful: iOS has suspended the camera (call, backgrounding,
      // Split View). Not an error tone — nothing is broken, and the session
      // clock is paused rather than counting the gap. The copy names no
      // specific cause because the native reasons vary and guessing wrong
      // would be worse than being general.
      return { text: 'Paused — camera unavailable', tone: 'neutral' as const, recedes: false };
    case 'searching':
      // Visibility coaching may apply here too: a face intermittently found
      // in the dark oscillates between searching and tracking.
      if (coaching === 'low-visibility') {
        return { text: COACHING_TEXT[coaching], tone: 'neutral' as const, recedes: false };
      }
      // A session that has tracked and lost the face is different from one
      // still waiting for its first acquisition — say so, gently.
      return {
        text: hasEverTracked ? 'Face lost — looking for you' : 'Looking for your face',
        tone: 'neutral' as const,
        recedes: false,
      };
    case 'tracking':
      if (!isCalibrated) {
        return {
          text: 'Calibrating — keep your eyes open',
          tone: 'neutral' as const,
          recedes: false,
        };
      }
      if (coaching) {
        return { text: COACHING_TEXT[coaching], tone: 'neutral' as const, recedes: false };
      }
      // The one state that recedes: good news said once, then quiet.
      return { text: 'Good tracking', tone: 'active' as const, recedes: true };
  }
}
