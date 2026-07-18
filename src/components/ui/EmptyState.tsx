import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  /** Decorative glyph. Hidden from assistive tech — the title carries meaning. */
  glyph?: string;
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
export function EmptyState({ glyph, title, body, action, footer, className }: EmptyStateProps) {
  return (
    <View className={cn('items-center gap-3 px-8 py-16', className)}>
      {glyph ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="mb-1 text-4xl"
        >
          {glyph}
        </Text>
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
