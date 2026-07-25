import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuthStore } from '@/features/auth/auth-store';
import { countSessionsSince } from '@/features/sessions/session-repository';
import { startOfLocalDay } from '@/features/subscription/daily-usage';
import { checkInAllowance, type CheckInAllowance } from '@/features/subscription/entitlements';
import { useEntitlements } from '@/features/subscription/subscription-provider';

/**
 * The daily check-in gate, resolved against live usage.
 *
 * Usage is counted server-side rather than derived from whatever list a screen
 * happens to have loaded: the Scan tab holds no session list, and a check-in
 * recorded on another device still spends today's allowance. The count is
 * refreshed on focus, which is also what makes a session recorded minutes ago
 * on Today show up here.
 *
 * **The gate fails open.** A failed count leaves `completedToday` null, which
 * `checkInAllowance` resolves to "allowed, usage unknown". Refusing to measure
 * because a count request timed out would punish the user for our network,
 * and the worst case is one unmetered check-in.
 */
export interface CheckInGate extends CheckInAllowance {
  /** True during the first count, when nothing is known yet. */
  isLoading: boolean;
  refresh: () => Promise<void>;
  /**
   * Records a just-saved check-in locally so the gate closes immediately,
   * without waiting for a refetch. Idempotent per call — the scan screen
   * invokes it exactly once per persisted session.
   */
  recordCheckIn: () => void;
}

export function useCheckInGate(): CheckInGate {
  const entitlements = useEntitlements();
  const userId = useAuthStore((state) => state.user?.id ?? null);

  const [completedToday, setCompletedToday] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!userId) {
      setCompletedToday(null);
      return;
    }
    const requestId = ++requestRef.current;
    try {
      // Recomputed per load, so a session left open across midnight counts
      // against the new day the next time this screen is focused.
      const count = await countSessionsSince(userId, startOfLocalDay());
      if (requestId !== requestRef.current) return;
      setCompletedToday(count);
    } catch {
      if (requestId !== requestRef.current) return;
      setCompletedToday(null);
    }
  }, [userId]);

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

  const recordCheckIn = useCallback(() => {
    // A local bump only counts when a count exists. With usage unknown the
    // gate is already open by design, and inventing "1" there would start
    // metering from a number we never measured.
    requestRef.current += 1;
    setCompletedToday((count) => (count === null ? null : count + 1));
  }, []);

  const allowance = useMemo(
    () => checkInAllowance(entitlements, completedToday),
    [entitlements, completedToday]
  );

  return { ...allowance, isLoading, refresh: load, recordCheckIn };
}
