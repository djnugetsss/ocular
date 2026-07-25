import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { formatDayTitle, formatShortDate } from '@/features/sessions/dates';
import type { DailyPoint, RangeBounds } from '@/features/insights/insights-aggregator';
import { colors } from '@/theme/tokens';

interface TrendChartProps {
  points: DailyPoint[];
  bounds: RangeBounds;
  /** Axis ceiling; the series max wins when it exceeds this. */
  suggestedMax: number;
  /**
   * Optional shaded band, drawn behind the series. Used for "below 8/min" on
   * blink rate and "at or above 80" on posture — a reference the eye reads
   * without a legend.
   */
  band?: { from: number; to: number; color: string; label: string };
  /** Dashed horizontal reference, typically the range average. */
  referenceValue?: number | null;
  referenceLabel?: string;
  /** Formats a value for the callout and the y-axis cap. */
  formatValue: (value: number) => string;
  lineColor?: string;
  onSelectDay?: (point: DailyPoint) => void;
  /** Spoken summary; the individual points are not focusable. */
  accessibilityLabel: string;
  className?: string;
}

const HEIGHT = 148;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 22;
const PADDING_X = 8;

/**
 * Maximum gap, as a fraction of the window, that the line will bridge before
 * it breaks. A gap is missing data, and a straight line drawn across two
 * weeks of silence asserts a continuity that was never measured.
 */
const MAX_BRIDGED_GAP = 0.18;

/**
 * The Insights trend chart (PRODUCT_SPEC.md §4.5).
 *
 * Custom `react-native-svg` rather than a chart library — svg is already a
 * dependency, the shapes needed here are a path, a band, and a dashed rule,
 * and no library would honor the gaps-not-zeros rule without being fought.
 *
 * The x-axis is *time*, not point index: a day with three check-ins and a day
 * with one occupy the same width, and a week of silence is visibly a week of
 * silence. Points are positioned from `bounds`, so switching range re-scales
 * rather than re-shaping the story.
 */
