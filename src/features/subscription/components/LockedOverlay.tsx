import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { colors } from '@/theme/tokens';

interface LockedOverlayProps {
  /** Decorative preview ghosted beneath the frost. Never real user data. */
  children: ReactNode;
  title: string;
  body: string;
  action: { label: string; onPress: () => void };
  className?: string;
}

/**
 * A locked surface: preview beneath, frosted scrim over, one way forward.
 *
 * The frost is a layered scrim, not a real gaussian blur — deliberately.
 * `expo-blur` would mean a new native dependency against the project's
 * no-new-deps law (PRODUCT_SPEC.md §6 rule 5), and this design system builds
 * depth from canvas steps, not materials (§5.3). The same decision is what
 * makes the second rule here enforceable: nothing under the frost is ever
 * the user's real data, so nothing can leak through an overlay that renders
 * at the wrong opacity for one frame. What ghosts through is decoration.
 *
 * Accessibility: the preview is decoration and is fully hidden from
 * assistive tech; VoiceOver reads title + body as one element, then lands on
 * the button. A sighted user squints at frost; a VoiceOver user hears the
 * same three facts with none of the squinting.
 */
export function LockedOverlay({ children, title, body, action, className }: LockedOverlayProps) {
  return (
    <View className={cn('overflow-hidden rounded-card border border-hairline', className)}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {children}
      </View>

      {/* Two scrim layers make the frost: a raised-canvas wash that reads as
          material, and a deeper center fade the text sits on. */}
      <View className="absolute inset-0 bg-canvas-raised/80" />
      <View className="absolute inset-0 items-center justify-center bg-canvas/40 px-6 py-6">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-canvas-overlay">
          <Icon name="lock.fill" size={18} color={colors.accent.DEFAULT} />
        </View>
        <View accessible accessibilityLabel={`${title}. ${body}`} className="items-center">
          <Text
            maxFontSizeMultiplier={1.4}
            className="mt-3 text-center text-base font-semibold text-ink"
          >
            {title}
          </Text>
          <Text
            maxFontSizeMultiplier={2}
            className="mt-1 max-w-[280px] text-center text-sm leading-5 text-ink-muted"
          >
            {body}
          </Text>
        </View>
        <Button
          label={action.label}
          onPress={action.onPress}
          className="mt-4 min-h-0 px-5 py-2.5"
        />
      </View>
    </View>
  );
}
