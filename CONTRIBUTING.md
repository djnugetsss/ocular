# Contributing to Ocular

## Getting set up

See [README.md](./README.md). You need a physical iPhone — the Simulator has no
camera, so nothing in `modules/ocular-vision` can be exercised there.

## Before opening a PR

```bash
npm run typecheck && npm run lint && npm test && npm run format
```

CI runs the same checks. Native changes additionally need the `native` label so
the macOS compile job runs.

## Where code goes

| Directory                | Contents                                                 |
| ------------------------ | -------------------------------------------------------- |
| `app/`                   | Routes only — routing and composition, no business logic |
| `src/components/ui/`     | Presentational primitives, no data fetching              |
| `src/features/<domain>/` | Vertical slices: stores, hooks, repositories             |
| `src/lib/`               | Cross-cutting infrastructure                             |
| `modules/ocular-vision/` | Everything camera- or Vision-related                     |

If a screen is growing logic, extract it to `src/features/`. If two features need
the same thing, it belongs in `src/lib/` or `src/components/ui/`.

## Working on the native module

**The contract.** `src/OcularVision.types.ts` and `ios/OcularVisionPayload.swift`
describe the same payloads. Change them together — there is no compiler checking
that they agree, and a mismatch surfaces as `undefined` at runtime rather than
as a build error.

**The layering.** `FaceTrackingSession` and everything below it
(`BlinkDetector`, `HeadPoseEstimator`, `FaceGeometry`) must not import
`ExpoModulesCore`. Keeping the Vision pipeline free of bridge types is what
makes it testable in isolation; adding an Expo dependency there collapses that
boundary.

**Threading.** Frame analysis runs on the capture queue. Anything touching
UIKit or the preview layer must hop to main first. `dispatchPrecondition` guards
the queue-sensitive paths — please keep them.

**Thresholds.** The constants in `BlinkDetectorConfiguration` are derived from
the blink literature, not tuned against a population. If you change one, say in
the PR what you validated against, including lighting and whether glasses were
worn.

## Database changes

Add a migration under `supabase/migrations/` — never edit an applied one. Then
regenerate types:

```bash
npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
```

**Every new table needs RLS enabled and policies scoped to `auth.uid()`.** The
anon key ships inside the app binary, so RLS is the only boundary between users'
data. A table without policies is readable by every user of the app.

## Style

Prettier and ESLint are authoritative; don't hand-format.

Comments should explain _why_, not restate the code. Prefer one comment
explaining a non-obvious decision over a running narration of obvious ones.
