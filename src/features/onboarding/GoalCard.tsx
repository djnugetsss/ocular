import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';
import type { GoalOption } from '@/features/onboarding/steps';

interface GoalCardProps {
  option: GoalOption;
  isSelected: boolean;
  onPress: () => void;
}

/**
 * One selectable goal tile in the 2×2 grid (PRODUCT_SPEC.md §4.1.5).
 *
 * Exposed to assistive tech as a radio rather than a button: these are mutually
 * exclusive, and `radio` is what tells VoiceOver to announce "selected" and to
 * imply that choosing one deselects the others.
 */
export function GoalCard({ option, isSelected, onPress }: GoalCardProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected, checked: isSelected }}
      accessibilityLabel={`${option.label}. ${option.description}`}
      onPress={onPress}
      className={cn(
        'flex-1 gap-2 rounded-card border p-4',
        isSelected
          ? 'border-accent bg-accent-soft'
          : 'border-hairline bg-canvas-raised active:bg-canvas-overlay'
      )}
    >
      <View className="flex-row items-start justify-between">
        <Icon
          name={option.symbol}
          size={20}
          color={isSelected ? colors.accent.DEFAULT : colors.ink.faint}
        />
        {isSelected ? (
          <Icon name="checkmark.circle.fill" size={16} color={colors.accent.DEFAULT} />
        ) : null}
      </View>

      <Text className="text-[15px] font-semibold text-ink">{option.label}</Text>
      <Text className="text-xs leading-4 text-ink-muted">{option.description}</Text>
    </Pressable>
  );
}
