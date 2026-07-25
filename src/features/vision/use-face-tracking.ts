import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BlinkEvent,
  FaceDetectionEvent,
  SessionStateEvent,
  VisionErrorEvent,
} from 'ocular-vision';

import { SessionAggregator, type SessionSummary } from '@/features/vision/session-aggregator';

export type TrackingStatus =
  'idle' | 'starting' | 'tracking' | 'searching' | 'interrupted' | 'error';

interface UseFaceTrackingOptions {
  /**
   * Emit landmark points for overlay rendering. Off by default — serializing
   * 76 points per frame is the single most expensive thing this module does,
   * and most screens only need the scalar metrics.
   */
  landmarks?: boolean;
}

interface FaceTrackingState {
  /**
   * Most recent frame — **only populated when `landmarks` is enabled**, since
   * the overlay is its sole consumer. Holding a fresh event object in state
   * at the native update rate forces a render of the whole scan screen 15
   * times a second; scalar consumers read `hasFace`/`isCalibrated` instead,
   * which React bails out of when unchanged.
   */
  frame: FaceDetectionEvent | null;
  status: TrackingStatus;
  error: VisionErrorEvent | null;
  isActive: boolean;
  /** True once the blink detector has established a per-face baseline. */
  isCalibrated: boolean;
  /**
   * Blinks counted since `start()`, from the JS aggregator. Unlike
   * `frame.blink.blinkCount`, this survives interruptions — the native
   * detector deliberately resets its count when the capture session resumes,
   * which made the on-screen counter appear to lose the user's blinks.
   */
  blinkCount: number;

  start: () => void;
  stop: () => SessionSummary | null;

  /** Spread onto `<OcularVisionView />`. Handler identities are stable. */
  viewProps: {
    isActive: boolean;
    landmarksEnabled: boolean;
    onFaceDetection: (event: { nativeEvent: FaceDetectionEvent }) => void;
    onBlink: (event: { nativeEvent: BlinkEvent }) => void;
    onSessionStateChange: (event: { nativeEvent: SessionStateEvent }) => void;
    onVisionError: (event: { nativeEvent: VisionErrorEvent }) => void;
  };
}

/**
 * Drives a face-tracking session and accumulates its summary.
 *
 * ## Why the aggregator lives in a ref
 * Every frame must reach the aggregator, but re-rendering on every frame to
 * accomplish that would be wasteful — the aggregator's running sums are not
 * rendered. So frames go into a ref synchronously, and only the small display
 * payload goes through `setState`. The render rate is therefore governed by the
 * native `updateInterval` prop (default ~15/sec), not by the capture rate.
 */
