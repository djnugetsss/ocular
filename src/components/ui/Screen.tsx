import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cn } from '@/lib/cn';

interface ScreenProps {
  children: ReactNode;
  /**
   * Insets to honor. Tab screens take `top` only — the tab bar already clears
   * the home indicator, and adding `bottom` would double the gap. Full-screen
   * routes (auth, onboarding, results) take both.
   */
  edges?: ('top' | 'bottom')[];
  className?: string;
}

/**
 * The canvas every route sits on (DESIGN_REVIEW.md §5).
 *
 * `<SafeAreaView className="flex-1 bg-canvas" edges={['top']}>` was written
 * out eight times across the four tabs and the results screen, including
 * three times within a single file for its loading, error, and ready states —
 * which is exactly how one of them ends up with the wrong inset or a
 * different background during a refactor.
 *
 * Deliberately *only* the shell. §5 also proposes a shared title header, but
 * the three tabs genuinely differ above the fold — Today leads with a date,
 * Insights with a range control, Profile with an identity block — and forcing
 * them into one header component would be a redesign, not a consolidation.
 */
export function Screen({ children, edges = ['top'], className }: ScreenProps) {
  return (
    <SafeAreaView className={cn('flex-1 bg-canvas', className)} edges={edges}>
      {children}
    </SafeAreaView>
  );
}
