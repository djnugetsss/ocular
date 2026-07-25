import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

interface CardProps {
  children: ReactNode;
  /**
   * Applies the standard 16 pt inset. Pass `false` when the card needs its own
   * padding and supply it via `className`.
   *
   * Explicit rather than override-by-className on purpose: `twMerge` keeps
   * both `p-4` and a caller's `px-6 py-8`, and NativeWind then resolves the
   * pair by stylesheet source order rather than by intent — the exact failure
   * `cn`'s doc comment warns about. An opt-out boolean cannot silently lose
   * that race.
   */
  padded?: boolean;
  /** Makes the card a button, with the standard pressed surface. */
  onPress?: () => void;
  className?: string;
}

type Props = CardProps & Omit<ViewProps & PressableProps, 'children' | 'style' | 'onPress'>;

/**
 * The app's one raised surface (DESIGN_REVIEW.md §5).
 *
 * `rounded-card border-hairline bg-canvas-raised` was re-declared inline
 * twelve times across screens and leaf components; a single radius or border
 * change previously meant twelve edits and eleven chances to miss one. No
 * shadow — deliberate for this palette (§4) and not a prop, because a shadow
 * on one card and not another is precisely the drift this component exists to
 * prevent.
 *
 * Renders as a button only when `onPress` is supplied, so a static card never
 * claims interactivity it does not have.
 */
export function Card({ children, padded = true, onPress, className, ...rest }: Props) {
  const classes = cn(
    'rounded-card border border-hairline bg-canvas-raised',
    padded && 'p-4',
    onPress && 'active:bg-canvas-overlay',
    className
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={classes} {...rest}>
        {children}
      </Pressable>
    );
  }

  return (
    <View className={classes} {...rest}>
      {children}
    </View>
  );
}
