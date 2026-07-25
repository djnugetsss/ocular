import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState, InlineError } from '@/components/ui/ErrorState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Screen } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/auth-store';
import { InsightCard } from '@/features/insights/InsightCard';
import {
  MIN_SESSIONS_FOR_TRENDS,
  RANGE_DAYS,
  RANGE_DESCRIPTIONS,
  compareMetric,
  dailySeries,
  previousRangeBounds,
  rangeBounds,
  rangeMetrics,
  sessionsInRange,
  timeOfDayPattern,
  type InsightsRange,
} from '@/features/insights/insights-aggregator';
import { TrendCard } from '@/features/insights/TrendCard';
import { TrendChart } from '@/features/insights/TrendChart';
import { SessionRow } from '@/features/sessions/components/SessionRow';
import { formatDayTitle, formatDuration } from '@/features/sessions/dates';
import { listSessionsSince, type SessionListRow } from '@/features/sessions/session-repository';
import { useSessionList } from '@/features/sessions/use-session-list';
import { LockedInsightsCard } from '@/features/subscription/components/LockedInsightsCard';
import { PlanLimitCard } from '@/features/subscription/components/PlanLimitCard';
import { visibleSessions } from '@/features/subscription/entitlements';
import { useEntitlements } from '@/features/subscription/subscription-provider';
import { blinkRateTone, colors, postureTone, thresholds } from '@/theme/tokens';

/**
 * Sessions shown before "Load more" appears, and the step it adds.
 *
 * The history list is the least urgent thing on this screen — the charts and
 * trend cards are why the tab exists — so it starts small and stays out of
 * the way of the analytics above it.
 */
const PAGE_SIZE = 10;

const RANGE_OPTIONS: { value: InsightsRange; label: string; accessibilityLabel: string }[] = [
  { value: 'W', label: 'W', accessibilityLabel: 'Past week' },
  { value: 'M', label: 'M', accessibilityLabel: 'Past month' },
  { value: '6M', label: '6M', accessibilityLabel: 'Past six months' },
];

interface DaySection {
  title: string;
  data: SessionListRow[];
}

