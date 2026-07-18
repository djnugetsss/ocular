import Foundation

/// Per-face blink detection from eye aspect ratios.
///
/// Absolute EAR is not comparable across faces — eye shape, glasses, and camera
/// distance all shift it — so the detector calibrates an open-eye baseline per
/// session and thresholds relative to that. Two mechanisms keep it from firing
/// on noise:
///
/// - **Hysteresis.** Closing requires dropping below `closeRatio` of baseline;
///   reopening requires climbing back above the higher `openRatio`. An EAR
///   hovering at the boundary cannot oscillate.
/// - **Duration gating.** A closure only counts once the eye reopens, and only
///   if it stayed shut between `minBlinkDuration` and `maxBlinkDuration`.
///   Shorter is tracking jitter; longer is a deliberate squint, a yawn, or a
///   dropout, none of which are blinks.
struct BlinkDetectorConfiguration {
  /// Frames of open-eye data required before the baseline is trusted.
  var calibrationFrames: Int = 30
  /// Fraction of baseline EAR below which the eye is considered closing.
  var closeRatio: Double = 0.70
  /// Fraction of baseline EAR above which the eye is considered open again.
  var openRatio: Double = 0.82
  var minBlinkDuration: TimeInterval = 0.045
  var maxBlinkDuration: TimeInterval = 0.60
  /// Trailing window used to extrapolate blinks per minute.
  var rateWindow: TimeInterval = 60
  /// EMA weight for baseline drift while the eye is open. Small on purpose:
  /// the baseline should follow posture changes over seconds, not track a blink.
  var baselineAdaptation: Double = 0.02
}

/// Blink state for one eye.
final class EyeBlinkTracker {
  enum State {
    case open
    case closed(since: TimeInterval)
  }

  private let configuration: BlinkDetectorConfiguration
  private var calibrationSamples: RollingWindow
  private var baseline: Double?
  private(set) var state: State = .open
  private(set) var lastAspectRatio: Double = 0

  init(configuration: BlinkDetectorConfiguration) {
    self.configuration = configuration
    self.calibrationSamples = RollingWindow(capacity: configuration.calibrationFrames)
  }

  var isCalibrated: Bool { baseline != nil }
  var isClosed: Bool {
    if case .closed = state { return true }
    return false
  }

  /// Current EAR as a fraction of the calibrated open baseline, clamped to `0...1`.
  var openness: Double {
    guard let baseline, baseline > .ulpOfOne else { return 1 }
    return min(1, max(0, lastAspectRatio / baseline))
  }

  /// Feeds one frame in.
  ///
  /// - Returns: The closure duration in seconds when this frame completed a
  ///   valid blink, otherwise `nil`.
  @discardableResult
  func update(aspectRatio: Double, timestamp: TimeInterval) -> TimeInterval? {
    lastAspectRatio = aspectRatio

    guard let baseline else {
      // Calibration assumes the eye is mostly open. A blink during calibration
      // pulls a few low samples in, which is why the baseline is the median of
      // the window rather than its mean.
      calibrationSamples.append(aspectRatio)
      if calibrationSamples.isFull {
        let candidate = calibrationSamples.median
        if candidate > .ulpOfOne {
          self.baseline = candidate
        } else {
          calibrationSamples.reset()
        }
      }
      return nil
    }

    let closeThreshold = baseline * configuration.closeRatio
    let openThreshold = baseline * configuration.openRatio

    switch state {
    case .open:
      if aspectRatio < closeThreshold {
        state = .closed(since: timestamp)
      } else {
        // Only adapt while unambiguously open, so the baseline never chases a
        // partial closure downward and desensitizes the detector.
        if aspectRatio > openThreshold {
          self.baseline =
            baseline * (1 - configuration.baselineAdaptation)
            + aspectRatio * configuration.baselineAdaptation
        }
      }
      return nil

    case .closed(let since):
      guard aspectRatio > openThreshold else {
        // Still shut. A closure that runs past the ceiling is not a blink, so
        // drop back to open without emitting; this resynchronizes after a
        // sustained squint or a tracking dropout.
        if timestamp - since > configuration.maxBlinkDuration {
          state = .open
        }
        return nil
      }

      let duration = timestamp - since
      state = .open

      guard duration >= configuration.minBlinkDuration,
        duration <= configuration.maxBlinkDuration
      else {
        return nil
      }
      return duration
    }
  }

