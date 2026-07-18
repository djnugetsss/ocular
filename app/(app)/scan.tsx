import { useCallback, useState } from 'react';
import { Alert, LayoutChangeEvent, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { OcularVisionView } from 'ocular-vision';

import { Button } from '@/components/ui/Button';
import { MetricCard } from '@/components/ui/MetricCard';
import { useAuthStore } from '@/features/auth/auth-store';
import { saveSession } from '@/features/sessions/session-repository';
import { LandmarkOverlay } from '@/features/vision/components/LandmarkOverlay';
import { useCameraPermission } from '@/features/vision/use-camera-permission';
import { useFaceTracking } from '@/features/vision/use-face-tracking';

/**
 * A resting adult blinks roughly 15-20 times per minute. Screen work reliably
 * drops that to the single digits, which is the mechanism behind digital eye
 * strain — so the thresholds below flag low rates, not high ones.
 */
const HEALTHY_BLINK_RATE = 12;
const LOW_BLINK_RATE = 8;

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
      <View className="flex-1" onLayout={handleLayout}>
        <OcularVisionView
          {...viewProps}
          cameraPosition="front"
          updateInterval={66}
          style={{ flex: 1 }}
        />
        <LandmarkOverlay frame={frame} width={previewSize.width} height={previewSize.height} />

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
            tone={
              !isCalibrated
                ? 'neutral'
                : rate < LOW_BLINK_RATE
                  ? 'bad'
                  : rate < HEALTHY_BLINK_RATE
                    ? 'warn'
                    : 'ok'
            }
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
          label={isActive ? 'End session' : 'Start session'}
          variant={isActive ? 'danger' : 'primary'}
          isLoading={isSaving}
          onPress={() => (isActive ? void handleStop() : start())}
        />
      </View>
    </SafeAreaView>
  );
}

function StatusPill({
  status,
  isCalibrated,
  error,
}: {
  status: string;
  isCalibrated: boolean;
  error?: string;
}) {
  const text =
    status === 'error'
      ? (error ?? 'Tracking failed')
      : status === 'idle'
        ? 'Ready'
        : status === 'starting'
          ? 'Starting camera…'
          : status === 'searching'
            ? 'Looking for your face'
            : isCalibrated
              ? 'Tracking'
              : 'Calibrating — keep your eyes open';

  const tone =
    status === 'error'
      ? 'bg-signal-bad/20 text-signal-bad'
      : status === 'tracking' && isCalibrated
        ? 'bg-signal-ok/20 text-signal-ok'
        : 'bg-black/50 text-ink';

  return (
    <View className={`rounded-full px-4 py-2 ${tone.split(' ')[0]}`}>
      <Text
        accessibilityLiveRegion="polite"
        className={`text-sm font-medium ${tone.split(' ')[1]}`}
      >
        {text}
      </Text>
    </View>
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
        <Text className="text-2xl font-semibold text-ink">{title}</Text>
        <Text className="text-base leading-6 text-ink-muted">{body}</Text>
        {action ? <View className="mt-4">{action}</View> : null}
      </View>
    </SafeAreaView>
  );
}
