import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  SlideInRight,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui/Icon';
import { colors, duration } from '@/theme/tokens';
import { ONBOARDING_STEP_COUNT } from '@/features/onboarding/steps';

interface OnboardingPageProps {
  /** Zero-based index, used for the progress dots. */
  step: number;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Primary CTA, pinned above the home indicator. */
  footer: ReactNode;
  onBack?: () => void;
}

/**
 * Shared shell for every onboarding screen (PRODUCT_SPEC.md §4.1).
 *
 * Owns the progress dots, the back affordance, the entrance animation, and the
 * pinned footer, so the five screens contain only their own content. That is
 * what keeps them honest: a screen that has to re-implement the chrome tends to
 * drift from its siblings.
 *
 * Content scrolls rather than being strictly centered. At Dynamic Type XL the
 * privacy screen's three rows exceed a small phone's height, and a fixed layout
 * would clip the very text the user most needs to read.
 */
export function OnboardingPage({
  step,
  title,
  subtitle,
  children,
  footer,
  onBack,
}: OnboardingPageProps) {
  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="h-11 flex-row items-center px-4">
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            hitSlop={12}
            className="h-11 w-11 items-center justify-center"
          >
            <Icon name="chevron.left" size={18} color={colors.ink.muted} weight="semibold" />
          </Pressable>
        ) : (
          // Placeholder keeps the dots optically centered when there is no
          // back button, rather than letting them shift between screens.
          <View className="h-11 w-11" />
        )}

        <View className="flex-1 flex-row items-center justify-center gap-2">
          {Array.from({ length: ONBOARDING_STEP_COUNT }, (_, index) => (
            <ProgressDot key={index} isActive={index === step} />
          ))}
        </View>

        <View className="h-11 w-11" />
      </View>

      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-8"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          // Slide carries the sense of forward progress; under Reduce Motion
          // Reanimated substitutes the entering animation with a plain fade.
          entering={SlideInRight.duration(250).reduceMotion(ReduceMotion.System)}
        >
          <Text
            // The heading is the screen's identity — focus lands here first so
            // VoiceOver announces where the user is, not the progress dots.
            accessibilityRole="header"
            className="text-title1 font-semibold text-ink"
          >
            {title}
          </Text>

          {subtitle ? (
            <Text className="mt-3 text-base leading-6 text-ink-muted">{subtitle}</Text>
          ) : null}

          {children ? <View className="mt-8">{children}</View> : null}
        </Animated.View>
      </ScrollView>

      <Animated.View
        entering={FadeIn.duration(250).reduceMotion(ReduceMotion.System)}
        // pb-4 rather than pb-2: on devices without a home indicator the
        // safe-area inset is zero, and 8 pt left the CTA nearly touching the
        // screen edge.
        className="gap-3 px-6 pb-4 pt-4"
      >
        {footer}
      </Animated.View>
    </SafeAreaView>
  );
}

/**
 * One progress dot. The active dot grows from dot- to pill-width as its screen
 * mounts, which reads as progress advancing; inactive dots are static. The
 * screens remount on every push, so the tween runs exactly once per arrival.
 */
function ProgressDot({ isActive }: { isActive: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = isActive
      ? withTiming(1, {
          duration: duration.page,
          easing: Easing.out(Easing.ease),
          reduceMotion: ReduceMotion.System,
        })
      : 0;
  }, [isActive, progress]);

  const style = useAnimatedStyle(() => ({
    width: 6 + progress.value * 14,
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.canvas.overlay, colors.accent.DEFAULT]
    ),
  }));

  return <Animated.View style={style} className="h-1.5 rounded-full" />;
}
