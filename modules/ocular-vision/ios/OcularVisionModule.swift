import AVFoundation
import ExpoModulesCore
import UIKit
import Vision

public class OcularVisionModule: Module {

  public func definition() -> ModuleDefinition {
    Name("OcularVision")

    Constants([
      // The Simulator exposes no capture device, so the whole pipeline is
      // inert there. Surfacing this lets the UI explain that up front instead
      // of showing a black preview that never resolves.
      "isSupported": !Self.isSimulator,
      "landmarkRevision": VNDetectFaceLandmarksRequestRevision3,
    ])

    AsyncFunction("getCameraPermissionsAsync") { () -> [String: Any] in
      Self.permissionPayload(for: AVCaptureDevice.authorizationStatus(for: .video))
    }

    AsyncFunction("requestCameraPermissionsAsync") { (promise: Promise) in
      let current = AVCaptureDevice.authorizationStatus(for: .video)

      // `requestAccess` only ever prompts once. Calling it after a denial
      // returns false immediately without showing anything, so a denied state
      // is resolved directly and the UI can route the user to Settings.
      guard current == .notDetermined else {
        promise.resolve(Self.permissionPayload(for: current))
        return
      }

      AVCaptureDevice.requestAccess(for: .video) { granted in
        promise.resolve(
          Self.permissionPayload(for: granted ? .authorized : .denied)
        )
      }
    }

    AsyncFunction("openSettingsAsync") { (promise: Promise) in
      guard let url = URL(string: UIApplication.openSettingsURLString) else {
        promise.reject("ERR_SETTINGS_URL", "Could not build the Settings URL.")
        return
      }
      DispatchQueue.main.async {
        UIApplication.shared.open(url, options: [:]) { opened in
          opened
            ? promise.resolve(nil)
            : promise.reject("ERR_SETTINGS_OPEN", "The Settings app could not be opened.")
        }
      }
    }

    View(OcularVisionView.self) {
      Events("onFaceDetection", "onBlink", "onSessionStateChange", "onVisionError")

      Prop("isActive") { (view: OcularVisionView, isActive: Bool) in
        view.isActive = isActive
      }

      Prop("cameraPosition") { (view: OcularVisionView, position: String) in
        view.cameraPosition = position == "back" ? .back : .front
      }

      Prop("landmarksEnabled") { (view: OcularVisionView, enabled: Bool) in
        view.landmarksEnabled = enabled
      }

      Prop("updateInterval") { (view: OcularVisionView, interval: Double) in
        // Guard the floor: a zero interval would emit on every frame and can
        // saturate the bridge on a busy JS thread.
        view.updateInterval = max(interval, 16) / 1000
      }

      Prop("mirrored") { (view: OcularVisionView, mirrored: Bool?) in
        view.mirrored = mirrored
      }
    }
  }

  private static var isSimulator: Bool {
    #if targetEnvironment(simulator)
      return true
    #else
      return false
    #endif
  }

  private static func permissionPayload(
    for status: AVAuthorizationStatus
  ) -> [String: Any] {
    let mapped: String
    let canAskAgain: Bool

    switch status {
    case .authorized:
      mapped = "granted"
      canAskAgain = false
    case .notDetermined:
      mapped = "undetermined"
      canAskAgain = true
    case .denied, .restricted:
      // `restricted` means policy (Screen Time, MDM) forbids the camera; the
      // user cannot grant it themselves, so it reads as denied to callers.
      mapped = "denied"
      canAskAgain = false
    @unknown default:
      mapped = "denied"
      canAskAgain = false
    }

    return [
      "status": mapped,
      "granted": status == .authorized,
      "canAskAgain": canAskAgain,
    ]
  }
}
