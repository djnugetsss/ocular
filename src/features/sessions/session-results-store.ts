import { create } from 'zustand';

import type { SessionSummary } from '@/features/vision/session-aggregator';
import type { Session } from '@/lib/supabase/database.types';

/**
 * In-memory handoff from the Scan screen to the Session Results screen.
 *
 * Exists for one reason: the results moment must not depend on a network
 * round trip. Post-scan, the summary is already in memory — refetching the
 * row just written would add latency to the payoff moment, and when the save
 * *failed* there is no row to fetch at all, yet the measurement still
 * deserves its screen (PRODUCT_SPEC.md §4.3: "the measurement is never lost
 * to a network error").
 *
 * The store holds at most one handoff — the most recent scan — and is keyed
 * by the route id the results screen was opened with, so a stale handoff can
 * never be mistaken for the session actually being viewed.
 */

/** Route id used when a session could not be saved and so has no row id. */
export const PENDING_RESULT_ID = 'pending';

export interface ResultsHandoff {
  /** The `[id]` route param the results screen was pushed with. */
  key: string;
  summary: SessionSummary;
  /** The saved row; `null` until a save (or retry) succeeds. */
  session: Session | null;
}

interface SessionResultsState {
  handoff: ResultsHandoff | null;
  setHandoff: (handoff: ResultsHandoff) => void;
  /** Records a successful retry without changing the route key. */
  markSaved: (session: Session) => void;
  clear: () => void;
}

export const useSessionResultsStore = create<SessionResultsState>((set) => ({
  handoff: null,
  setHandoff: (handoff) => set({ handoff }),
  markSaved: (session) =>
    set((state) => (state.handoff ? { handoff: { ...state.handoff, session } } : state)),
  clear: () => set({ handoff: null }),
}));
