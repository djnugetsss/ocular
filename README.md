# Ocular

Real-time blink rate and head posture tracking for iOS, measured entirely
on-device with Apple's Vision framework.

Built with Expo Router, TypeScript, NativeWind, and Supabase, around a custom
Swift native module that runs face landmark detection on the camera capture
queue.

> **Privacy:** camera frames are analyzed in memory and never recorded, written
> to disk, or transmitted. Only derived numbers — blink counts, rates, and head
> angles — are saved to your account.

---

## Requirements

- macOS with **Xcode 16+**
- **Node 20+**
- **CocoaPods** (`gem install cocoapods`)
- A **physical iPhone** running iOS 16.4 or later — the Simulator has no camera,
  so face tracking cannot run there
- A **Supabase** project

---

## Setup

```bash
git clone <your-remote> ocular && cd ocular
npm install

cp .env.example .env.local     # then fill in your Supabase values
```

### Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema:
   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
   Or paste `supabase/migrations/20260718000000_initial_schema.sql` into the SQL
   editor.
3. Copy the project URL and **anon** key from Settings → API into `.env.local`.

The anon key is safe to ship — it is constrained by row-level security. Never
put a service-role key in `.env.local`.

### Run on your iPhone

```bash
npx expo prebuild --platform ios   # generates ios/
npm run ios:device                 # select your connected device
```

The first build prompts for a signing team. A free Apple ID works; builds expire
after 7 days.

Afterwards, `npm start` runs the dev server against the installed dev client.

> Changing `.env.local` requires `npx expo start --clear` — `EXPO_PUBLIC_*`
> values are inlined at build time.

---

## Scripts

| Command                            | Purpose                                 |
| ---------------------------------- | --------------------------------------- |
| `npm start`                        | Dev server (dev client)                 |
| `npm run ios:device`               | Build and install on a connected iPhone |
| `npm run prebuild`                 | Regenerate `ios/` from config           |
| `npm run typecheck`                | `tsc --noEmit`                          |
| `npm test`                         | Jest                                    |
| `npm run lint` / `npm run format`  | ESLint / Prettier                       |
| `npm run build:dev\|preview\|prod` | EAS builds                              |

---

## Project layout

See [PLAN.md](./PLAN.md) for the full architecture, including the native module
design, the blink-detection algorithm, and the security model.

```
app/                    Expo Router routes (routing + composition only)
src/                    Application code — components, features, lib
modules/ocular-vision/  Swift native module (Vision + AVFoundation)
supabase/migrations/    Database schema
```

The native module is deliberately layered so that the Vision pipeline
(`FaceTrackingSession.swift`) has no dependency on Expo or React — see
[PLAN.md §4](./PLAN.md#4-the-native-boundary).

---

## How the measurement works

Blink detection calibrates a per-face eye-aspect-ratio baseline (absolute EAR
varies too much across faces for a fixed threshold), then applies hysteresis and
duration gating so that jitter, squints, and tracking dropouts do not count as
blinks. Head pose is adaptively smoothed and carries a stability score, which is
used to exclude mid-motion frames from posture scoring.

The details, and the reasoning behind each threshold, are in
[PLAN.md §5](./PLAN.md#5-signal-processing).

---

## Troubleshooting

**"Requires a physical device"** — expected on the Simulator.

**Black preview** — the view needs non-zero bounds before `isActive` turns true;
ensure a `flex-1` parent.

**Signed out on every launch** — a Keychain write failure. Check the
`secure-storage` chunking path; sessions over 2048 bytes are split.

**`pod install` fails** — Ruby 2.6 (macOS system Ruby) emits `filter_map`
warnings during autolinking. Install a newer Ruby if the install actually fails.

---

## License

MIT — see [LICENSE](./LICENSE).