export function TrendChart({
  points,
  bounds,
  suggestedMax,
  band,
  referenceValue,
  referenceLabel,
  formatValue,
  lineColor = colors.accent.DEFAULT,
  onSelectDay,
  accessibilityLabel,
  className,
}: TrendChartProps) {
  const [width, setWidth] = useState(0);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const startMs = bounds.start.getTime();
  const endMs = bounds.end.getTime();
  const spanMs = Math.max(1, endMs - startMs);

  const maxValue = useMemo(
    () => Math.max(suggestedMax, ...points.map((point) => point.value)),
    [points, suggestedMax]
  );

  const plotWidth = Math.max(0, width - PADDING_X * 2);
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const toX = useCallback(
    (date: Date) => PADDING_X + ((date.getTime() - startMs) / spanMs) * plotWidth,
    [startMs, spanMs, plotWidth]
  );
  const toY = useCallback(
    (value: number) => PADDING_TOP + (1 - Math.min(value, maxValue) / maxValue) * plotHeight,
    [maxValue, plotHeight]
  );

  // Segments rather than one path: the line breaks wherever the record does.
  const segments = useMemo(() => {
    if (plotWidth <= 0) return [];
    const result: string[] = [];
    let current = '';
    let previousTime: number | null = null;

    for (const point of points) {
      const command = `${toX(point.date).toFixed(2)},${toY(point.value).toFixed(2)}`;
      const isBreak =
        previousTime !== null && (point.date.getTime() - previousTime) / spanMs > MAX_BRIDGED_GAP;

      if (isBreak) {
        if (current) result.push(current);
        current = `M${command}`;
      } else {
        current = current ? `${current} L${command}` : `M${command}`;
      }
      previousTime = point.date.getTime();
    }
    if (current) result.push(current);
    return result;
  }, [points, toX, toY, spanMs, plotWidth]);

  const selected = useMemo(
    () => points.find((point) => point.date.getTime() === selectedTime) ?? null,
    [points, selectedTime]
  );

  // One hit target over the whole plot, resolving to the nearest point by x.
  // Cheaper and far more forgiving than per-point touch targets, which at
  // 6M would be 180 sibling views competing for a fingertip.
  const handlePress = useCallback(
    (locationX: number) => {
      if (points.length === 0) return;
      let nearest = points[0]!;
      let bestDistance = Infinity;
      for (const point of points) {
        const distance = Math.abs(toX(point.date) - locationX);
        if (distance < bestDistance) {
          bestDistance = distance;
          nearest = point;
        }
      }
      const isSame = nearest.date.getTime() === selectedTime;
      setSelectedTime(isSame ? null : nearest.date.getTime());
      if (!isSame) onSelectDay?.(nearest);
    },
    [points, toX, selectedTime, onSelectDay]
  );

  return (
    <Card className={className} onLayout={handleLayout}>
      <View className="mb-1 flex-row items-baseline justify-between">
        <SectionHeader>{referenceLabel ?? ''}</SectionHeader>
        {/* Axis cap and the callout below both change as the range or the
            selected day changes — tabular figures keep them from shifting. */}
        <Text
          maxFontSizeMultiplier={2}
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-xs text-ink-faint"
        >
          {formatValue(maxValue)}
        </Text>
      </View>

      <Pressable
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={points.length > 0 ? 'Double tap to inspect a day' : undefined}
        onPress={(event) => handlePress(event.nativeEvent.locationX)}
      >
        {width > 0 ? (
          <Svg width={width - 32} height={HEIGHT}>
            {band ? (
              <Rect
                x={PADDING_X}
                y={toY(band.to)}
                width={plotWidth}
                height={Math.max(0, toY(band.from) - toY(band.to))}
                fill={band.color}
                opacity={0.09}
              />
            ) : null}

            {referenceValue != null ? (
              <Line
                x1={PADDING_X}
                y1={toY(referenceValue)}
                x2={PADDING_X + plotWidth}
                y2={toY(referenceValue)}
                stroke={colors.ink.faint}
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.7}
              />
            ) : null}

            {/* Baseline rule: the floor of the plot, so a sparse series still
                reads as sitting on an axis rather than floating. */}
            <Line
              x1={PADDING_X}
              y1={PADDING_TOP + plotHeight}
              x2={PADDING_X + plotWidth}
              y2={PADDING_TOP + plotHeight}
              stroke={colors.hairline}
              strokeWidth={1}
            />

            {segments.map((segment, index) => (
              <Path
                key={index}
                d={segment}
                stroke={lineColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}

            {points.map((point) => {
              const isSelected = point.date.getTime() === selectedTime;
              return (
                <Circle
                  key={point.date.getTime()}
                  cx={toX(point.date)}
                  cy={toY(point.value)}
                  r={isSelected ? 5 : 3}
                  fill={isSelected ? colors.ink.DEFAULT : lineColor}
                  stroke={isSelected ? lineColor : undefined}
                  strokeWidth={isSelected ? 2 : 0}
                />
              );
            })}
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </Pressable>

      <View className="mt-1 flex-row justify-between">
        <Text maxFontSizeMultiplier={2} className="text-xs text-ink-faint">
          {formatShortDate(bounds.start)}
        </Text>
        {band ? (
          <Text maxFontSizeMultiplier={2} className="text-xs text-ink-faint">
            {band.label}
          </Text>
        ) : null}
        <Text maxFontSizeMultiplier={2} className="text-xs text-ink-faint">
          Now
        </Text>
      </View>

      {selected ? (
        <Animated.View
          entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
          className="mt-3 flex-row items-baseline justify-between rounded-card bg-canvas-overlay px-3 py-2"
        >
          <Text maxFontSizeMultiplier={2} className="text-sm text-ink">
            {formatDayTitle(selected.date)}
          </Text>
          <Text
            maxFontSizeMultiplier={2}
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-sm text-ink-muted"
          >
            {formatValue(selected.value)} ·{' '}
            {selected.sessionCount === 1 ? '1 check-in' : `${selected.sessionCount} check-ins`}
          </Text>
        </Animated.View>
      ) : null}
    </Card>
  );
}
