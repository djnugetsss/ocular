import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

interface InfoLineProps {
  label: string;
  value?: string;
  /** Pressable rows get a chevron and button semantics; static rows get neither. */
  onPress?: () => void;
  /** Destructive rows read in `signal-bad` — the iOS settings idiom. */
  destructive?: boolean;
  className?: string;
}

/**
 * One settings row: label, optional value, chevron when pressable
 * (DESIGN_REVIEW.md §5 — the single `InfoLine` that replaces Profile's
 * private `Row` and any future settings-row twins).
 *
 * Like `SessionRow`, it only claims to be a button when it is one, so a
 * static row never lies to assistive tech about being interactive.
 */
export function InfoLine({ label, value, onPress, destructive = false, className }: InfoLineProps) {
  const content = (
    <>
      <Text
        maxFontSizeMultiplier={2}
        className={cn('text-sm', destructive ? 'font-medium text-signal-bad' : 'text-ink-muted')}
      >
        {label}
      </Text>
      <View className="flex-shrink flex-row items-center gap-1.5">
        {value ? (
          <Text
            maxFontSizeMultiplier={2}
            numberOfLines={1}
            className="flex-shrink text-right text-sm font-medium text-ink"
          >
            {value}
          </Text>
        ) : null}
        {onPress ? <Icon name="chevron.right" size={12} color={colors.ink.faint} /> : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}, ${value}` : label}
        onPress={onPress}
        // Negative margin widens the touch target to the card edge without
        // disturbing the card's visual padding.
        className={cn(
          '-mx-2 flex-row items-center justify-between gap-4 rounded-lg px-2 py-1 active:bg-canvas-overlay',
          className
        )}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={value ? `${label}, ${value}` : label}
      className={cn('flex-row items-center justify-between gap-4 py-1', className)}
    >
      {content}
    </View>
  );
}
