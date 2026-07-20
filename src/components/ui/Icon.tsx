import { SymbolView, type SFSymbol, type SymbolWeight } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { colors } from '@/theme/tokens';

interface IconProps {
  name: SFSymbol;
  size?: number;
  color?: ColorValue;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}

/**
 * SF Symbols, typed and tokened (DESIGN_REVIEW.md §4 "Icons").
 *
 * The one place symbol rendering is configured, so callers cannot drift on
 * weight or default color. Symbol names are compile-checked against the
 * `SFSymbol` union — a typo is a type error, not an invisible icon.
 *
 * Icons are decorative throughout the app: every call site sits next to a text
 * label that carries the meaning, so the view is hidden from assistive tech
 * here rather than at each caller.
 */
export function Icon({
  name,
  size = 20,
  color = colors.ink.muted,
  weight = 'regular',
  style,
}: IconProps) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
