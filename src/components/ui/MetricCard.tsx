import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { cn } from '@/lib/cn';

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
  className?: string;
}

const TONE: Record<NonNullable<MetricCardProps['tone']>, string> = {
  neutral: 'text-ink',
  ok: 'text-signal-ok',
  warn: 'text-signal-warn',
  bad: 'text-signal-bad',
};

export function MetricCard({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
  className,
}: MetricCardProps) {
  return (
    <Card
      // Grouped so VoiceOver reads "Blink rate, 14 per minute" as one unit
      // instead of stopping on each fragment.
      accessible
      accessibilityLabel={`${label}, ${value}${unit ? ` ${unit}` : ''}`}
      className={className}
    >
      <SectionHeader>{label}</SectionHeader>
      <View className="mt-2 flex-row items-baseline gap-1">
        {/* Tabular figures: these values sit side by side across cards, and
            proportional digits would make equal-length numbers ragged. */}
        <Text
          maxFontSizeMultiplier={1.4}
          style={{ fontVariant: ['tabular-nums'] }}
          className={cn('text-metric font-semibold', TONE[tone])}
        >
          {value}
        </Text>
        {unit ? (
          <Text maxFontSizeMultiplier={1.4} className="text-sm text-ink-muted">
            {unit}
          </Text>
        ) : null}
      </View>
      {hint ? (
        <Text maxFontSizeMultiplier={2} className="mt-1 text-xs text-ink-faint">
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}
