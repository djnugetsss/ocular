import AVFoundation
import CoreMedia
import Foundation
import UIKit
import Vision

/// Owns the capture pipeline and the Vision analysis that runs on it.
///
/// Deliberately knows nothing about Expo or React Native: it takes
/// configuration in and hands analysis results to a delegate. That boundary is
/// what lets the detection logic be exercised without a bridge attached, and
/// keeps `OcularVisionView` down to plumbing.
///
/// ## Threading
/// - `start`/`stop`/`configure` are called from the main thread.
/// - `AVCaptureSession` mutation happens on `sessionQueue` (serial), because
///   `startRunning()` blocks and would stall the UI.
/// - Frame analysis happens on `captureQueue` (serial). Late frames are
///   discarded rather than queued, so the pipeline sheds load under pressure
///   instead of drifting further behind real time.
/// - Delegate callbacks are invoked on `captureQueue`. The delegate is
///   responsible for hopping to main if it touches UIKit.
protocol FaceTrackingSessionDelegate: AnyObject {
  func faceTrackingSession(_ session: FaceTrackingSession, didProduce analysis: FrameAnalysis)
  func faceTrackingSession(_ session: FaceTrackingSession, didDetect blink: BlinkReport)
  func faceTrackingSession(_ session: FaceTrackingSession, didChangeState state: SessionState, reason: String?)
  func faceTrackingSession(_ session: FaceTrackingSession, didFailWith error: VisionSessionError)
}

enum SessionState: String {
  case idle
  case configuring
  case running
  case interrupted
  case stopped
  case failed
}

enum VisionSessionError: Error {
  case permissionDenied
  case cameraUnavailable(position: AVCaptureDevice.Position)
  case configurationFailed(String)
  case visionRequestFailed(String)
  case unsupportedDevice

  var code: String {
    switch self {
    case .permissionDenied: return "ERR_CAMERA_PERMISSION_DENIED"
    case .cameraUnavailable: return "ERR_CAMERA_UNAVAILABLE"
    case .configurationFailed: return "ERR_SESSION_CONFIGURATION_FAILED"
    case .visionRequestFailed: return "ERR_VISION_REQUEST_FAILED"
    case .unsupportedDevice: return "ERR_UNSUPPORTED_DEVICE"
    }
  }

  var message: String {
    switch self {
    case .permissionDenied:
      return "Camera access has not been granted."
    case .cameraUnavailable(let position):
      return "No camera is available at the \(position == .front ? "front" : "back") position. The iOS Simulator has no camera; face tracking requires a physical device."
    case .configurationFailed(let detail):
      return "Failed to configure the capture session: \(detail)"
    case .visionRequestFailed(let detail):
      return "Vision request failed: \(detail)"
    case .unsupportedDevice:
      return "This device does not support Vision face landmark tracking."
    }
  }
}

/// A completed blink together with the running totals as of that blink.
///
/// The totals travel with the event rather than being read back afterwards:
/// the delegate is called on the capture queue, and by the time a consumer
/// hopped to main to ask "how many blinks now?", another frame may already have
/// advanced the count past the one this event describes.
struct BlinkReport {
  let blink: DetectedBlink
  let blinkCount: Int
  let blinksPerMinute: Double
}

/// One frame's analysis, in Vision's normalized coordinate space.
///
/// Points here are **not** yet mapped to the preview view — that conversion
/// depends on the preview layer's gravity and mirroring and therefore happens
/// in the view layer, which owns the layer.
struct FrameAnalysis {
  struct EyeReading {
    let aspectRatio: Double
    let openness: Double
    let isClosed: Bool
  }

  let timestamp: TimeInterval
  let hasFace: Bool
  let confidence: Double
  /// Vision-space bounding box: normalized, origin bottom-left.
  let boundingBox: CGRect?
  let pose: HeadPoseEstimator.Pose?
  let left: EyeReading?
  let right: EyeReading?
  let blinkCount: Int
  let blinksPerMinute: Double
  let lastBlinkDurationMs: Double?
  let timeSinceLastBlinkMs: Double?
  let isCalibrated: Bool
  /// Vision-space landmark regions, populated only when landmarks are enabled.
  let landmarks: [String: [CGPoint]]?
  let processedFps: Double
}

final class FaceTrackingSession: NSObject {

  // MARK: - Configuration

