import Foundation
import Vision

/// Smoothed head orientation derived from `VNFaceObservation`.
///
/// Vision reports yaw, pitch, and roll directly, but the raw values jitter by a
/// degree or two frame to frame — enough to make a numeric readout unreadable
/// and to trip any threshold-based posture rule. This applies a one-euro-style
/// adaptive low-pass: heavy smoothing while the head is still, light smoothing
/// while it moves, so the reading is both steady at rest and responsive when
/// the user actually turns.
final class HeadPoseEstimator {

  struct Pose {
    let yaw: Double
    let pitch: Double
    let roll: Double
    /// `0..1`, where 1 means the head has been essentially motionless.
    let stability: Double
  }

  /// Smoothing factor at rest. Lower means steadier and laggier.
  private let minAlpha: Double = 0.12
  /// Smoothing factor under fast motion.
  private let maxAlpha: Double = 0.85
  /// Angular speed, in degrees/second, at which smoothing reaches `maxAlpha`.
  private let speedAtMaxAlpha: Double = 90
  /// Standard deviation, in degrees, treated as fully unstable.
  private let unstableDeviation: Double = 6

  private var smoothed: (yaw: Double, pitch: Double, roll: Double)?
  private var lastTimestamp: TimeInterval?

  private var yawWindow = RollingWindow(capacity: 15)
  private var pitchWindow = RollingWindow(capacity: 15)
  private var rollWindow = RollingWindow(capacity: 15)

  /// Extracts and smooths pose for one observation.
  ///
  /// - Returns: `nil` when Vision omits the angles, which happens for profile
  ///   views and low-confidence detections. Callers should surface the absence
  ///   rather than substituting zeros — a missing pose is not a centered head.
  func update(observation: VNFaceObservation, timestamp: TimeInterval) -> Pose? {
    guard let yawValue = observation.yaw, let rollValue = observation.roll else {
      return nil
    }

    // `pitch` arrived in iOS 15. The deployment target is 16, so it is always
    // available, but Vision still returns nil for observations where it cannot
    // be resolved.
    let pitchValue = observation.pitch

    let yaw = FaceGeometry.degrees(fromRadians: yawValue.doubleValue)
    let roll = FaceGeometry.degrees(fromRadians: rollValue.doubleValue)
    let pitch = pitchValue.map { FaceGeometry.degrees(fromRadians: $0.doubleValue) } ?? 0

    guard let previous = smoothed, let previousTimestamp = lastTimestamp else {
      smoothed = (yaw, pitch, roll)
      lastTimestamp = timestamp
      yawWindow.append(yaw)
      pitchWindow.append(pitch)
      rollWindow.append(roll)
      return Pose(yaw: yaw, pitch: pitch, roll: roll, stability: 0)
    }

    let deltaTime = max(timestamp - previousTimestamp, 1.0 / 240.0)
    let angularSpeed =
      (abs(yaw - previous.yaw) + abs(pitch - previous.pitch) + abs(roll - previous.roll))
      / deltaTime

    let alpha = min(
      maxAlpha,
      minAlpha + (maxAlpha - minAlpha) * min(1, angularSpeed / speedAtMaxAlpha)
    )

    let nextYaw = previous.yaw + alpha * (yaw - previous.yaw)
    let nextPitch = previous.pitch + alpha * (pitch - previous.pitch)
    let nextRoll = previous.roll + alpha * (roll - previous.roll)

    smoothed = (nextYaw, nextPitch, nextRoll)
    lastTimestamp = timestamp

    yawWindow.append(nextYaw)
    pitchWindow.append(nextPitch)
    rollWindow.append(nextRoll)

    let deviation =
      (yawWindow.standardDeviation + pitchWindow.standardDeviation + rollWindow.standardDeviation)
      / 3
    let stability = max(0, min(1, 1 - deviation / unstableDeviation))

    return Pose(yaw: nextYaw, pitch: nextPitch, roll: nextRoll, stability: stability)
  }

  func reset() {
    smoothed = nil
    lastTimestamp = nil
    yawWindow.reset()
    pitchWindow.reset()
    rollWindow.reset()
  }
}
