import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { OcularVisionView, type FaceDetectionEvent } from 'ocular-vision';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toast } from '@/components/ui/Toast';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useAuthStore } from '@/features/auth/auth-store';
import { useProfileStore } from '@/features/profile/profile-store';
import { formatTimer } from '@/features/sessions/dates';
import { saveSession } from '@/features/sessions/session-repository';
import {
  PENDING_RESULT_ID,
  useSessionResultsStore,
} from '@/features/sessions/session-results-store';
import { PlanLimitCard } from '@/features/subscription/components/PlanLimitCard';
import { useCheckInGate } from '@/features/subscription/use-check-in-gate';
import { FaceGuide, type FaceGuideState } from '@/features/vision/components/FaceGuide';
import { LandmarkOverlay } from '@/features/vision/components/LandmarkOverlay';
import { PrivacyBadge } from '@/features/vision/components/PrivacyBadge';
import { ScanIntroOverlay } from '@/features/vision/components/ScanIntroOverlay';
import { StatusPill } from '@/features/vision/components/StatusPill';
import { CoachingMonitor, type CoachingHint } from '@/features/vision/scan-coaching';
import { useCameraPermission } from '@/features/vision/use-camera-permission';
import { useFaceTracking } from '@/features/vision/use-face-tracking';

/**
 * The scan ritual (DESIGN_REVIEW.md §3 state machine).
 *
 * A session moves through two phases on top of the tracking states:
 *
 * - **intro** (~5 s): the `ScanIntroOverlay` sits over the live camera and
 *   asks the user to put the phone down and go back to work. It dismisses
 *   itself; a tap dismisses it early.
 * - **focus**: the interface recedes to almost nothing — elapsed time, a
 *   hairline of progress, the privacy badge, and a tiny status dot. Live
 *   numbers belong on the results screen; a phone worth glancing at would
 *   defeat the measurement (conscious blinking is not natural blinking).
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

/**
 * How long the intro overlay stays before dismissing itself. Long enough to
 * read four short lines calmly, short enough that a repeat user who already
 * set the phone down is never held up (and a tap skips it entirely).
 */
const INTRO_DURATION_MS = 5000;

/**
 * Native → JS frame event interval (~15/s). Detection itself runs at capture
 * rate on the native side; this only governs how often results cross the
 * bridge, which is the part that costs JS time and battery.
 */
const FRAME_INTERVAL_MS = 66;

/** Module constant so the native view never sees a "changed" style prop. */
const styles = StyleSheet.create({ fill: { flex: 1 } });

type EndReason = 'user' | 'auto' | 'error' | 'interruption';

