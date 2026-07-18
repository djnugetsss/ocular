/**
 * Wire types for the `ocular-vision` native module.
 *
 * These mirror the payloads constructed in `ios/OcularVisionPayload.swift`. Any
 * change here needs a matching change there; the two files are the contract
 * between the React Native layer and the Vision pipeline.
 */

/** Which physical camera the tracking session should open. */
export type CameraPosition = 'front' | 'back';

/** Result of a camera-permission query or request. */
export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PermissionResponse {
  status: PermissionStatus;
  granted: boolean;
  /** False when the user has permanently denied access and must visit Settings. */
  canAskAgain: boolean;
}

/** Lifecycle of the underlying `AVCaptureSession`. */
export type SessionState =
  'idle' | 'configuring' | 'running' | 'interrupted' | 'stopped' | 'failed';

/**
 * A point in the preview view's coordinate space, normalized to `0..1` with the
 * origin at the top-left — i.e. multiply by the view's width/height to get a
 * pixel offset. Mirroring and aspect-fill cropping have already been applied,
 * so these can be drawn directly on top of the preview without correction.
 */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/** An axis-aligned box in the same normalized preview space as `NormalizedPoint`. */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Named landmark regions from Vision's 76-point constellation. Only emitted
 * while the `landmarksEnabled` prop is true, since serializing every point at
 * frame rate is measurably expensive.
 */
export interface FaceLandmarks {
  faceContour: NormalizedPoint[];
  leftEye: NormalizedPoint[];
  rightEye: NormalizedPoint[];
  leftEyebrow: NormalizedPoint[];
  rightEyebrow: NormalizedPoint[];
  leftPupil: NormalizedPoint[];
  rightPupil: NormalizedPoint[];
  nose: NormalizedPoint[];
  noseCrest: NormalizedPoint[];
  medianLine: NormalizedPoint[];
  outerLips: NormalizedPoint[];
  innerLips: NormalizedPoint[];
}

/** Head rotation in degrees, in the camera's frame of reference. */
export interface HeadPose {
  /** Left/right shake. Negative turns toward the subject's right. */
  yaw: number;
  /** Up/down nod. Positive looks up. */
  pitch: number;
  /** Head tilt toward a shoulder. Positive tilts toward the subject's right. */
  roll: number;
  /**
   * `0..1` measure of how still the head has been over the recent window. Low
   * values mean the pose reading is in motion and should not be trusted for
   * calibration.
   */
  stability: number;
}

export interface EyeState {
  /**
   * Eye aspect ratio — aperture divided by corner-to-corner width. Roughly 0.3
   * for a relaxed open eye and near 0.1 when shut, but the absolute value
   * varies per face, which is why blink detection calibrates a baseline rather
   * than using a fixed cutoff.
   */
  aspectRatio: number;
  /** `aspectRatio` normalized against this face's calibrated open baseline. */
  openness: number;
  isClosed: boolean;
}

export interface BlinkMetrics {
  left: EyeState;
  right: EyeState;
  /** Blinks counted since the session started or was last reset. */
  blinkCount: number;
  /** Blink rate extrapolated from a trailing 60-second window. */
  blinksPerMinute: number;
  /** Duration of the most recent completed blink, or null if none yet. */
  lastBlinkDurationMs: number | null;
  /** Milliseconds since the last completed blink, or null if none yet. */
  timeSinceLastBlinkMs: number | null;
  /**
   * True once enough open-eye frames have been observed to trust the baseline.
   * Blink events are suppressed until this flips true.
   */
  isCalibrated: boolean;
}

/** A single frame's worth of analysis. */
export interface FaceDetectionEvent {
  /** Monotonic capture timestamp in milliseconds. */
  timestamp: number;
  /** False when no face was found; every other field is stale in that case. */
  hasFace: boolean;
  /** Vision's confidence in the detection, `0..1`. */
  confidence: number;
  boundingBox: NormalizedRect | null;
  headPose: HeadPose | null;
  blink: BlinkMetrics | null;
  landmarks: FaceLandmarks | null;
  /** Frames per second the Vision pipeline is actually sustaining. */
  processedFps: number;
}

/** Fired once per completed blink, independently of the per-frame stream. */
export interface BlinkEvent {
  timestamp: number;
  durationMs: number;
  eye: 'left' | 'right' | 'both';
  blinkCount: number;
  blinksPerMinute: number;
}

export interface SessionStateEvent {
  state: SessionState;
  /** Present when `state` is `failed` or `interrupted`. */
  reason: string | null;
}

export interface VisionErrorEvent {
  code: string;
  message: string;
}

/** Props accepted by the native preview view. */
export interface OcularVisionViewProps {
  /** Starts/stops the capture session. Defaults to false. */
  isActive?: boolean;
  cameraPosition?: CameraPosition;
  /**
   * Include the full landmark constellation in each frame event. Off by
   * default — enable only while something is actually drawing an overlay.
   */
  landmarksEnabled?: boolean;
  /**
   * Minimum milliseconds between `onFaceDetection` events. Vision still runs on
   * every frame; this only throttles what crosses into JS. Defaults to 66ms
   * (~15 events/sec), which is plenty for UI and keeps the bridge quiet.
   */
  updateInterval?: number;
  /** Mirror the preview horizontally. Defaults to true for the front camera. */
  mirrored?: boolean;

  onFaceDetection?: (event: { nativeEvent: FaceDetectionEvent }) => void;
  onBlink?: (event: { nativeEvent: BlinkEvent }) => void;
  onSessionStateChange?: (event: { nativeEvent: SessionStateEvent }) => void;
  onVisionError?: (event: { nativeEvent: VisionErrorEvent }) => void;
}
