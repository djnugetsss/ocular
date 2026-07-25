import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { MetricComparison } from '@/features/insights/insights-aggregator';
import { cn } from '@/lib/cn';
import { colors, type Tone } from '@/theme/tokens';

interface TrendCardProps {
  label: string;
  /** Preformatted; the card never decides how a metric reads. */
  value: string;
  unit?: string;
  tone?: Tone;
  comparison: MetricComparison | null;
  /**
   * Whether an increase in this metric is good. Blink rate and steadiness
   * improve upward; session duration is neutral, so its chip stays grey.
   */
  higherIsBetter?: boolean | 'neutral';
  /** One line under the value — what the number means, in plain words. */
  hint?: string;
  className?: string;
}

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  ok: 'text-signal-ok',
  warn: 'text-signal-warn',
  bad: 'text-signal-bad',
};

/**
 * One metric over a range, with its change against the previous equal range
 * (PRODUCT_SPEC.md §4.5 "improvement tracker").
 *
 * The comparison chip is absent — not zeroed, not greyed — whenever the
 * aggregator withheld it, which is how "not enough history to compare" stays
 * visually distinct from "no change". A chip reading 0% would claim a
 * measurement that was never made.
 */
export function TrendCard({
  label,
  value,
  unit,
  tone = 'neutral',
  comparison,
  higherIsBetter = true,
  hint,
  className,
}: TrendCardProps) {
  const chip = comparison ? describeChip(comparison, higherIsBetter) : null;

  return (
    <Card
      accessible
      accessibilityLabel={[
        label,
        `${value}${unit ? ` ${unit}` : ''}`,
        comparison ? `${comparison.label} than the previous period` : 'no comparison yet',
        hint,
      ]
        .filter(Boolean)
        .join(', ')}
      className={cn('flex-1', className)}
    >
      <SectionHeader>{label}</SectionHeader>

      <View className="mt-2 flex-row items-baseline gap-1">
        <Text
          maxFontSizeMultiplier={1.4}
          style={{ fontVariant: ['tabular-nums'] }}
          className={cn('text-title1 font-semibold', TONE_TEXT[tone])}
        >
          {value}
        </Text>
        {unit ? (
          <Text maxFontSizeMultiplier={1.4} className="text-sm text-ink-muted">
            {unit}
          </Text>
        ) : null}
      </View>

      {chip ? (
        <View className="mt-2 flex-row items-center gap-1">
          <Icon name={chip.symbol} size={11} color={chip.color} />
          <Text maxFontSizeMultiplier={2} className={cn('text-xs', chip.className)}>
            {chip.text}
          </Text>
        </View>
      ) : (
        <Text maxFontSizeMultiplier={2} className="mt-2 text-xs text-ink-faint">
          {hint ?? 'Not enough history yet'}
        </Text>
      )}

      {chip && hint ? (
        <Text maxFontSizeMultiplier={2} className="mt-1 text-xs text-ink-faint">
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

function describeChip(comparison: MetricComparison, higherIsBetter: boolean | 'neutral') {
  if (comparison.direction === 'flat') {
    return {
      symbol: 'equal' as const,
      color: colors.ink.muted,
      className: 'text-ink-muted',
      text: comparison.label,
    };
  }

  const isUp = comparison.direction === 'up';
  const symbol = isUp ? ('arrow.up.right' as const) : ('arrow.down.right' as const);

  if (higherIsBetter === 'neutral') {
    return { symbol, color: colors.ink.muted, className: 'text-ink-muted', text: comparison.label };
  }

  const isGood = isUp === higherIsBetter;
  return {
    symbol,
    color: isGood ? colors.signal.ok : colors.signal.warn,
    className: isGood ? 'text-signal-ok' : 'text-signal-warn',
    text: comparison.label,
  };
}
