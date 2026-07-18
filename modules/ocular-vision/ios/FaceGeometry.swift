import CoreGraphics
import Foundation
import Vision

/// Geometry helpers for turning Vision's landmark output into scalar metrics.
enum FaceGeometry {

  /// Eye aspect ratio: vertical aperture divided by corner-to-corner width.
  ///
  /// The textbook EAR formula indexes six specific landmark points, which ties
  /// it to one Vision request revision — revision 2 returns 6 points per eye
  /// while revision 3 returns 8. This computes the same quantity without
  /// depending on point count or ordering:
  ///
  /// 1. The two most distant points in the contour are the eye corners; the
  ///    distance between them is the width.
  /// 2. Every point is projected onto the axis perpendicular to that corner
  ///    line. The span between the extreme upper and lower projections is the
  ///    aperture.
  ///
  /// Because the aperture is measured perpendicular to the corner axis rather
  /// than along the image's y-axis, the result is invariant to head roll —
  /// a tilted head does not read as a partly closed eye.
  ///
  /// - Parameter points: Eye contour points **in image pixel space**. Passing
  ///   bounding-box-normalized points would distort the ratio by the box's
  ///   aspect, so callers must convert via `pointsInImage(imageSize:)` first.
  /// - Returns: The ratio, or `nil` if the contour is degenerate.
  static func eyeAspectRatio(points: [CGPoint]) -> Double? {
    guard points.count >= 4 else { return nil }

    var corners: (CGPoint, CGPoint) = (points[0], points[1])
    var maxDistanceSquared: CGFloat = 0

    for i in 0..<points.count {
      for j in (i + 1)..<points.count {
        let distanceSquared = squaredDistance(points[i], points[j])
        if distanceSquared > maxDistanceSquared {
          maxDistanceSquared = distanceSquared
          corners = (points[i], points[j])
        }
      }
    }

    let width = sqrt(Double(maxDistanceSquared))
    guard width > .ulpOfOne else { return nil }

    let axis = CGPoint(x: corners.1.x - corners.0.x, y: corners.1.y - corners.0.y)
    // Unit normal to the corner axis.
    let normal = CGPoint(x: -axis.y / CGFloat(width), y: axis.x / CGFloat(width))

    var maxOffset = -Double.greatestFiniteMagnitude
    var minOffset = Double.greatestFiniteMagnitude

    for point in points {
      let offset = Double(
        (point.x - corners.0.x) * normal.x + (point.y - corners.0.y) * normal.y
      )
      maxOffset = max(maxOffset, offset)
      minOffset = min(minOffset, offset)
    }

    let aperture = maxOffset - minOffset
    guard aperture.isFinite else { return nil }

    return aperture / width
  }

  /// Converts a Vision-normalized point (origin bottom-left) into the
  /// top-left-origin space that UIKit and React Native both use.
  static func flipVertically(_ point: CGPoint) -> CGPoint {
    CGPoint(x: point.x, y: 1.0 - point.y)
  }

  static func squaredDistance(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
    let dx = a.x - b.x
    let dy = a.y - b.y
    return dx * dx + dy * dy
  }

  static func degrees(fromRadians radians: Double) -> Double {
    radians * 180.0 / .pi
  }
}

/// Fixed-capacity ring buffer of `Double`s with running mean and variance.
///
/// Used for pose smoothing and stability scoring, both of which run once per
/// frame on the capture queue — so it avoids allocation after construction.
struct RollingWindow {
  private var values: [Double]
  private var index = 0
  private(set) var count = 0

  init(capacity: Int) {
    precondition(capacity > 0, "RollingWindow requires a positive capacity")
    values = [Double](repeating: 0, count: capacity)
  }

  var isFull: Bool { count == values.count }

  mutating func append(_ value: Double) {
    values[index] = value
    index = (index + 1) % values.count
    count = Swift.min(count + 1, values.count)
  }

  mutating func reset() {
    index = 0
    count = 0
  }

  var mean: Double {
    guard count > 0 else { return 0 }
    var total = 0.0
    for i in 0..<count { total += values[i] }
    return total / Double(count)
  }

  var standardDeviation: Double {
    guard count > 1 else { return 0 }
    let average = mean
    var sumSquares = 0.0
    for i in 0..<count {
      let delta = values[i] - average
      sumSquares += delta * delta
    }
    return sqrt(sumSquares / Double(count - 1))
  }

  /// Median via a sorted copy. Only called during calibration, not per frame.
  var median: Double {
    guard count > 0 else { return 0 }
    let sorted = values[0..<count].sorted()
    let middle = count / 2
    if count % 2 == 0 {
      return (sorted[middle - 1] + sorted[middle]) / 2
    }
    return sorted[middle]
  }
}
