import { memo } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { formatClockTime, formatShortDate, formatSpokenDate } from '@/features/sessions/dates';
import { cn } from '@/lib/cn';
import { blinkRateTone, postureTone } from '@/theme/tokens';
import type { Session } from '@/lib/supabase/database.types';

/**
 * Only the fields this row renders. Matches the repository's list projection,
 * so the row cannot start reading a column the list queries do not fetch.
 */
export type SessionRowData = Pick<
  Session,
  'id' | 'started_at' | 'duration_seconds' | 'blink_count' | 'blinks_per_minute' | 'posture_score'
>;

interface SessionRowProps {
  session: SessionRowData;
  /**
   * Receives the session id rather than closing over it, so callers can pass
   * one stable `useCallback` for the whole list. An `onPress: () => void`
   * forces a fresh closure per row per render, which would defeat the memo
   * below and re-render every visible row whenever the list header changes.
   */
  onPress?: (sessionId: string) => void;
  className?: string;
}

const TONE_TEXT = {
  neutral: 'text-ink-faint',
  ok: 'text-signal-ok',
  warn: 'text-signal-warn',
  bad: 'text-signal-bad',
} as const;

/**
 * One session in a history list.
 *
 * Extracted from the Today screen so Today, Insights, and any future
 * day-scoped list render sessions identically — a divergence between "recent"
 * and "all" lists is the kind of inconsistency users notice immediately.
 *
 * Renders as a button only when `onPress` is supplied, so it stays usable as a
 * static row without lying to assistive tech about being interactive.
 */
function SessionRowComponent({ session, onPress, className }: SessionRowProps) {
  const started = new Date(session.started_at);
  const minutes = (session.duration_seconds ?? 0) / 60;
  const durationLabel = minutes < 1 ? '<1' : minutes.toFixed(0);

  return (
    <Card
      accessible
      {...(onPress
        ? { accessibilityRole: 'button' as const, onPress: () => onPress(session.id) }
        : {})}
      accessibilityLabel={[
        formatSpokenDate(started),
        formatClockTime(started),
        `${session.blink_count} blinks over ${durationLabel} minutes`,
        session.blinks_per_minute != null
          ? `${session.blinks_per_minute.toFixed(0)} blinks per minute`
          : 'rate unavailable',
      ].join(', ')}
      className={cn('flex-row items-center justify-between', className)}
    >
      <View className="gap-1">
        <Text maxFontSizeMultiplier={2} className="text-base font-medium text-ink">
          {formatShortDate(started)}
          {' · '}
          {formatClockTime(started)}
        </Text>
        <Text maxFontSizeMultiplier={2} className="text-sm text-ink-muted">
          {durationLabel} min · {session.blink_count} blinks
        </Text>
      </View>

      <View className="items-end gap-1">
        {/* Tabular figures: rows stack in a list, and the rates must align
            digit-for-digit down the column (§4 typography). */}
        <Text
          maxFontSizeMultiplier={1.4}
          style={{ fontVariant: ['tabular-nums'] }}
          // DEFERRED: `text-lg` (18) is the one surviving off-scale size. §2.9
          // flags it, but the scale has no 18 pt step — `text-base` (16) and
          // `text-title2` (22) both visibly change every row in the app, which
          // is a redesign rather than a cleanup. Left as-is until the scale
          // gains a row-value step or the row is intentionally restyled.
          className={cn(
            'text-lg font-semibold',
            TONE_TEXT[blinkRateTone(session.blinks_per_minute)]
          )}
        >
          {session.blinks_per_minute?.toFixed(0) ?? '—'}
          <Text maxFontSizeMultiplier={2} className="text-sm font-normal text-ink-faint">
            {' '}
            /min
          </Text>
        </Text>

        {session.posture_score !== null ? (
          <Text
            maxFontSizeMultiplier={2}
            style={{ fontVariant: ['tabular-nums'] }}
            className={cn('text-xs', TONE_TEXT[postureTone(session.posture_score)])}
          >
            Posture {session.posture_score.toFixed(0)}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Memoized: these render inside `FlatList`/`SectionList` headers that
 * re-render on every refresh flag, range switch, and pagination step. The row
 * itself only depends on its own session, so re-rendering forty of them to
 * repaint a header above is pure waste.
 */
export const SessionRow = memo(SessionRowComponent);
