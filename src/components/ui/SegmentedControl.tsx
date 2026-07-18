import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/cn';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  /** Spoken label, when the visible one is too terse (e.g. "W" → "Week"). */
  accessibilityLabel?: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Single-select segmented control in the iOS idiom.
 *
 * Built rather than imported: React Native's own `SegmentedControlIOS` is
 * removed from core, and the community package would be a dependency for one
 * simple control that has to be restyled to the dark palette anyway
 * (PRODUCT_SPEC.md §6, rule 5 — no new dependencies for this).
 *
 * Used for the daily-target stepper in onboarding and, later, the Insights
 * range picker.
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <View
      // The container is the tab list; each segment reports its own selected
      // state, which is what VoiceOver reads out as "selected".
      accessibilityRole="tablist"
      className={cn('flex-row gap-1 rounded-card bg-canvas-raised p-1', className)}
    >
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            onPress={() => onChange(option.value)}
            className={cn(
              'flex-1 items-center justify-center rounded-[14px] py-2.5',
              isSelected ? 'bg-accent' : 'active:bg-canvas-overlay'
            )}
          >
            <Text
              className={cn('text-sm font-semibold', isSelected ? 'text-white' : 'text-ink-muted')}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
