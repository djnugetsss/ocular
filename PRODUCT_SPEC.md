# Ocular — Product Specification

**Status:** Pre-implementation UX specification
**Companion doc:** [PLAN.md](./PLAN.md) covers the technical architecture; this document covers the product experience. Where the two reference the same thing (screens, tables, components), PLAN.md describes what exists today and this document describes what the product should become. Nothing here rewrites the architecture — every screen below is expressible with the current Expo Router structure, the existing `ocular-vision` native surface, and the existing Supabase model plus the additive fields in §7.

**A note on grounding.** This spec is written against the real capabilities of the shipped native module — `FaceDetectionEvent` (pose + blink metrics at ~15 Hz), `BlinkEvent`, calibration state, pose `stability`, and `processedFps`. No screen below depends on a signal the pipeline does not produce. Where a screen wants something the pipeline _could_ produce but doesn't yet (e.g. gaze distance), that is called out as future work, not designed around.

---

# 1. Product Vision

## What Ocular is

Ocular is a personal eye-wellness companion for iPhone. It uses the front camera and Apple's Vision framework — entirely on-device — to measure two things that quietly degrade during screen work: **how often you blink** and **how you hold your head**. It turns those signals into a daily awareness practice: short measurement sessions, honest trends, and small behavioral nudges.

## The user problem

People who spend hours on screens blink at a third to half their resting rate without noticing, and hold their necks in sustained flexion without feeling it until it hurts. The symptoms — dry eyes, blurred focus, headaches, neck stiffness — arrive hours after the behavior that caused them, so the feedback loop that would correct the habit never closes. Existing "eye strain" apps are timers: they guess at the problem on a schedule. Nothing on the phone actually _measures_ the behavior.

## Why Ocular is different

1. **It measures, it doesn't guess.** Blink rate and head pose are real signals read from the user's own face, not inferred from screen-time counters.
2. **Privacy is structural, not promised.** Frames are analyzed in memory and discarded; only ~10 derived numbers per session ever leave the device. This isn't a policy statement — it's how the pipeline is built, and the UI makes that legible at every point where the camera is on.
3. **It respects the ceiling of its own evidence.** Ocular is a wellness and awareness tool. It never diagnoses, never names conditions, and frames every recommendation as a habit suggestion, not a clinical instruction.
4. **It feels like an Apple app.** Calm, dark, spacious, numerically confident — closer to Apple Health's Sleep section or Calm's session flow than to a utility app.

## Core value proposition

> _"See the habits you can't feel. Two minutes with the front camera shows you what your eyes and neck have been doing all day — and whether it's getting better."_

## Explicit non-goals

- **No medical claims.** Ocular never says "dry eye disease," "computer vision syndrome," or any diagnostic term. It says "your blink rate ran low today."
- **No passive surveillance.** Ocular does not run in the background, does not monitor continuously, and never opens the camera without an explicit user action and a visible indicator.
- **No engagement-bait.** No infinite feeds, no shame mechanics. Streaks exist but breaking one is styled neutrally, never as failure.

---

# 2. User Personas

## Primary: "Maya" — the desk-bound knowledge worker

- **Who:** 24–45, works 6–10 hours/day on screens (engineering, design, finance, writing). Owns an iPhone and probably an Apple Watch. Already tracks something (sleep, steps, cycles).
- **Pain:** Gritty eyes by 3 pm, tension headaches, an ergonomics guilt she can't act on because she has no data.
- **Goal:** Understand whether her discomfort correlates with anything measurable, and get _small, specific_ adjustments — not a lecture about screen time.
- **Success looks like:** She runs a 2-minute scan mid-morning and mid-afternoon most workdays, watches her weekly blink-rate trend recover after she starts taking breaks, and feels the app respected her time and privacy.
- **Design implications:** Sessions must be startable in ≤2 taps from cold launch. Results must be readable in ≤10 seconds. Nothing may require the camera for longer than she chooses.

## Secondary: "Dev" — the self-quantifier

- **Who:** 20–35, tracks everything, reads the methodology section. Skeptical of black boxes.
- **Pain:** Wants raw-ish numbers and transparent methods; abandons apps that hide how a score is computed.
- **Goal:** See per-session metrics (EAR-derived blink durations, pose angles, tracking coverage), understand the calibration model, export his data.
- **Design implications:** Every composite score must be tappable to reveal its inputs. Settings exposes diagnostics (calibration state, processed FPS, landmark revision). Data export is a first-class privacy control.

## Tertiary: "Elena" — the comfort-seeker

