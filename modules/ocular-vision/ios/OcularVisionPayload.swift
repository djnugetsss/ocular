import CoreGraphics
import Foundation

/// Builds the dictionaries sent across the bridge.
///
/// This is the Swift half of the contract declared in
/// `src/OcularVision.types.ts`. Keeping serialization in one file — rather than
/// scattered through the view — means the two halves can be diffed against each
/// other when either changes.
enum OcularVisionPayload {

  /// Builds a `FaceDetectionEvent`.
  ///
  /// Coordinate mapping is injected rather than performed here: only the view
  /// holds the preview layer that knows the current crop and mirroring. The
  /// mappers are called on the main thread.
  static func faceDetection(
    _ analysis: FrameAnalysis,
    pointMapper: (CGPoint) -> CGPoint,
    rectMapper: (CGRect) -> CGRect
  ) -> [String: Any] {
    var payload: [String: Any] = [
      // JS wants milliseconds; the pipeline works in seconds.
      "timestamp": analysis.timestamp * 1000,
      "hasFace": analysis.hasFace,
      "confidence": analysis.confidence,
      "processedFps": analysis.processedFps,
      "boundingBox": NSNull(),
      "headPose": NSNull(),
      "blink": NSNull(),
      "landmarks": NSNull(),
    ]

    if let boundingBox = analysis.boundingBox {
      let mapped = rectMapper(boundingBox)
      payload["boundingBox"] = [
        "x": mapped.origin.x,
        "y": mapped.origin.y,
        "width": mapped.size.width,
        "height": mapped.size.height,
      ]
    }

    if let pose = analysis.pose {
      payload["headPose"] = [
        "yaw": pose.yaw,
        "pitch": pose.pitch,
        "roll": pose.roll,
        "stability": pose.stability,
      ]
    }

    if let left = analysis.left, let right = analysis.right {
      payload["blink"] = [
        "left": eye(left),
        "right": eye(right),
        "blinkCount": analysis.blinkCount,
        "blinksPerMinute": analysis.blinksPerMinute,
        "lastBlinkDurationMs": analysis.lastBlinkDurationMs as Any,
        "timeSinceLastBlinkMs": analysis.timeSinceLastBlinkMs as Any,
        "isCalibrated": analysis.isCalibrated,
      ]
    }

    if let landmarks = analysis.landmarks {
      var mapped: [String: [[String: CGFloat]]] = [:]
      for (region, points) in landmarks {
        mapped[region] = points.map { point in
          let converted = pointMapper(point)
          return ["x": converted.x, "y": converted.y]
        }
      }
      payload["landmarks"] = mapped
    }

    return payload
  }

  static func blink(_ report: BlinkReport) -> [String: Any] {
    [
      "timestamp": report.blink.timestamp * 1000,
      "durationMs": report.blink.durationMs,
      "eye": report.blink.eye.rawValue,
      "blinkCount": report.blinkCount,
      "blinksPerMinute": report.blinksPerMinute,
    ]
  }

  private static func eye(_ reading: FrameAnalysis.EyeReading) -> [String: Any] {
    [
      "aspectRatio": reading.aspectRatio,
      "openness": reading.openness,
      "isClosed": reading.isClosed,
    ]
  }
}
