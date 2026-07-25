import { Text, View } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

interface InsightCardProps {
  symbol: SFSymbol;
  title: string;
  body: string;
  className?: string;
}

/**
 * One observation, stated once (PRODUCT_SPEC.md §4.5 "pattern card").
 *
 * Deliberately capped at a single card per screen: a calm app makes one
 * remark, not a feed of them. Accent-toned rather than signal-toned — a
 * pattern is an observation about behavior, not a verdict on data, and the
 * palette rule reserves signal colors for the latter.
 */
export function InsightCard({ symbol, title, body, className }: InsightCardProps) {
  return (
    <Card
      accessible
      accessibilityLabel={`${title}. ${body}`}
      className={cn('flex-row gap-3', className)}
    >
      <View className="mt-0.5">
        <Icon name={symbol} size={18} color={colors.accent.DEFAULT} />
      </View>
      <View className="flex-1">
        <Text maxFontSizeMultiplier={2} className="text-base font-semibold text-ink">
          {title}
        </Text>
        <Text maxFontSizeMultiplier={2} className="mt-1 text-sm leading-5 text-ink-muted">
          {body}
        </Text>
      </View>
    </Card>
  );
}
