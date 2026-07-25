import { Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { PLAN_COMPARISON, type ComparisonRow } from '@/features/subscription/premium-content';
import { colors } from '@/theme/tokens';

/**
 * The Free vs. Pro comparison — an Apple-style capability table.
 *
 * Built row-wise (so every row is one VoiceOver element that reads
 * "label, free …, pro …") with the Pro column raised on a single `accent-soft`
 * highlight behind the cells. The highlight is one absolutely-positioned pane,
 * not a fill per cell, so the column reads as one surface and the corners clip
 * cleanly under the card's radius.
 *
 * Honesty rules the copy already encodes, rendered without drama: a capability
 * free keeps is a muted check, one it lacks is a quiet dash (never a red ✗),
 * and an unshipped Pro capability is a check with a "Soon" tag — the same
 * "Coming soon" truth the FeatureGate enforces.
 */

/** Column widths, shared by the header and every row so the highlight lines up. */
const FREE_COL = 'w-16';
const PRO_COL = 'w-24';

export function PlanComparison() {
  return (
    <View className="relative overflow-hidden rounded-card border border-hairline bg-canvas-raised">
      {/* One highlight pane behind the Pro column, flush to the right edge. */}
      <View
        pointerEvents="none"
        className={cn('absolute bottom-0 right-0 top-0 bg-accent-soft', PRO_COL)}
      />

      {/* Header */}
      <View className="flex-row items-center py-3">
        <View className="flex-1 pl-4" />
        <Text
          maxFontSizeMultiplier={1.4}
          className={cn('text-center text-sm font-medium text-ink-muted', FREE_COL)}
        >
          Free
        </Text>
        <Text
          maxFontSizeMultiplier={1.4}
          className={cn('text-center text-sm font-semibold text-accent', PRO_COL)}
        >
          Pro
        </Text>
      </View>

      {PLAN_COMPARISON.map((row) => (
        <View
          key={row.label}
          accessible
          accessibilityLabel={rowAccessibilityLabel(row)}
          className="h-12 flex-row items-center border-t border-hairline"
        >
          <Text
            maxFontSizeMultiplier={1.4}
            numberOfLines={1}
            className="flex-1 pl-4 pr-2 text-sm text-ink"
          >
            {row.label}
          </Text>
          <View className={cn('items-center', FREE_COL)}>
            <PlanCell value={row.free} variant="free" />
          </View>
          <View className={cn('items-center', PRO_COL)}>
            <PlanCell value={row.pro} variant="pro" upcoming={row.upcoming} />
          </View>
        </View>
      ))}
    </View>
  );
}

function PlanCell({
  value,
  variant,
  upcoming,
}: {
  value: string | boolean;
  variant: 'free' | 'pro';
  upcoming?: boolean;
}) {
  if (typeof value === 'string') {
    return (
      <Text
        maxFontSizeMultiplier={1.4}
        className={cn(
          'text-center text-sm',
          variant === 'pro' ? 'font-semibold text-ink' : 'text-ink-muted'
        )}
      >
        {value}
      </Text>
    );
  }

  // A capability the plan lacks: a quiet dash, never an alarming ✗.
  if (!value) {
    return (
      <Text maxFontSizeMultiplier={1.4} className="text-base text-ink-faint">
        —
      </Text>
    );
  }

  // Included. Pro checks carry the accent; a check on the free side is present
  // but unhighlighted, since it is not what the upgrade is selling.
  return (
    <View className="items-center">
      <Icon
        name="checkmark"
        size={15}
        color={variant === 'pro' ? colors.accent.DEFAULT : colors.ink.muted}
      />
      {upcoming ? (
        <Text maxFontSizeMultiplier={1.2} className="mt-0.5 text-[10px] font-medium text-ink-faint">
          Soon
        </Text>
      ) : null}
    </View>
  );
}

function rowAccessibilityLabel(row: ComparisonRow): string {
  return `${row.label}. Free: ${describe(row.free)}. Pro: ${describe(row.pro, row.upcoming)}.`;
}

function describe(value: string | boolean, upcoming?: boolean): string {
  if (typeof value === 'string') return value;
  if (!value) return 'Not included';
  return upcoming ? 'Included, coming soon' : 'Included';
}
