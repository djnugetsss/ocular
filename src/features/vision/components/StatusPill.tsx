import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';
import type { TrackingStatus } from '@/features/vision/use-face-tracking';

interface StatusPillProps {
  status: TrackingStatus;
  isCalibrated: boolean;
  error?: string | null;
  className?: string;
}

/**
 * The scan screen's single line of narration.
 *
 * Extracted from `scan.tsx` and typed against `TrackingStatus` rather than a
 * bare string, so a new tracking state cannot be added without the compiler
 * pointing here — the previous inline version silently fell through to
 * "Tracking" for anything unrecognized.
 *
 * Copy is behavioral and never alarming: this pill sits over a live image of
 * the user's face, and anything that reads as a verdict on their body belongs
 * nowhere near it.
 */
export function StatusPill({ status, isCalibrated, error, className }: StatusPillProps) {
  const { text, tone } = describe(status, isCalibrated, error);

  return (
    <View className={cn('rounded-full px-4 py-2', tone.container, className)}>
      <Text
        // Announced on change so a user who cannot see the preview still learns
        // that tracking was acquired, lost, or has finished calibrating.
        accessibilityLiveRegion="polite"
        className={cn('text-sm font-medium', tone.text)}
      >
        {text}
      </Text>
    </View>
  );
}

const TONES = {
  neutral: { container: 'bg-black/50', text: 'text-ink' },
  active: { container: 'bg-signal-ok/20', text: 'text-signal-ok' },
  error: { container: 'bg-signal-bad/20', text: 'text-signal-bad' },
} as const;

function describe(status: TrackingStatus, isCalibrated: boolean, error?: string | null) {
  switch (status) {
    case 'error':
      return { text: error ?? 'Tracking stopped', tone: TONES.error };
    case 'idle':
      return { text: 'Ready', tone: TONES.neutral };
    case 'starting':
      return { text: 'Starting camera…', tone: TONES.neutral };
    case 'searching':
      return { text: 'Looking for you', tone: TONES.neutral };
    case 'tracking':
      return isCalibrated
        ? { text: 'Tracking', tone: TONES.active }
        : { text: 'Calibrating — keep your eyes open', tone: TONES.neutral };
  }
}
