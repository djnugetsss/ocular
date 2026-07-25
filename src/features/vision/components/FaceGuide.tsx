import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
import Animated, {
  Easing,
  ReduceMotion,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, duration } from '@/theme/tokens';

/**
 * The face-guide oval's visual states (DESIGN_REVIEW.md §3, states 1 and 5–11).
 *
 * - `searching` — no face (or camera warming up): `ink-faint` at 40%, breathing.
 *   Also the idle rest state; searching is calm and indefinite, never a nag.
 * - `acquired` — face found, calibrating: `accent` at 70% with one gentle
 *   acknowledgment pulse (the "I see you" beat, state 6).
 * - `locked` — calibrated and tracking: `signal-ok` at full opacity, and the
 *   oval *stops animating* — stillness is what signals "locked" (state 7).
 * - `hidden` — locked during the focused phase of a scan: the oval fades out
 *   entirely (state 7's recession — a visible frame invites looking at the
 *   phone). It keeps its color so the return trip is a fade, not a repaint.
 * - `dimmed` — interruption or error: drops to 40% without changing color;
 *   the session is paused, not lost (state 11).
 */
export type FaceGuideState = 'searching' | 'acquired' | 'locked' | 'hidden' | 'dimmed';

interface FaceGuideProps {
  state: FaceGuideState;
  /** Measured preview size; the oval is ~60% of the preview width (§3). */
  width: number;
  height: number;
}

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/** Position on the color track: faint → accent → ok. */
const COLOR_STOP: Record<Exclude<FaceGuideState, 'dimmed' | 'hidden'>, number> = {
  searching: 0,
  acquired: 1,
  locked: 2,
};

const STROKE_OPACITY: Record<FaceGuideState, number> = {
  searching: 0.4,
  acquired: 0.7,
  locked: 1,
  hidden: 0,
  dimmed: 0.4,
};

/**
 * The breathing guide oval over the camera preview.
 *
 * All transitions run at `duration.state` (300 ms) per the §3 transition
 * rules, and every tween carries `ReduceMotion.System` — under Reduce Motion
 * the oval snaps between treatments and simply does not breathe or pulse,
 * but every state remains distinguishable by color and opacity alone.
 */
export function FaceGuide({ state, width, height }: FaceGuideProps) {
  const colorStop = useSharedValue(COLOR_STOP.searching);
  const opacity = useSharedValue(STROKE_OPACITY.searching);
  const scale = useSharedValue(1);
  // Previous state, for the one transition that depends on where we came
  // from: re-acquiring a face after losing it skips `acquired` (calibration
  // persists in the native layer, so `locked` follows immediately), yet §3
  // state 10 still owes the user the acknowledgment pulse.
  const previousRef = useRef<FaceGuideState>('searching');

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = state;

    // `dimmed` keeps whatever color the guide had — an interruption pauses
    // the session, and repainting the oval would misreport that as a loss.
    // `hidden` keeps it too: the oval is invisible, and holding its color
    // means reappearing (face lost → searching) starts from the right hue.
    if (state !== 'dimmed' && state !== 'hidden') {
      colorStop.value = withTiming(COLOR_STOP[state], {
        duration: duration.state,
        easing: Easing.out(Easing.ease),
        reduceMotion: ReduceMotion.System,
      });
    }

    opacity.value = withTiming(STROKE_OPACITY[state], {
      duration: duration.state,
      easing: Easing.out(Easing.ease),
      reduceMotion: ReduceMotion.System,
    });

    if (state === 'searching') {
      // 1.0 → 1.03 breathing, 4 s round trip (§3 state 1/5). Static under
      // Reduce Motion: the oval still reads as a face guide without it.
      scale.value = withRepeat(
        withTiming(1.03, {
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true
      );
    } else if (state === 'acquired' || (state === 'locked' && previous === 'searching')) {
      scale.value = withSequence(
        withTiming(1.02, {
          duration: duration.state / 2,
          easing: Easing.out(Easing.ease),
          reduceMotion: ReduceMotion.System,
        }),
        withTiming(1, {
          duration: duration.state / 2,
          easing: Easing.in(Easing.ease),
          reduceMotion: ReduceMotion.System,
        })
      );
    } else {
      scale.value = withTiming(1, {
        duration: duration.state,
        easing: Easing.out(Easing.ease),
        reduceMotion: ReduceMotion.System,
      });
    }
  }, [state, colorStop, opacity, scale]);

  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const strokeProps = useAnimatedProps(() => ({
    stroke: interpolateColor(
      colorStop.value,
      [0, 1, 2],
      [colors.ink.faint, colors.accent.DEFAULT, colors.signal.ok]
    ),
    strokeOpacity: opacity.value,
  }));

  if (width <= 0 || height <= 0) return null;

  const rx = width * 0.3;
  // Capped so the oval clears the status pill above and the idle caption
  // below even on short previews.
  const ry = Math.min(rx * 1.34, height * 0.38);
  // The SVG canvas outgrows the oval by a stroke's width so the edge never
  // clips at scale 1.03.
  const pad = 3;

  return (
    <View
      pointerEvents="none"
      // Decorative: the StatusPill narrates every state this oval draws.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0 items-center justify-center"
    >
      <Animated.View style={scaleStyle}>
        <Svg width={rx * 2 + pad * 2} height={ry * 2 + pad * 2}>
          <AnimatedEllipse
            animatedProps={strokeProps}
            cx={rx + pad}
            cy={ry + pad}
            rx={rx}
            ry={ry}
            strokeWidth={1.5}
            fill="none"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
