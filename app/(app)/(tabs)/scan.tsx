import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { OcularVisionView, type FaceDetectionEvent } from 'ocular-vision';
import Svg, { Ellipse } from 'react-native-svg';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricCard } from '@/components/ui/MetricCard';
import { Toast } from '@/components/ui/Toast';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useAuthStore } from '@/features/auth/auth-store';
import { useProfileStore } from '@/features/profile/profile-store';
import { formatTimer } from '@/features/sessions/dates';
import { saveSession } from '@/features/sessions/session-repository';
import {
  PENDING_RESULT_ID,
  useSessionResultsStore,
} from '@/features/sessions/session-results-store';
import { LandmarkOverlay } from '@/features/vision/components/LandmarkOverlay';
import { StatusPill } from '@/features/vision/components/StatusPill';
import { CoachingMonitor, type CoachingHint } from '@/features/vision/scan-coaching';
import { useCameraPermission } from '@/features/vision/use-camera-permission';
import { useFaceTracking } from '@/features/vision/use-face-tracking';
import { blinkRateTone, colors, duration } from '@/theme/tokens';

/**
 * The scan ritual (DESIGN_REVIEW.md §3 state machine).
 *
 * This screen never raises a native alert while the camera is live: notices
 * go through the `Toast` tier, save failures travel to the results screen's
 * banner, and blur-stops are silent (state 15). It also never *blocks* on
 * guidance — coaching pills advise, the pipeline keeps measuring.
 */

/** Selectable durations; must match the `default_session_seconds` DB check. */
const DURATION_OPTIONS_SECONDS = [60, 120, 300] as const;
const FALLBACK_DURATION_SECONDS = 120;

/**
 * An interruption longer than this ends the session with a partial save
 * (§3 state 11) — the camera is not coming back soon, and holding a paused
 * session open forever helps no one. JS timers suspend in the background, so
 * for backgrounding interruptions this fires on return to foreground; the
 * outcome is the same either way.
 */
const INTERRUPTION_LIMIT_MS = 10_000;

/** UI clock tick. Display shows whole seconds; 250 ms keeps them honest. */
const CLOCK_TICK_MS = 250;

type EndReason = 'user' | 'auto' | 'error' | 'interruption';

