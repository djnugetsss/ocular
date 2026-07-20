import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import type { FaceDetectionEvent, NormalizedPoint } from 'ocular-vision';

import { colors } from '@/theme/tokens';

/**
 * Draws the face mesh over the camera preview.
 *
 * Points arrive already mapped into preview space by the native layer (see
 * `OcularVisionView.previewPoint`), so this only needs to scale by the view's
 * measured size — no mirroring or aspect correction happens here. That is
 * deliberate: only the preview layer knows the crop actually in effect, and
 * duplicating that math in JS is how overlays end up drifting near the frame
 * edges.
 */

interface LandmarkOverlayProps {
  frame: FaceDetectionEvent | null;
  width: number;
  height: number;
  /** Draw the detection bounding box. Useful while debugging tracking. */
  showBoundingBox?: boolean;
}

/** Regions drawn as open polylines rather than closed loops. */
const OPEN_REGIONS = new Set([
  'faceContour',
  'noseCrest',
  'medianLine',
  'leftEyebrow',
  'rightEyebrow',
]);

/** Regions drawn as individual dots — pupils are single points. */
const POINT_REGIONS = new Set(['leftPupil', 'rightPupil']);

const MESH_COLOR = colors.accent.DEFAULT;
const EYE_COLOR = colors.signal.ok;

function toPolylinePoints(points: NormalizedPoint[], width: number, height: number): string {
  return points.map((point) => `${point.x * width},${point.y * height}`).join(' ');
}

export const LandmarkOverlay = memo(function LandmarkOverlay({
  frame,
  width,
  height,
  showBoundingBox = false,
}: LandmarkOverlayProps) {
  const landmarks = frame?.landmarks;

  // Render nothing rather than an empty <Svg> when there is no face: mounting
  // and unmounting the SVG tree is cheaper than keeping a stale mesh on screen,
  // and a frozen mesh reads as a bug to the user.
  if (!frame?.hasFace || !landmarks) return null;

  return (
    <View pointerEvents="none" className="absolute inset-0" accessibilityElementsHidden>
      <Svg width={width} height={height}>
        {showBoundingBox && frame.boundingBox ? (
          <Rect
            x={frame.boundingBox.x * width}
            y={frame.boundingBox.y * height}
            width={frame.boundingBox.width * width}
            height={frame.boundingBox.height * height}
            stroke={MESH_COLOR}
            strokeWidth={1.5}
            strokeOpacity={0.4}
            fill="none"
          />
        ) : null}

        {/* Object.entries widens the value type to any, so it is narrowed back
            to the declared landmark shape here. */}
        {(Object.entries(landmarks) as [string, NormalizedPoint[]][]).map(([region, points]) => {
          if (!points.length) return null;

          const isEye = region === 'leftEye' || region === 'rightEye';
          const color = isEye ? EYE_COLOR : MESH_COLOR;

          if (POINT_REGIONS.has(region)) {
            return points.map((point, index) => (
              <Circle
                key={`${region}-${index}`}
                cx={point.x * width}
                cy={point.y * height}
                r={2.5}
                fill={EYE_COLOR}
              />
            ));
          }

          // Closed regions repeat their first point so the outline joins up;
          // Polyline does not close paths on its own.
          const ordered = OPEN_REGIONS.has(region) ? points : [...points, points[0]!];

          return (
            <Polyline
              key={region}
              points={toPolylinePoints(ordered, width, height)}
              stroke={color}
              strokeWidth={isEye ? 2 : 1.25}
              strokeOpacity={isEye ? 0.95 : 0.6}
              fill="none"
            />
          );
        })}
      </Svg>
    </View>
  );
});
