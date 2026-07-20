import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

interface EmptyStateProps {
  /** Decorative SF Symbol. Hidden from assistive tech — the title carries meaning. */
  symbol?: SFSymbol;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
  /** Rendered below the action. For secondary hints like a progress count. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Shown when a screen has no data yet — as opposed to failing to load it.
 *
 * The distinction from `ErrorState` is deliberate and load-bearing: empty is a
 * normal, expected condition on a new account, so the tone is invitational and
 * the action moves the user forward. Errors are abnormal, so their action is
 * always "try again." Conflating the two makes a brand-new user feel like
 * something broke on their first launch.
 */
export function EmptyState({ symbol, title, body, action, footer, className }: EmptyStateProps) {
  return (
    <View className={cn('items-center gap-3 px-8 py-16', className)}>
      {symbol ? (
        <View className="mb-1 h-16 w-16 items-center justify-center rounded-full bg-canvas-raised">
          <Icon name={symbol} size={28} color={colors.ink.faint} />
        </View>
      ) : null}

      <Text className="text-center text-lg font-semibold text-ink">{title}</Text>
      <Text className="text-center text-base leading-6 text-ink-muted">{body}</Text>

      {action ? (
        <Button label={action.label} onPress={action.onPress} className="mt-4 w-full" />
      ) : null}

      {footer}
    </View>
  );
}
