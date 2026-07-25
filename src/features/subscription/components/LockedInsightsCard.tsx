import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { LockedOverlay } from '@/features/subscription/components/LockedOverlay';
import { colors } from '@/theme/tokens';

interface LockedInsightsCardProps {
  /** Opens the premium sheet with the `insights` trigger. */
  onUnlock: () => void;
  className?: string;
}

/**
 * The locked-charts state on Insights for free plans (trigger 3).
 *
 * What ghosts through the frost is a decorative waveform, not the user's
 * series — teasing someone's real trend line through a scrim would be both a
 * data leak and a taunt. The shape just says "a chart lives here."
 *
 * Sits where the two TrendCharts would; the four summary stat cards below it
 * stay on every plan, which the overlay copy points out so a free user knows
 * their averages are still theirs.
 */

const PREVIEW_HEIGHT = 168;

/** Deterministic, hand-placed waveform — plausible chart, nobody's data. */
const LINE =
  'M12 116 C40 96 58 122 84 106 C112 88 128 118 156 98 C186 76 204 96 232 72 C258 52 276 68 300 46';
const POINTS: [number, number][] = [
  [12, 116],
  [84, 106],
  [156, 98],
  [232, 72],
  [300, 46],
];

export function LockedInsightsCard({ onUnlock, className }: LockedInsightsCardProps) {
  return (
    <LockedOverlay
      title="Trends are part of Pro"
      body="Charts, range comparisons, and time-of-day patterns. Your averages for this range stay below, on every plan."
      action={{ label: 'Unlock full Insights', onPress: onUnlock }}
      className={className}
    >
      <View className="bg-canvas-raised px-3 py-4" style={{ height: PREVIEW_HEIGHT + 32 }}>
        <Svg width="100%" height={PREVIEW_HEIGHT} viewBox={`0 0 312 ${PREVIEW_HEIGHT - 24}`}>
          <Path
            d={LINE}
            stroke={colors.accent.DEFAULT}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
            opacity={0.65}
          />
          {POINTS.map(([x, y]) => (
            <Circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={4}
              fill={colors.accent.DEFAULT}
              opacity={0.75}
            />
          ))}
        </Svg>
      </View>
    </LockedOverlay>
  );
}