- **Who:** 45–65, increasing screen time, growing eye fatigue, low tolerance for fiddly apps.
- **Pain:** Discomfort is the motivator; dashboards are noise.
- **Goal:** A simple ritual — open, scan, get one sentence of guidance.
- **Design implications:** The Home screen leads with one plain-language sentence before any chart. Type is large. Every metric has a "what does this mean?" affordance. VoiceOver and Dynamic Type are non-negotiable.

---

# 3. Information Architecture

## Route map (Expo Router)

```
app/
├── _layout.tsx                  # Splash gate → auth redirect → onboarding gate
│
├── (auth)/                      # Signed out
│   ├── sign-in.tsx
│   ├── sign-up.tsx
│   └── forgot-password.tsx      # modal
│
├── (onboarding)/                # Signed in, profiles.onboarded_at IS NULL
│   ├── _layout.tsx              # Linear stack, no tab bar, progress dots
│   ├── welcome.tsx              # 1. What Ocular is
│   ├── how-it-works.tsx         # 2. Why blinking & posture
│   ├── privacy.tsx              # 3. The privacy contract
│   ├── camera-permission.tsx    # 4. Permission priming → system prompt
│   └── goals.tsx                # 5. Goal selection → writes onboarded_at
│
└── (app)/                       # Signed in + onboarded
    ├── _layout.tsx              # 4 tabs
    ├── index.tsx                # Tab 1 · Today (home dashboard)
    ├── scan.tsx                 # Tab 2 · Scan (live camera)
    ├── insights.tsx             # Tab 3 · Insights (history & trends)
    ├── profile.tsx              # Tab 4 · Profile (account, privacy, settings)
    ├── session/[id].tsx         # Pushed: session results (also post-scan)
    └── metric-info/[metric].tsx # Modal: "what does this mean?" explainers
```

### Gating logic (extends the existing redirect in `app/_layout.tsx`)

| Session | `onboarded_at` | Destination            |
| ------- | -------------- | ---------------------- |
| none    | —              | `(auth)/sign-in`       |
| valid   | `NULL`         | `(onboarding)/welcome` |
| valid   | set            | `(app)/index`          |

Onboarding is **resumable but not skippable** past the privacy screen: a user may quit mid-flow and resume at the same step (persisted in the profile row), but cannot reach the tabs without having seen the privacy explanation. The camera permission step _is_ skippable — the Scan tab handles the un-granted state on its own, and forcing permission during onboarding is both hostile and an App Review risk.

### Navigation hierarchy rationale

- **Four tabs, not five.** Session Results is not a destination the user navigates _to_; it's the consequence of ending a scan, so it's a pushed screen reachable from Today, Insights, and scan completion. This mirrors Apple Fitness (workout summary is pushed, not a tab).
- **Scan is tab 2, not center-prominent.** The measurement is the app's heart but not its most-frequent screen; Today is. A center floating action button was considered and rejected — it fights the calm aesthetic and Apple's own tab conventions.
- **Settings becomes Profile.** Account identity, goals, and privacy controls belong together; "Settings" undersells that a third of the screen is the privacy contract.

---

# 4. Complete Screen Specifications

Conventions used below:

