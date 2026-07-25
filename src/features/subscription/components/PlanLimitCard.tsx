import { Text, View } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

interface PlanLimitCardProps {
  symbol: SFSymbol;
  title: string;
  body: string;
  /** One quieter line — when a limit resets, or where the data still lives. */
  footnote?: string;
  /**
   * The way forward, usually "See Ocular Pro" → the premium sheet. Same shape
   * as `EmptyState`'s action (DESIGN_REVIEW.md §5 prop standardization).
   * Secondary weight on purpose: a plan boundary invites, it never insists.
   */
  action?: { label: string; onPress: () => void };
  className?: string;
}

/**
 * States a plan limit, calmly (DESIGN_REVIEW.md §4 tone rules).
 *
 * Accent-toned, never `signal-*`: signal colors describe *data* in this app,
 * and a plan boundary is a fact about the account, not a finding about the
 * user's eyes. Amber here would read as "your blink rate is low."
 *
 * The copy contract every caller follows: say what is limited, say that
 * nothing was lost, and never scold. A free user who has finished today's
 * check-ins did the thing the app asked of them — that screen is not the
 * place for disappointment.
 */
export function PlanLimitCard({
  symbol,
  title,
  body,
  footnote,
  action,
  className,
}: PlanLimitCardProps) {
  return (
    <Card className={cn('flex-row gap-3', className)}>
      <View className="mt-0.5">
        <Icon name={symbol} size={18} color={colors.accent.DEFAULT} />
      </View>
      {/* Text grouped for one VoiceOver read; the action stays its own,
          separately focusable element rather than being swallowed into it. */}
      <View className="flex-1">
        <View accessible accessibilityLabel={[title, body, footnote].filter(Boolean).join('. ')}>
          <Text maxFontSizeMultiplier={2} className="text-base font-semibold text-ink">
            {title}
          </Text>
          <Text maxFontSizeMultiplier={2} className="mt-1 text-sm leading-5 text-ink-muted">
            {body}
          </Text>
          {footnote ? (
            <Text maxFontSizeMultiplier={2} className="mt-2 text-xs leading-4 text-ink-faint">
              {footnote}
            </Text>
          ) : null}
        </View>
        {action ? (
          <Button
            label={action.label}
            variant="secondary"
            onPress={action.onPress}
            className="mt-3 min-h-0 self-start px-4 py-2"
          />
        ) : null}
      </View>
    </Card>
  );
}
