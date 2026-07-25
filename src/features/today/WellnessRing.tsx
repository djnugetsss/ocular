import { Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

interface WellnessRingProps {
  sessionsToday: number;
  /** The profile's `daily_target_sessions`. */
  targetSessions: number;
  /** Today's duration-weighted blink rate; `null` renders a muted em dash. */
  todayRate: number | null;
  /** From `dailySentence` — this component only renders it. */
  sentence: string;
}

/**
 * Today's hero (PRODUCT_SPEC.md §4.2): the 140 pt daily-progress ring with
 * the day's average blink rate at its center, the check-in count beneath,
 * and the one plain sentence that gives the screen a voice.
 *
 * The ring's arc is `sessions today / daily_target_sessions` and turns
 * `signal-ok` when the target is met — completion is data, so a signal color
 * describing it honors the "signal colors describe data, never chrome" rule.
 */
export function WellnessRing({
  sessionsToday,
  targetSessions,
  todayRate,
  sentence,
}: WellnessRingProps) {
  const isTargetMet = targetSessions > 0 && sessionsToday >= targetSessions;
  const progress = targetSessions > 0 ? sessionsToday / targetSessions : 0;

  const rateDescription =
    todayRate == null
      ? 'no blink rate measured yet'
      : `average blink rate ${todayRate.toFixed(0)} per minute`;

  return (
    <View
      // One VoiceOver stop: count, rate, and sentence as a single narration
      // rather than four fragments in visual order.
      accessible
      accessibilityLabel={`${sessionsToday} of ${targetSessions} check-ins today, ${rateDescription}. ${sentence}`}
      className="items-center"
    >
      <ProgressRing
        progress={progress}
        color={isTargetMet ? colors.signal.ok : colors.accent.DEFAULT}
      >
        <Text
          maxFontSizeMultiplier={1.4}
          style={{ fontVariant: ['tabular-nums'] }}
          className={cn(
            'text-metric font-semibold',
            todayRate == null ? 'text-ink-faint' : 'text-ink'
          )}
        >
          {todayRate == null ? '—' : todayRate.toFixed(0)}
        </Text>
        {todayRate != null ? (
          <Text maxFontSizeMultiplier={1.4} className="text-xs text-ink-muted">
            /min
          </Text>
        ) : null}
      </ProgressRing>

      <View className="mt-4 flex-row items-center gap-1.5">
        <Icon
          name={isTargetMet ? 'checkmark.circle.fill' : 'circle.dashed'}
          size={15}
          color={isTargetMet ? colors.signal.ok : colors.ink.muted}
        />
        <Text
          maxFontSizeMultiplier={2}
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-sm font-medium text-ink-muted"
        >
          {sessionsToday} of {targetSessions} check-in{targetSessions === 1 ? '' : 's'}
        </Text>
      </View>

      <Text
        maxFontSizeMultiplier={2}
        className="mt-2 max-w-[300px] text-center text-base text-ink-muted"
      >
        {sentence}
      </Text>
    </View>
  );
}
