import { Text } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme/tokens';

/**
 * The on-device processing badge (DESIGN_REVIEW.md §3 anatomy, state 4).
 *
 * Onboarding promises "an on-device badge shows whenever the camera is
 * active" — this is that badge, and its presence must be a *truthful* signal.
 * The caller mounts it iff the camera's `isActive` prop is set, which is the
 * same prop that drives the capture session: badge and camera share one
 * source of truth, so the badge can never be early or late by more than its
 * 200 ms fade (§3: "badge before frames" — `isActive` commits before the
 * native session produces its first frame).
 *
 * On session end the fade-out is deliberate and visible: §3 state 12 wants
 * the user to *see the badge extinguish* before navigation.
 */
export function PrivacyBadge() {
  return (
    <Animated.View
      entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(200).reduceMotion(ReduceMotion.System)}
      // Announced, not decorative: a VoiceOver user deserves the same
      // moment-of-truth signal the badge gives sighted users.
      accessible
      accessibilityLabel="Camera on. Frames are analyzed on this device and never leave it."
      className="flex-row items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5"
    >
      <Icon name="checkmark.shield.fill" size={13} color={colors.signal.ok} />
      <Text maxFontSizeMultiplier={2} className="text-xs font-medium text-ink">
        On-device
      </Text>
    </Animated.View>
  );
}