  struct Configuration {
    var cameraPosition: AVCaptureDevice.Position = .front
    var landmarksEnabled: Bool = false
    /// Target capture frame rate. Vision face landmarks comfortably sustains 30
    /// fps on an A12 and newer; going higher costs battery for no measurable
    /// gain in blink timing, since blinks last 100-400ms.
    var frameRate: Int32 = 30
  }

  weak var delegate: FaceTrackingSessionDelegate?

  private(set) var state: SessionState = .idle {
    didSet {
      guard state != oldValue else { return }
      delegate?.faceTrackingSession(self, didChangeState: state, reason: stateReason)
    }
  }
  private var stateReason: String?

  let captureSession = AVCaptureSession()

  private let sessionQueue = DispatchQueue(label: "app.ocular.vision.session")
  private let captureQueue = DispatchQueue(
    label: "app.ocular.vision.capture",
    qos: .userInitiated
  )

  private var configuration: Configuration
  private var videoOutput: AVCaptureVideoDataOutput?
  private var videoInput: AVCaptureDeviceInput?
  private var isConfigured = false

  // MARK: - Analysis state (captureQueue only)

  private let sequenceHandler = VNSequenceRequestHandler()
  private let blinkDetector = BlinkDetector()
  private let poseEstimator = HeadPoseEstimator()

  private var sessionStartTimestamp: TimeInterval?
  private var lastFaceTimestamp: TimeInterval?
  private var fpsWindow = RollingWindow(capacity: 30)
  private var lastFrameTimestamp: TimeInterval?

  /// How long tracking may be absent before detector state is discarded. A
  /// brief dropout (a hand passing the lens) should not cost the calibration;
  /// a long one probably means a different face or a very different pose, and
  /// the stale baseline would be worse than recalibrating.
  private let trackingLossResetInterval: TimeInterval = 3.0

  // MARK: - Init

  init(configuration: Configuration = Configuration()) {
    self.configuration = configuration
    super.init()
    registerForNotifications()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    // Tear down synchronously: the session retains hardware that must be
    // released before another session can claim it.
    if captureSession.isRunning {
      captureSession.stopRunning()
    }
  }

  // MARK: - Lifecycle

