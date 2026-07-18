import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { useRecordOnboardingStep } from '@/features/onboarding/use-onboarding-step';

export default function WelcomeScreen() {
  const router = useRouter();
  useRecordOnboardingStep(0);

  // A slow blink: the eye holds open, closes briefly, reopens. Vertical scale
  // rather than opacity, because a fade reads as the glyph disappearing while a
  // squash reads as an eyelid — which is the whole point of the gesture.
  const lidScale = useSharedValue(1);

  useEffect(() => {
    lidScale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3400, reduceMotion: ReduceMotion.System }),
        withTiming(0.08, {
          duration: 110,
          easing: Easing.in(Easing.quad),
          reduceMotion: ReduceMotion.System,
        }),
        withTiming(1, {
          duration: 140,
          easing: Easing.out(Easing.quad),
          reduceMotion: ReduceMotion.System,
        })
      ),
      -1,
      false
    );
  }, [lidScale]);

  const eyeStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: lidScale.value }] }));

  return (
    <OnboardingPage
      step={0}
      title="Ocular"
      subtitle="Ocular helps you notice what your eyes can't tell you — how you blink and how you sit, measured privately on your iPhone."
      footer={
        <Button label="Get started" onPress={() => router.push('/(onboarding)/how-it-works')} />
      }
    >
      <View className="items-center py-6">
        <Animated.View
          style={eyeStyle}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="h-24 w-24 items-center justify-center rounded-full bg-accent-soft"
        >
          <Text className="text-5xl text-accent">◉</Text>
        </Animated.View>
      </View>
    </OnboardingPage>
  );
}
