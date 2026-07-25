import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import type { SessionListRow } from '@/features/sessions/session-repository';

interface SessionListState {
  sessions: SessionListRow[];
  /** True only for the first load, when there is nothing to show yet. */
  isLoading: boolean;
  isRefreshing: boolean;
  /** Human-readable; `null` when the last load succeeded. */
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * The load / refresh / error / reload-on-focus machine shared by Today and
 * Insights (DESIGN_REVIEW.md §5 "duplication to eliminate").
 *
 * Both screens had ~40 near-identical lines of this, and they had already
 * started to drift — the race guard below was added to one before the other.
 * Centralizing it means the two screens cannot disagree about what "loading"
 * or "stale" means, which is what §4's states discipline actually depends on.
 *
 * Three behaviors are load-bearing and easy to lose in a rewrite:
 *
 * 1. **Ordered responses.** A focus reload and a pull-to-refresh overlap
 *    routinely and are not guaranteed to resolve in order. A monotonic
 *    request id discards superseded responses, so a slow earlier fetch can
 *    never overwrite fresher data or blank a successful load with a stale
 *    error.
 * 2. **Stale data survives failure.** A failed refresh sets `error` but never
 *    clears `sessions`; the screens render a quiet banner over readable
 *    content rather than destroying it.
 * 3. **`isLoading` is first-load only.** Once data exists, refreshes are
 *    expressed through `isRefreshing` and the native control, so the skeleton
 *    never flashes over content the user is already reading.
 */
export function useSessionList(
  fetcher: (() => Promise<SessionListRow[]>) | null,
  errorMessage: string
): SessionListState {
  const [sessions, setSessions] = useState<SessionListRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!fetcher) return;
    const requestId = ++requestRef.current;
    try {
      const loaded = await fetcher();
      if (requestId !== requestRef.current) return;
      setSessions(loaded);
      setError(null);
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      setError(cause instanceof Error ? cause.message : errorMessage);
    }
  }, [fetcher, errorMessage]);

  // Reload on focus so a session recorded on the Scan tab appears immediately
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

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  return { sessions, isLoading, isRefreshing, error, refresh };
}
