# Ocular — Architecture & Implementation Plan

Ocular measures blink rate and head posture in real time using Apple's Vision
framework, entirely on-device. This document explains how the app is put
together, why the boundaries fall where they do, and what remains to be built.

---

## 1. Scope note

The original brief referenced "the complete folder structure above," but no
structure was included with the request. The layout in §3 is therefore a
proposal derived from the stated requirements rather than a transcription. If
you had a specific tree in mind, that is the section to correct — everything
else follows from it mechanically.

---

## 2. Product shape

| Surface                                 | Purpose                                             |
| --------------------------------------- | --------------------------------------------------- |
| **Today** (`app/(app)/index.tsx`)       | Daily rollup and session history                    |
| **Scan** (`app/(app)/scan.tsx`)         | Live camera, real-time metrics, session record/stop |
| **Settings** (`app/(app)/settings.tsx`) | Account, privacy statement, diagnostics             |
| **Auth** (`app/(auth)/*`)               | Sign in, sign up, password reset                    |

### The measurement itself

A "session" is a period of live tracking. During it, the native layer analyzes
every camera frame and emits throttled metric updates. On stop, the JS layer
summarizes the session into ~10 scalars and writes one row to Supabase. **No
frames, images, or landmark coordinates are ever persisted or transmitted.**

---

## 3. Repository layout

```
ocularapp/
├── app/                          # Expo Router — file-based routes only
│   ├── _layout.tsx               # Providers, splash gate, auth redirect
│   ├── +not-found.tsx
│   ├── (auth)/                   # Unauthenticated group
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   ├── sign-up.tsx
│   │   └── forgot-password.tsx
│   └── (app)/                    # Authenticated group (tabs)
│       ├── _layout.tsx
│       ├── index.tsx             # Today
│       ├── scan.tsx              # Live tracking
│       └── settings.tsx
│
├── src/                          # All non-route application code
│   ├── components/ui/            # Presentational primitives
│   │   ├── Button.tsx
│   │   ├── TextField.tsx
│   │   └── MetricCard.tsx
│   ├── features/                 # Vertical slices, one folder per domain
│   │   ├── auth/
│   │   │   └── auth-store.ts
│   │   ├── sessions/
│   │   │   └── session-repository.ts
│   │   └── vision/
│   │       ├── components/LandmarkOverlay.tsx
│   │       ├── session-aggregator.ts       # Pure scoring logic
│   │       ├── use-camera-permission.ts
│   │       ├── use-face-tracking.ts
│   │       └── __tests__/
│   └── lib/                      # Cross-cutting infrastructure
│       ├── cn.ts
│       ├── env.ts                # Fail-fast env validation
│       └── supabase/
│           ├── client.ts
│           ├── database.types.ts # Generated — do not hand-edit
│           └── secure-storage.ts # Keychain adapter
│
├── modules/ocular-vision/        # Local Expo native module
│   ├── app.plugin.js             # Contributes NSCameraUsageDescription
│   ├── expo-module.config.json   # Autolinking manifest
│   ├── index.ts
│   ├── src/                      # TypeScript surface
│   │   ├── OcularVision.types.ts # ⟵ contract with Swift
│   │   ├── OcularVisionModule.ts
│   │   └── OcularVisionView.tsx
│   └── ios/                      # Swift implementation
│       ├── OcularVision.podspec
│       ├── OcularVisionModule.swift    # Expo module definition
│       ├── OcularVisionView.swift      # Preview layer + coordinate mapping
│       ├── OcularVisionPayload.swift   # ⟵ contract with TypeScript
│       ├── FaceTrackingSession.swift   # AVCapture + Vision pipeline
│       ├── BlinkDetector.swift         # EAR state machine
│       ├── HeadPoseEstimator.swift     # Adaptive pose smoothing
│       └── FaceGeometry.swift          # EAR math, RollingWindow
│
├── supabase/migrations/          # SQL, applied via Supabase CLI
├── .github/workflows/            # CI
└── app.config.ts, eas.json, ...  # Build configuration
```

**The rule:** `app/` contains routing and composition only. Anything reusable
lives in `src/`. Anything touching the camera lives in `modules/ocular-vision/`.

---

## 4. The native boundary

This is the most important design decision in the project, so it is worth being
explicit about.

### Layering inside the module

```
OcularVisionModule.swift     Expo glue: props, events, permissions
        │
OcularVisionView.swift       UIView: preview layer, throttling, coordinate mapping
        │
FaceTrackingSession.swift    AVCaptureSession + Vision — knows nothing about React
        │
   ┌────┴─────┬──────────────┐
BlinkDetector  HeadPose…  FaceGeometry     Pure logic, no framework deps
```

