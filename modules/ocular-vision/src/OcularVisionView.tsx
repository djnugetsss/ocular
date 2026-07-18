import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { OcularVisionViewProps } from './OcularVision.types';

type NativeProps = OcularVisionViewProps & { style?: StyleProp<ViewStyle> };

const NativeView: ComponentType<NativeProps> = requireNativeView('OcularVision');

/**
 * Camera preview backed by an `AVCaptureSession`, with Vision face analysis
 * running on the capture queue.
 *
 * The view must have non-zero layout bounds before `isActive` turns true —
 * `flex-1` on a parent is the usual answer. It renders nothing but the preview
 * layer; overlays belong in sibling views positioned above it.
 */
export function OcularVisionView({
  isActive = false,
  cameraPosition = 'front',
  ...rest
}: NativeProps) {
  return <NativeView isActive={isActive} cameraPosition={cameraPosition} {...rest} />;
}
