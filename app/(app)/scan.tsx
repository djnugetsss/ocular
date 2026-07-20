import { useCallback, useEffect, useState } from 'react';
import { Alert, LayoutChangeEvent, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { OcularVisionView } from 'ocular-vision';
import Svg, { Ellipse } from 'react-native-svg';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { MetricCard } from '@/components/ui/MetricCard';
import { useAuthStore } from '@/features/auth/auth-store';
import { saveSession } from '@/features/sessions/session-repository';
import { LandmarkOverlay } from '@/features/vision/components/LandmarkOverlay';
import { StatusPill } from '@/features/vision/components/StatusPill';
import { useCameraPermission } from '@/features/vision/use-camera-permission';
import { useFaceTracking } from '@/features/vision/use-face-tracking';
import { blinkRateTone, colors } from '@/theme/tokens';

export default function ScanScreen() {
  const user = useAuthStore((state) => state.user);
  const { permission, isLoading, request, openSettings, isSupported } = useCameraPermission();
  const { frame, status, error, isActive, isCalibrated, start, stop, viewProps } = useFaceTracking({
    landmarks: true,
  });

  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [isSaving, setIsSaving] = useState(false);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setPreviewSize({ width, height });
  }, []);

  const handleStop = useCallback(async () => {
    const summary = stop();
    if (!summary || !user) return;

    setIsSaving(true);
    try {
      const saved = await saveSession(summary, user.id);
      if (!saved) {
        Alert.alert('Session too short', 'Sessions under 10 seconds are not saved.');
      }
    } catch (cause) {
      // The measurement already happened; a failed write should not read as a
      // failed session. Surface it, but do not discard the user's context.
      Alert.alert(
        'Could not save session',
        cause instanceof Error ? cause.message : 'Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [stop, user]);

  // Stop tracking when the tab loses focus. Without this the camera stays live
  // behind another tab, which drains battery and leaves the privacy indicator on.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (isActive) void handleStop();
      };
    }, [isActive, handleStop])
  );

  if (!isSupported) {
    return (
      <Centered
        title="Requires a physical device"
        body="The iOS Simulator has no camera, so Vision face tracking cannot run. Build to a connected iPhone with `npm run ios:device`."
      />
    );
  }

  if (isLoading) {
    return <Centered title="Checking camera access" body="One moment…" />;
  }

  if (!permission?.granted) {
    return (
      <Centered
        title="Camera access needed"
        body={
          permission?.canAskAgain
            ? 'Ocular analyzes frames on-device to measure blink rate and head posture. Nothing is recorded or uploaded.'
            : 'Camera access was denied. Enable it in Settings to run a scan.'
        }
        action={
          permission?.canAskAgain ? (
            <Button label="Allow camera" onPress={() => void request()} />
          ) : (
            <Button label="Open Settings" variant="secondary" onPress={() => void openSettings()} />
          )
        }
      />
    );
  }

  const blink = frame?.blink;
  const pose = frame?.headPose;
  const rate = blink?.blinksPerMinute ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      {/* Bottom radius separates the camera from the instrument panel below it
          (DESIGN_REVIEW.md §3 anatomy). */}
      <View className="flex-1 overflow-hidden rounded-b-sheet" onLayout={handleLayout}>
        <OcularVisionView
          {...viewProps}
          cameraPosition="front"
          updateInterval={66}
          style={{ flex: 1 }}
        />
        <LandmarkOverlay frame={frame} width={previewSize.width} height={previewSize.height} />

        {!isActive ? <IdleGuide /> : null}

        <View className="absolute left-0 right-0 top-4 items-center">
          <StatusPill status={status} isCalibrated={isCalibrated} error={error?.message} />
        </View>
      </View>

      <View className="gap-3 px-4 pb-4 pt-4">
        <View className="flex-row gap-3">
          <MetricCard
            className="flex-1"
            label="Blink rate"
            value={isCalibrated ? rate.toFixed(0) : '—'}
            unit="/min"
            // Shared thresholds from the theme, so this screen cannot drift
            // from how the same rate is toned on Today and in history.
            tone={isCalibrated ? blinkRateTone(rate) : 'neutral'}
            hint={isCalibrated ? undefined : 'Calibrating…'}
          />
          <MetricCard
            className="flex-1"
            label="Blinks"
            value={String(blink?.blinkCount ?? 0)}
            hint={
              blink?.lastBlinkDurationMs
                ? `Last ${Math.round(blink.lastBlinkDurationMs)} ms`
                : undefined
            }
          />
        </View>

        <View className="flex-row gap-3">
          <MetricCard
            className="flex-1"
            label="Yaw"
            value={pose ? pose.yaw.toFixed(0) : '—'}
            unit="°"
          />
          <MetricCard
            className="flex-1"
            label="Pitch"
            value={pose ? pose.pitch.toFixed(0) : '—'}
            unit="°"
          />
          <MetricCard
            className="flex-1"
            label="Roll"
            value={pose ? pose.roll.toFixed(0) : '—'}
            unit="°"
          />
        </View>

        <Button
          label={isActive ? 'End session' : 'Begin check-in'}
          variant={isActive ? 'danger' : 'primary'}
          isLoading={isSaving}
          onPress={() => (isActive ? void handleStop() : start())}
        />
      </View>
    </SafeAreaView>
  );
}

function Centered({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 justify-center gap-3 px-8">
        <Text accessibilityRole="header" className="text-title2 font-semibold text-ink">
          {title}
        </Text>
        <Text className="text-base leading-6 text-ink-muted">{body}</Text>
        {action ? <View className="mt-4">{action}</View> : null}
      </View>
    </SafeAreaView>
  );
}

/**
 * The scan tab at rest (DESIGN_REVIEW.md §3, state 1).
 *
 * The camera is genuinely off before a session starts, which used to render as
 * a black void. This overlay makes the rest state look intentional: a quietly
 * breathing face-guide oval on raised canvas, plus one line confirming the
 * camera is off — the idle screen's job is to *show* the privacy promise, not
 * just rely on onboarding having stated it.
 */
function IdleGuide() {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.03, {
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
        // Static under Reduce Motion: the oval still reads as a face guide
        // without the breathing.
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      true
    );
  }, [scale]);

  const breathStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0 items-center justify-center gap-6 bg-canvas-raised"
    >
      <Animated.View style={breathStyle}>
        <Svg width={200} height={256}>
          <Ellipse
            cx={100}
            cy={128}
            rx={88}
            ry={118}
            stroke={colors.ink.faint}
            strokeWidth={1.5}
            strokeOpacity={0.45}
            fill="none"
          />
        </Svg>
      </Animated.View>
      <Text className="text-sm text-ink-muted">Camera stays off until you begin</Text>
    </View>
  );
}
