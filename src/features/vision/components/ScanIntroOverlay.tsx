import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme/tokens';

/**
 * The check-in ritual card (DESIGN_REVIEW.md §3, state 4½).
 *
 * Shown over the live camera for the first breath of every session, then gone.
 * Its one job is behavioral: a scan only measures *natural* blinking if the
 * user is not performing for the camera, so the overlay asks them to set the
 * phone down and go back to work — and then gets out of the way on its own.
 *
 * The parent owns the clock (~5 s) and unmounts this view; entering/exiting
 * fades live here. A tap dismisses early — returning attention to work is the
 * whole point, so the overlay never insists on being read twice. It covers
 * only the preview region: the controls below stay reachable throughout.
 */

interface ScanIntroOverlayProps {
  /** Early dismissal; the parent also dismisses on its own timer. */
  onSkip: () => void;
}

const STEPS: readonly { symbol: SFSymbol; text: string }[] = [
  { symbol: 'laptopcomputer.and.iphone', text: 'Place your phone beside your laptop' },
  { symbol: 'keyboard', text: 'Keep working normally' },
  { symbol: 'eye', text: 'Blink naturally' },
  { symbol: 'iphone.slash', text: "Don't look at the phone" },
];

/** Stagger for the step rows: title first, then one row per beat. */
const STAGGER_MS = 120;

export function ScanIntroOverlay({ onSkip }: ScanIntroOverlayProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(300).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(500).reduceMotion(ReduceMotion.System)}
      className="absolute inset-0"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Check-in started. ${STEPS.map((step) => step.text).join('. ')}. Ocular works best when you forget it's there.`}
        accessibilityHint="Dismisses these tips"
        onPress={onSkip}
        className="flex-1 items-center justify-center bg-canvas/80 px-8"
      >
        <View className="w-full max-w-sm gap-6">
          <Animated.Text
            entering={FadeIn.duration(400).reduceMotion(ReduceMotion.System)}
            maxFontSizeMultiplier={1.6}
            className="text-center text-xl font-semibold text-ink"
          >
            Now, back to work
          </Animated.Text>

          <View className="gap-4">
            {STEPS.map((step, index) => (
              <Animated.View
                key={step.symbol}
                entering={FadeIn.duration(400)
                  .delay(STAGGER_MS * (index + 1))
                  .reduceMotion(ReduceMotion.System)}
                className="flex-row items-center gap-4"
              >
                <View className="w-7 items-center">
                  <Icon name={step.symbol} size={19} color={colors.accent.DEFAULT} />
                </View>
                <Text maxFontSizeMultiplier={1.8} className="flex-1 text-base text-ink">
                  {step.text}
                </Text>
              </Animated.View>
            ))}
          </View>

          <Animated.Text
            entering={FadeIn.duration(400)
              .delay(STAGGER_MS * (STEPS.length + 1))
              .reduceMotion(ReduceMotion.System)}
            maxFontSizeMultiplier={1.8}
            className="text-center text-sm text-ink-muted"
          >
            Ocular works best when you forget it&apos;s there.
          </Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
