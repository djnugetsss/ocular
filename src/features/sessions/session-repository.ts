import { supabase } from '@/lib/supabase/client';
import type { Session } from '@/lib/supabase/database.types';
import { toSessionInsert, type SessionSummary } from '@/features/vision/session-aggregator';

/**
 * Persistence for tracking sessions.
 *
 * `user_id` is passed explicitly rather than read from the client here so the
 * caller — which already has the authenticated user — cannot accidentally write
 * a row while signed out. RLS would reject that anyway, but failing in the
 * type system beats failing at the database.
 */

/** Sessions shorter than this are almost certainly a mis-tap, not a measurement. */
const MIN_PERSISTED_DURATION_SECONDS = 10;

export async function saveSession(
  summary: SessionSummary,
  userId: string
): Promise<Session | null> {
  if (summary.durationSeconds < MIN_PERSISTED_DURATION_SECONDS) return null;

  const { data, error } = await supabase
    .from('sessions')
    .insert(toSessionInsert(summary, userId))
    .select()
    .single();

  if (error) {
    throw new Error(`Could not save session: ${error.message}`);
  }
  return data;
}

export async function listRecentSessions(userId: string, limit = 30): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load sessions: ${error.message}`);
  }
  return data ?? [];
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
  if (error) {
    throw new Error(`Could not delete session: ${error.message}`);
  }
}
