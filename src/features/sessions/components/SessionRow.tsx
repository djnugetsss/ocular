import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/cn';
import { blinkRateTone, postureTone } from '@/theme/tokens';
import type { Session } from '@/lib/supabase/database.types';

interface SessionRowProps {
  session: Session;
  onPress?: () => void;
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
export function SessionRow({ session, onPress, className }: SessionRowProps) {
  const started = new Date(session.started_at);
  const minutes = (session.duration_seconds ?? 0) / 60;
  const durationLabel = minutes < 1 ? '<1' : minutes.toFixed(0);

  const Container = onPress ? Pressable : View;

  return (
    <Container
      accessible
      {...(onPress ? { accessibilityRole: 'button' as const, onPress } : {})}
      accessibilityLabel={[
        started.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }),
        started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
        `${session.blink_count} blinks over ${durationLabel} minutes`,
        session.blinks_per_minute != null
          ? `${session.blinks_per_minute.toFixed(0)} blinks per minute`
          : 'rate unavailable',
      ].join(', ')}
      className={cn(
        'flex-row items-center justify-between rounded-card border border-hairline bg-canvas-raised p-4',
        onPress && 'active:bg-canvas-overlay',
        className
      )}
    >
      <View className="gap-1">
        <Text className="text-base font-medium text-ink">
          {started.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {' · '}
          {started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </Text>
        <Text className="text-sm text-ink-muted">
          {durationLabel} min · {session.blink_count} blinks
        </Text>
      </View>

      <View className="items-end gap-1">
        <Text
          className={cn(
            'text-lg font-semibold',
            TONE_TEXT[blinkRateTone(session.blinks_per_minute)]
          )}
        >
          {session.blinks_per_minute?.toFixed(0) ?? '—'}
          <Text className="text-sm font-normal text-ink-faint"> /min</Text>
        </Text>

        {session.posture_score !== null ? (
          <Text className={cn('text-xs', TONE_TEXT[postureTone(session.posture_score)])}>
            Posture {session.posture_score.toFixed(0)}
          </Text>
        ) : null}
      </View>
    </Container>
  );
}
