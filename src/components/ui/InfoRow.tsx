import { Text, View } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

interface InfoRowProps {
  /** Leading SF Symbol. Decorative — the title and body carry the meaning. */
  symbol: SFSymbol;
  title: string;
  body: string;
  tone?: 'neutral' | 'accent' | 'ok';
  className?: string;
}

const TONE = {
  neutral: { container: 'bg-canvas-overlay', color: colors.ink.muted },
  accent: { container: 'bg-accent-soft', color: colors.accent.DEFAULT },
  ok: { container: 'bg-signal-ok/15', color: colors.signal.ok },
} as const;

/**
 * Icon + title + explanatory body, stacked in a column of peers.
 *
 * The workhorse of onboarding (PRODUCT_SPEC.md §4.1.2, §4.1.3), where the job
 * is to explain rather than to collect input. Grouped for accessibility so
 * VoiceOver reads each row as one statement instead of three fragments.
 */
export function InfoRow({ symbol, title, body, tone = 'neutral', className }: InfoRowProps) {
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${body}`}
      className={cn('flex-row gap-4', className)}
    >
      <View
        className={cn(
          'h-10 w-10 shrink-0 items-center justify-center rounded-full',
          TONE[tone].container
        )}
      >
        <Icon name={symbol} size={18} color={TONE[tone].color} />
      </View>

      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        <Text className="text-[15px] leading-6 text-ink-muted">{body}</Text>
      </View>
    </View>
  );
}
