import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';

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
            onPress={() => {
              // Re-tapping the active segment is a no-op, matching every
              // native iOS picker: no tick, and — since callers persist this
              // choice — no redundant write for a value that did not change.
              if (isSelected) return;
              haptics.selectionChanged();
              onChange(option.value);
            }}
            className={cn(
              // 14, not the 18 pt card radius: this sits inside a `rounded-card`
              // track with 4 pt of padding, and concentric corners need the
              // inner radius reduced by exactly that inset or the curves read
              // as mismatched. A deliberate exception to the 18/24/999 set.
              // `min-h-11` holds the 44 pt HIG touch target: the padding alone
              // left the segment ~38 pt, and it collapses further as the label
              // shrinks at small Dynamic Type sizes.
              'min-h-11 flex-1 items-center justify-center rounded-[14px] py-2.5',
              isSelected ? 'bg-accent' : 'active:bg-canvas-overlay'
            )}
          >
            <Text
              maxFontSizeMultiplier={2}
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
