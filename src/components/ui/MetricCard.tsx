import { Text, View } from 'react-native';

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
    <View
      // Grouped so VoiceOver reads "Blink rate, 14 per minute" as one unit
      // instead of stopping on each fragment.
      accessible
      accessibilityLabel={`${label}, ${value}${unit ? ` ${unit}` : ''}`}
      className={cn('rounded-card border border-hairline bg-canvas-raised p-4', className)}
    >
      <Text className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</Text>
      <View className="mt-2 flex-row items-baseline gap-1">
        <Text className={cn('text-metric font-semibold', TONE[tone])}>{value}</Text>
        {unit ? <Text className="text-sm text-ink-muted">{unit}</Text> : null}
      </View>
      {hint ? <Text className="mt-1 text-xs text-ink-faint">{hint}</Text> : null}
    </View>
  );
}