`FaceTrackingSession` has no reference to Expo, React, or any bridge type. It
takes a `Configuration` and reports to a delegate. This means the detection
logic can be exercised from a plain Swift test target or an AVFoundation-only
harness app, and it keeps the Expo-facing classes thin enough to review at a
glance.

### What crosses the bridge

Two payload shapes, defined once in `OcularVision.types.ts` and constructed once
in `OcularVisionPayload.swift`. Those two files are the contract; changing one
without the other is the main way this module can break, which is why
serialization is centralized rather than spread across the view.

| Event                  | Rate                     | Contents                                |
| ---------------------- | ------------------------ | --------------------------------------- |
| `onFaceDetection`      | Throttled (default 15/s) | Pose, blink metrics, optional landmarks |
| `onBlink`              | Per blink (unthrottled)  | Duration, eye, running count            |
| `onSessionStateChange` | On transition            | Capture session lifecycle               |
| `onVisionError`        | On failure               | Structured code + message               |

**Throttling policy.** Vision runs on every captured frame (30 fps), but only a
throttled subset crosses into JS. Blink events bypass the throttle because each
one is individually meaningful — dropping one corrupts the count. Landmark
arrays (76 points) are omitted entirely unless `landmarksEnabled` is set, since
serializing them is the single most expensive operation in the module.

### Threading

| Queue                                     | Work                                                     |
| ----------------------------------------- | -------------------------------------------------------- |
| Main                                      | Props, preview layer, coordinate mapping, event dispatch |
| `…vision.session` (serial)                | `AVCaptureSession` mutation — `startRunning()` blocks    |
| `…vision.capture` (serial, userInitiated) | Frame analysis, detector state                           |

Late frames are discarded (`alwaysDiscardsLateVideoFrames`), so the pipeline
sheds load under pressure rather than drifting behind real time.

---

## 5. Signal processing

### Blink detection

Blink detection is the part most likely to be _subtly_ wrong, so the reasoning
is spelled out here and in `BlinkDetector.swift`.

1. **Eye aspect ratio (EAR)** is computed per eye as aperture ÷ corner-to-corner
   width. The implementation in `FaceGeometry.eyeAspectRatio` does _not_ index
   fixed landmark positions — it derives the corners as the most-distant point
   pair and measures the aperture perpendicular to that axis. Two consequences:
   it works across Vision revisions (6-point vs 8-point eye contours), and it is
   invariant to head roll, so a tilted head does not read as a half-closed eye.

2. **Per-face calibration.** Absolute EAR varies with eye shape, glasses, and
   camera distance, so a fixed threshold misfires across users. The detector
   collects 30 open-eye frames and takes their **median** (not mean — a blink
   during calibration would drag a mean down) as the baseline, then adapts
   slowly via EMA while the eye is unambiguously open.

3. **Hysteresis.** Closing requires < 70 % of baseline; reopening requires

   > 82 %. An EAR sitting near the boundary cannot oscillate.

4. **Duration gating.** A closure counts only on reopening, and only if it
   lasted 45–600 ms. Shorter is tracking jitter; longer is a squint, a yawn, or
   a dropout.

5. **Coordinate space.** Vision's landmarks are normalized _within the face
   bounding box_, which is not square. Measuring ratios there would stretch them
   by the box's aspect, so points are projected into a square reference space
   first.

### Head pose

Vision supplies yaw/pitch/roll directly, but raw values jitter a degree or two
per frame. `HeadPoseEstimator` applies a one-euro-style adaptive low-pass:
heavy smoothing at rest, light smoothing under motion — steady when still,
responsive when the user actually turns. It also publishes a `stability` score,
which the aggregator uses to **exclude mid-motion frames from posture scoring**
(a head sweeping through 40° was never _held_ at 40°).

### Overlay coordinates

Landmark points are mapped to preview space in Swift via
`AVCaptureVideoPreviewLayer.layerPointConverted(fromCaptureDevicePoint:)`, which
accounts for aspect-fill cropping, mirroring, and connection orientation. This
deliberately is _not_ reimplemented in JS — hand-rolled versions of that math
are the usual cause of overlays that drift near the frame edges.

---

## 6. Data & security

### Row-level security

Every table has RLS enabled and policies scoped to `auth.uid()`. This is
load-bearing, not defense in depth: the anon key ships inside the app binary and
is readable by anyone with the IPA. RLS is the _only_ thing separating users'
data.

