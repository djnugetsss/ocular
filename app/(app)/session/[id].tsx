import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { MetricCard } from '@/components/ui/MetricCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/auth-store';
import {
  SIGNIFICANT_DELTA_PERCENT,
  blinkRateDelta,
  sessionVerdict,
  trailingBaseline,
  verdictWithoutBaseline,
  type TrailingBaseline,
} from '@/features/sessions/baseline';
import { formatClockTime, formatDayTitle, formatDuration } from '@/features/sessions/dates';
import {
  deleteSession,
  getSession,
  listRecentSessions,
  saveSession,
} from '@/features/sessions/session-repository';
import { useSessionResultsStore } from '@/features/sessions/session-results-store';
import { cn } from '@/lib/cn';
import { blinkRateTone, colors, postureTone, type Tone } from '@/theme/tokens';
import type { Session } from '@/lib/supabase/database.types';

/**
 * Session Results (PRODUCT_SPEC.md §4.4): the payoff moment of a check-in.
 *
 * Reached two ways, and the data path differs on purpose:
 *
 * - **Post-scan** — the summary arrives in memory via the results store and
 *   renders immediately; only the baseline comparison waits on the network.
 *   When the save failed, the screen still opens (the measurement is never
 *   lost to a network error) with an amber not-saved banner and a retry.
 * - **From history** — any `SessionRow` on Today or Insights; the row is
 *   fetched by id behind a layout-mirroring skeleton.
 */

/** What the screen renders, unified across the in-memory and fetched paths. */
interface ResultsView {
  /** Database id, or `null` while the session exists only in memory. */
  savedId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  blinkCount: number;
  blinksPerMinute: number | null;
  meanBlinkDurationMs: number | null;
  postureScore: number | null;
}

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  ok: 'text-signal-ok',
  warn: 'text-signal-warn',
  bad: 'text-signal-bad',
};

const TONE_COLOR: Record<Tone, string> = {
  neutral: colors.ink.muted,
  ok: colors.signal.ok,
  warn: colors.signal.warn,
  bad: colors.signal.bad,
};

