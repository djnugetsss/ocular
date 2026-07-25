import { useRouter } from 'expo-router';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { PlanLimitCard } from '@/features/subscription/components/PlanLimitCard';
import { useCheckInGate } from '@/features/subscription/use-check-in-gate';

/**
 * Trigger 1: the third check-in of the day just completed.
 *
 * Rendered by Session Results — post-scan only, free plans only (the parent
 * owns both conditions, which also keeps this component's usage count off
 * the wire for Pro users and history browsing). Inside, it shows exactly
 * when the check-in that just saved was the day's last: an inline card, not
 * a modal, because the results screen is the ritual's payoff and nothing is
 * allowed to land on top of it (DESIGN_REVIEW.md §3/§6). The sheet is one
 * intentional tap away.
 *
 * Enters after the hero's own rise (350 ms) so the verdict is read first —
 * the measurement is the point; the plan is a footnote to it.
 */
export function PostScanPremiumMoment() {
  const router = useRouter();
  const gate = useCheckInGate();

  // Only the certain case earns the card: allowance truly spent, count
  // known. Unknown usage stays silent — never advertise a limit you cannot
  // prove was reached.
  if (gate.isLoading || gate.isUsageUnknown || gate.isUnlimited || gate.isAllowed) return null;

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(450).reduceMotion(ReduceMotion.System)}>
      <PlanLimitCard
        className="mt-3"
        symbol="checkmark.seal"
        title="That was today's last included check-in"
        body={`You've used all ${gate.limit} on your plan — a full day of checking in. Pro removes the daily limit.`}
        footnote="Your allowance resets at midnight."
        action={{
          label: 'See Ocular Pro',
          onPress: () =>
            router.push({
              pathname: '/(app)/premium',
              params: { trigger: 'third-check-in' },
            }),
        }}
      />
    </Animated.View>
  );
}