export default function ScanScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const profile = useProfileStore((state) => state.profile);
  const savePreference = useProfileStore((state) => state.saveInBackground);
  const setResultsHandoff = useSessionResultsStore((state) => state.setHandoff);

  const { permission, isLoading, request, openSettings, isSupported } = useCameraPermission();
  const { frame, status, error, isActive, isCalibrated, blinkCount, start, stop, viewProps } =
    useFaceTracking({
      landmarks: true,
    });

  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [coaching, setCoaching] = useState<CoachingHint | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [targetSeconds, setTargetSeconds] = useState<number>(() => {
    const preferred = profile?.default_session_seconds;
    return preferred != null && DURATION_OPTIONS_SECONDS.some((option) => option === preferred)
      ? preferred
      : FALLBACK_DURATION_SECONDS;
  });

  // The session clock lives in refs and mirrors the aggregator's pause
  // semantics: interrupted time is not measurement time. Duplicated here
  // (rather than read from the aggregator) because the aggregator is
  // summary-oriented and this is a 4-times-a-second display concern.
  const clockRef = useRef({ startedAtMs: 0, pausedMs: 0, pauseStartedAtMs: null as number | null });
  const completingRef = useRef(false);
  const coachingMonitorRef = useRef(new CoachingMonitor());

  // Driven from state in an effect rather than written in handlers: the
  // React Compiler treats shared values as immutable in render scope (the
  // same pattern Button's press spring follows).
  const [isPreviewFading, setIsPreviewFading] = useState(false);
  const previewOpacity = useSharedValue(1);

  useEffect(() => {
    // §3 state 12: on auto-complete the preview dims before the camera goes
    // off, so completion reads as a settling, not a cut.
    previewOpacity.value = withTiming(isPreviewFading ? 0.3 : 1, {
      duration: 400,
      easing: Easing.in(Easing.ease),
      reduceMotion: ReduceMotion.System,
    });
  }, [isPreviewFading, previewOpacity]);

  const previewStyle = useAnimatedStyle(() => ({ opacity: previewOpacity.value }));

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setPreviewSize({ width, height });
  }, []);

  // ── Ending a session (states 12–15 funnel through here) ───────────────────
  const completeSession = useCallback(
    async (options?: { navigate?: boolean; fade?: boolean; endedBy?: EndReason }) => {
      const { navigate: shouldNavigate = true, fade = false, endedBy = 'user' } = options ?? {};
      if (completingRef.current) return;
      completingRef.current = true;
      try {
        if (fade) {
          setIsPreviewFading(true);
          await wait(400);
        }

        const summary = stop();
        if (!summary || !user) return;

        setIsSaving(true);
        try {
          const saved = await saveSession(summary, user.id);
          if (!saved) {
            // Under the 10 s floor: a quiet acknowledgment, never an alert,
            // and no navigation (§3 states 13–14).
            if (shouldNavigate) {
              setToast(
                endedBy === 'error'
                  ? 'This check-in ended unexpectedly.'
                  : 'Under 10 seconds — too short to measure.'
              );
            }
            return;
          }
          if (!shouldNavigate) return;
          setResultsHandoff({ key: saved.id, summary, session: saved });
          router.push({ pathname: '/(app)/session/[id]', params: { id: saved.id, from: 'scan' } });
        } catch {
          // Save failed. With the user present, the measurement travels to
          // the results screen in memory and the banner owns the retry. On a
          // silent blur-stop (state 15) there is no one to tell — Today's
          // focus reload is the only acknowledgment either way.
          if (!shouldNavigate) return;
          setResultsHandoff({ key: PENDING_RESULT_ID, summary, session: null });
          router.push({
            pathname: '/(app)/session/[id]',
            params: { id: PENDING_RESULT_ID, from: 'scan' },
          });
        } finally {
          setIsSaving(false);
        }
      } finally {
        completingRef.current = false;
      }
    },
    [stop, user, router, setResultsHandoff]
  );

  // Refs so blur/error/interruption handlers always see current values
  // without re-arming their effects (re-arming is what made the old cleanup
  // fire on state flips rather than on actual blur).
  const completeSessionRef = useRef(completeSession);
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    completeSessionRef.current = completeSession;
    isActiveRef.current = isActive;
  }, [completeSession, isActive]);

  const handleBegin = useCallback(() => {
    clockRef.current = { startedAtMs: Date.now(), pausedMs: 0, pauseStartedAtMs: null };
    coachingMonitorRef.current.reset();
    setCoaching(null);
    setElapsedSeconds(0);
    setIsPreviewFading(false);
    start();
  }, [start]);

  const handleSelectDuration = useCallback(
    (seconds: number) => {
      setTargetSeconds(seconds);
      // Incidental preference: apply locally at once, write in the
      // background — blocking a chip tap on a network round trip would make
      // the control feel broken offline.
      savePreference({ default_session_seconds: seconds });
    },
    [savePreference]
  );

  // ── Session clock ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      const clock = clockRef.current;
      const openPauseMs = clock.pauseStartedAtMs !== null ? Date.now() - clock.pauseStartedAtMs : 0;
      const seconds = Math.max(0, (Date.now() - clock.startedAtMs - clock.pausedMs - openPauseMs) / 1000);
      setElapsedSeconds(seconds);

      // Auto-complete (state 12) checked on the tick rather than in an
      // effect: the tick is the thing that knows the time.
      if (seconds >= targetSeconds && !completingRef.current) {
        void completeSessionRef.current({ fade: true, endedBy: 'auto' });
      }
    }, CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, [isActive, targetSeconds]);

  // Interruptions pause the display clock, mirroring the aggregator (§3
  // state 11: a pause, unlike face-lost, which keeps counting).
  useEffect(() => {
    const clock = clockRef.current;
    if (status === 'interrupted') {
      if (clock.pauseStartedAtMs === null) clock.pauseStartedAtMs = Date.now();
    } else if (clock.pauseStartedAtMs !== null) {
      clock.pausedMs += Date.now() - clock.pauseStartedAtMs;
      clock.pauseStartedAtMs = null;
    }
  }, [status]);

  // An interruption that outlives its welcome ends the session (state 11).
  useEffect(() => {
    if (status !== 'interrupted') return;
    const enteredAtMs = Date.now();
    const timer = setTimeout(() => {
      void completeSessionRef.current({ endedBy: 'interruption' });
    }, INTERRUPTION_LIMIT_MS);
    return () => {
      clearTimeout(timer);
      // Resumed after the limit with the timer suspended (backgrounding
      // freezes JS timers): honor the rule on the way out.
      if (Date.now() - enteredAtMs > INTERRUPTION_LIMIT_MS && isActiveRef.current) {
        setTimeout(() => void completeSessionRef.current({ endedBy: 'interruption' }), 0);
      }
    };
  }, [status]);

  // A native failure ends the session gracefully (state 14): partial data at
  // or over the floor still earns its results screen; under it, a toast.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      void completeSessionRef.current({ endedBy: 'error' });
    }, 0);
    return () => clearTimeout(timer);
  }, [error]);

  // Stop when the tab loses focus — silently (state 15). The stable callback
  // means this cleanup runs on genuine blur, not on every state flip.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (isActiveRef.current) void completeSessionRef.current({ navigate: false });
      };
    }, [])
  );

  // ── Coaching (states 8–9), fed in the event handler at frame rate ────────
  const baseFaceDetection = viewProps.onFaceDetection;
  const handleFaceDetection = useCallback(
    (event: { nativeEvent: FaceDetectionEvent }) => {
      baseFaceDetection(event);
      const observed = event.nativeEvent;
      const hint = coachingMonitorRef.current.observe({
        timestampMs: observed.timestamp,
        hasFace: observed.hasFace,
        confidence: observed.confidence,
        faceWidthFraction: observed.hasFace ? (observed.boundingBox?.width ?? null) : null,
      });
      // Functional update with a bail-out: this runs ~15×/s and must not
      // re-render unless the hint actually changed.
      setCoaching((previous) => (previous === hint ? previous : hint));
    },
    [baseFaceDetection]
  );

  // ── Permission / support states (§3 states 2–3) ───────────────────────────
  if (!isSupported) {
    return (
      <CenteredNotice
        symbol="camera"
        title="Requires a physical device"
        body="The iOS Simulator has no camera, so Vision face tracking cannot run. Build to a connected iPhone with `npm run ios:device`."
      />
    );
  }

  if (isLoading) {
    return <CenteredNotice title="Checking camera access" body="One moment…" />;
  }

  if (!permission?.granted) {
    return permission?.canAskAgain ? (
      <CenteredNotice
        symbol="camera"
        title="Camera access needed"
        body="Ocular analyzes frames on-device to measure blink rate and head posture. Nothing is recorded or uploaded."
        action={{ label: 'Allow camera', onPress: () => void request() }}
      />
    ) : (
      <CenteredNotice
        symbol="camera"
        title="Camera access is off"
        body="Scans need it — nothing else does. You can turn it on anytime in Settings."
        action={{ label: 'Open Settings', onPress: () => void openSettings() }}
      />
    );
  }

  const blink = frame?.blink;
  const pose = frame?.headPose;
  const rate = blink?.blinksPerMinute ?? 0;
  const showLive = isActive && isCalibrated;
  const progress = Math.min(elapsedSeconds / targetSeconds, 1);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      {/* Bottom radius separates the camera from the instrument panel below it
          (DESIGN_REVIEW.md §3 anatomy). */}
      <View className="flex-1 overflow-hidden rounded-b-sheet" onLayout={handleLayout}>
        {/* Only the live imagery dims on auto-complete — the idle guide and
            pill sit outside the fade so the rest state never looks broken. */}
        <Animated.View style={[{ flex: 1 }, previewStyle]}>
          <OcularVisionView
            {...viewProps}
            onFaceDetection={handleFaceDetection}
            cameraPosition="front"
            updateInterval={66}
            style={{ flex: 1 }}
          />
          <LandmarkOverlay frame={frame} width={previewSize.width} height={previewSize.height} />
        </Animated.View>

        {!isActive ? <IdleGuide /> : null}

        <View className="absolute left-0 right-0 top-4 items-center">
          <StatusPill
            status={status}
            isCalibrated={isCalibrated}
            coaching={coaching}
            error={error?.message}
          />
        </View>
      </View>

      <View className="gap-3 px-4 pb-4 pt-4">
        <View className="flex-row gap-3">
          <MetricCard
            className="flex-1"
            label="Blink rate"
            value={showLive ? rate.toFixed(0) : '—'}
            unit="/min"
            // Shared thresholds from the theme, so this screen cannot drift
            // from how the same rate is toned on Today and in history.
            tone={showLive ? blinkRateTone(rate) : 'neutral'}
            hint={isActive && !isCalibrated ? 'Calibrating…' : undefined}
          />
          <BlinkPulse trigger={isActive ? blinkCount : 0}>
            <MetricCard
              label="Blinks"
              // The aggregator's session total, not the native per-frame
              // count — the native detector resets across interruptions.
              value={isActive ? String(blinkCount) : '—'}
              hint={
                isActive && blink?.lastBlinkDurationMs
                  ? `Last ${Math.round(blink.lastBlinkDurationMs)} ms`
                  : undefined
              }
            />
          </BlinkPulse>
        </View>

        <View className="flex-row gap-3">
          <MetricCard
            className="flex-1"
            label="Yaw"
            value={isActive && pose ? pose.yaw.toFixed(0) : '—'}
            unit="°"
          />
          <MetricCard
            className="flex-1"
            label="Pitch"
            value={isActive && pose ? pose.pitch.toFixed(0) : '—'}
            unit="°"
          />
          <MetricCard
            className="flex-1"
            label="Roll"
            value={isActive && pose ? pose.roll.toFixed(0) : '—'}
            unit="°"
          />
        </View>

        {isActive ? (
          <Animated.View
            key="active-controls"
            entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
            className="gap-3"
          >
            <View
              accessible
              accessibilityLabel={`${formatTimer(elapsedSeconds)} elapsed of ${formatTimer(targetSeconds)}`}
              className="gap-2"
            >
              <View className="flex-row items-baseline justify-between">
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-title2 font-semibold text-ink"
                >
                  {formatTimer(elapsedSeconds)}
                </Text>
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-sm text-ink-muted"
                >
                  {formatTimer(targetSeconds)}
                </Text>
              </View>
              <View className="h-1 overflow-hidden rounded-full bg-canvas-overlay">
                <View
                  className="h-1 rounded-full bg-accent"
                  style={{ width: `${progress * 100}%` }}
                />
              </View>
            </View>

            <Button
              label="End session"
              variant="danger-text"
              isLoading={isSaving}
              onPress={() => void completeSession({ endedBy: 'user' })}
            />
          </Animated.View>
        ) : (
          <Animated.View
            key="idle-controls"
            entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
            className="gap-3"
          >
            <SegmentedControl
              options={DURATION_OPTIONS_SECONDS.map((seconds) => ({
                value: seconds,
                label: `${seconds / 60} min`,
                accessibilityLabel: `${seconds / 60} minute session`,
              }))}
              value={targetSeconds}
              onChange={handleSelectDuration}
            />
            <Button label="Begin check-in" onPress={handleBegin} isLoading={isSaving} />
          </Animated.View>
        )}
      </View>

      <Toast message={toast} onHide={() => setToast(null)} />
    </SafeAreaView>
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Full-screen notice for the support/permission states, in the standard tone. */
function CenteredNotice(props: {
  symbol?: 'camera';
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 justify-center">
        <EmptyState {...props} />
      </View>
    </SafeAreaView>
  );
}

/**
 * The 120 ms blink acknowledgment on the Blinks tile (§6 motion table).
 * Scale only, never a haptic — a buzz per blink would be unbearable.
 */
function BlinkPulse({ trigger, children }: { trigger: number; children: ReactNode }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (trigger === 0) return;
    scale.value = withSequence(
      withTiming(1.06, {
        duration: duration.pulse / 2,
        easing: Easing.out(Easing.ease),
        reduceMotion: ReduceMotion.System,
      }),
      withTiming(1, {
        duration: duration.pulse / 2,
        easing: Easing.in(Easing.ease),
        reduceMotion: ReduceMotion.System,
      })
    );
  }, [trigger, scale]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={pulseStyle} className="flex-1">
      {children}
    </Animated.View>
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
