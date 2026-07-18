import AVFoundation
import ExpoModulesCore
import UIKit

/// The React Native view: an `AVCaptureVideoPreviewLayer` plus the plumbing
/// that turns `FaceTrackingSession` output into JS events.
///
/// Everything analytical lives in `FaceTrackingSession`. This class is
/// responsible for three things the session cannot do on its own:
///
/// 1. Owning the preview layer and keeping it sized to the view.
/// 2. Mapping Vision's normalized coordinates into the preview's coordinate
///    space — which requires the layer, because only it knows the aspect-fill
///    crop and mirroring currently applied.
/// 3. Throttling the frame stream so the bridge is not asked to serialize 30
///    payloads a second.
final class OcularVisionView: ExpoView {

  // MARK: - Events

  let onFaceDetection = EventDispatcher()
  let onBlink = EventDispatcher()
  let onSessionStateChange = EventDispatcher()
  let onVisionError = EventDispatcher()

  // MARK: - Props

  var isActive: Bool = false {
    didSet {
      guard isActive != oldValue else { return }
      isActive ? session.start() : session.stop()
    }
  }

  var cameraPosition: AVCaptureDevice.Position = .front {
    didSet {
      guard cameraPosition != oldValue else { return }
      applyConfiguration()
      updateMirroring()
    }
  }

  var landmarksEnabled: Bool = false {
    didSet {
      guard landmarksEnabled != oldValue else { return }
      applyConfiguration()
    }
  }

  /// Minimum seconds between `onFaceDetection` events.
  var updateInterval: TimeInterval = 0.066

  /// `nil` means "follow the camera": mirrored for front, not for back.
  var mirrored: Bool? {
    didSet { updateMirroring() }
  }

  // MARK: - Internals

  private let session = FaceTrackingSession()
  private let previewLayer = AVCaptureVideoPreviewLayer()
  private var lastEmittedAt: TimeInterval = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    clipsToBounds = true
    backgroundColor = .black

    previewLayer.session = session.captureSession
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)

    session.delegate = self
    updateMirroring()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // The preview layer is not in the Auto Layout system, so it has to be
    // resized by hand. Disabling the implicit animation avoids the layer
    // visibly sliding into place on rotation or keyboard-driven resizes.
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    previewLayer.frame = bounds
    CATransaction.commit()
  }

  override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    // Releasing the camera when the view leaves the hierarchy matters: an
    // orphaned running session keeps the capture hardware and the green
    // recording indicator alive after the user has navigated away.
    if newWindow == nil {
      session.stop()
    } else if isActive {
      session.start()
    }
  }

  private func applyConfiguration() {
    var configuration = FaceTrackingSession.Configuration()
    configuration.cameraPosition = cameraPosition
    configuration.landmarksEnabled = landmarksEnabled
    session.update(configuration: configuration)
  }

  private func updateMirroring() {
    guard let connection = previewLayer.connection else { return }
    guard connection.isVideoMirroringSupported else { return }
    connection.automaticallyAdjustsVideoMirroring = false
    connection.isVideoMirrored = mirrored ?? (cameraPosition == .front)
  }

  // MARK: - Coordinate mapping

  /// Maps a Vision-normalized point into the preview view's normalized space.
  ///
  /// `layerPointConverted(fromCaptureDevicePoint:)` is doing the real work
  /// here: it accounts for the aspect-fill crop, the mirroring state, and the
  /// connection's orientation — none of which can be reconstructed reliably by
  /// hand. Reimplementing that math is the usual source of overlays that drift
  /// as they approach the edges of the frame.
  ///
  /// Must be called on the main thread, since it reads layer state.
  private func previewPoint(fromVisionPoint point: CGPoint) -> CGPoint {
    // Vision's origin is bottom-left; capture-device space is top-left.
    let devicePoint = FaceGeometry.flipVertically(point)
    let layerPoint = previewLayer.layerPointConverted(fromCaptureDevicePoint: devicePoint)

    let size = previewLayer.bounds.size
    guard size.width > 0, size.height > 0 else { return .zero }

    return CGPoint(x: layerPoint.x / size.width, y: layerPoint.y / size.height)
  }

  private func previewRect(fromVisionRect rect: CGRect) -> CGRect {
    // Convert opposite corners rather than origin+size: mirroring can swap
    // which corner ends up on the left, and a naively transformed size comes
    // out negative.
    let a = previewPoint(fromVisionPoint: CGPoint(x: rect.minX, y: rect.minY))
    let b = previewPoint(fromVisionPoint: CGPoint(x: rect.maxX, y: rect.maxY))

    return CGRect(
      x: min(a.x, b.x),
      y: min(a.y, b.y),
      width: abs(b.x - a.x),
      height: abs(b.y - a.y)
    )
  }
}

// MARK: - FaceTrackingSessionDelegate

extension OcularVisionView: FaceTrackingSessionDelegate {

  func faceTrackingSession(_ session: FaceTrackingSession, didProduce analysis: FrameAnalysis) {
    // Throttle on the capture queue so a dropped frame costs nothing — no main
    // -thread hop, no payload construction, no serialization.
    let now = CACurrentMediaTime()
    guard now - lastEmittedAt >= updateInterval else { return }
    lastEmittedAt = now

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.onFaceDetection(OcularVisionPayload.faceDetection(analysis) { visionPoint in
        self.previewPoint(fromVisionPoint: visionPoint)
      } rectMapper: { visionRect in
        self.previewRect(fromVisionRect: visionRect)
      })
    }
  }

  func faceTrackingSession(_ session: FaceTrackingSession, didDetect report: BlinkReport) {
    // Blinks bypass the throttle. They are low-frequency and each one is
    // meaningful; dropping one silently corrupts the count downstream.
    DispatchQueue.main.async { [weak self] in
      self?.onBlink(OcularVisionPayload.blink(report))
    }
  }

  func faceTrackingSession(
    _ session: FaceTrackingSession,
    didChangeState state: SessionState,
    reason: String?
  ) {
    onSessionStateChange([
      "state": state.rawValue,
      "reason": reason as Any,
    ])
  }

  func faceTrackingSession(_ session: FaceTrackingSession, didFailWith error: VisionSessionError) {
    onVisionError([
      "code": error.code,
      "message": error.message,
    ])
  }
}
