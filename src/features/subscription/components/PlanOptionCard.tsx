import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { colors } from '@/theme/tokens';

interface PlanOptionCardProps {
  name: string;
  /** Preformatted, e.g. "$3.99" — StoreKit will own localization later. */
  priceLabel: string;
  period: 'month' | 'year';
  /** e.g. "Save 16%". Accent-toned: marketing is chrome, never signal. */
  badge?: string;
  isSelected: boolean;
  onPress: () => void;
}

/**
 * One selectable plan on the premium sheet — `GoalCard`'s selection pattern
 * (accent border + soft fill + radio semantics) applied to pricing, so the
 * sheet's biggest choice looks like every other choice in the app.
 *
 * Prices render in tabular figures: the two cards sit side by side and their
 * numbers are the comparison the eye makes.
 */
export function PlanOptionCard({
  name,
  priceLabel,
  period,
  badge,
  isSelected,
  onPress,
}: PlanOptionCardProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected, checked: isSelected }}
      // No "selected" in the label: `accessibilityState.selected` above already
      // makes VoiceOver say it, and spelling it out here produced "…, selected,
      // selected" on the preselected annual plan.
      accessibilityLabel={[`${name}, ${priceLabel} per ${period}`, badge]
        .filter(Boolean)
        .join(', ')}
      onPress={() => {
        // The same discrete-choice tick the segmented control gives, for the
        // sheet's most consequential choice. Silent when re-tapping the plan
        // that is already active, matching every native picker.
        if (isSelected) return;
        haptics.selectionChanged();
        onPress();
      }}
      className={cn(
        'flex-1 gap-1 rounded-card border p-4',
        isSelected
          ? 'border-accent bg-accent-soft'
          : 'border-hairline bg-canvas-raised active:bg-canvas-overlay'
      )}
    >
      <View className="min-h-6 flex-row items-center justify-between gap-2">
        <Text maxFontSizeMultiplier={2} className="text-sm font-medium text-ink-muted">
          {name}
        </Text>
        {isSelected ? (
          <Icon name="checkmark.circle.fill" size={16} color={colors.accent.DEFAULT} />
        ) : null}
      </View>

      <Text
        maxFontSizeMultiplier={1.4}
        style={{ fontVariant: ['tabular-nums'] }}
        className="text-title2 font-semibold text-ink"
      >
        {priceLabel}
      </Text>
      <Text maxFontSizeMultiplier={2} className="text-xs text-ink-faint">
        per {period}
      </Text>

      {badge ? (
        <View className="mt-1.5 self-start rounded-full bg-accent/15 px-2.5 py-1">
          <Text maxFontSizeMultiplier={1.4} className="text-xs font-medium text-accent">
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
