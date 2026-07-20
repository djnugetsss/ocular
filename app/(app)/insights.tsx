import { useCallback, useState } from 'react';
import { RefreshControl, SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState, InlineError } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/auth-store';
import { SessionRow } from '@/features/sessions/components/SessionRow';
import { listRecentSessions } from '@/features/sessions/session-repository';
import { colors } from '@/theme/tokens';
import type { Session } from '@/lib/supabase/database.types';

/**
 * Sessions required before trends mean anything (PRODUCT_SPEC.md §4.5).
 *
 * Below this, a chart would draw a confident line through two points and imply
 * a trend that does not exist. Withholding it is the honest choice, and saying
 * exactly how many more are needed turns a locked feature into a goal.
 */
const MIN_SESSIONS_FOR_TRENDS = 3;

interface DaySection {
  title: string;
  data: Session[];
}

export default function InsightsScreen() {
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
      setSessions(await listRecentSessions(user.id, 100));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your history.');
    }
  }, [user]);

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

  if (isLoading) {
    return <InsightsSkeleton />;
  }

  if (error && sessions.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
        <ErrorState
          title="Couldn't load your history"
          message={error}
          onRetry={() => void handleRefresh()}
          isRetrying={isRefreshing}
        />
      </SafeAreaView>
    );
  }

  const remaining = MIN_SESSIONS_FOR_TRENDS - sessions.length;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <SectionList
        sections={groupByDay(sessions)}
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
            <Text accessibilityRole="header" className="text-title1 font-semibold text-ink">
              Insights
            </Text>

            {error ? (
              <InlineError
                className="mt-4"
                message="Couldn't refresh — showing earlier data."
                onRetry={() => void handleRefresh()}
              />
            ) : null}

            {remaining > 0 ? (
              <View className="mt-5 rounded-card border border-hairline bg-canvas-raised px-4 py-8">
                <Text className="text-center text-base font-semibold text-ink">
                  Trends unlock after a few check-ins
                </Text>
                <Text className="mt-2 text-center text-sm leading-5 text-ink-muted">
                  {remaining} more {remaining === 1 ? 'session' : 'sessions'} and Ocular can start
                  showing how your blink rate and posture change over time.
                </Text>
              </View>
            ) : null}

            {sessions.length > 0 ? (
              <Text className="mb-2 mt-8 text-xs font-medium uppercase tracking-wide text-ink-faint">
                All sessions
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            symbol="chart.bar"
            title="Nothing to chart yet"
            body="Your history builds as you check in. Trends appear once there are a few sessions to compare."
            action={{
              label: 'Start a scan',
              onPress: () => router.navigate('/(app)/scan'),
            }}
          />
        }
        renderSectionHeader={({ section }) => (
          <Text className="pb-2 pt-4 text-sm font-medium text-ink-muted">{section.title}</Text>
        )}
        renderItem={({ item }) => <SessionRow session={item} />}
        ItemSeparatorComponent={() => <View className="h-2" />}
      />
    </SafeAreaView>
  );
}

/**
 * Buckets sessions into day sections, preserving the newest-first order the
 * repository already guarantees.
 *
 * Days with no sessions are simply absent rather than rendered as empty
 * sections — a gap in the record, not a zero. The same principle governs the
 * Phase 3 charts.
 */
function groupByDay(sessions: Session[]): DaySection[] {
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

function formatDayTitle(date: Date): string {
  const now = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  if (isSameDay(date, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function InsightsSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="px-4 pt-2">
        <Text accessibilityRole="header" className="text-title1 font-semibold text-ink">
          Insights
        </Text>

        <View accessibilityLabel="Loading your history" accessibilityLiveRegion="polite">
          <Skeleton className="mt-5 h-[132px]" />
          <Skeleton className="mb-3 mt-8 h-3 w-24 rounded-md" />
          <View className="gap-2">
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