export default function ScanScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  // Field selectors rather than the whole profile: subscribing to the object
  // re-renders this screen — with a camera running — every time any unrelated
  // preference is written (a goal change, an onboarding step, a daily target).
  const preferredSeconds = useProfileStore((state) => state.profile?.default_session_seconds);
  const showLandmarks = useProfileStore((state) => state.profile?.show_landmarks ?? false);
  const savePreference = useProfileStore((state) => state.saveInBackground);
  const setResultsHandoff = useSessionResultsStore((state) => state.setHandoff);

  // The plan's daily allowance, counted server-side and refreshed on focus.
  // Gating happens at *start*: a session already running is never interrupted
  // by a limit, and whatever it measured is always saved and always shown.
  const checkInGate = useCheckInGate();
  const { recordCheckIn } = checkInGate;

  const { permission, isLoading, request, openSettings, isSupported } = useCameraPermission();
  // Mesh off by default (§3: a wireframe crawling over your face is the
  // visual language of surveillance). The `show_landmarks` preference exists
  // for the curious; leaving the option off also spares serializing 76
  // points per frame for everyone who never asked to see them.
  const { frame, status, error, isActive, isCalibrated, start, stop, viewProps } = useFaceTracking({
    landmarks: showLandmarks,
  });

  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingResultId, setPendingResultId] = useState<string | null>(null);
  const [coaching, setCoaching] = useState<CoachingHint | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Duration is *derived*, not synced. Seeding state from the profile at mount
  // would miss a profile that arrives late — splash holds until the profile
  // settles, but "settled" includes *failed*, so a retry or account switch can
  // land after this screen is up. Reading it every render costs nothing and
  // cannot go stale. An explicit tap (and `handleBegin`, which pins the target
  // for the session) wins over the stored value; the DB constrains the column
  // to these three values, so anything else is treated as absent.
  const [chosenSeconds, setChosenSeconds] = useState<number | null>(null);
  const storedSeconds =
    DURATION_OPTIONS_SECONDS.find((option) => option === preferredSeconds) ?? null;
  const targetSeconds = chosenSeconds ?? storedSeconds ?? FALLBACK_DURATION_SECONDS;

  // The session clock lives in refs and mirrors the aggregator's pause
  // semantics: interrupted time is not measurement time. Duplicated here
  // (rather than read from the aggregator) because the aggregator is
  // summary-oriented and this is a 4-times-a-second display concern.
  const clockRef = useRef({ startedAtMs: 0, pausedMs: 0, pauseStartedAtMs: null as number | null });
  const completingRef = useRef(false);
  const coachingMonitorRef = useRef(new CoachingMonitor());

  // Sticky calibration memory. `hasCalibrated` outlives the hook's per-frame
  // `isCalibrated` — a lost face reports uncalibrated, but this session has
  // already tracked, which changes both the guide treatment and the searching
  // copy ("face lost", not "looking for your face").
  const [hasCalibrated, setHasCalibrated] = useState(false);

  // The session's presentation phase: the intro overlay first, then the
  // receded focus interface. Only meaningful while `isActive`; `handleBegin`
  // resets it for every session.
  const [phase, setPhase] = useState<'intro' | 'focus'>('intro');

  // The overlay dismisses itself — a timer, not a tracking condition, so it
  // can never hang around because calibration is slow, and never bail early.
  useEffect(() => {
    if (!isActive || phase !== 'intro') return;
    const timer = setTimeout(() => setPhase('focus'), INTRO_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isActive, phase]);

  const handleSkipIntro = useCallback(() => setPhase('focus'), []);

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
        if (!summary || !user) {
          setIsPreviewFading(false);
          return;
        }

        setIsSaving(true);
        try {
          const saved = await saveSession(summary, user.id);
          if (!saved) {
            // Under the 10 s floor: a quiet acknowledgment, never an alert,
            // and no navigation (§3 states 13–14). The preview returns to
            // full opacity because we are staying on this screen.
            setIsPreviewFading(false);
            if (shouldNavigate) {
              setToast(
                endedBy === 'error'
                  ? 'This check-in ended unexpectedly.'
                  : 'Under 10 seconds — too short to measure.'
              );
            }
            return;
          }
          // A persisted session spends the day's allowance — including on the
          // silent blur-stop path, where nothing else would notice it.
          recordCheckIn();
          if (!shouldNavigate) return;
          setResultsHandoff({ key: saved.id, summary, session: saved });
          setPendingResultId(saved.id);
        } catch {
          // Save failed. With the user present, the measurement travels to
          // the results screen in memory and the banner owns the retry. On a
          // silent blur-stop (state 15) there is no one to tell — Today's
          // focus reload is the only acknowledgment either way.
          if (!shouldNavigate) return;
          setResultsHandoff({ key: PENDING_RESULT_ID, summary, session: null });
          setPendingResultId(PENDING_RESULT_ID);
        } finally {
          setIsSaving(false);
        }
      } finally {
        completingRef.current = false;
      }
    },
    [stop, user, setResultsHandoff, recordCheckIn]
  );

  /**
   * §3 state 12: "Camera off and badge gone *before* navigation."
   *
   * `stop()` does not switch the camera off — it clears `isActive`, and the
   * native view releases the capture device when that prop *commits*. Pushing
   * inline right after the awaited save would race the renderer: on a fast
   * save the route could mount while the preview was still live, and because
   * results push *over* the tab bar this screen stays mounted, so nothing
   * downstream would correct it. Deferring the push to an effect gated on
   * `!isActive` makes the ordering a React guarantee rather than a timing bet.
   */
  const navigatedResultRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingResultId || isActive) return;
    // The push is the effect's external-system write; the "already navigated"
    // bookkeeping is a ref rather than state so this cannot cascade a render,
    // and so a change in `router` identity cannot push the same result twice.
    if (navigatedResultRef.current === pendingResultId) return;
    navigatedResultRef.current = pendingResultId;
    router.push({
      pathname: '/(app)/session/[id]',
      params: { id: pendingResultId, from: 'scan' },
    });
  }, [pendingResultId, isActive, router]);

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
    // The control is replaced when the allowance is spent, so this is a
    // guard against a stale render, not the primary gate.
    if (!checkInGate.isAllowed) return;
    clockRef.current = { startedAtMs: Date.now(), pausedMs: 0, pauseStartedAtMs: null };
    coachingMonitorRef.current.reset();
    setCoaching(null);
    setElapsedSeconds(0);
    setIsPreviewFading(false);
    setHasCalibrated(false);
    setPhase('intro');
    // Pin the duration for this session so a profile write landing mid-scan
    // cannot move the finish line, and clear the previous run's navigation
    // bookkeeping before a new one can produce any.
    setChosenSeconds(targetSeconds);
    setPendingResultId(null);
    navigatedResultRef.current = null;
    start();
  }, [start, targetSeconds, checkInGate.isAllowed]);

  const handleSelectDuration = useCallback(
    (seconds: number) => {
      setChosenSeconds(seconds);
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
      const seconds = Math.max(
        0,
        (Date.now() - clock.startedAtMs - clock.pausedMs - openPauseMs) / 1000
      );
      // The tick stays at 250 ms so auto-complete lands close to the target,
      // but state carries whole seconds — the only granularity the timer and
      // the progress bar render. React bails on the three ticks in four that
      // would repaint an identical display.
      setElapsedSeconds(Math.floor(seconds));

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

      // Sticky calibration memory; React bails on the ~15/s identical writes.
      if (observed.hasFace && observed.blink?.isCalibrated) {
        setHasCalibrated(true);
      }

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

  // ── Guide state (§3 states 5–11), all derived, no new machinery ───────────
  // In the focus phase a locked guide *disappears* (state 7's recession): a
  // frame around your face is an invitation to look at it. It fades back in
  // by itself the moment tracking degrades, because those states derive to
  // visible treatments.
  const isFocused = isActive && phase === 'focus';
  const guideState: FaceGuideState =
    status === 'interrupted' || status === 'error'
      ? 'dimmed'
      : status === 'tracking'
        ? isCalibrated
          ? isFocused
            ? 'hidden'
            : 'locked'
          : 'acquired'
        : 'searching';

  const progress = Math.min(elapsedSeconds / targetSeconds, 1);

  return (
    <Screen>
      {/* Bottom radius separates the camera from the instrument panel below it
          (DESIGN_REVIEW.md §3 anatomy). */}
      <View className="flex-1 overflow-hidden rounded-b-sheet" onLayout={handleLayout}>
        {/* Only the live imagery dims on auto-complete — the idle guide and
            pill sit outside the fade so the rest state never looks broken. */}
        <Animated.View style={[styles.fill, previewStyle]}>
          {/* `styles.fill` is a module constant, not an inline object: an
              inline style is a fresh value on every render, which the native
              view sees as a changed prop and writes across the bridge. */}
          <OcularVisionView
            {...viewProps}
            onFaceDetection={handleFaceDetection}
            cameraPosition="front"
            updateInterval={FRAME_INTERVAL_MS}
            style={styles.fill}
          />
          {showLandmarks ? (
            <LandmarkOverlay frame={frame} width={previewSize.width} height={previewSize.height} />
          ) : null}
          {isActive ? (
            <FaceGuide state={guideState} width={previewSize.width} height={previewSize.height} />
          ) : null}
        </Animated.View>

        {!isActive ? <IdleGuide width={previewSize.width} height={previewSize.height} /> : null}

        {/* The intro ritual (state 4½), under the badge in z-order: the
            on-device promise stays visible even over the scrim. */}
        {isActive && phase === 'intro' ? <ScanIntroOverlay onSkip={handleSkipIntro} /> : null}

        {/* Badge and camera share one source of truth: the same `isActive`
            that drives the capture session mounts the badge (§3 anatomy). */}
        {isActive ? (
          <View className="absolute left-4 top-4">
            <PrivacyBadge />
          </View>
        ) : null}

        {/* Inset past the badge so long coaching copy wraps beside it rather
            than running underneath. During the intro the overlay owns the
            narration; the pill mounts with the focus phase and, once settled,
            recedes to the tiny status dot. */}
        {!isActive || phase === 'focus' ? (
          <View className="absolute inset-x-32 top-4 items-center">
            <StatusPill
              status={status}
              isCalibrated={isCalibrated}
              coaching={coaching}
              error={error?.message}
              minimal={isFocused}
              hasEverTracked={hasCalibrated}
            />
          </View>
        ) : null}
      </View>

      <View className="gap-3 px-4 pb-4 pt-4">
        {isActive ? (
          /* The receded footer (§3 state 7): a quiet elapsed clock, a
             hairline of progress, and a way out. No live numbers — a phone
             worth glancing at would corrupt the measurement it's making;
             the readings belong to the results screen. */
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
                {/* Tabular figures are not cosmetic — proportional digits
                    reflow the string every tick and the number visibly
                    jitters. */}
                <Text
                  maxFontSizeMultiplier={2}
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-sm font-medium text-ink-muted"
                >
                  {formatTimer(elapsedSeconds)}
                </Text>
                <Text
                  maxFontSizeMultiplier={2}
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-sm text-ink-faint"
                >
                  {formatTimer(targetSeconds)}
                </Text>
              </View>
              <View className="h-0.5 overflow-hidden rounded-full bg-canvas-overlay">
                <View
                  className="h-0.5 rounded-full bg-accent/70"
                  style={{ width: `${progress * 100}%` }}
                />
              </View>
            </View>

            {/* Ghost, not danger chrome: ending early is an ordinary choice,
                and the one control on a receded screen shouldn't be its
                loudest element. */}
            <Button
              label="End early"
              variant="ghost"
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
            {checkInGate.isAllowed ? (
              <>
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
                {/* Said once, on the last one — a counter on every idle
                    screen would turn a wellness ritual into a metered
                    utility, and Today already carries the running tally. */}
                {checkInGate.remaining === 1 ? (
                  <Text maxFontSizeMultiplier={2} className="text-center text-xs text-ink-faint">
                    Last check-in on your plan today
                  </Text>
                ) : null}
              </>
            ) : (
              // The allowance is spent (trigger 2: this card *is* the answer
              // to an attempted fourth check-in). The duration chips and the
              // button go with it — a disabled primary button invites tapping
              // at something that will not respond. The way forward is one
              // honest action into the premium sheet.
              <PlanLimitCard
                symbol="checkmark.circle"
                title={
                  checkInGate.limit === null
                    ? "That's all your check-ins for today"
                    : `That's all ${checkInGate.limit} check-ins for today`
                }
                body="You've used the check-ins your plan includes today. Everything you measured is saved and waiting on Today."
                footnote="Resets at midnight."
                action={{
                  label: 'See Ocular Pro',
                  onPress: () =>
                    router.push({
                      pathname: '/(app)/premium',
                      params: { trigger: 'fourth-check-in' },
                    }),
                }}
              />
            )}
          </Animated.View>
        )}
      </View>

      <Toast message={toast} onHide={() => setToast(null)} />
    </Screen>
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
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 justify-center">
        <EmptyState {...props} />
      </View>
    </Screen>
  );
}

/**
 * The scan tab at rest (DESIGN_REVIEW.md §3, state 1).
 *
 * The camera is genuinely off before a session starts, which used to render as
 * a black void. This overlay makes the rest state look intentional: the same
 * breathing FaceGuide the live states use (its `searching` treatment *is* the
 * rest treatment), on raised canvas, plus one line confirming the camera is
 * off — the idle screen's job is to *show* the privacy promise, not just rely
 * on onboarding having stated it.
 */
function IdleGuide({ width, height }: { width: number; height: number }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0 bg-canvas-raised"
    >
      <FaceGuide state="searching" width={width} height={height} />
      <View className="absolute inset-x-0 bottom-8 items-center">
        <Text maxFontSizeMultiplier={2} className="text-sm text-ink-muted">
          Camera stays off until you begin
        </Text>
      </View>
    </View>
  );
}