export function useFaceTracking(options: UseFaceTrackingOptions = {}): FaceTrackingState {
  const { landmarks = false } = options;

  const [frame, setFrame] = useState<FaceDetectionEvent | null>(null);
  const [hasFace, setHasFace] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<VisionErrorEvent | null>(null);
  const [sessionState, setSessionState] = useState<SessionStateEvent['state']>('idle');
  const [blinkCount, setBlinkCount] = useState(0);

  const aggregatorRef = useRef<SessionAggregator | null>(null);
  // Mirrors `isActive` for use inside event handlers. Native events can arrive
  // after `stop()` — the capture queue may already have a frame in flight — and
  // reading state directly in the handler would fold those stragglers into a
  // session the user has already ended.
  const isActiveRef = useRef(false);
  // Read inside the frame handler so toggling the mesh never re-arms the
  // handler (which would churn `viewProps` and re-cross the bridge).
  const landmarksRef = useRef(landmarks);
  useEffect(() => {
    landmarksRef.current = landmarks;
  }, [landmarks]);

  const start = useCallback(() => {
    aggregatorRef.current = new SessionAggregator(new Date());
    isActiveRef.current = true;
    setError(null);
    setBlinkCount(0);
    setHasFace(false);
    setIsCalibrated(false);
    setIsActive(true);
  }, []);

  const stop = useCallback((): SessionSummary | null => {
    isActiveRef.current = false;
    setIsActive(false);
    setHasFace(false);
    // Release the retained frame: with landmarks on it holds 76 points, and
    // nothing should keep the last image-derived geometry alive after a
    // session ends.
    setFrame(null);

    const aggregator = aggregatorRef.current;
    aggregatorRef.current = null;

    if (!aggregator?.hasData) return null;
    return aggregator.summarize(new Date());
  }, []);

  const handleFaceDetection = useCallback((event: { nativeEvent: FaceDetectionEvent }) => {
    if (!isActiveRef.current) return;
    const observed = event.nativeEvent;
    aggregatorRef.current?.addFrame(observed);

    // Booleans, not the event object: React bails out of the render entirely
    // when these are unchanged, so a steady tracking state costs zero renders
    // per frame instead of one. Only the mesh needs the full payload.
    setHasFace(observed.hasFace);
    setIsCalibrated(observed.blink?.isCalibrated ?? false);
    if (landmarksRef.current) setFrame(observed);
  }, []);

  const handleBlink = useCallback((event: { nativeEvent: BlinkEvent }) => {
    if (!isActiveRef.current) return;
    aggregatorRef.current?.addBlink(event.nativeEvent);
    // One state write per blink, not per frame — blinks arrive a few times a
    // minute, so this is cheap, and it keeps the visible counter continuous
    // across the native detector's interruption resets.
    setBlinkCount((count) => count + 1);
  }, []);

  const handleSessionStateChange = useCallback((event: { nativeEvent: SessionStateEvent }) => {
    // Interrupted time is not measurement time: no frames arrive while the
    // camera is suspended, so the aggregator's clock pauses with it. Resuming
    // on any 'running' transition is safe — resume without a pause is a no-op.
    if (event.nativeEvent.state === 'interrupted') {
      aggregatorRef.current?.pause();
    } else if (event.nativeEvent.state === 'running') {
      aggregatorRef.current?.resume();
    }
    setSessionState(event.nativeEvent.state);
  }, []);

  const handleVisionError = useCallback((event: { nativeEvent: VisionErrorEvent }) => {
    setError(event.nativeEvent);
    isActiveRef.current = false;
    setIsActive(false);
    setFrame(null);
  }, []);

  // Releasing the camera on unmount is not optional: a session left running
  // holds the capture device and keeps the system's camera-in-use indicator lit
  // after the user has navigated away.
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      aggregatorRef.current = null;
    };
  }, []);

  const status = useMemo<TrackingStatus>(() => {
    if (error || sessionState === 'failed') return 'error';
    if (!isActive) return 'idle';
    // Before this case existed, an interruption fell through to 'starting' and
    // the UI claimed "Starting camera…" while the camera was actually paused
    // by iOS — misleading exactly when the user most needs the truth.
    if (sessionState === 'interrupted') return 'interrupted';
    if (sessionState !== 'running') return 'starting';
    return hasFace ? 'tracking' : 'searching';
  }, [error, sessionState, isActive, hasFace]);

  const viewProps = useMemo(
    () => ({
      isActive,
      landmarksEnabled: landmarks,
      onFaceDetection: handleFaceDetection,
      onBlink: handleBlink,
      onSessionStateChange: handleSessionStateChange,
      onVisionError: handleVisionError,
    }),
    [
      isActive,
      landmarks,
      handleFaceDetection,
      handleBlink,
      handleSessionStateChange,
      handleVisionError,
    ]
  );

  return {
    // Derived rather than cleared in an effect: turning the mesh off mid-app
    // must not leave the last frame's geometry addressable, and a derivation
    // cannot cascade a render the way a state reset would.
    frame: landmarks ? frame : null,
    status,
    error,
    isActive,
    isCalibrated,
    blinkCount,
    start,
    stop,
    viewProps,
  };
}
