import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ErrorState, InlineError } from '@/components/ui/ErrorState';
import { MetricCard } from '@/components/ui/MetricCard';
import { Screen } from '@/components/ui/Screen';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/auth-store';
import { useProfileStore } from '@/features/profile/profile-store';
import {
  blinkRateDelta,
  durationWeightedBlinkRate,
  trailingBaseline,
} from '@/features/sessions/baseline';
import { SessionRow } from '@/features/sessions/components/SessionRow';
import { isSameDay, isToday } from '@/features/sessions/dates';
import {
  listRecentSessionsPage,
  type SessionListRow,
} from '@/features/sessions/session-repository';
import { useSessionList } from '@/features/sessions/use-session-list';
import { PlanLimitCard } from '@/features/subscription/components/PlanLimitCard';
import { checkInAllowance, visibleSessions } from '@/features/subscription/entitlements';
import { useEntitlements } from '@/features/subscription/subscription-provider';
import { dailySentence } from '@/features/today/daily-sentence';
import { WellnessRing } from '@/features/today/WellnessRing';
import { blinkRateTone, colors, postureTone } from '@/theme/tokens';

/** Shown when the profile is unreadable; matches onboarding's middle option. */
const FALLBACK_TARGET_SESSIONS = 3;

export default function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const targetSessions =
    useProfileStore((state) => state.profile?.daily_target_sessions) ?? FALLBACK_TARGET_SESSIONS;
  const entitlements = useEntitlements();
  const router = useRouter();

  // Reload-on-focus is what fills the ring the moment the user returns from a
  // completed scan; the shared hook owns that plus refresh and the race guard.
  const userId = user?.id ?? null;
  // The exact history size, captured from the same round trip that loads the
  // window below, so a free user's "N older kept" counts *all* their sessions
  // rather than only those inside the fetched window.
  const [totalSessions, setTotalSessions] = useState<number | null>(null);
  const fetchSessions = useCallback(async () => {
    if (!userId) return [];
    const page = await listRecentSessionsPage(userId);
    setTotalSessions(page.total);
    return page.rows;
  }, [userId]);
  const {
    sessions,
    isLoading,
    isRefreshing,
    error,
    refresh: handleRefresh,
  } = useSessionList(userId ? fetchSessions : null, 'Could not load your sessions.');

  // Stable across renders so the memoized rows stay memoized.
  const handleOpenSession = useCallback(
    (sessionId: string) =>
      router.push({ pathname: '/(app)/session/[id]', params: { id: sessionId } }),
    [router]
  );

  // ── Today's aggregates ─────────────────────────────────────────────────────
  // Memoized as one block: this runs a filter, three weighted reductions, and
  // a sort over the whole history, and without it every unrelated render
  // (refresh flag, profile write, scroll-driven state) redoes all of it.
  const { now, today, todayRate, todayPosture, sentence } = useMemo(() => {
    const at = new Date();
    const todaySessions = sessions.filter((session) => isToday(new Date(session.started_at), at));
    // Duration-weighted, same rule the trailing baseline uses: a 30-second
    // session should not count as much as a 20-minute one for the day.
    const rate = durationWeightedBlinkRate(todaySessions);

    // The hero sentence's ingredients. The baseline is cut off at midnight so
    // today's sessions cannot be compared against themselves, and yesterday's
    // rate exists purely so an empty morning can lead with continuity.
    const startOfToday = new Date(at);
    startOfToday.setHours(0, 0, 0, 0);
    const yesterday = new Date(startOfToday);
    yesterday.setDate(startOfToday.getDate() - 1);

    return {
      now: at,
      today: todaySessions,
      todayRate: rate,
      todayPosture: durationWeightedPostureScore(todaySessions),
      sentence: dailySentence({
        todayCount: todaySessions.length,
        targetCount: targetSessions,
        todayRate: rate,
        yesterdayRate: durationWeightedBlinkRate(
          sessions.filter((session) => isSameDay(new Date(session.started_at), yesterday))
        ),
        hasHistory: sessions.length > 0,
        delta: blinkRateDelta(rate, trailingBaseline(sessions, { startedAt: startOfToday })),
      }),
    };
  }, [sessions, targetSessions]);

  // ── Plan limits ────────────────────────────────────────────────────────────
  // Presentation only. Every aggregate above — the ring, both metric cards,
  // the hero sentence — was computed from the *full* history a few lines
  // earlier, and every row this hides is still stored, still exported, and
  // back the moment the user upgrades.
  const history = useMemo(
    () => visibleSessions(sessions, entitlements, totalSessions),
    [sessions, entitlements, totalSessions]
  );
  const allowance = checkInAllowance(entitlements, today.length);

  // First load shows the shape of what is coming rather than a spinner, so the
  // layout does not jump when data lands.
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Only take over the whole screen when there is genuinely nothing to show.
  // A failed refresh over readable data is handled by the inline banner below.
  if (error && sessions.length === 0) {
    return (
      <Screen>
        <ErrorState
          title="Couldn't load your sessions"
          message={error}
          onRetry={() => void handleRefresh()}
          isRetrying={isRefreshing}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={history.visible}
        keyExtractor={(session) => session.id}
        contentContainerClassName="px-4 pb-8"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent.DEFAULT}
          />
        }
        ListHeaderComponent={
          <View className="pb-4 pt-2">
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={1.4}
              className="text-title1 font-semibold text-ink"
            >
              Today
            </Text>
            <Text maxFontSizeMultiplier={2} className="mt-0.5 text-sm text-ink-muted">
              {now.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>

            {error ? (
              <InlineError
                className="mt-4"
                message="Couldn't refresh — showing earlier data."
                onRetry={() => void handleRefresh()}
              />
            ) : null}

            {/* The hero (PRODUCT_SPEC.md §4.2): progress against the daily
                target, today's rate at the center, one plain sentence. */}
            <View className="mt-6">
              <WellnessRing
                sessionsToday={today.length}
                targetSessions={targetSessions}
                todayRate={todayRate}
                sentence={sentence}
              />
            </View>

            <View className="mt-6 flex-row gap-3">
              <MetricCard
                className="flex-1"
                label="Blink rate"
                value={todayRate === null ? '—' : todayRate.toFixed(0)}
                unit="/min"
                tone={blinkRateTone(todayRate)}
              />
              <MetricCard
                className="flex-1"
                label="Posture"
                value={todayPosture === null ? '—' : todayPosture.toFixed(0)}
                unit="/100"
                tone={postureTone(todayPosture)}
              />
            </View>

            {/* Stated plainly rather than as a warning: on a plan with a
                daily allowance, knowing where you stand is part of planning
                the day. Pro users see nothing here. */}
            {allowance.isUnlimited || allowance.isUsageUnknown ? null : (
              <Text maxFontSizeMultiplier={2} className="mt-3 text-center text-xs text-ink-faint">
                {`${allowance.used} of ${allowance.limit} check-ins today`}
              </Text>
            )}

            {sessions.length > 0 ? (
              <SectionHeader className="mb-2 mt-8">Recent sessions</SectionHeader>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            symbol="eye"
            title="No check-ins yet"
            body="Run your first scan to see your baseline. It takes about two minutes."
            action={{
              label: 'Start your first scan',
              onPress: () => router.navigate('/(app)/(tabs)/scan'),
            }}
          />
        }
        ListFooterComponent={
          history.hiddenCount > 0 ? (
            // Trigger 4: scrolling past the tenth visible session lands here
            // — the exact moment the limit becomes real, answered in place.
            <PlanLimitCard
              className="mt-3"
              symbol="clock.arrow.circlepath"
              title={`${history.hiddenCount} older check-${history.hiddenCount === 1 ? 'in' : 'ins'} kept`}
              body={`Your plan shows the ${history.limit} most recent here. Nothing older was deleted — it stays in your history and in your export.`}
              action={{
                label: 'See Ocular Pro',
                onPress: () =>
                  router.push({ pathname: '/(app)/premium', params: { trigger: 'history' } }),
              }}
            />
          ) : null
        }
        renderItem={({ item }) => <SessionRow session={item} onPress={handleOpenSession} />}
        ItemSeparatorComponent={() => <View className="h-2" />}
      />
    </Screen>
  );
}

/**
 * Today's average posture, weighted by measured time — the same fairness rule
 * as the blink figure, kept local because posture has no baseline math to
 * share with `baseline.ts` yet.
 */
function durationWeightedPostureScore(
  sessions: readonly Pick<SessionListRow, 'duration_seconds' | 'posture_score'>[]
): number | null {
  let weighted = 0;
  let minutes = 0;
  for (const session of sessions) {
    if (session.duration_seconds == null || session.duration_seconds <= 0) continue;
    if (session.posture_score == null) continue;
    weighted += session.posture_score * (session.duration_seconds / 60);
    minutes += session.duration_seconds / 60;
  }
  return minutes > 0 ? weighted / minutes : null;
}

/** Mirrors the loaded layout so the transition into real data is positional. */
function DashboardSkeleton() {
  return (
    <Screen>
      <View className="px-4 pt-2">
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={1.4}
          className="text-title1 font-semibold text-ink"
        >
          Today
        </Text>
        <Skeleton className="mt-1.5 h-3.5 w-40 rounded-md" />

        <View
          accessibilityLabel="Loading your day"
          accessibilityLiveRegion="polite"
          className="mt-6 items-center"
        >
          <Skeleton className="h-[140px] w-[140px] rounded-full" />
          <Skeleton className="mt-4 h-3.5 w-28 rounded-md" />
          <Skeleton className="mt-3 h-4 w-56 rounded-md" />
        </View>

        <View className="mt-6 flex-row gap-3">
          <Skeleton className="h-[104px] flex-1" />
          <Skeleton className="h-[104px] flex-1" />
        </View>

        <Skeleton className="mb-3 mt-8 h-3 w-32 rounded-md" />

        <View className="gap-2">
          <Skeleton className="h-[76px]" />
          <Skeleton className="h-[76px]" />
          <Skeleton className="h-[76px]" />
        </View>
      </View>
    </Screen>
  );
}