export default function SessionResultsScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const isPostScan = from === 'scan';
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const handoff = useSessionResultsStore((state) => state.handoff);
  const markSaved = useSessionResultsStore((state) => state.markSaved);
  const clearHandoff = useSessionResultsStore((state) => state.clear);

  // The in-memory path only engages when the handoff is for *this* route id —
  // a leftover handoff from an earlier scan must never shadow a row the user
  // opened from history.
  const memory = handoff && id && handoff.key === id ? handoff : null;

  const [fetched, setFetched] = useState<Session | null>(null);
  const [fetchState, setFetchState] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    'loading'
  );

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (memory || !id) return;
    let cancelled = false;

    getSession(id)
      .then((row) => {
        if (cancelled) return;
        setFetched(row);
        setFetchState(row ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setFetchState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [memory, id, reloadKey]);

  const retryLoad = useCallback(() => {
    setFetchState('loading');
    setReloadKey((key) => key + 1);
  }, []);

  const view = useMemo<ResultsView | null>(() => {
    if (memory) {
      const summary = memory.summary;
      return {
        savedId: memory.session?.id ?? null,
        startedAt: summary.startedAt,
        endedAt: summary.endedAt,
        durationSeconds: summary.durationSeconds,
        blinkCount: summary.blinkCount,
        blinksPerMinute: summary.blinksPerMinute,
        meanBlinkDurationMs: summary.meanBlinkDurationMs,
        postureScore: summary.postureScore,
      };
    }
    if (fetched) {
      return {
        savedId: fetched.id,
        startedAt: new Date(fetched.started_at),
        endedAt: fetched.ended_at ? new Date(fetched.ended_at) : null,
        durationSeconds: fetched.duration_seconds,
        blinkCount: fetched.blink_count,
        blinksPerMinute: fetched.blinks_per_minute,
        meanBlinkDurationMs: fetched.mean_blink_duration_ms,
        postureScore: fetched.posture_score,
      };
    }
    return null;
  }, [memory, fetched]);

  // ── Baseline ───────────────────────────────────────────────────────────────
  // Fetched independently so the hero number renders instantly post-scan and
  // only the comparison waits. A failed fetch downgrades the verdict to
  // absolute thresholds rather than pretending this is a first session.
  const [baseline, setBaseline] = useState<TrailingBaseline | null>(null);
  const [baselineState, setBaselineState] = useState<'loading' | 'ready' | 'failed'>('loading');

  const startedAtMs = view ? view.startedAt.getTime() : null;
  const savedId = view?.savedId ?? null;

  // No synchronous reset to 'loading' here: the initial state covers mount,
  // and on the one re-run (retry-save assigning a real id) keeping the settled
  // verdict visible while the refetch lands beats a flash of skeleton.
  useEffect(() => {
    if (!user || startedAtMs === null) return;
    let cancelled = false;

    listRecentSessions(user.id, 40)
      .then((rows) => {
        if (cancelled) return;
        setBaseline(trailingBaseline(rows, { id: savedId, startedAt: new Date(startedAtMs) }));
        setBaselineState('ready');
      })
      .catch(() => {
        if (!cancelled) setBaselineState('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [user, startedAtMs, savedId]);

  const verdict =
    view === null || baselineState === 'loading'
      ? null
      : baselineState === 'failed'
        ? verdictWithoutBaseline(view)
        : sessionVerdict(view, baseline);
  const delta =
    view && baselineState === 'ready' ? blinkRateDelta(view.blinksPerMinute, baseline) : null;

  // ── Retry save ─────────────────────────────────────────────────────────────
  const [isRetrying, setIsRetrying] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleRetrySave = useCallback(async () => {
    if (!memory || !user) return;
    setIsRetrying(true);
    setSaveError(null);
    try {
      const saved = await saveSession(memory.summary, user.id);
      if (saved) markSaved(saved);
    } catch {
      setSaveError("Still couldn't reach the server. Your measurement stays on this screen.");
    } finally {
      setIsRetrying(false);
    }
  }, [memory, user, markSaved]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (!savedId) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteSession(savedId);
      // Today and Insights refetch on focus, so the row disappears without
      // any cross-screen bookkeeping here.
      if (memory) clearHandoff();
      router.back();
    } catch {
      // Not optimistic on purpose: the row is only gone from the UI once the
      // server agrees it is gone.
      setDeleteError("Couldn't delete this session — check your connection and try again.");
      setIsDeleting(false);
    }
  }, [savedId, memory, clearHandoff, router]);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      'Delete this session?',
      'This check-in will be removed from your history. There is no undo.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void handleDelete() },
      ]
    );
  }, [handleDelete]);

  // ── Leaving ────────────────────────────────────────────────────────────────
  const leave = useCallback(() => {
    router.back();
    // Post-scan, "Done" completes the ritual and lands on Today — not back on
    // the scan viewfinder, whose session is already over.
    if (isPostScan) router.navigate('/(app)/(tabs)');
  }, [router, isPostScan]);

  const handleLeave = useCallback(() => {
    if (view && view.savedId === null) {
      // An unsaved measurement dies with this screen; leaving deserves the
      // same friction as any other destructive step.
      Alert.alert('Leave without saving?', "This check-in wasn't saved and will be lost.", [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: leave },
      ]);
      return;
    }
    leave();
  }, [view, leave]);

  // ── Hero entrance (DESIGN_REVIEW.md §6): fade + 8 pt rise ─────────────────
  const appear = useSharedValue(0);

  useEffect(() => {
    appear.value = withTiming(1, {
      duration: 350,
      easing: Easing.out(Easing.ease),
      reduceMotion: ReduceMotion.System,
    });
  }, [appear]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ translateY: (1 - appear.value) * 8 }],
  }));

  // ── Empty / error / loading branches ──────────────────────────────────────
  if (!view) {
    if (fetchState === 'missing') {
      return (
        <SafeAreaView className="flex-1 bg-canvas">
          <ErrorState
            title="This session isn't available"
            message="It may have been deleted on another device."
            onRetry={() => router.back()}
            retryLabel="Go back"
          />
        </SafeAreaView>
      );
    }
    if (fetchState === 'error') {
      return (
        <SafeAreaView className="flex-1 bg-canvas">
          <ErrorState
            title="Couldn't load this session"
            message="Check your connection and try again."
            onRetry={retryLoad}
          />
        </SafeAreaView>
      );
    }
    return <ResultsSkeleton />;
  }

  const rateTone = blinkRateTone(view.blinksPerMinute);
  const chipTone: Tone =
    delta && Math.abs(delta.percent) >= SIGNIFICANT_DELTA_PERCENT
      ? delta.direction === 'above'
        ? 'ok'
        : 'warn'
      : 'neutral';

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-8"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-start justify-between pt-2">
          <View className="flex-1 pr-4">
            <Text accessibilityRole="header" className="text-title1 font-semibold text-ink">
              {isPostScan ? 'Check-in complete' : formatDayTitle(view.startedAt)}
            </Text>
            <Text className="mt-1 text-sm text-ink-muted">
              Completed {formatClockTime(view.endedAt ?? view.startedAt)}
              {' · '}
              {formatDuration(view.durationSeconds)}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPostScan ? 'Close' : 'Back'}
            onPress={handleLeave}
            hitSlop={8}
            className="mt-1 h-10 w-10 items-center justify-center rounded-full bg-canvas-raised active:bg-canvas-overlay"
          >
            <Icon
              name={isPostScan ? 'xmark' : 'chevron.backward'}
              size={15}
              color={colors.ink.muted}
            />
          </Pressable>
        </View>

        {/* Retry-save banner */}
        {view.savedId === null ? (
          <View
            accessibilityLiveRegion="polite"
            className="mt-5 rounded-card border border-signal-warn/30 bg-signal-warn/10 p-4"
          >
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-signal-warn">Not saved yet</Text>
                <Text className="mt-1 text-xs leading-4 text-ink-muted">
                  The measurement is safe on this screen, but couldn&apos;t be written to your
                  history.
                </Text>
              </View>
              <Button
                label="Retry"
                variant="secondary"
                isLoading={isRetrying}
                onPress={() => void handleRetrySave()}
                className="min-h-0 px-4 py-2"
              />
            </View>
            {saveError ? (
              <Text className="mt-2 text-xs leading-4 text-signal-bad">{saveError}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Hero */}
        <Animated.View
          style={heroStyle}
          accessible
          accessibilityLabel={[
            view.blinksPerMinute != null
              ? `Blink rate ${Math.round(view.blinksPerMinute)} per minute`
              : 'Blink rate unavailable',
            delta ? delta.label : null,
            verdict ? verdict.sentence : 'Comparing with your baseline',
          ]
            .filter(Boolean)
            .join('. ')}
          className="mt-6 items-center rounded-card border border-hairline bg-canvas-raised px-6 py-8"
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-canvas-overlay">
            <Icon
              name={verdict?.symbol ?? 'hourglass'}
              size={20}
              color={verdict ? TONE_COLOR[verdict.tone] : colors.ink.muted}
            />
          </View>

          <View className="mt-5 flex-row items-baseline gap-2">
            <Text
              className={cn(
                'text-[56px] font-semibold leading-[62px] tracking-[-2px]',
                TONE_TEXT[rateTone]
              )}
            >
              {view.blinksPerMinute != null ? Math.round(view.blinksPerMinute).toString() : '—'}
            </Text>
            <Text className="text-base text-ink-muted">blinks/min</Text>
          </View>

          {baselineState === 'loading' ? (
            <Skeleton className="mt-3 h-7 w-32 rounded-full" />
          ) : delta ? (
            <View
              className={cn(
                'mt-3 flex-row items-center gap-1.5 rounded-full px-3 py-1.5',
                chipTone === 'neutral' && 'bg-canvas-overlay',
                chipTone === 'ok' && 'bg-signal-ok/15',
                chipTone === 'warn' && 'bg-signal-warn/15'
              )}
            >
              <Icon
                name={
                  delta.direction === 'above'
                    ? 'arrow.up.right'
                    : delta.direction === 'below'
                      ? 'arrow.down.right'
                      : 'equal'
                }
                size={11}
                color={chipTone === 'neutral' ? colors.ink.muted : TONE_COLOR[chipTone]}
              />
              <Text
                className={cn(
                  'text-xs font-medium',
                  chipTone === 'neutral' ? 'text-ink-muted' : TONE_TEXT[chipTone]
                )}
              >
                {delta.label}
              </Text>
            </View>
          ) : null}

          {baselineState === 'loading' ? (
            <Skeleton className="mt-5 h-4 w-56 rounded-md" />
          ) : (
            <Text
              accessibilityLiveRegion="polite"
              className="mt-5 max-w-[280px] text-center text-base leading-6 text-ink-muted"
            >
              {verdict?.sentence}
            </Text>
          )}
        </Animated.View>

        {/* Metric grid */}
        <View className="mt-3 flex-row gap-3">
          <MetricCard
            className="flex-1"
            label="Blinks"
            value={String(view.blinkCount)}
            hint={
              view.meanBlinkDurationMs != null
                ? `Avg ${Math.round(view.meanBlinkDurationMs)} ms`
                : undefined
            }
          />
          <MetricCard
            className="flex-1"
            label="Head steadiness"
            value={view.postureScore != null ? view.postureScore.toFixed(0) : '—'}
            unit={view.postureScore != null ? '/100' : undefined}
            tone={postureTone(view.postureScore)}
            hint={view.postureScore != null ? 'Drift from your start' : 'Too short to score'}
          />
          <MetricCard className="flex-1" label="Duration" value={formatDuration(view.durationSeconds)} />
        </View>

        {/* Footer actions */}
        <View className="mt-8 gap-3">
          {deleteError ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-center text-sm text-signal-bad"
            >
              {deleteError}
            </Text>
          ) : null}

          <Button label="Done" onPress={handleLeave} />

          {view.savedId !== null ? (
            <Button
              label="Delete this session"
              variant="ghost"
              isLoading={isDeleting}
              onPress={confirmDelete}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Mirrors the loaded layout so data lands positionally (states discipline). */
function ResultsSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View
        accessibilityLabel="Loading session"
        accessibilityLiveRegion="polite"
        className="px-4 pt-2"
      >
        <Skeleton className="h-9 w-40 rounded-md" />
        <Skeleton className="mt-2 h-4 w-52 rounded-md" />
        <Skeleton className="mt-6 h-[264px]" />
        <View className="mt-3 flex-row gap-3">
          <Skeleton className="h-[104px] flex-1" />
          <Skeleton className="h-[104px] flex-1" />
          <Skeleton className="h-[104px] flex-1" />
        </View>
        <Skeleton className="mt-8 h-14" />
      </View>
    </SafeAreaView>
  );
}