`profiles` intentionally has **no INSERT policy** — rows are created by a
`security definer` trigger on `auth.users`. A client-side insert path would let
a user create a profile row for an id that isn't theirs. Both trigger functions
pin `search_path = ''` to close the standard privilege-escalation vector.

### Session storage

Supabase defaults to AsyncStorage, which is an unencrypted SQLite file — a
stolen device yields a working refresh token. Sessions go in the Keychain
instead (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so they don't sync to iCloud or
restore onto another device).

`SecureStore` caps values at 2048 bytes and Supabase sessions exceed that once
custom claims appear, so `secure-storage.ts` transparently chunks large values
behind a manifest key. Slices are written before the manifest, so an interrupted
write degrades to "no session" rather than a corrupt one.

### Privacy posture

Only derived scalars leave the device. No frames are written to disk or
transmitted, which keeps the app out of biometric-data territory for review
purposes. The camera usage string lives in the module's config plugin so it
travels with the code that opens the camera.

---

## 7. Build & environment

Three variants install side by side via `APP_VARIANT`:

| Variant     | Bundle ID                | Name             |
| ----------- | ------------------------ | ---------------- |
| development | `com.ocular.app.dev`     | Ocular (Dev)     |
| preview     | `com.ocular.app.preview` | Ocular (Preview) |
| production  | `com.ocular.app`         | Ocular           |

`env.ts` validates configuration at **import time** and throws with a remediation
message. A missing Supabase URL otherwise surfaces as an opaque fetch failure
inside a sign-in handler — a much worse place to discover a bad build.

Deployment target is iOS 16.4 (SDK 57's floor; Vision's revision-3 constellation
and the pitch angle need 15+).

---

## 8. Verification status

Everything below was executed against this tree, not assumed:

| Check                             | Result                                          |
| --------------------------------- | ----------------------------------------------- |
| `tsc --noEmit`                    | Passes, zero errors                             |
| `jest`                            | 9/9 pass                                        |
| `eslint --max-warnings 0`         | Clean                                           |
| `prettier --check`                | Clean                                           |
| `expo prebuild --platform ios`    | Generates `ios/`, plugin injects camera key     |
| `expo-modules-autolinking search` | Resolves `ocular-vision` → `OcularVisionModule` |
| `pod install`                     | `OcularVision` pod integrated                   |
| `xcodebuild … build`              | **BUILD SUCCEEDED** — all 7 Swift files compile |

**Not yet verified:** runtime behavior on hardware. The Swift compiles and links,
but no frame has been through the pipeline. Blink thresholds in particular are
derived from the literature and need calibration against real faces — see §9.

---

## 9. Next steps

### Immediate — required before the app is usable

1. **Provision Supabase.** Create the project, apply
   `supabase/migrations/20260718000000_initial_schema.sql`, put real values in
   `.env.local`. The checked-in `.env.local` holds placeholders.
2. **Run on hardware.** `npm run ios:device`. The Simulator has no camera; the
   module reports `isSupported: false` and the Scan tab says so explicitly.
3. **Tune blink thresholds.** `BlinkDetectorConfiguration` values are
   literature-derived starting points. Validate against recorded sessions,
   especially with glasses and in low light.

### Near term

4. **Swift test target** for `BlinkDetector`/`FaceGeometry` against synthetic EAR
   sequences. The logic is already dependency-free specifically to allow this;
   only the target is missing.
5. **Onboarding calibration flow** to populate
   `profiles.baseline_blinks_per_minute`, so sessions can be scored against the
   user rather than a population average.
6. **Offline queue.** `saveSession` currently fails loudly if the network is
   down. The measurement already happened; it should be queued and retried.
7. **EAS credentials.** Fill the `submit.production` placeholders in `eas.json`
   and run `eas init` to populate `EAS_PROJECT_ID`.

### Later

8. Trend analytics (rolling 7/30-day rate), strain notifications, Screen Time
   correlation, HealthKit export, Android via ML Kit behind the same TS surface.

---

## 10. Known trade-offs

- **Frame rate is fixed at 30 fps / VGA.** Blinks last 100–400 ms, so higher
  rates buy precision the product doesn't use while costing battery and thermal
  headroom on a session the user leaves running.
- **Largest face wins** when several are in frame. Correct for a
  self-measurement tool, wrong if this ever becomes multi-subject.
- **Portrait-locked.** `visionOrientation` assumes it. Supporting rotation means
  reading live interface orientation there.
- **Landmark overlay re-renders at event rate** (~15 Hz). Fine for a focused
  screen; if it ever shows cost, the overlay should move to Reanimated shared
  values and skip the React commit entirely.
