# VERIFIED.md — Pre-Milestone-A stability verification

**Date:** 2026-07-20
**Build:** `main` @ a203592 + dependency-declaration fixes (this pass)
**Scope:** Verify every fix from the 2026-07-19 device-test round, run all available automated verification, fix regressions. No new features.

A hard constraint shapes what "verified" means below: **the iOS Simulator has no
camera**, so every camera-dependent behavior can only be *behaviorally* confirmed
on a physical iPhone. For those items this pass verifies the code path, the unit
tests around it, and that the Swift compiles — and explicitly flags the
on-device retest still owed.

---

## 1. Feature verification

| # | Feature | Verification method | Result |
|---|---------|--------------------|--------|
| 1 | Landmark mesh orientation | Code review + Swift compile | **PASS (code-level)** — device retest owed |
| 2 | Blink counts persist across interruptions | Code review + unit tests | **PASS (code-level)** — device retest owed |
| 3 | Session timer pauses during interruptions | Unit tests (6 dedicated cases) | **PASS** — device retest owed |
| 4 | Head steadiness / posture drift scoring | Unit tests (5 dedicated cases) | **PASS** — device retest owed for "feels natural" |
| 5 | Auth footer alignment | Code review | **PASS (code-level)** — visual confirm owed |
| 6 | Onboarding end-to-end | Code review + routing/steps unit tests | **PASS (code-level)** |
| 7 | Session saving | Code review + typecheck against DB types | **PASS (code-level)** |

### Detail per feature

**1. Landmark mesh orientation** — `OcularVisionView.devicePoint(fromOrientedPoint:)`
inverts the EXIF orientation before `layerPointConverted(fromCaptureDevicePoint:)`,
which expects sensor-space points. Confirmed the two sides agree:
`FaceTrackingSession.visionOrientation` declares `.leftMirrored` (front) / `.right`
(back), and the view's inverse implements exactly the transpose / inverse-rotation
of those two cases. Rect conversion converts opposite corners to survive mirroring.
This is geometry that only eyes on a phone can finally confirm.

**2. Blink persistence** — The Blinks tile reads `blinkCount` from the JS
aggregator (`use-face-tracking.ts`), not the native per-frame count. The native
detector *deliberately* resets on interruption end (`resetAnalysisState()` in
`FaceTrackingSession.sessionInterruptionEnded`) because metrics across a gap
aren't continuous; the JS total survives that reset. `scan.tsx` renders
`String(blinkCount)` with a comment pinning the reason.

**3. Timer pause on interruption** — Full chain verified:
`AVCaptureSessionWasInterrupted` → native `interrupted` state →
`handleSessionStateChange` calls `aggregator.pause()`; `running` resumes it.
`SessionAggregator` handles idempotent pause, stray resume, and a session that
*ends while still interrupted* (open pause counted to end time, summarize stays
non-destructive). Blink rate is computed from measured time only. All covered by
unit tests (`session-aggregator.test.ts`).

**4. Posture drift scoring** — Score is drift from a per-session baseline (first
30 stable samples ≈ 2 s), not camera alignment — the fix for scores pegged at
~100 when holding the phone. Unstable frames (stability < 0.5) excluded from
both baseline and scoring. Sessions too short to establish a baseline report
`null`, not a fake score. Euclidean 3-axis magnitude against a 30° ceiling.
Tests cover: start-slumped-stay-slumped = 100, drift past ceiling = 0, short
session = null, unstable frames excluded.

**5. Auth footer** — Both footers are a single `<Text>` run with a nested
`<Link>`, so the two text segments share one baseline (the misalignment came
from sibling `Text` elements in a row). Sign-in and sign-up match.

