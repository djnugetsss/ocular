import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

interface InfoRowProps {
  /** Leading glyph. Decorative — the title and body carry the meaning. */
  glyph: string;
  title: string;
  body: string;
  tone?: 'neutral' | 'accent' | 'ok';
  className?: string;
}

const GLYPH_TONE = {
  neutral: 'bg-canvas-overlay text-ink-muted',
  accent: 'bg-accent-soft text-accent',
  ok: 'bg-signal-ok/15 text-signal-ok',
} as const;

/**
 * Icon + title + explanatory body, stacked in a column of peers.
 *
 * The workhorse of onboarding (PRODUCT_SPEC.md §4.1.2, §4.1.3), where the job
 * is to explain rather than to collect input. Grouped for accessibility so
 * VoiceOver reads each row as one statement instead of three fragments.
 */
export function InfoRow({ glyph, title, body, tone = 'neutral', className }: InfoRowProps) {
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${body}`}
      className={cn('flex-row gap-4', className)}
    >
      <View
        className={cn(
          'h-10 w-10 shrink-0 items-center justify-center rounded-full',
          GLYPH_TONE[tone]
        )}
      >
        <Text className={cn('text-lg', GLYPH_TONE[tone].split(' ')[1])}>{glyph}</Text>
      </View>

      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        <Text className="text-[15px] leading-6 text-ink-muted">{body}</Text>
      </View>
    </View>
  );
}