  func reset() {
    calibrationSamples.reset()
    baseline = nil
    state = .open
    lastAspectRatio = 0
  }
}

/// Completed blink, as reported to JS.
struct DetectedBlink {
  enum Eye: String {
    case left
    case right
    case both
  }

  let eye: Eye
  let durationMs: Double
  let timestamp: TimeInterval
}

/// Combines the two per-eye trackers and maintains count and rate.
final class BlinkDetector {
  private let configuration: BlinkDetectorConfiguration
  private let leftEye: EyeBlinkTracker
  private let rightEye: EyeBlinkTracker

  /// Timestamps of recent blinks, pruned to `rateWindow` on each access.
  private var recentBlinkTimestamps: [TimeInterval] = []

  private(set) var blinkCount: Int = 0
  private(set) var lastBlinkDurationMs: Double?
  private(set) var lastBlinkTimestamp: TimeInterval?

  init(configuration: BlinkDetectorConfiguration = BlinkDetectorConfiguration()) {
    self.configuration = configuration
    self.leftEye = EyeBlinkTracker(configuration: configuration)
    self.rightEye = EyeBlinkTracker(configuration: configuration)
    self.recentBlinkTimestamps.reserveCapacity(64)
  }

  var left: EyeBlinkTracker { leftEye }
  var right: EyeBlinkTracker { rightEye }
  var isCalibrated: Bool { leftEye.isCalibrated && rightEye.isCalibrated }

  /// Advances both eyes by one frame.
  ///
  /// - Returns: A blink if this frame completed one. Closures that end on the
  ///   same frame in both eyes are reported once as `.both` rather than twice,
  ///   so the count tracks blinks rather than eyelids.
  func update(
    leftAspectRatio: Double,
    rightAspectRatio: Double,
    timestamp: TimeInterval
  ) -> DetectedBlink? {
    let leftDuration = leftEye.update(aspectRatio: leftAspectRatio, timestamp: timestamp)
    let rightDuration = rightEye.update(aspectRatio: rightAspectRatio, timestamp: timestamp)

    guard leftDuration != nil || rightDuration != nil else { return nil }
    // Suppress events until both baselines are established, otherwise the first
    // seconds of a session emit spurious blinks from an unsettled threshold.
    guard isCalibrated else { return nil }

    let eye: DetectedBlink.Eye
    let duration: TimeInterval

    switch (leftDuration, rightDuration) {
    case let (left?, right?):
      eye = .both
      duration = (left + right) / 2
    case let (left?, nil):
      eye = .left
      duration = left
    case let (nil, right?):
      eye = .right
      duration = right
    case (nil, nil):
      return nil
    }

    blinkCount += 1
    lastBlinkDurationMs = duration * 1000
    lastBlinkTimestamp = timestamp
    recentBlinkTimestamps.append(timestamp)

    return DetectedBlink(eye: eye, durationMs: duration * 1000, timestamp: timestamp)
  }

  /// Blinks per minute extrapolated from the trailing window.
  ///
  /// Before the window has filled, the rate is scaled by elapsed time rather
  /// than assuming a full minute — otherwise a session reads as 0 bpm for its
  /// first minute regardless of how much the subject blinked.
  func blinksPerMinute(at timestamp: TimeInterval, sessionStart: TimeInterval) -> Double {
    recentBlinkTimestamps.removeAll { timestamp - $0 > configuration.rateWindow }

    let elapsed = min(timestamp - sessionStart, configuration.rateWindow)
    guard elapsed > 1 else { return 0 }

    return Double(recentBlinkTimestamps.count) * (60.0 / elapsed)
  }

  func timeSinceLastBlinkMs(at timestamp: TimeInterval) -> Double? {
    guard let lastBlinkTimestamp else { return nil }
    return (timestamp - lastBlinkTimestamp) * 1000
  }

  /// Clears counts and forces recalibration. Called when tracking is lost long
  /// enough that the previous baseline may describe a different face or pose.
  func reset() {
    leftEye.reset()
    rightEye.reset()
    recentBlinkTimestamps.removeAll(keepingCapacity: true)
    blinkCount = 0
    lastBlinkDurationMs = nil
    lastBlinkTimestamp = nil
  }
}