  func start() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
        self.fail(with: .permissionDenied)
        return
      }

      if !self.isConfigured {
        do {
          try self.configureSession()
          self.isConfigured = true
        } catch let error as VisionSessionError {
          self.fail(with: error)
          return
        } catch {
          self.fail(with: .configurationFailed(error.localizedDescription))
          return
        }
      }

      guard !self.captureSession.isRunning else { return }
      self.captureSession.startRunning()

      self.captureQueue.async {
        self.resetAnalysisState()
      }
      DispatchQueue.main.async { self.state = .running }
    }
  }

  func stop() {
    sessionQueue.async { [weak self] in
      guard let self, self.captureSession.isRunning else { return }
      self.captureSession.stopRunning()
      DispatchQueue.main.async { self.state = .stopped }
    }
  }

  /// Applies new configuration, reconfiguring the capture graph only when the
  /// camera position actually changed. Toggling landmarks is just a flag read
  /// on the capture queue and must not disturb a running session.
  func update(configuration newConfiguration: Configuration) {
    let positionChanged = newConfiguration.cameraPosition != configuration.cameraPosition
    let frameRateChanged = newConfiguration.frameRate != configuration.frameRate

    captureQueue.async { [weak self] in
      self?.configuration.landmarksEnabled = newConfiguration.landmarksEnabled
    }

    guard positionChanged || frameRateChanged else { return }

    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.configuration = newConfiguration

      guard self.isConfigured else { return }
      do {
        try self.reconfigureInput()
        self.captureQueue.async { self.resetAnalysisState() }
      } catch let error as VisionSessionError {
        self.fail(with: error)
      } catch {
        self.fail(with: .configurationFailed(error.localizedDescription))
      }
    }
  }

  /// Clears blink counts and forces recalibration.
  func resetMetrics() {
    captureQueue.async { [weak self] in
      self?.resetAnalysisState()
    }
  }

  // MARK: - Capture configuration

  private func configureSession() throws {
    DispatchQueue.main.async { self.state = .configuring }

    captureSession.beginConfiguration()
    defer { captureSession.commitConfiguration() }

    // 640x480 is intentional. Vision's landmark detector downsamples anyway,
    // and a smaller buffer meaningfully cuts per-frame cost and thermal load
    // versus 1080p, which matters for a session the user leaves running.
    captureSession.sessionPreset = .vga640x480

    try attachInput()

    let output = AVCaptureVideoDataOutput()
    output.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
    ]
    // Analyze the newest frame available rather than falling behind.
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(self, queue: captureQueue)

    guard captureSession.canAddOutput(output) else {
      throw VisionSessionError.configurationFailed("Cannot add video data output.")
    }
    captureSession.addOutput(output)
    videoOutput = output

    configureConnection(for: output)
  }

  private func attachInput() throws {
    let discovery = AVCaptureDevice.DiscoverySession(
      deviceTypes: [.builtInWideAngleCamera],
      mediaType: .video,
      position: configuration.cameraPosition
    )

    guard let device = discovery.devices.first else {
      throw VisionSessionError.cameraUnavailable(position: configuration.cameraPosition)
    }

    let input = try AVCaptureDeviceInput(device: device)
    guard captureSession.canAddInput(input) else {
      throw VisionSessionError.configurationFailed("Cannot add camera input.")
    }
    captureSession.addInput(input)
    videoInput = input

    try configureFrameRate(on: device)
  }

  private func reconfigureInput() throws {
    captureSession.beginConfiguration()
    defer {
      captureSession.commitConfiguration()
      if let output = videoOutput {
        configureConnection(for: output)
      }
    }

    if let existing = videoInput {
      captureSession.removeInput(existing)
      videoInput = nil
    }
    try attachInput()
  }

  private func configureFrameRate(on device: AVCaptureDevice) throws {
    let target = configuration.frameRate
    // Only clamp when the active format actually supports the target; forcing
    // an unsupported duration throws and takes the whole session down.
    let supportsTarget = device.activeFormat.videoSupportedFrameRateRanges.contains {
      Double(target) >= $0.minFrameRate && Double(target) <= $0.maxFrameRate
    }
    guard supportsTarget else { return }

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }

    let duration = CMTime(value: 1, timescale: target)
    device.activeVideoMinFrameDuration = duration
    device.activeVideoMaxFrameDuration = duration
  }

  private func configureConnection(for output: AVCaptureVideoDataOutput) {
    guard let connection = output.connection(with: .video) else { return }

    // Leave the buffer in its native orientation and tell Vision how to read it
    // instead. Rotating buffers in the capture path costs a copy per frame for
    // no benefit, since nothing downstream displays them — the preview layer
    // draws from the session directly.
    if connection.isVideoMirroringSupported {
      connection.automaticallyAdjustsVideoMirroring = false
      connection.isVideoMirrored = false
    }
  }

  /// Maps the sensor's native buffer orientation into the EXIF orientation
  /// Vision expects, for a portrait-locked interface.
  ///
  /// The app pins portrait in `app.config.ts`; if that ever changes, this must
  /// read the live interface orientation instead of assuming one.
  private var visionOrientation: CGImagePropertyOrientation {
    configuration.cameraPosition == .front ? .leftMirrored : .right
  }

  // MARK: - Notifications

  private func registerForNotifications() {
    let center = NotificationCenter.default
    center.addObserver(
      self,
      selector: #selector(sessionWasInterrupted(_:)),
      name: .AVCaptureSessionWasInterrupted,
      object: captureSession
    )
    center.addObserver(
      self,
      selector: #selector(sessionInterruptionEnded(_:)),
      name: .AVCaptureSessionInterruptionEnded,
      object: captureSession
    )
    center.addObserver(
      self,
      selector: #selector(sessionRuntimeError(_:)),
      name: .AVCaptureSessionRuntimeError,
      object: captureSession
    )
  }

  @objc private func sessionWasInterrupted(_ notification: Notification) {
    let reason: String
    if let value = notification.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int,
      let parsed = AVCaptureSession.InterruptionReason(rawValue: value)
    {
      reason = Self.describe(interruption: parsed)
    } else {
      reason = "The capture session was interrupted."
    }

    DispatchQueue.main.async {
      self.stateReason = reason
      self.state = .interrupted
    }
  }

  @objc private func sessionInterruptionEnded(_ notification: Notification) {
    // Metrics collected across an interruption are not continuous, so drop the
    // detector state rather than resuming a count with a gap in it.
    captureQueue.async { [weak self] in self?.resetAnalysisState() }
    DispatchQueue.main.async {
      self.stateReason = nil
      self.state = self.captureSession.isRunning ? .running : .stopped
    }
  }

  @objc private func sessionRuntimeError(_ notification: Notification) {
    let error = notification.userInfo?[AVCaptureSessionErrorKey] as? NSError
    fail(with: .configurationFailed(error?.localizedDescription ?? "Unknown runtime error."))
  }

  private static func describe(interruption reason: AVCaptureSession.InterruptionReason) -> String {
    switch reason {
    case .videoDeviceNotAvailableInBackground:
      return "The camera is unavailable while the app is in the background."
    case .audioDeviceInUseByAnotherClient, .videoDeviceInUseByAnotherClient:
      return "The camera is in use by another app."
    case .videoDeviceNotAvailableWithMultipleForegroundApps:
      return "The camera is unavailable in Split View or Slide Over."
    case .videoDeviceNotAvailableDueToSystemPressure:
      return "The camera was suspended due to system pressure, such as overheating."
    @unknown default:
      return "The capture session was interrupted."
    }
  }

  private func fail(with error: VisionSessionError) {
    DispatchQueue.main.async {
      self.stateReason = error.message
      self.state = .failed
      self.delegate?.faceTrackingSession(self, didFailWith: error)
    }
  }

  // MARK: - Analysis

  private func resetAnalysisState() {
    dispatchPrecondition(condition: .onQueue(captureQueue))
    blinkDetector.reset()
    poseEstimator.reset()
    sessionStartTimestamp = nil
    lastFaceTimestamp = nil
    lastFrameTimestamp = nil
    fpsWindow.reset()
  }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension FaceTrackingSession: AVCaptureVideoDataOutputSampleBufferDelegate {

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

    // Use the presentation timestamp rather than wall clock: blink durations
    // are measured against when frames were captured, not when they happened to
    // reach this queue, so scheduling jitter cannot inflate them.
    let timestamp = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
    guard timestamp.isFinite else { return }

    if sessionStartTimestamp == nil { sessionStartTimestamp = timestamp }
    trackFrameRate(at: timestamp)

    let request = VNDetectFaceLandmarksRequest()
    request.revision = VNDetectFaceLandmarksRequestRevision3
    request.constellation = .constellation76Points

    do {
      try sequenceHandler.perform(
        [request],
        on: pixelBuffer,
        orientation: visionOrientation
      )
    } catch {
      delegate?.faceTrackingSession(
        self,
        didFailWith: .visionRequestFailed(error.localizedDescription)
      )
      return
    }

    // Multiple faces in frame is ambiguous for a self-measurement tool, so track
    // the largest — which is reliably the user rather than someone behind them.
    let observation = (request.results ?? [])
      .max { $0.boundingBox.area < $1.boundingBox.area }

    guard let observation else {
      handleTrackingLoss(at: timestamp)
      return
    }

    lastFaceTimestamp = timestamp
    process(observation: observation, at: timestamp)
  }

  private func trackFrameRate(at timestamp: TimeInterval) {
    defer { lastFrameTimestamp = timestamp }
    guard let last = lastFrameTimestamp else { return }
    let delta = timestamp - last
    guard delta > 0 else { return }
    fpsWindow.append(1.0 / delta)
  }

  private func handleTrackingLoss(at timestamp: TimeInterval) {
    if let lastFace = lastFaceTimestamp, timestamp - lastFace > trackingLossResetInterval {
      resetAnalysisState()
      lastFaceTimestamp = nil
    }

    let analysis = FrameAnalysis(
      timestamp: timestamp,
      hasFace: false,
      confidence: 0,
      boundingBox: nil,
      pose: nil,
      left: nil,
      right: nil,
      blinkCount: blinkDetector.blinkCount,
      blinksPerMinute: 0,
      lastBlinkDurationMs: blinkDetector.lastBlinkDurationMs,
      timeSinceLastBlinkMs: blinkDetector.timeSinceLastBlinkMs(at: timestamp),
      isCalibrated: blinkDetector.isCalibrated,
      landmarks: nil,
      processedFps: fpsWindow.mean
    )
    delegate?.faceTrackingSession(self, didProduce: analysis)
  }

  private func process(observation: VNFaceObservation, at timestamp: TimeInterval) {
    let pose = poseEstimator.update(observation: observation, timestamp: timestamp)

    var leftReading: FrameAnalysis.EyeReading?
    var rightReading: FrameAnalysis.EyeReading?
    var landmarkRegions: [String: [CGPoint]]?

    if let landmarks = observation.landmarks {
      // Landmarks are normalized within the face's bounding box, which is not
      // square. Measuring aspect ratios in that space would stretch them by the
      // box's aspect, so convert to a square pixel space first. The size is
      // arbitrary as long as it is square — only ratios are used downstream.
      let referenceSize = CGSize(width: 1000, height: 1000)
      let boundingBox = observation.boundingBox

      func imagePoints(_ region: VNFaceLandmarkRegion2D?) -> [CGPoint]? {
        guard let region, region.pointCount > 0 else { return nil }
        return region.normalizedPoints.map { point in
          CGPoint(
            x: (boundingBox.origin.x + point.x * boundingBox.width) * referenceSize.width,
            y: (boundingBox.origin.y + point.y * boundingBox.height) * referenceSize.height
          )
        }
      }

      let leftPoints = imagePoints(landmarks.leftEye)
      let rightPoints = imagePoints(landmarks.rightEye)

      let leftRatio = leftPoints.flatMap { FaceGeometry.eyeAspectRatio(points: $0) }
      let rightRatio = rightPoints.flatMap { FaceGeometry.eyeAspectRatio(points: $0) }

      if let leftRatio, let rightRatio {
        if let blink = blinkDetector.update(
          leftAspectRatio: leftRatio,
          rightAspectRatio: rightRatio,
          timestamp: timestamp
        ) {
          let report = BlinkReport(
            blink: blink,
            blinkCount: blinkDetector.blinkCount,
            blinksPerMinute: blinkDetector.blinksPerMinute(
              at: timestamp,
              sessionStart: sessionStartTimestamp ?? timestamp
            )
          )
          delegate?.faceTrackingSession(self, didDetect: report)
        }

        leftReading = FrameAnalysis.EyeReading(
          aspectRatio: leftRatio,
          openness: blinkDetector.left.openness,
          isClosed: blinkDetector.left.isClosed
        )
        rightReading = FrameAnalysis.EyeReading(
          aspectRatio: rightRatio,
          openness: blinkDetector.right.openness,
          isClosed: blinkDetector.right.isClosed
        )
      }

      if configuration.landmarksEnabled {
        // Emitted in Vision's normalized space; the view maps them onto the
        // preview layer, which is the only place that knows the gravity and
        // mirroring actually in effect.
        var regions: [String: [CGPoint]] = [:]
        func addRegion(_ key: String, _ region: VNFaceLandmarkRegion2D?) {
          guard let region, region.pointCount > 0 else { return }
          regions[key] = region.normalizedPoints.map { point in
            CGPoint(
              x: boundingBox.origin.x + point.x * boundingBox.width,
              y: boundingBox.origin.y + point.y * boundingBox.height
            )
          }
        }

        addRegion("faceContour", landmarks.faceContour)
        addRegion("leftEye", landmarks.leftEye)
        addRegion("rightEye", landmarks.rightEye)
        addRegion("leftEyebrow", landmarks.leftEyebrow)
        addRegion("rightEyebrow", landmarks.rightEyebrow)
        addRegion("leftPupil", landmarks.leftPupil)
        addRegion("rightPupil", landmarks.rightPupil)
        addRegion("nose", landmarks.nose)
        addRegion("noseCrest", landmarks.noseCrest)
        addRegion("medianLine", landmarks.medianLine)
        addRegion("outerLips", landmarks.outerLips)
        addRegion("innerLips", landmarks.innerLips)

        landmarkRegions = regions
      }
    }

    let analysis = FrameAnalysis(
      timestamp: timestamp,
      hasFace: true,
      confidence: Double(observation.confidence),
      boundingBox: observation.boundingBox,
      pose: pose,
      left: leftReading,
      right: rightReading,
      blinkCount: blinkDetector.blinkCount,
      blinksPerMinute: blinkDetector.blinksPerMinute(
        at: timestamp,
        sessionStart: sessionStartTimestamp ?? timestamp
      ),
      lastBlinkDurationMs: blinkDetector.lastBlinkDurationMs,
      timeSinceLastBlinkMs: blinkDetector.timeSinceLastBlinkMs(at: timestamp),
      isCalibrated: blinkDetector.isCalibrated,
      landmarks: landmarkRegions,
      processedFps: fpsWindow.mean
    )

    delegate?.faceTrackingSession(self, didProduce: analysis)
  }
}

extension CGRect {
  fileprivate var area: CGFloat { width * height }
}
