import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { MetricCard } from '@/components/ui/MetricCard';
import { useAuthStore } from '@/features/auth/auth-store';
import { listRecentSessions } from '@/features/sessions/session-repository';
import type { Session } from '@/lib/supabase/database.types';

export default function DashboardScreen() {
  const user = useAuthStore((state) => state.user);

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

  const today = sessions.filter((session) => isToday(session.started_at));
  const todayBlinks = today.reduce((total, session) => total + session.blink_count, 0);
  const todayMinutes = today.reduce(
    (total, session) => total + (session.duration_seconds ?? 0) / 60,
    0
  );
  // Weight each session's rate by its duration: a 30-second session should not
  // count as much as a 20-minute one when describing the day.
  const todayRate = todayMinutes > 0 ? todayBlinks / todayMinutes : null;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#5B8DEF" />
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
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#5B8DEF" />
        }
        ListHeaderComponent={
          <View className="pb-4 pt-2">
            <Text className="text-3xl font-semibold text-ink">Today</Text>

            {error ? (
              <View className="mt-4 rounded-card border border-signal-bad/40 bg-signal-bad/10 p-4">
                <Text className="text-sm text-signal-bad">{error}</Text>
              </View>
            ) : null}

            <View className="mt-5 flex-row gap-3">
              <MetricCard
                className="flex-1"
                label="Avg blink rate"
                value={todayRate === null ? '—' : todayRate.toFixed(0)}
                unit="/min"
                tone={
                  todayRate === null
                    ? 'neutral'
                    : todayRate < 8
                      ? 'bad'
                      : todayRate < 12
                        ? 'warn'
                        : 'ok'
                }
              />
              <MetricCard
                className="flex-1"
                label="Tracked"
                value={todayMinutes < 1 ? '0' : todayMinutes.toFixed(0)}
                unit="min"
              />
            </View>

            <Text className="mb-2 mt-8 text-xs font-medium uppercase tracking-wide text-ink-faint">
              Recent sessions
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center gap-2 px-6 py-16">
            <Text className="text-base font-medium text-ink">No sessions yet</Text>
            <Text className="text-center text-sm leading-5 text-ink-muted">
              Open the Scan tab and run your first measurement to start building a baseline.
            </Text>
          </View>
        }
        renderItem={({ item }) => <SessionRow session={item} />}
        ItemSeparatorComponent={() => <View className="h-2" />}
      />
    </SafeAreaView>
  );
}

function SessionRow({ session }: { session: Session }) {
  const started = new Date(session.started_at);
  const minutes = (session.duration_seconds ?? 0) / 60;

  return (
    <View
      accessible
      accessibilityLabel={`Session on ${started.toLocaleDateString()}, ${session.blink_count} blinks over ${minutes.toFixed(0)} minutes`}
      className="flex-row items-center justify-between rounded-card border border-hairline bg-canvas-raised p-4"
    >
      <View className="gap-1">
        <Text className="text-base font-medium text-ink">
          {started.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {' · '}
          {started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </Text>
        <Text className="text-sm text-ink-muted">
          {minutes < 1 ? '<1' : minutes.toFixed(0)} min · {session.blink_count} blinks
        </Text>
      </View>

      <View className="items-end gap-1">
        <Text className="text-lg font-semibold text-ink">
          {session.blinks_per_minute?.toFixed(0) ?? '—'}
          <Text className="text-sm font-normal text-ink-faint"> /min</Text>
        </Text>
        {session.posture_score !== null ? (
          <Text className="text-xs text-ink-faint">Posture {session.posture_score.toFixed(0)}</Text>
        ) : null}
      </View>
    </View>
  );
}

function isToday(isoDate: string): boolean {
  const date = new Date(isoDate);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