- **Tokens** reference the design system in §5 (`canvas`, `ink`, `accent`, `signal-*`, spacing in pt).
- All screens are dark-theme (`canvas` #0B0B0F background), portrait-locked, safe-area aware.
- Every screen must render meaningfully at Dynamic Type XL and be fully traversable with VoiceOver.
- "Skeleton" means the shimmer placeholder component (§6), never a centered spinner, except where noted.

---

## 4.1 Onboarding

Shared shell: full-bleed `canvas`, progress dots (5) top-center, content vertically centered, one primary `Button` pinned above the home indicator, optional ghost "Back". Advancing animates a 250 ms horizontal slide + fade (Reanimated). No skipping ahead via dots.

### 4.1.1 Welcome

- **Purpose:** Set tone and promise in one screen. Zero cognitive load.
- **Layout:** Centered animated eye glyph (subtle 4 s blink loop, Reanimated; static image under Reduce Motion) → app name in Display type → one sentence.
- **Copy:** _"Ocular helps you notice what your eyes can't tell you — how you blink and how you sit, measured privately on your iPhone."_
- **Components:** `OnboardingPage`, `Button` ("Get started").
- **Actions:** Continue → How it works.
- **Data:** None.
- **States:** No loading/empty/error — screen is fully static. This is deliberate: onboarding must be indestructible offline.

### 4.1.2 How it works

- **Purpose:** Teach the two signals in plain language; set expectation of a "session" ritual.
- **Layout:** Two stacked `InfoRow`s, each icon + title + two lines:
  - **Blinking** — _"You blink around 15 times a minute at rest. Screen focus can cut that in half, which dries and tires your eyes."_
  - **Head position** — _"Your head drifts forward and down during long focus. Ocular measures its angle, so you can feel what neutral is."_
    Below: a small footnote row — _"Ocular is a wellness tool, not a medical device. It measures habits, not health conditions."_
- **Components:** `OnboardingPage`, `InfoRow`, `Button` ("Continue").
- **Actions:** Continue → Privacy. Back → Welcome.
- **Data:** None. **States:** static.

### 4.1.3 Privacy — _the contract screen_

- **Purpose:** The single most important trust moment. State the privacy model concretely enough that a skeptical user believes it.
- **Layout:** Title "Your camera data never leaves your phone." Three `InfoRow`s with check-glyphs:
  1. _"Frames are analyzed in your iPhone's memory and immediately discarded. Nothing is recorded."_
  2. _"No image, video, or face geometry is ever stored or uploaded."_
  3. _"Only summary numbers — blink counts, rates, head angles — sync to your account, and you can delete them anytime."_
     Below, a quiet `ghost` link: "How this works technically →" (opens the metric-info modal with a lay explanation of on-device Vision processing).
- **Components:** `OnboardingPage`, `InfoRow`, `Button` ("I understand"), ghost link.
- **Actions:** Continue → Camera permission. Back → How it works. This screen is the non-skippable gate.
- **Data:** None. **States:** static.

### 4.1.4 Camera permission (priming)

- **Purpose:** Prime before the one-shot iOS system prompt, so a distracted "Don't Allow" doesn't dead-end the product.
- **Layout:** Camera glyph, title "Ocular needs the front camera — only while you scan." Body reiterates: camera activates _only_ during a scan you start, a visible indicator always shows when it's on, and iOS's own green dot provides system-level proof.
- **Components:** `OnboardingPage`, `Button` ("Allow camera"), ghost `Button` ("Maybe later").
- **Actions:**
  - "Allow camera" → `requestCameraPermissionsAsync()`. Granted → advance with a brief check animation. Denied → advance anyway, with a non-blocking toast: _"You can enable the camera anytime in Profile."_ Never show a second modal scolding the user.
  - "Maybe later" → advance. The Scan tab owns the un-granted state forever after.
- **Data:** `PermissionResponse` from the native module.
- **Loading:** Button shows its spinner state while the system prompt is up. **Error:** module rejection (should not happen on device) → treat as "later," continue. **Empty:** n/a.

### 4.1.5 Goal selection

- **Purpose:** Personalize the daily target and give the Today screen a denominator; also the moment the profile is marked onboarded.
- **Layout:** Title "What brings you here?" — 2×2 grid of selectable `GoalCard`s (single-select, accent border when chosen):
  - **Reduce eye tiredness** (default)
  - **Improve posture**
  - **Build a check-in habit**
  - **Just curious**
    Below: a stepper row — "Daily check-ins: 1 / 2 / 3" (default 2).
- **Components:** `GoalCard`, stepper (segmented control), `Button` ("Start using Ocular").
- **Actions:** Select goal → enable CTA. CTA → write `goal`, `daily_target_sessions`, `onboarded_at` to profile → replace to `(app)/index`.
- **Data displayed:** none fetched; writes profile fields (§7).
- **Loading:** CTA spinner during the write. **Error:** write fails → inline error under CTA (_"Couldn't save — check your connection."_), selections retained; a retry that fails twice offers "Continue anyway" (fields retried lazily later — a network hiccup must not block first use). **Empty:** n/a.

---

## 4.2 Home Dashboard — "Today" (`(app)/index`)

- **Purpose:** Answer, in one glance: _How are my eye habits today, and what should I do next?_ The emotional home of the app — it must feel like Apple Health's Summary, not an analytics console.

- **Layout (vertical scroll):**
  1. **Header** — "Today", small date; top-right avatar chip → Profile tab.
  2. **Hero: `WellnessRing`** — a single large progress ring (140 pt) showing daily check-in progress (`sessions today / daily_target_sessions`), center shows today's average blink rate as the primary number with "/min" unit. One plain sentence beneath, generated from today's data (see _sentence logic_ below).
  3. **Metric row** — two `MetricCard`s side by side: **Blink rate** (today's duration-weighted average, tone-colored vs. baseline) and **Posture** (today's average posture score /100, tone-colored).
  4. **Recommendation** — one `InsightCard` (max one; this is a calm app): icon, one sentence, optional single action ("Start a scan"). Selection logic: rate < 8/min → break/blink nudge; posture < 60 → neutral-posture nudge; no sessions today → gentle invite; target met & metrics fine → affirmation, no CTA.
  5. **Recent sessions** — list header "Recent" + up to 5 `SessionRow`s (time, duration, blink rate, posture chip) → each pushes `session/[id]`. Footer link "See all →" → Insights tab.

- **Sentence logic (hero):** deterministic, from today's aggregates — e.g. _"Your blink rate is holding near your baseline."_ / _"Blinking ran low this afternoon — your eyes may feel it later."_ / _"First check-in of the day is ready when you are."_ Rules live in one pure, unit-tested function; no LLM, no network.

- **Components:** `WellnessRing`, `MetricCard`, `InsightCard`, `SessionRow`, `Skeleton`, `EmptyState`.
- **User actions:** pull-to-refresh; tap ring → today's detail (Insights, day-scoped); tap metric card → `metric-info/[metric]` modal; tap recommendation CTA → Scan tab; tap session → results.
- **Data displayed:** today's sessions (existing `listRecentSessions` filtered client-side), profile (goal, target, baseline), derived aggregates (already computed on this screen today — logic moves into a `useTodaySummary` hook).
- **Loading:** skeletons for ring, cards, and 3 rows on first load; pull-to-refresh uses the native control thereafter. Never blank the previous data during refresh.
- **Empty (no sessions ever):** ring at 0 with muted center "—"; hero sentence _"Run your first scan to see your baseline."_; `EmptyState` in the sessions area with a "Start your first scan" button. Recommendation card hidden.
- **Empty (none today, history exists):** ring at 0, hero references yesterday (_"Yesterday you averaged 11/min."_), recent list shows prior sessions.
- **Error:** fetch failure with cached/previous data → keep data, show a quiet inline banner (_"Couldn't refresh — showing earlier data."_). Failure with nothing to show → full-screen `ErrorState` with Retry. Auth-expired → the root gate handles redirect; this screen never renders a signed-out flash.

---

## 4.3 Live Scan (`(app)/scan`)

- **Purpose:** The measurement ritual. Must feel precise, private, and calm — closer to a meditation timer than a camera app.

- **Layout:**
  1. **Preview area** (top ~55%) — `OcularVisionView` full-bleed, 24 pt bottom corner radius. Overlaid:
     - **`FaceGuide`** — a centered oval stroke. Idle/searching: `ink-faint`, 40% opacity, breathing animation. Face detected & stable: animates to `signal-ok` and locks. This replaces raw landmark rendering as the _default_ feedback — the 76-point mesh reads as surveillance, exactly the wrong feeling. A "Show face mesh" toggle (persisted, default **off**) enables the existing `LandmarkOverlay` for Dev-persona users; the toggle is also what gates `landmarksEnabled`, so the default session never pays landmark serialization cost.
     - **`PrivacyBadge`** (top-left): shield glyph + "On-device". Tap → small popover restating the privacy contract. Always visible whenever the preview is live.
     - **`StatusPill`** (top-center, existing component): "Ready" / "Starting camera…" / "Looking for you" / "Calibrating — keep your eyes open" / "Tracking" / error text. VoiceOver live region.
  2. **Metrics band** (middle) — three compact `LiveMetric` tiles updating at event rate: **Blinks** (count), **Rate** (/min, tone-colored once calibrated, "—" before), **Head** (single deviation-from-neutral degree figure, expandable to yaw/pitch/roll on tap). During calibration the tiles show a subtle shimmer rather than misleading zeros.
  3. **Session controls** (bottom) — idle: large "Begin check-in" `Button` + duration chips (1 / 2 / 5 min, default 2, persisted). Active: elapsed time in Display type, thin linear progress toward chosen duration, "End session" `danger` button. Sessions auto-complete at the chosen duration with a soft haptic; ending early keeps whatever was measured (≥ 10 s persists, matching the existing repository floor).

- **User actions:** begin/end session; pick duration; toggle mesh; tap privacy badge; tap head tile to expand axes.
- **Data displayed:** all real-time values straight from `FaceDetectionEvent`/`BlinkEvent` — no invented signals. `processedFps` surfaces only in a debug row when mesh is on.
- **Loading:** camera warm-up ≈ hundreds of ms — preview area shows `canvas-raised` with the pill in "Starting camera…"; no spinner.
- **Empty / precondition states:**
  - **Permission undetermined:** in-place explainer card + "Allow camera" (system prompt inline; the tab is self-sufficient for users who skipped onboarding's step).
  - **Permission denied:** explainer + "Open Settings" (existing `openSettingsAsync`), calm tone, no red.
  - **Simulator (`isSupported === false`):** existing physical-device explainer, verbatim behavior kept.
- **Error states:**
  - `onVisionError` mid-session → session ends gracefully, partial data kept (if ≥ 10 s), error surfaced on the results screen as a note — never a data-destroying alert.
  - Session `interrupted` (call, Split View, thermal — reasons already surfaced by the native layer) → pill shows the reason; >10 s interruption auto-ends with partial save. The native layer already resets metrics across interruptions, so continuity is honest.
  - **Face lost** mid-session → guide reverts to searching state, pill updates, timer continues (looking away briefly is normal life, and coverage is recorded as `trackingCoverage`).
- **On completion:** stop → summarize → save → **replace** to `session/[id]`. Save failure still navigates, passing the summary in memory with a "not saved — retry" banner on the results screen (the measurement is never lost to a network error; retry re-invokes the repository).

---

## 4.4 Session Results (`(app)/session/[id]`)

- **Purpose:** Close the ritual loop: what did this check-in find, is it better or worse than usual, and what's one thing to do about it? Ten-second read.

- **Layout (scroll):**
  1. **Header** — "Check-in complete" (post-scan) or date/time (from history); duration + time-of-day subtitle; close (X) when presented post-scan.
  2. **Hero verdict** — one sentence + tone glyph, computed from the session vs. the user's trailing 14-session baseline: _"Blink rate 20% below your usual — a sign of hard focus."_ First-ever session instead: _"This is your baseline. Future check-ins compare against it."_
  3. **Metric grid** — four `MetricCard`s: **Blink rate** (vs. baseline delta chip), **Blinks** (count, mean duration as hint), **Posture score** (/100, tone), **Stillness/coverage** (tracking coverage %, hint _"How much of the session your face was in view"_). Each → `metric-info` modal.
  4. **Head position detail** — collapsed `DisclosureRow` "Head position ▸" expanding to mean yaw/pitch/roll with tiny axis glyphs and a neutral-range band.
  5. **Recommendation** — one `InsightCard`, session-specific (low rate → 20-20-20 style nudge phrased as habit, not prescription; forward pitch → monitor-height nudge; strong session → affirmation).
  6. **Footer actions** — primary "Done" (→ Today); ghost "Delete this session" (confirmation sheet; existing `deleteSession`).

- **Data displayed:** one `sessions` row + trailing baseline aggregate (client-computed from recent sessions).
- **Loading:** post-scan, data arrives in memory — full render immediately (only the baseline-delta chips shimmer briefly). From history: skeleton of the full layout.
- **Empty:** n/a (screen only exists for an existing session); short-session case never navigates here — the Scan screen toasts _"Under 10 seconds — too short to measure."_
- **Error:** unknown/deleted id → friendly `ErrorState` ("This session isn't available") + back. Unsaved post-scan → amber banner "Not saved yet — Retry"; delete failure → inline error, row not removed optimistically.

---

## 4.5 Insights (`(app)/insights`)

- **Purpose:** The longitudinal story: trends, time-of-day patterns, and change over weeks. Where Maya sees whether things are working and Dev goes spelunking.

- **Layout (scroll):**
  1. **Range selector** — segmented control: **W / M / 6M** (Apple Health convention), default W.
  2. **Blink rate chart** — `TrendChart` (custom, react-native-svg — already a dependency; no chart library added): daily duration-weighted average as bars/points, dashed baseline reference line, `signal-warn` band below 8/min with a one-word label "low". Tap a day → callout with values → tap-through to that day's sessions.
  3. **Posture chart** — same component, posture score 0–100, `signal-ok` band ≥ 80.
  4. **Pattern card** — one `InsightCard` computing a simple, honest time-of-day pattern: sessions bucketed morning/afternoon/evening; if the worst bucket underperforms the best by >20%, say so (_"Your blink rate drops most in the afternoon."_). Otherwise: _"No strong time-of-day pattern yet."_ Rule-based, unit-tested, minimum 10 sessions before it renders at all.
  5. **Improvement tracker** — `DeltaRow` pair comparing this range vs. the previous equal range ("Blink rate +12% · Posture +4"), tone-colored, suppressed when the previous range has < 5 sessions (no fake precision).
  6. **All sessions** — grouped-by-day `SessionRow` list (paginated via the existing repository's limit/offset), each → `session/[id]`.

- **User actions:** switch range; tap chart day; open sessions; scroll history.
- **Data displayed:** sessions in range; client-side aggregation in a pure, tested `insights-aggregator` (mirroring the `session-aggregator` pattern — same philosophy, same testability).
- **Loading:** skeleton chart frames + rows; range switches show 150 ms crossfade on cached data, skeleton only if uncached.
- **Empty (< 3 sessions):** charts replaced by `EmptyState`: _"Insights unlock after a few check-ins. 2 more to go."_ — with a real count and a "Start a scan" button. Pattern and delta cards hidden entirely (never render an empty chart axis).
- **Error:** fetch failure → cached data + quiet banner, else full `ErrorState` with retry. A day with no sessions is a **gap** in the chart, not a zero — zero is a data point and would poison the trend line.

---

## 4.6 Profile (`(app)/profile`)

- **Purpose:** Identity, goals, the privacy contract in actionable form, and data self-determination.

- **Layout (scroll, grouped sections in `canvas-raised` cards):**
  1. **Identity** — avatar circle (initial), display name (tap → inline edit sheet), email (read-only).
  2. **Goals & habits** — goal (reopens the onboarding goal picker as a sheet), daily check-in target stepper, default session duration.
  3. **Privacy & camera** —
     - Camera access row: live status ("Allowed" / "Not allowed") from the existing permission hook + "Open Settings" chevron.
     - "How Ocular protects your camera data" → the privacy explainer modal (same content as onboarding 4.1.3 — one source of truth).
     - Face mesh default toggle.
  4. **Data** —
     - "Export my data" → generates JSON of the user's rows (profiles + sessions) via the existing client, shares through the iOS share sheet. (`expo-sharing` is the one candidate dependency this spec surfaces; decision deferred to implementation — a clipboard fallback avoids even that.)
     - "Delete all sessions" → double-confirmation sheet (types-free, but two-step) → bulk delete.
     - "Delete account" → strongest confirmation pattern; deletes auth user (cascades per existing schema FKs).
  5. **About** — version/variant/landmark revision (existing diagnostics), "Not a medical device" disclosure line, licenses.
  6. **Sign out** — existing confirmation flow.

- **Data displayed:** profile row, permission state, `Constants` diagnostics.
- **Loading:** skeleton rows on the profile section only; everything else is local/synchronous.
- **Empty:** n/a. **Error:** profile fetch fails → identity section shows email from the auth session (always available locally) + retry chip; destructive-action failures → inline sheet errors, never silent.

---

## 4.7 Metric explainers (`metric-info/[metric]`, modal)

- **Purpose:** One reusable sheet that makes every number legible (Elena) and every method transparent (Dev). Slugs: `blink-rate`, `posture`, `coverage`, `privacy`.
- **Layout:** grabber, title, 2–3 short paragraphs (what it is → why it matters → how Ocular measures it, including the honest limits: _"Blink detection calibrates to your face each session; glasses and low light can reduce accuracy."_), "Done".
- **States:** fully static content bundled in-app; unknown slug → closes silently. No loading/error possible by construction.

---

# 5. Design System

Codifies and extends the tokens already in `tailwind.config.js` — additive only; no existing token changes, so no visual regression on shipped screens.

## 5.1 Color

| Token            | Value     | Role                             |
| ---------------- | --------- | -------------------------------- |
| `canvas`         | `#0B0B0F` | App background                   |
| `canvas-raised`  | `#14141B` | Cards                            |
| `canvas-overlay` | `#1D1D27` | Sheets, popovers                 |
| `ink`            | `#F5F5F7` | Primary text                     |
| `ink-muted`      | `#A0A0AE` | Secondary text                   |
| `ink-faint`      | `#6B6B7B` | Tertiary, disabled               |
| `accent`         | `#5B8DEF` | Interactive, rings, charts       |
| `accent-strong`  | `#3D6FD9` | Pressed                          |
| `accent-soft`    | `#1B2740` | Selected fills, chart area fills |
| `signal-ok`      | `#3DD68C` | Good range                       |
| `signal-warn`    | `#F5B942` | Below-typical                    |
| `signal-bad`     | `#F26D6D` | Well below typical, destructive  |
| `hairline`       | `#262631` | Borders, separators              |

**Usage rules.** Signal colors describe _data_, never decorate chrome. `signal-bad` on a metric means "notably below typical," and its copy must stay behavioral ("ran low"), never alarmist — the color system must not smuggle in medical implication. Dark-first is a product decision (an eye-comfort app should not blast white); light theme is out of scope for v1.

## 5.2 Typography (SF Pro via system font — no font dependency)

| Style   | Size/weight                         | Use                                              |
| ------- | ----------------------------------- | ------------------------------------------------ |
| Display | 44/semibold, −1.5 tracking          | Hero numbers, scan timer (`text-metric`, exists) |
| Title 1 | 30/semibold                         | Screen titles                                    |
| Title 2 | 22/semibold                         | Section headers, sheet titles                    |
| Body    | 16/regular                          | Copy                                             |
| Callout | 14/medium                           | Card labels, buttons-secondary                   |
| Caption | 12/medium, +0.5 tracking, uppercase | Metric labels (exists in `MetricCard`)           |

Numbers in metrics always use tabular-nums variant so live values don't jitter horizontally. All styles scale with Dynamic Type; Display clamps at 1.4× to protect layouts.

## 5.3 Spacing, radius, elevation

- **Spacing:** 4-pt base scale — 4 / 8 / 12 / 16 / 24 / 32 / 48. Screen gutters 16 pt; card internal padding 16 pt; inter-card gap 12 pt.
- **Radius:** `card` 18 pt (exists) for cards and buttons; 24 pt for sheets and the camera preview's bottom corners; 999 for pills/rings.
- **Elevation:** none — dark UIs read shadows as mud. Depth comes from the three canvas steps plus hairline borders. (One exception: sheets get the system modal dimming.)

## 5.4 Motion

| Interaction        | Spec                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Screen transitions | Router defaults; onboarding 250 ms slide+fade                                                                   |
| Ring/chart fills   | 600 ms ease-out on appear, from zero once per screen visit                                                      |
| Face guide state   | 300 ms color+scale spring on acquire/lose                                                                       |
| Blink tick         | Blinks count tile does a 120 ms scale pulse (1.0→1.06→1.0) per `onBlink` — the moment of "it sees me" delight   |
| Button press       | Existing `active:` color step + 0.97 scale                                                                      |
| Haptics            | Light impact on session start; success notification on auto-complete; warning on error. Never haptic per blink. |

All motion respects **Reduce Motion**: transforms replaced by opacity fades; the welcome-eye loop goes static. Reanimated (already a dependency) drives everything; no animation library added.

## 5.5 Reusable component inventory

Existing, kept as-is: `Button`, `TextField`, `MetricCard`, `LandmarkOverlay`, `StatusPill` (to be extracted from `scan.tsx`). New components are enumerated with responsibilities in §6.

---

# 6. React Native Component Plan

```
src/components/ui/            # Generic — no domain knowledge, no data fetching
├── Button.tsx                ✅ exists
├── TextField.tsx             ✅ exists
├── MetricCard.tsx            ✅ exists (gains optional delta-chip prop)
├── Skeleton.tsx              NEW
├── EmptyState.tsx            NEW
├── ErrorState.tsx            NEW
├── SegmentedControl.tsx      NEW
├── DisclosureRow.tsx         NEW
├── InfoRow.tsx               NEW
├── ProgressRing.tsx          NEW
└── Sheet.tsx                 NEW

src/features/today/
├── WellnessRing.tsx          NEW — composes ProgressRing + hero number + sentence
├── use-today-summary.ts      NEW — hook; aggregation logic extracted from index.tsx
└── daily-sentence.ts         NEW — pure, tested sentence rules

src/features/vision/components/
├── LandmarkOverlay.tsx       ✅ exists
├── FaceGuide.tsx             NEW
├── PrivacyBadge.tsx          NEW
├── LiveMetric.tsx            NEW
└── StatusPill.tsx            MOVED from scan.tsx inline

src/features/sessions/components/
├── SessionRow.tsx            MOVED from index.tsx inline
├── SessionVerdict.tsx        NEW — hero sentence vs. baseline
└── baseline.ts               NEW — pure trailing-baseline math, tested

src/features/insights/
├── TrendChart.tsx            NEW — svg chart, gaps-not-zeros, tap callouts
├── DeltaRow.tsx              NEW
├── InsightCard.tsx           NEW — icon + sentence + optional single CTA
└── insights-aggregator.ts    NEW — pure range/bucket/pattern math, tested

src/features/onboarding/
├── OnboardingPage.tsx        NEW — shared shell (dots, CTA slot, transitions)
└── GoalCard.tsx              NEW
```

**Responsibility rules (unchanged from the existing architecture, restated as law):**

1. `components/ui/` renders props. It never imports Supabase, stores, or the native module.
2. `features/*/components/` may know domain shapes (a `Session`, a `FaceDetectionEvent`) but still never fetch — data arrives via props or the feature's own hook.
3. All non-trivial math lives in pure `*.ts` modules with tests, following the `session-aggregator` precedent: `daily-sentence`, `baseline`, `insights-aggregator` are the three new ones, and they are the highest-value test targets in this spec.
4. Screens in `app/` compose; anything a screen grows beyond composition gets extracted to its feature.
5. No new dependencies for any of this: rings and charts are `react-native-svg`, motion is Reanimated, state is zustand + hooks — all already installed. (`expo-sharing` for export is the sole open question, flagged in §4.6.)

---

# 7. Database Requirements

Current schema (2 tables, RLS-complete) already covers the core loop. The UX above needs **additive** changes only — no breaking migrations, no new security model. _Definitions only; migrations come at implementation time._

## 7.1 `profiles` — extend

| New field                 | Type                                                             | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `goal`                    | `text` CHECK in (`eye_comfort`, `posture`, `habit`, `curiosity`) | Onboarding 4.1.5; tunes Today's sentence + recommendations |
| `daily_target_sessions`   | `smallint` default 2, CHECK 1–3                                  | WellnessRing denominator                                   |
| `default_session_seconds` | `int` default 120, CHECK in (60, 120, 300)                       | Scan duration preference                                   |
| `show_landmarks`          | `boolean` default false                                          | Mesh toggle persistence                                    |
| `onboarding_step`         | `smallint` default 0                                             | Resumable onboarding                                       |

(`onboarded_at` and `baseline_blinks_per_minute` already exist and are used as designed.)

## 7.2 `sessions` — extend

| New field           | Type                                                                | Purpose                                                                                       |
| ------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `tracking_coverage` | `numeric(5,4)` CHECK 0–1                                            | Already computed by the aggregator, currently dropped at persistence; Results 4.4 displays it |
| `completed`         | `boolean` default true                                              | Distinguishes auto-completed vs. ended-early vs. error-truncated for Insights honesty         |
| `end_reason`        | `text` CHECK in (`completed`, `user_ended`, `interrupted`, `error`) | Results screen annotation                                                                     |

## 7.3 Explicitly _not_ added, and why

- **`daily_summaries` table** — daily aggregates are cheap client-side over a user's own sessions (existing composite index covers the query). Materializing them adds a consistency problem before scale demands it. Revisit if Insights queries exceed ~1k sessions/user.
- **`recommendations` / `insights` tables** — recommendations are deterministic functions of session data; storing them creates staleness for zero value.
- **Raw landmark/frame storage of any kind** — prohibited by the privacy contract. This is a product invariant, not a deferred feature.

Relationships stay as-is: `auth.users 1—1 profiles`, `auth.users 1—N sessions`, cascade deletes already correct for the account-deletion flow. Every new column inherits the tables' existing RLS envelope.

---

# 8. Implementation Roadmap

Phases are sequenced so each ends in a shippable, testable state. "Exit" = verifiable on a physical iPhone.

## Phase 1 — App shell & authentication _(mostly complete)_

Already built and verified: auth screens/store/redirects, Keychain sessions, tabs, base tokens, native module compiling, CI.
**Remaining:** add the `(onboarding)` group + 5 screens; onboarding gate on `onboarded_at`; profile migration fields (7.1); extract `StatusPill`/`SessionRow`; add `Skeleton`/`EmptyState`/`ErrorState`.
**Exit:** fresh account lands in onboarding, completes goal selection, arrives at tabs; relaunch resumes correctly; denied-camera path is survivable.

## Phase 2 — Core scanning experience

Scan screen to spec: `FaceGuide` (replacing mesh-by-default), `PrivacyBadge`, `LiveMetric` band, duration chips + auto-complete, blink pulse + haptics, interruption handling; Session Results screen (in-memory path); `baseline.ts`; explainer modals with initial content.
**Exit:** a 2-minute check-in runs start→auto-complete→results on hardware; airplane-mode session still shows full results with a retry banner; VoiceOver can complete the whole flow. _This phase is also where blink thresholds get tuned against real faces (PLAN.md §9.3) — the first sustained hardware time._

## Phase 3 — Data persistence & longitudinal features

Sessions migration (7.2), persistence of coverage/end-reason; save-retry queue for offline; Today screen to full spec (`WellnessRing`, `daily-sentence`, recommendation card); Insights tab (`TrendChart`, `insights-aggregator`, pattern + delta cards); Profile data controls (export, bulk delete, account deletion).
**Exit:** two weeks of real usage renders honest W/M charts with gaps, not zeros; export produces complete JSON; account deletion verifiably cascades.

## Phase 4 — Polish & App Store readiness

Motion pass (Reduce Motion audit), Dynamic Type XL audit, haptics tuning; empty/error state QA against network chaos; App Store assets & privacy nutrition label (aligned with §4.1.3 — "Data Not Linked to You: none beyond account + wellness metrics"); App Review prep (camera-purpose string already ships with the module; wellness-not-medical positioning in review notes); TestFlight beta with ≥5 external users; EAS production profile exercise end-to-end.
**Exit:** approved TestFlight build; a first-time tester completes onboarding → scan → results without guidance.

---

_End of specification._