**6. Onboarding** — Flow is data-driven (`ONBOARDING_ROUTES`), 5 steps; `stepRoute`
clamps stale persisted indices instead of throwing (unit-tested). Root layout
gates on auth + profile settled before routing; completion is driven by writing
`onboarded_at` (no navigation race); goals screen has an escape hatch after 2
failed saves with background retry. Goals copy states check-ins are always
user-initiated ("You start every check-in yourself — Ocular never measures on
its own"), resolving the ambiguous-copy finding.

**7. Session saving** — `handleStop` → `stop()` → `summarize()` → `saveSession`.
Sub-10-second sessions rejected with an explanatory alert; save failures alert
without discarding the user's context; `toSessionInsert` typechecks against the
generated Supabase row type. Tab blur stops the session and saves (camera never
left running behind another tab).

---

## 2. Automated verification

| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `npm run typecheck` | **PASS** — no errors |
| ESLint | `npm run lint` (`--max-warnings 0`) | **PASS** — no errors, no warnings |
| Jest | `npx jest --ci` | **PASS** — 2 suites, 22/22 tests |
| Expo Doctor | `npx expo-doctor` | **PASS** — 20/20 checks (was 18/20; see §3) |
| CocoaPods | `pod install` | **PASS** — RNWorklets pinned 0.10.0 |
| Native build (incl. Swift) | `xcodebuild -scheme OcularDev -destination 'generic/platform=iOS Simulator'` | **PASS** — `BUILD SUCCEEDED`, zero warnings from the `ocular-vision` Swift module (only stock Expo/Hermes script-phase warnings) |

TypeScript, Jest, and Expo Doctor were re-run *after* the dependency fixes in §3
and remained green.

---

## 3. Bugs fixed in this pass

Expo Doctor failed 2 of 20 checks; both were dependency-declaration issues, now
fixed:

1. **`react-native-worklets` was not a declared dependency.** Reanimated 4
   requires it as a peer; npm had auto-installed 0.10.2 transitively, so the app
   worked *today*, but nothing pinned the version — a fresh `npm ci` after a
   transitive bump could silently change native code. Now declared at `0.10.0`
   (the SDK 57-pinned version) and pods re-resolved to match (`RNWorklets 0.10.0`
   in Podfile.lock).
2. **`expo-font` was not declared** (peer of `expo-symbols`, which every SF
   Symbol icon in the app uses). Now declared at `~57.0.1`.
3. **`@types/jest` was at 30.x against Jest 29.** Downgraded to `29.5.14` per
   the SDK's expected version. Typecheck and all tests re-verified green.

No code regressions were found: every finding from the 2026-07-19 device test
has a correct, tested fix in the current tree.

---

## 4. Remaining issues

**Owed to the physical device** (Simulator has no camera; these are code-verified
but not eyes-on-verified since commit a203592 landed):

- [ ] Mesh overlay sits correctly on the face — front camera, both portrait
      grips, near frame edges (edge drift is the classic failure of this math)
- [ ] Background the app mid-session → return: Blinks tile keeps its total,
      status pill shows "Paused — camera unavailable", duration excludes the gap
- [ ] Take a phone call mid-session (second interruption path)
- [ ] Posture score responds believably: holding steady ≈ high, deliberate slump
      degrades it, short session shows no score
- [ ] Auth footer baseline looks right on device
- [ ] One full onboarding pass + one saved session on device

**Known, accepted trade-offs (not defects):**

- Posture drift scoring cannot flag a user who *starts* slumped and stays there;
  it measures change within a session by design, and product copy must not claim
  more.
- If the goals-screen "Continue anyway" background write never lands,
  onboarding reappears next launch (`onboarded_at` is the source of truth).
- `stop()` discards straggler frames that arrive after the user ends a session
  (deliberate: they belong to no session).

**Environment notes (non-blocking):**

- 2 xcodebuild warnings, both stock Expo/Hermes run-script-phase noise from
  Pods, not app code.
- Native build verified against the Simulator SDK; a device-signed build
  (`npm run ios:device`) is the final gate and runs the same Swift.

---

## 5. Confidence before Milestone A

**High on everything a machine can verify; conditional on one device pass for
the rest.**

- Logic layer (aggregator, scoring, interruption accounting, routing): **high** —
  fully unit-tested, all 22 tests green, and the tests encode the exact failure
  modes found on-device.
- Native layer: **high on compile + review** — the orientation inverse provably
  matches the declared EXIF orientations, and the interruption chain is wired
  end-to-end. But coordinate-space geometry has been wrong while looking right
  before; it is *proven* only by the mesh sitting on a real face.
- Dependencies/tooling: **high** — 20/20 Doctor, versions now pinned, lockfile
  consistent.

**Recommendation:** run the six-item device checklist in §4 (≈10 minutes on the
iPhone). If the mesh and the backgrounding round-trip look right, ship into
Milestone A. No code changes should be needed before that pass — the tree is
stable, green, and buildable.
