import { Text } from 'react-native';

import { cn } from '@/lib/cn';

interface SectionHeaderProps {
  children: string;
  className?: string;
}

/**
 * The uppercase caption that titles a group (DESIGN_REVIEW.md §5).
 *
 * Seven inline copies of the same six utility classes existed across Today,
 * Insights, Profile, and four leaf components. Centralizing it also fixes the
 * Dynamic Type clamp in one place — §4 sets 2× for body-scale text, and a
 * per-caller clamp is a per-caller opportunity to forget.
 *
 * `ink-faint` on `canvas` was lightened to ≈4.6:1 for exactly this component's
 * sake (§1 Accessibility); it must stay the token, never a literal.
 */
export function SectionHeader({ children, className }: SectionHeaderProps) {
  return (
    <Text
      maxFontSizeMultiplier={2}
      className={cn('text-xs font-medium uppercase tracking-wide text-ink-faint', className)}
    >
      {children}
    </Text>
  );
}
