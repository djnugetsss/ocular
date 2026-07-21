import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState, InlineError } from '@/components/ui/ErrorState';
import { MetricCard } from '@/components/ui/MetricCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/auth-store';
import { durationWeightedBlinkRate } from '@/features/sessions/baseline';
import { SessionRow } from '@/features/sessions/components/SessionRow';
import { isToday } from '@/features/sessions/dates';
import { listRecentSessions } from '@/features/sessions/session-repository';
import { blinkRateTone, colors } from '@/theme/tokens';
import type { Session } from '@/lib/supabase/database.types';

export default function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      setSessions(await listRecentSessions(user.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your sessions.');
    }
  }, [user]);

  // Reload on focus so a session recorded on the Scan tab shows up immediately
  // rather than after an app restart.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void load().finally(() => {
        if (!cancelled) setIsLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const today = sessions.filter((session) => isToday(new Date(session.started_at)));
  const todayMinutes = today.reduce(
    (total, session) => total + (session.duration_seconds ?? 0) / 60,
    0
  );
  // Duration-weighted, same rule the trailing baseline uses: a 30-second
  // session should not count as much as a 20-minute one when describing the day.
  const todayRate = durationWeightedBlinkRate(today);

  // First load shows the shape of what is coming rather than a spinner, so the
  // layout does not jump when data lands.
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Only take over the whole screen when there is genuinely nothing to show.
  // A failed refresh over readable data is handled by the inline banner below.
  if (error && sessions.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
        <ErrorState
          title="Couldn't load your sessions"
          message={error}
          onRetry={() => void handleRefresh()}
          isRetrying={isRefreshing}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <FlatList
        data={sessions}
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
            <Text accessibilityRole="header" className="text-title1 font-semibold text-ink">
              Today
            </Text>

            {error ? (
              <InlineError
                className="mt-4"
                message="Couldn't refresh — showing earlier data."
                onRetry={() => void handleRefresh()}
              />
            ) : null}

            <View className="mt-5 flex-row gap-3">
              <MetricCard
                className="flex-1"
                label="Avg blink rate"
                value={todayRate === null ? '—' : todayRate.toFixed(0)}
                unit="/min"
                tone={blinkRateTone(todayRate)}
              />
              <MetricCard
                className="flex-1"
                label="Tracked"
                value={todayMinutes < 1 ? '0' : todayMinutes.toFixed(0)}
                unit="min"
              />
            </View>

            {sessions.length > 0 ? (
              <Text className="mb-2 mt-8 text-xs font-medium uppercase tracking-wide text-ink-faint">
                Recent sessions
              </Text>
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
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            onPress={() =>
              router.push({ pathname: '/(app)/session/[id]', params: { id: item.id } })
            }
          />
        )}
        ItemSeparatorComponent={() => <View className="h-2" />}
      />
    </SafeAreaView>
  );
}

/** Mirrors the loaded layout so the transition into real data is positional. */
function DashboardSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="px-4 pt-2">
        <Text accessibilityRole="header" className="text-title1 font-semibold text-ink">
          Today
        </Text>

        <View
          accessibilityLabel="Loading your sessions"
          accessibilityLiveRegion="polite"
          className="mt-5 flex-row gap-3"
        >
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
    </SafeAreaView>
  );
}
