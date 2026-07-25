import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

interface ErrorStateProps {
  title?: string;
  /** What went wrong, in the user's terms. Avoid raw exception text. */
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
  className?: string;
}

/**
 * Full-screen failure with a way out.
 *
 * Reserved for the case where a screen has *nothing* to show. When stale data
 * is available, prefer `InlineError` — blowing away readable content because a
 * background refresh failed is worse than the failure itself.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  isRetrying = false,
  className,
}: ErrorStateProps) {
  return (
    <View className={cn('flex-1 items-center justify-center gap-3 px-8', className)}>
      <Text maxFontSizeMultiplier={1.4} className="text-center text-title2 font-semibold text-ink">
        {title}
      </Text>
      <Text
        // Announced when it appears, so a failure is not silent for a user who
        // cannot see the screen change.
        accessibilityLiveRegion="polite"
        maxFontSizeMultiplier={2}
        className="text-center text-base leading-6 text-ink-muted"
      >
        {message}
      </Text>

      {onRetry ? (
        <Button
          label={retryLabel}
          variant="secondary"
          onPress={onRetry}
          isLoading={isRetrying}
          className="mt-4 w-full"
        />
      ) : null}
    </View>
  );
}

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Quiet banner for a failure that did not cost the user their content —
 * typically a refresh that failed while cached data is still on screen
 * (PRODUCT_SPEC.md §4.2). Styled in the warn tone rather than the bad tone:
 * nothing is broken, the data is just not current.
 */
export function InlineError({ message, onRetry, className }: InlineErrorProps) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className={cn(
        'flex-row items-center justify-between gap-3 rounded-card border border-signal-warn/30 bg-signal-warn/10 px-4 py-3',
        className
      )}
    >
      <Text maxFontSizeMultiplier={2} className="flex-1 text-sm text-signal-warn">
        {message}
      </Text>
      {onRetry ? (
        // A real pressable with padding rather than bare text: the visible
        // word is small, and the touch target must not be. Negative margin
        // keeps the banner's visual rhythm unchanged.
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          hitSlop={8}
          className="-my-2 -mr-2 rounded-lg px-2 py-2 active:bg-signal-warn/15"
        >
          <Text maxFontSizeMultiplier={2} className="text-sm font-semibold text-ink">
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
