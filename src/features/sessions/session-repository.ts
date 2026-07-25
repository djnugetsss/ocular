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

/**
 * Fetches one session, or `null` when it does not exist (deleted, or an id
 * from a stale link). RLS scopes the read to the signed-in user, so someone
 * else's id also resolves to `null` rather than an error.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load session: ${error.message}`);
  }
  return data;
}

/**
 * Columns the list-and-aggregate screens actually read.
 *
 * Today, Insights, and every aggregation in `baseline`/`insights-aggregator`
 * touch exactly these. `select('*')` also shipped `created_at`, `ended_at`,
 * `mean_blink_duration_ms`, and `user_id` on every row — dead weight over the
 * wire and in memory at 500 rows, and a silent cost increase every time a
 * column is added to the table for some other screen's benefit.
 *
 * The results screen still selects `*`: it renders one row and shows fields
 * this projection omits.
 */
const LIST_COLUMNS =
  'id,started_at,duration_seconds,blink_count,blinks_per_minute,mean_yaw,mean_pitch,mean_roll,posture_score';

/** A row as returned by the list projection above. */
export type SessionListRow = Pick<
  Session,
  | 'id'
  | 'started_at'
  | 'duration_seconds'
  | 'blink_count'
  | 'blinks_per_minute'
  | 'mean_yaw'
  | 'mean_pitch'
  | 'mean_roll'
  | 'posture_score'
>;

export async function listRecentSessions(userId: string, limit = 30): Promise<SessionListRow[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(LIST_COLUMNS)
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load sessions: ${error.message}`);
  }
  return data ?? [];
}

/** A window of recent rows plus the exact total, from one round trip. */
export interface RecentSessionsPage {
  rows: SessionListRow[];
  /** Exact count of *all* the user's sessions, not just the returned window. */
  total: number;
}

/**
 * The newest `limit` sessions **and** the exact total, in a single query.
 *
 * The free plan renders only the ten most recent, but Today still needs the
 * true history size to say "N older kept" honestly — and fetching hundreds of
 * rows just to count them, then throwing all but ten away, is exactly the waste
 * this avoids. Supabase's `{ count: 'exact' }` returns the full count alongside
 * a `limit`-bounded page, so one round trip serves both the render window (also
 * wide enough for Today's aggregates) and an accurate remainder. See
 * `visibleSessions`, which takes this `total` to compute `hiddenCount`.
 */
export async function listRecentSessionsPage(
  userId: string,
  limit = 30
): Promise<RecentSessionsPage> {
  const { data, count, error } = await supabase
    .from('sessions')
    .select(LIST_COLUMNS, { count: 'exact' })
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load sessions: ${error.message}`);
  }
  return { rows: data ?? [], total: count ?? data?.length ?? 0 };
}

/**
 * Every session on or after `since`, newest first.
 *
 * The Insights tab fetches its widest range once and derives the narrower
 * ones in memory, so switching W/M/6M costs nothing and never re-queries.
 * `limit` is a safety ceiling, not a page size: a user with more sessions
 * than this in six months has their oldest ones fall out of the window, which
 * degrades the chart's left edge rather than breaking the screen.
 */
export async function listSessionsSince(
  userId: string,
  since: Date,
  limit = 500
): Promise<SessionListRow[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(LIST_COLUMNS)
    .eq('user_id', userId)
    .gte('started_at', since.toISOString())
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load sessions: ${error.message}`);
  }
  return data ?? [];
}

/** How many sessions the user has, without fetching any of them. */
export async function countSessions(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Could not count sessions: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * How many sessions the user started on or after `since`.
 *
 * The denominator of the free plan's daily allowance
 * (`features/subscription`). A count rather than a fetch: the gate needs one
 * number, the rows would be thrown away, and the same composite index serves
 * both. Only *persisted* sessions are counted, so a mis-tap under the
 * ten-second floor never costs a user part of their day.
 */
export async function countSessionsSince(userId: string, since: Date): Promise<number> {
  const { count, error } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('started_at', since.toISOString());

  if (error) {
    throw new Error(`Could not count sessions: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Every session with every column, for export — the one caller that must not
 * use the list projection, since an export that quietly drops columns is not
 * an export. The ceiling is a transport guard, not a page: at 10k sessions
 * the JSON itself is the problem long before the query is.
 */
export async function listAllSessions(userId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(10_000);

  if (error) {
    throw new Error(`Could not load sessions: ${error.message}`);
  }
  return data ?? [];
}

/**
 * Deletes the user's entire session history (PRODUCT_SPEC.md §4.6).
 *
 * The explicit `user_id` filter is belt on top of RLS's suspenders — a bulk
 * delete is the one query where a scoping bug would be unrecoverable, so it
 * is constrained in both layers.
 */
export async function deleteAllSessions(userId: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('user_id', userId);

  if (error) {
    throw new Error(`Could not delete your sessions: ${error.message}`);
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
  if (error) {
    throw new Error(`Could not delete session: ${error.message}`);
  }
}