export default function InsightsScreen() {
  const user = useAuthStore((state) => state.user);
  const entitlements = useEntitlements();
  const router = useRouter();

  const [range, setRange] = useState<InsightsRange>('W');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // One fetch covers every range: the widest window is loaded and the narrower
  // ones are derived in memory, so switching W/M/6M is instant and never shows
  // a spinner over data the app already has.
  const userId = user?.id ?? null;
  const fetchSessions = useCallback(() => {
    if (!userId) return Promise.resolve([]);
    const since = new Date();
    since.setDate(since.getDate() - RANGE_DAYS['6M']);
    since.setHours(0, 0, 0, 0);
    return listSessionsSince(userId, since);
  }, [userId]);

  const {
    sessions,
    isLoading,
    isRefreshing,
    error,
    refresh: handleRefresh,
  } = useSessionList(userId ? fetchSessions : null, 'Could not load your history.');

  // Stable across renders so the memoized rows stay memoized.
  const handleOpenSession = useCallback(
    (sessionId: string) =>
      router.push({ pathname: '/(app)/session/[id]', params: { id: sessionId } }),
    [router]
  );

  const handleRangeChange = useCallback((next: InsightsRange) => {
    setRange(next);
    // A narrower range with a deep list scrolled open would strand the user
    // in an empty tail; every range starts at its first page.
    setVisibleCount(PAGE_SIZE);
  }, []);

  // ── Analytics ─────────────────────────────────────────────────────────────
  // Recomputed only when the data or the range actually changes: this is the
  // expensive part of the screen, and it must not run on every scroll frame.
  const analytics = useMemo(() => {
    const now = new Date();
    const bounds = rangeBounds(range, now);
    const previousBounds = previousRangeBounds(range, now);

    const inRange = sessionsInRange(sessions, bounds);
    const previous = sessionsInRange(sessions, previousBounds);
    const current = rangeMetrics(inRange);
    const prior = rangeMetrics(previous);

    return {
      bounds,
      inRange,
      current,
      prior,
      blinkPoints: dailySeries(inRange, 'blinkRate'),
      posturePoints: dailySeries(inRange, 'posture'),
      pattern: timeOfDayPattern(inRange),
      comparisons: {
        blinkRate: compareMetric(current.blinkRate, prior.blinkRate, prior.sessionCount),
        consistency: compareMetric(
          current.blinkConsistency,
          prior.blinkConsistency,
          prior.sessionCount
        ),
        steadiness: compareMetric(current.headSteadiness, prior.headSteadiness, prior.sessionCount),
        duration: compareMetric(
          current.meanDurationSeconds,
          prior.meanDurationSeconds,
          prior.sessionCount
        ),
      },
    };
  }, [sessions, range]);

  // ── Plan limits ────────────────────────────────────────────────────────────
  // The gate sits between the analytics and the list, on purpose. Everything
  // above — every average, every comparison, the pattern — is computed from
  // all sessions in range, because a plan that quietly narrowed the maths
  // would show a free user *wrong numbers* rather than fewer rows. Only the
  // history list is capped, and only visually.
  const history = useMemo(
    () => visibleSessions(analytics.inRange, entitlements),
    [analytics.inRange, entitlements]
  );

  const sections = useMemo(
    () => groupByDay(history.visible.slice(0, visibleCount)),
    [history.visible, visibleCount]
  );
  // Rows this plan *would* page in, distinct from rows it will not show at all.
  const pagedCount = history.visible.length - visibleCount;

  if (isLoading) {
    return <InsightsSkeleton />;
  }

  if (error && sessions.length === 0) {
    return (
      <Screen>
        <ErrorState
          title="Couldn't load your history"
          message={error}
          onRetry={() => void handleRefresh()}
          isRetrying={isRefreshing}
        />
      </Screen>
    );
  }

  const { current, bounds } = analytics;
  const hasTrends = current.sessionCount >= MIN_SESSIONS_FOR_TRENDS;
  const remaining = MIN_SESSIONS_FOR_TRENDS - current.sessionCount;

  return (
    <Screen>
      <SectionList
        sections={sections}
        keyExtractor={(session) => session.id}
        contentContainerClassName="px-4 pb-8"
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent.DEFAULT}
          />
        }
        ListHeaderComponent={
          <View className="pb-2 pt-2">
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={1.4}
              className="text-title1 font-semibold text-ink"
            >
              Insights
            </Text>

            <SegmentedControl
              className="mt-4"
              options={RANGE_OPTIONS}
              value={range}
              onChange={handleRangeChange}
            />

            {error ? (
              <InlineError
                className="mt-4"
                message="Couldn't refresh — showing earlier data."
                onRetry={() => void handleRefresh()}
              />
            ) : null}

            {/* Keyed on range so a switch crossfades the whole analytics
                block rather than letting charts pop in place (§4 loading). */}
            <Animated.View
              key={range}
              entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
            >
              {hasTrends ? (
                <View className="mt-5 gap-3">
                  {/* Trigger 3: opening Insights with charts locked. The
                      frosted preview stands where the TrendCharts would —
                      the shape of what Pro unlocks, decorative underneath so
                      no real data leaks through the frost. The four summary
                      cards below stay on every plan: basic statistics are
                      part of the measurement, not an upsell. */}
                  {!entitlements.hasFullInsights ? (
                    <LockedInsightsCard
                      onUnlock={() =>
                        router.push({
                          pathname: '/(app)/premium',
                          params: { trigger: 'insights' },
                        })
                      }
                    />
                  ) : null}

                  {entitlements.hasFullInsights ? (
                    <>
                      <TrendChart
                        points={analytics.blinkPoints}
                        bounds={bounds}
                        suggestedMax={20}
                        band={{
                          from: 0,
                          to: thresholds.blinkRate.low,
                          color: colors.signal.warn,
                          label: `low · under ${thresholds.blinkRate.low}`,
                        }}
                        referenceValue={current.blinkRate}
                        referenceLabel="Blink rate /min"
                        formatValue={(value) => `${value.toFixed(0)}/min`}
                        accessibilityLabel={describeSeries(
                          'Blink rate',
                          analytics.blinkPoints.length,
                          current.blinkRate,
                          '/min',
                          range
                        )}
                      />

                      <TrendChart
                        points={analytics.posturePoints}
                        bounds={bounds}
                        suggestedMax={100}
                        band={{
                          from: thresholds.postureScore.good,
                          to: 100,
                          color: colors.signal.ok,
                          label: `steady · ${thresholds.postureScore.good}+`,
                        }}
                        referenceValue={current.postureScore}
                        referenceLabel="Posture /100"
                        formatValue={(value) => value.toFixed(0)}
                        lineColor={colors.signal.ok}
                        accessibilityLabel={describeSeries(
                          'Posture',
                          analytics.posturePoints.length,
                          current.postureScore,
                          'out of 100',
                          range
                        )}
                      />
                    </>
                  ) : null}

                  {/* Comparison chips travel with the charts: a delta against
                      the previous range is the same longitudinal reading the
                      trend lines give, so it belongs to the same tier. The
                      cards themselves — this range's averages — do not. */}
                  <View className="flex-row gap-3">
                    <TrendCard
                      label="Avg blink rate"
                      value={current.blinkRate == null ? '—' : current.blinkRate.toFixed(0)}
                      unit="/min"
                      tone={blinkRateTone(current.blinkRate)}
                      comparison={
                        entitlements.hasFullInsights ? analytics.comparisons.blinkRate : null
                      }
                      hint="Duration-weighted"
                    />
                    <TrendCard
                      label="Consistency"
                      value={
                        current.blinkConsistency == null ? '—' : current.blinkConsistency.toFixed(0)
                      }
                      unit="/100"
                      comparison={
                        entitlements.hasFullInsights ? analytics.comparisons.consistency : null
                      }
                      hint="How alike your sessions are"
                    />
                  </View>

                  <View className="flex-row gap-3">
                    <TrendCard
                      label="Head steadiness"
                      value={
                        current.headSteadiness == null ? '—' : current.headSteadiness.toFixed(0)
                      }
                      unit="/100"
                      tone={postureTone(current.headSteadiness)}
                      comparison={
                        entitlements.hasFullInsights ? analytics.comparisons.steadiness : null
                      }
                      hint="How centered you sat"
                    />
                    <TrendCard
                      label="Avg session"
                      value={formatDuration(current.meanDurationSeconds)}
                      comparison={
                        entitlements.hasFullInsights ? analytics.comparisons.duration : null
                      }
                      higherIsBetter="neutral"
                      hint={`${current.sessionCount} check-ins · ${current.totalMinutes.toFixed(0)} min`}
                    />
                  </View>

                  {entitlements.hasFullInsights && analytics.pattern ? (
                    <InsightCard symbol="clock" title="Time of day" body={analytics.pattern.text} />
                  ) : null}
                </View>
              ) : (
                <Card padded={false} className="mt-5 px-4 py-8">
                  <Text
                    maxFontSizeMultiplier={2}
                    className="text-center text-base font-semibold text-ink"
                  >
                    Trends unlock after a few check-ins
                  </Text>
                  <Text
                    maxFontSizeMultiplier={2}
                    className="mt-2 text-center text-sm leading-5 text-ink-muted"
                  >
                    {current.sessionCount === 0
                      ? `No check-ins in the ${RANGE_DESCRIPTIONS[range].toLowerCase()} yet.`
                      : `${remaining} more ${remaining === 1 ? 'session' : 'sessions'} in this range and Ocular can chart how your blink rate and posture change over time.`}
                  </Text>
                </Card>
              )}
            </Animated.View>

            {analytics.inRange.length > 0 ? (
              <SectionHeader className="mb-2 mt-8">
                {`${RANGE_DESCRIPTIONS[range]} · ${analytics.inRange.length} ${
                  analytics.inRange.length === 1 ? 'session' : 'sessions'
                }`}
              </SectionHeader>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          sessions.length === 0 ? (
            <EmptyState
              symbol="chart.bar"
              title="Nothing to chart yet"
              body="Your history builds as you check in. Trends appear once there are a few sessions to compare."
              action={{
                label: 'Start a scan',
                onPress: () => router.navigate('/(app)/(tabs)/scan'),
              }}
            />
          ) : (
            <EmptyState
              symbol="calendar"
              title="Nothing in this range"
              body="Try a wider range to see your earlier check-ins."
            />
          )
        }
        ListFooterComponent={
          pagedCount > 0 ? (
            <Card
              padded={false}
              accessibilityRole="button"
              accessibilityLabel={`Load more sessions. ${pagedCount} remaining.`}
              onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
              className="mt-3 items-center py-3"
            >
              <Text maxFontSizeMultiplier={2} className="text-sm font-medium text-accent">
                Load {Math.min(pagedCount, PAGE_SIZE)} more
              </Text>
              <Text maxFontSizeMultiplier={2} className="mt-0.5 text-xs text-ink-faint">
                {pagedCount} older {pagedCount === 1 ? 'session' : 'sessions'} in this range
              </Text>
            </Card>
          ) : history.hiddenCount > 0 ? (
            // Trigger 4's sibling: same moment as Today's footer, reached by
            // scrolling past the last row this plan lists.
            <PlanLimitCard
              className="mt-3"
              symbol="clock.arrow.circlepath"
              title={`${history.hiddenCount} more check-${history.hiddenCount === 1 ? 'in' : 'ins'} in this range`}
              body={`Your plan lists the ${history.limit} most recent. The rest are still stored — they count toward every average on this screen and are included in your data export.`}
              action={{
                label: 'See Ocular Pro',
                onPress: () =>
                  router.push({ pathname: '/(app)/premium', params: { trigger: 'history' } }),
              }}
            />
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text maxFontSizeMultiplier={2} className="pb-2 pt-4 text-sm font-medium text-ink-muted">
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => <SessionRow session={item} onPress={handleOpenSession} />}
        ItemSeparatorComponent={() => <View className="h-2" />}
        // One page fills the first screen; `visibleCount` already bounds the
        // data, so virtualization has little left to trim. `removeClippedSubviews`
        // is deliberately off — on iOS it blanks rows under a tall header, and
        // this header is two charts and six cards tall.
        initialNumToRender={PAGE_SIZE}
      />
    </Screen>
  );
}

/** Spoken summary of a chart, since its points are not individually focusable. */
function describeSeries(
  name: string,
  pointCount: number,
  average: number | null,
  unit: string,
  range: InsightsRange
): string {
  if (pointCount === 0) return `${name} chart, no data in the ${RANGE_DESCRIPTIONS[range]}`;
  const averageText = average == null ? 'no average' : `averaging ${average.toFixed(0)} ${unit}`;
  return `${name} chart, ${pointCount} ${pointCount === 1 ? 'day' : 'days'} with check-ins over the ${RANGE_DESCRIPTIONS[range].toLowerCase()}, ${averageText}`;
}

/**
 * Buckets sessions into day sections, preserving the newest-first order the
 * repository already guarantees.
 *
 * Days with no sessions are simply absent rather than rendered as empty
 * sections — a gap in the record, not a zero. The same principle governs the
 * charts above.
 */
function groupByDay(sessions: SessionListRow[]): DaySection[] {
  const sections: DaySection[] = [];
  let currentKey: string | null = null;

  for (const session of sessions) {
    const started = new Date(session.started_at);
    const key = started.toDateString();

    if (key !== currentKey) {
      currentKey = key;
      sections.push({ title: formatDayTitle(started), data: [] });
    }
    sections[sections.length - 1]!.data.push(session);
  }

  return sections;
}

/** Mirrors the loaded layout so the transition into real data is positional. */
function InsightsSkeleton() {
  return (
    <Screen>
      <View className="px-4 pt-2">
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={1.4}
          className="text-title1 font-semibold text-ink"
        >
          Insights
        </Text>

        <View accessibilityLabel="Loading your history" accessibilityLiveRegion="polite">
          <Skeleton className="mt-4 h-11 rounded-card" />
          <Skeleton className="mt-5 h-[212px]" />
          <Skeleton className="mt-3 h-[212px]" />
          <View className="mt-3 flex-row gap-3">
            <Skeleton className="h-[116px] flex-1" />
            <Skeleton className="h-[116px] flex-1" />
          </View>
          <Skeleton className="mb-3 mt-8 h-3 w-32 rounded-md" />
          <View className="gap-2">
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
          </View>
        </View>
      </View>
    </Screen>
  );
}
