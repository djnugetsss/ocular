# Ocular — Design Review & Product Vision Freeze

**Status:** Canonical design document. Written against the actual code on `main`
(commit `4d8b0ce`), not against intentions. Every claim below was verified by
reading the implementation.
**Role:** Lead Product Designer / Senior iOS UX / Apple HIG review.
**Relationship to other docs:** PRODUCT_SPEC.md defines what the product should
become; PLAN.md defines the architecture. This document freezes the *design
decisions* for the remaining implementation and audits what exists today
(Phase 1 complete, Phase 2 partially started).

**What is actually implemented today:** auth (sign-in / sign-up / forgot
password), the 5-screen onboarding flow with resume, the 4-tab shell, a Today
list with two metric cards, a functional but developer-grade Scan screen, an
Insights screen that is a session list with a "trends locked" card, and a
read-mostly Profile screen. Not yet implemented: session results
(`session/[id]`), metric explainers, `WellnessRing`, `FaceGuide`,
`PrivacyBadge`, duration/auto-complete, charts, haptics, data export, session
deletion, account deletion.

---

## SECTION 1 — Overall Product Review

Scored as an App Store reviewer / discerning first-time user would experience
the current build. 10 = Top-10 Health & Fitness quality.

| Dimension | Score | |
| --- | :-: | --- |
| Visual quality | 6/10 | Strong foundations, unfinished surfaces |
| UX | 6/10 | Excellent states discipline, incomplete core loop |
| Navigation | 7/10 | Correct structure, missing destinations |
| Clarity | 7/10 | Copy is a genuine strength |
| Trust | 7/10 | Great words, not yet great *behavior* |
| Onboarding | 8/10 | The best-built surface in the app |
| Accessibility | 7/10 | Unusually good foundations, two real gaps |
| Premium feel | 4/10 | The biggest gap to close |
| Privacy communication | 7/10 | Strong statically, weak at the moment of truth |
| App Store readiness | 3/10 | Several hard blockers |

### Visual quality — 6

The token system (`tailwind.config.js`, `src/theme/tokens.ts`) is genuinely
good: a disciplined three-step dark canvas, restrained accent, semantic signal
colors, one card radius. Cards, buttons, and text fields are consistent and
would not embarrass a shipped app. What drags the score down:

- **Tab bar icons are text glyphs** (`◎ ◉ ◫ ⚙` in `app/(app)/_layout.tsx`).
  The code itself calls this a scaffold. Nothing says "unfinished" faster to an
  iOS user — or an App Review screenshot — than font glyphs standing in for
  SF Symbols-quality icons. The same glyphs are reused as empty-state art,
  goal-card icons, and the onboarding eye, so the placeholder look is systemic.
- **The Scan screen is a debug view.** Five `MetricCard`s (including raw
  yaw/pitch/roll cards) below a full-bleed preview with the 76-point mesh
  always on. It reads as an engineering harness, which is exactly what it is.
- No screen yet has a hero moment — no ring, no chart, no large number
  presented with pride. Dark, spacious apps live or die on one confident focal
  element per screen; today every screen is a stack of same-weight cards.

### UX — 6

The states discipline is excellent — every implemented screen has real
skeleton, empty, inline-error, and full-error treatments, and the
empty-vs-error distinction (`EmptyState.tsx` doc comment) is the kind of
thinking most shipped apps never do. But the core loop is severed:

- A session ends in a **native `Alert`** or in silence. There is no results
  screen, so the ritual has no payoff. The user blinks at their phone for two
  minutes and gets… a list row.
- Session rows are deliberately non-interactive (`app/(app)/index.tsx:147`),
  so recorded data leads nowhere.
- There is **no timer and no target duration** during a scan. The user cannot
  answer "how long have I been doing this?" or "when is it done?" — the two
  questions every timed ritual must answer.
- Sessions never auto-complete; measurement quality depends on the user
  remembering to stop.

### Navigation — 7

Four tabs is right, the groups and gating in `app/_layout.tsx` are right, and
the redirect logic (splash held until auth *and* profile settle; error counts
as settled) is better-reasoned than most production apps. Deducted because the
graph is missing its two most-traveled edges — scan → results and row →
results — and because tapping the Scan tab mid-session context (stop-on-blur in
`scan.tsx`) can pop a save `Alert` over a *different* tab, which is
disorienting.

### Clarity — 7

Copywriting is a real strength: "Looking for you," "Calibrating — keep your
eyes open," "A realistic target you can keep beats an ambitious one you
ignore," the honest trends-locked card with a real count. Two deductions:
metric cards show numbers with no "what does this mean?" affordance (the
explainer modal doesn't exist yet), and one copy slip — "pick up your
**eye-health** history" on sign-in (`app/(auth)/sign-in.tsx:55`) — drifts
toward the medical framing the spec explicitly bans. Say "check-in history."

### Trust — 7

The privacy contract screen is the strongest single screen in the app, and the
camera-permission priming (explain first, always advance, never scold) is
textbook. But trust is built at the moment the camera is *on*, and there the
current build undermines its own promises:

- Onboarding promises "an on-device badge shows whenever the camera is active"
  (`camera-permission.tsx`). **No such badge exists.** The app currently makes
  a specific trust claim it does not keep — this is the single most important
  trust bug to fix.
- The landmark mesh renders by default (`scan.tsx` passes `landmarks: true`).
  A wireframe crawling over your face is the visual language of surveillance,
  precisely inverted from "calm, private measurement."

### Onboarding — 8

The best surface: shared `OnboardingPage` shell, progress dots, resumable
`onboarding_step` that only advances, slide+fade with Reduce Motion fallback,
the escape hatch after repeated save failures, the quiet camera-denied note on
the goals screen instead of a scolding modal. Deductions: the welcome screen's
"hero" is a 96 pt circle with a text glyph (needs real art), the flow has no
haptic or celebratory beat at completion, and disabled gestures mean no
swipe-back anywhere (defensible for the privacy gate, unnecessary before it).

### Accessibility — 7

Far above typical for this stage: accessibility roles everywhere, grouped
labels on cards and rows, live regions on status/error text, VoiceOver-hidden
skeletons and decorative glyphs, `ReduceMotion.System` on every animation,
radio semantics on goal cards. Two substantive gaps keep it at 7:

1. **No Dynamic Type clamping anywhere.** The spec (§5.2) requires Display to
   clamp at 1.4×; no component sets `maxFontSizeMultiplier`, and fixed heights
   (`h-14` buttons, `h-[104px]` skeletons, `h-11` header row) will clip or
   misalign at accessibility sizes.
2. **`ink-faint` (#6B6B7B) on `canvas` (#0B0B0F) is ≈3.6:1** — below WCAG AA
   (4.5:1) for the 12 px uppercase captions it is used for (section headers,
   metric labels, hints). Ironic for an eye-comfort app. Lighten the token or
   reserve it for non-text.

### Premium feel — 4

Honest score. What exists is *tasteful*, which is the hard part, but premium
is earned through motion, materiality, and payoff, and today: zero haptics
(`expo-haptics` isn't even a dependency), no animation outside onboarding and
the skeleton pulse, glyph icons, no blur materials, no rounded camera preview,
no blink-tick delight, no completion moment. The spec's §5.4 motion table is
entirely unimplemented. This is the largest gap between the app today and the
app the spec describes — and the most closable, because the foundations
(Reanimated, tokens, structure) are already right.

### Privacy communication — 7

Statically excellent (onboarding contract, Profile privacy section, honest
permission string in `app.plugin.js`). Weak dynamically: no on-camera badge, no
tap-to-reread-contract during a scan, and the mesh default sends the opposite
message. The words are 9/10; the behavior at the moment of truth is 5/10.

### App Store readiness — 3

Hard blockers, detailed in Section 8: **no account deletion** (Guideline
5.1.1(v) — instant rejection for an app with account creation), no privacy
policy URL, placeholder app icon, no session deletion despite onboarding
promising "you can delete them anytime" (a stated-vs-actual mismatch reviewers
notice), and a core loop that dead-ends. The permission string, on-device
processing posture, and non-medical framing are all *assets* for review — the
groundwork is good; the checklist is simply unfinished.

---

## SECTION 2 — Complete UI Audit

Priorities: **Critical** (blocks ship or breaks a core promise), **High**
(materially hurts quality/trust), **Medium** (noticeable polish debt),
**Low** (nit).

### 2.1 Sign In (`app/(auth)/sign-in.tsx`)

**Strengths.** Correct keyboard handling (avoiding view + scroll +
persistTaps), field chaining via refs, proper `textContentType` for iCloud
Keychain autofill, disabled-until-valid CTA, store-driven redirect with no
navigation race, mapped human error copy (`describeAuthError`).

**Weaknesses & issues.**
- "Sign in to pick up your **eye-health** history" — medical-adjacent framing
  banned by spec §1. Use "check-in history." — **High**
- Error text renders only under the password field regardless of cause; an
  email-shaped error visually blames the wrong field. Add a form-level error
  slot. — **Medium**
- `TextField` doesn't set `keyboardAppearance="dark"`, so a light keyboard
  slams into the dark canvas. One-line fix, large perceived-quality gain. —
  **High**
- No brand presence — the screen opens cold on "Welcome back" with no mark or
  glyph; the first authenticated impression is generic. — **Medium**
- Hierarchy/spacing are otherwise sound: title → subtitle → fields → CTA with
  consistent 16/24 rhythm. — n/a

### 2.2 Sign Up (`app/(auth)/sign-up.tsx`)

**Strengths.** `new-password` autofill for iOS password generation, live
min-length feedback, the confirm-email terminal state instead of a silent
no-op, a one-line privacy promise right in the subtitle — excellent placement.

**Weaknesses & issues.**
- Server error and local password hint share one slot (`error ?? passwordError`)
  under the password field — same misattribution problem as sign-in. — **Medium**
- No terms/privacy-policy acknowledgment line; needed for review and for trust
  (see §8). — **High**
- The confirm-email state has no "resend" affordance and no way to correct a
  typo'd email except starting over. — **Medium**
- Name field is required but never explained (it seeds `display_name` via the
  DB trigger); "What should we call you?" or making it optional would reduce
  first-form friction. — **Low**

### 2.3 Forgot Password (`app/(auth)/forgot-password.tsx`)

**Strengths.** Modal presentation, autofocus, enumeration-safe copy ("If an
account exists…"), clean sent-state swap.

**Weaknesses & issues.**
- Content sits at `pt-8` under a modal sheet with no grabber and no title
  alignment with the iOS sheet idiom; feels like a page pretending to be a
  sheet. Add a grabber or use a proper header. — **Low**
- Layout is top-anchored while sign-in/sign-up are centered — small
  inconsistency in the group. — **Low**

### 2.4 Onboarding shell (`OnboardingPage.tsx`) and the five screens

**Strengths.** Single shared shell (dots, back, pinned footer, entrance
animation) so screens can't drift; scrollable content specifically justified
for Dynamic Type XL; heading gets first VoiceOver focus; step recording is
fire-and-forget and only-advances; the goals screen's failure escape hatch is
one of the most user-respecting flows I've reviewed.

**Weaknesses & issues.**
- Welcome hero is a glyph in a circle. This is the app's first impression;
  it needs a designed mark (see §6 for the blink animation spec, which is
  already implemented well — the *asset* is what's placeholder). — **High**
- Back chevron is the text character `‹`, optically off-center in its 44 pt
  target and unweighted; use a drawn chevron (SF-Symbols-style path). —
  **Medium**
- Progress dots don't animate between states (instant width jump from 6 to
  20 pt); a 200 ms width/color tween would match the shell's care. — **Low**
- The footer's `pb-2` sits close to the home indicator on non-notch devices;
  should be `max(safe-area, 16)`. — **Low**
- `gestureEnabled: false` globally: keep it from privacy onward, but allow
  swipe-back on steps 0–1 where nothing is gated; native feel wins. — **Low**
- No completion beat: tapping "Start using Ocular" fades into the tabs with no
  acknowledgment. See §6. — **Medium**
- Goal grid: two hard-coded rows of `slice(0,2)`/`slice(2,4)`; at Dynamic Type
  XL four cards of wrapped text in fixed rows will crowd. Collapse to a single
  column at large content sizes. — **Medium**

### 2.5 Today (`app/(app)/index.tsx`)

**Strengths.** Duration-weighted daily rate (correct statistics, commented);
skeleton mirrors real layout so data lands positionally; stale-data-preserving
inline error; correct empty state with a real CTA; reload-on-focus so a new
scan appears immediately.

**Weaknesses & issues.**
- **No daily-progress hero.** `daily_target_sessions` exists in the profile
  and is settable in two places, but Today never shows progress against it.
  The emotional core of the screen (spec §4.2's `WellnessRing`) is absent, and
  with it the reason to come back. — **Critical** (for the product's promise;
  it is the top implementation priority in §9)
- Session rows don't navigate (results screen missing) — recorded data is a
  dead end. — **Critical**
- No hero sentence; the screen leads with two cards of numbers, which is the
  analytics-console feel the spec warns against. Elena gets no plain-language
  read. — **High**
- Header is the word "Today" alone — no date, no avatar affordance to Profile
  (spec §4.2 header). — **Medium**
- "Tracked / min" card: unit label "min" with value "0" reads as "0 min" for a
  brand-new day even when history exists; fine, but the pair of cards has no
  tap affordance and no explainer. — **Medium**
- `isToday` uses device-local time correctly, but the day rolls over silently
  while the screen is open; harmless now, worth a focus-refresh note later. —
  **Low**

### 2.6 Scan (`app/(app)/scan.tsx`)

The most important screen and currently the furthest from its spec. Full
target design in Section 3.

**Strengths.** Permission tri-state handled in place (undetermined / denied /
simulator) with calm copy and correct Settings deep-link; camera provably off
until "Start session" (`isActive` gates the native view) — the *behavior* is
privacy-first even though the UI doesn't say so; stop-on-blur releases the
camera; save failures never destroy the measurement.

**Weaknesses & issues.**
- **Landmark mesh always on** (`landmarks: true`): contradicts spec §4.3, reads
  as surveillance, and pays the serialization cost every session. The
  `show_landmarks` profile column exists and is unused. — **Critical**
- **No privacy badge** while the camera is live — the app breaks an explicit
  onboarding promise. — **Critical**
- **No elapsed timer, no duration target, no auto-complete.** The
  `default_session_seconds` column exists and is unused. — **Critical**
- **`Alert.alert` for "Session too short" and save failures** — a native modal
  is a slap in the middle of a calm ritual; use a toast/banner and the results
  screen's retry banner. — **High**
- Idle state is a black void: preview inactive means a dark rectangle with a
  "Ready" pill floating in it. The idle scan tab needs a designed rest state
  (§3, State 1). — **High**
- Metric band: five dashboard `MetricCard`s with 44 pt `text-metric` values —
  live tiles need a compact variant; raw Yaw/Pitch/Roll cards are
  developer-facing (spec: one "Head" deviation figure, expandable). — **High**
- Preview is square-cornered and full-bleed to the edges; spec calls for a
  24 pt bottom radius separating "camera" from "instrument panel." — **Medium**
- Stop-on-blur can surface its save `Alert` over another tab. Save silently,
  notify via banner on return. — **Medium**
- No haptic on start/complete. — **High** (spec §5.4)
- `updateInterval={66}` and thresholds are duplicated locally
  (`HEALTHY_BLINK_RATE`/`LOW_BLINK_RATE` shadow `thresholds` in
  `tokens.ts` — the exact drift the tokens file warns about; the screen should
  import `blinkRateTone`). — **Medium**

### 2.7 Insights (`app/(app)/insights.tsx`)

**Strengths.** Honest gating (real remaining-count, no fake chart axes);
day-grouped sections with Today/Yesterday humanization; gaps-not-zeros
philosophy already encoded in `groupByDay`'s comment; same state discipline as
Today.

**Weaknesses & issues.**
- No charts, deltas, or patterns yet — the tab is a filing cabinet. Expected at
  this phase; noted for §9 ordering. — **High** (product completeness)
- Rows non-interactive (same root cause: no results screen). — **Critical**
  (shared with 2.5/2.6; one fix)
- The locked-trends card and the `EmptyState` (0 sessions) present *the same
  concept* with two different visual treatments; unify copy/tone. — **Low**
- Fetches 100 sessions with no pagination affordance; fine now, flag for
  Phase 3. — **Low**
- W/M/6M segmented control absent (component exists and is unused here). —
  **Medium**

### 2.8 Profile (`app/(app)/profile.tsx`)

**Strengths.** Sectioned cards match spec structure; email survives profile
read failure (pulled from auth session); daily-target writes are
optimistic-background — correct for a preference; live camera status with
Settings deep-link; the "wellness tool, not a medical device" line is exactly
where it should be.

**Weaknesses & issues.**
- **No data controls at all**: no export, no delete-all-sessions, no delete
  account. Onboarding's third privacy promise ("you can delete them anytime")
  is currently false, and account deletion is an App Review requirement. —
  **Critical**
- Name is read-only ("Name — Ansh") with no edit affordance; spec calls for
  inline edit. — **Medium**
- Goal shows as a static row; spec says tapping reopens the goal picker as a
  sheet. Currently a user's goal is *permanent* in the UI. — **High**
- Default session duration setting missing (column exists). — **Medium**
- No avatar/identity visual — the screen starts with a label row; a small
  identity header (initial-circle + name + email) would anchor it. — **Low**
- Sign out as a full-width `danger` button is heavier than the action
  warrants; iOS idiom is a plain destructive-red *text* row in a card. —
  **Low**
- Diagnostics section is always expanded, serving the 5% (Dev persona) at the
  cost of the 95%; collapse behind a disclosure or move under "About." —
  **Low**

### 2.9 System-wide consistency issues

- **Hardcoded colors bypassing tokens:** `#0B0B0F` in `app/(auth)/_layout.tsx`,
  `#FFFFFF`/`#A0A0AE` spinner colors in `Button.tsx`, `#6B6B7B` placeholder in
  `TextField.tsx`, `#5B8DEF`/`#3DD68C` in `LandmarkOverlay.tsx`. All exist in
  `tokens.ts`; import them. — **Medium**
- **Typography scale leakage:** `text-2xl`/`text-3xl`/`text-lg` used in auth
  screens, `Centered`, and `EmptyState` instead of the named `title1/title2`
  steps — two parallel type systems. Standardize on the named scale. —
  **Medium**
- **`text-[13px]`, `text-[15px]` one-offs** (how-it-works footnote, InfoRow
  body, GoalCard label) — either promote to the scale or round to it. — **Low**
- Section header pattern (`text-xs uppercase tracking-wide text-ink-faint`) is
  re-declared inline on three screens — extract (see §5). — **Medium**
- Contrast: primary button is white-on-`#5B8DEF` ≈ 3.2:1 — passes for large
  text only; the 16 pt semibold label is borderline. Consider `ink` text on a
  slightly deepened accent, or accept as-is with awareness. — **Medium**
- `ink-faint` text contrast failure (see §1 Accessibility). — **High**
- No `maxFontSizeMultiplier` strategy anywhere. — **High**

---

## SECTION 3 — Camera / Scan Experience (target design)

This section is the frozen design for the Scan tab. Constraints honored: only
signals the pipeline actually produces (`hasFace`, `confidence`,
`boundingBox`, `headPose.stability`, `blink.isCalibrated`, `processedFps`,
session lifecycle + interruption reasons). "Too close / too far" derive from
`boundingBox` area; "low light" is *proxied* (Vision reports no lux) by
sustained low `confidence` with a face intermittently found — the copy is
therefore phrased as visibility, never as a confident diagnosis of lighting.

### Anatomy (all states share it)

1. **Preview region** — top ~55%, 24 pt bottom corner radius, `canvas` behind
   it. Contains: `FaceGuide` oval (centered, ~60% of preview width),
   `PrivacyBadge` top-left, `StatusPill` top-center.
2. **Live metrics band** — three compact `LiveMetric` tiles: Blinks · Rate ·
   Head.
3. **Control area** — duration chips + primary button (idle), or timer +
   progress + end button (active).

The scan screen never uses `signal-bad` color for *guidance* (too close, face
lost, low light are neutral coaching, not errors) and never shows a native
alert while the camera is live.

### States and transitions

**1. Idle (camera off).** The default tab state. Preview region shows quiet
`canvas-raised` with the FaceGuide oval at 40% opacity `ink-faint`, breathing
(scale 1.0→1.03, 4 s loop; static under Reduce Motion). No camera, and the
badge area shows nothing — the badge appears *only* when the camera is truly
on, so its presence is always a truthful signal. Pill: "Ready when you are."
Metrics band shows em-dashes. Controls: duration chips (1 · 2 · 5 min,
persisted to `default_session_seconds`, default from profile) + "Begin
check-in." *This state must feel restful, not broken — it is the meditation
room with the lights off.*

**2. Permission undetermined.** Replaces the preview content with an in-place
explainer card (reuse onboarding's camera InfoRows, condensed) + "Allow
camera." The system prompt fires inline. Grant → State 1 with a 300 ms
crossfade. Deny → State 3. No navigation, no modal of our own.

**3. Permission denied.** Same layout, copy shifts to ownership without blame:
"Camera access is off. Scans need it — nothing else does." + "Open Settings"
(secondary variant). Never red, never an exclamation icon. On foreground
return with permission granted (`useCameraPermission` already re-queries),
crossfade to State 1.

**4. Starting camera (user tapped Begin).** Light-impact haptic on tap.
Camera activates; `PrivacyBadge` fades in (200 ms) the moment `isActive`
flips — badge before frames, so the promise is kept from the first instant.
Preview shows `canvas-raised` until first frame (warm-up is ~hundreds of ms;
no spinner). Pill: "Starting camera…"

**5. Searching for face.** First frames arrived, `hasFace` false. Guide oval:
`ink-faint`, 40%, breathing. Pill: "Looking for you." Metrics stay dashed.
No timeout nag — searching is a calm, indefinite state.

**6. Face detected → calibrating.** `hasFace` true, `isCalibrated` false.
Guide transitions to `accent` at 70% with a 300 ms spring (color + one gentle
1.0→1.02→1.0 scale pulse — the "I see you" acknowledgment). Pill:
"Calibrating — keep your eyes open." Metric tiles show a subtle shimmer
(not zeros — zeros are lies during calibration).

**7. Good positioning / tracking (calibrated).** Guide settles to `signal-ok`
stroke at full opacity and *stops animating* — stillness signals "locked."
Pill: "Tracking," then **fades out entirely after 3 s** — during a good scan
the interface should recede; the user shouldn't feel watched by their own UI.
It returns whenever state changes. Tiles go live: Blinks (integer), Rate
(tone-colored via `blinkRateTone`), Head (single deviation magnitude in
degrees, tap to expand yaw/pitch/roll for one breath — collapses after 5 s).
Blink tile does the 120 ms scale pulse per `onBlink` (§6). Session timer runs
in Display type in the control area with a thin linear progress toward the
chosen duration.

**8. Too close / too far.** Derived from `boundingBox` area vs. preview
(> ~55% width = close; < ~18% = far), debounced 1 s so momentary lean-ins
don't nag. Guide stays `accent` but the pill coaches: "A little farther back"
/ "Come a bit closer." Never blocks measurement — coverage keeps recording;
this is advice, not a gate. Clears (pill fades) when back in band 1 s.

**9. Low light / poor visibility (proxy).** Sustained (>3 s) `confidence`
below ~0.4 while a face is at least intermittently detected. Pill: "Having
trouble seeing you — a bit more light will help." Neutral tone, never
`signal-warn` chrome. Clears when confidence recovers.

**10. Face lost mid-session.** Guide reverts to searching treatment (300 ms
spring back to `ink-faint`, breathing resumes); pill returns: "Looking for
you." **Timer keeps running** — looking away is normal life, and
`trackingCoverage` records the truth. Tiles hold their last values at 50%
opacity rather than blanking (blanking punishes a glance at the door). On
re-acquire: State 6's acknowledgment pulse, straight back to 7 (calibration
persists per native layer).

**11. Interrupted (call, Split View, thermal).** Native reasons surface in the
pill verbatim-but-humanized: "Paused — on a call." Guide dims to 40%. Timer
pauses (this is a pause, unlike face-lost). If interruption exceeds 10 s the
session auto-ends with partial save (≥ 10 s floor) and a gentle notice on the
results screen: "Ended early — your phone was busy." No data destroyed, ever.

**12. Active → auto-complete.** At the chosen duration: success-notification
haptic, guide performs one soft `signal-ok` pulse, preview fades to 30% over
400 ms, then `router.replace` to `session/[id]` (in-memory summary; save in
background). Camera off and badge gone *before* navigation — the user should
see the badge extinguish.

**13. Ended early by user.** "End session" (ghost-danger text, not a filled
red button — ending early is a choice, not destruction). ≥ 10 s → same
completion path with "ended early" noted. < 10 s → no navigation; a quiet
toast on the scan screen: "Under 10 seconds — too short to measure." Light
haptic, no alert, no shame. Return to State 1.

**14. Error (`onVisionError` / `failed`).** Session ends gracefully; partial
data ≥ 10 s persists and navigates to results with an amber note ("This
check-in ended unexpectedly"). Below the floor: toast + return to State 1.
The pill may show the error for the moment before transition, in
`signal-bad` tone — the only place red chrome is permitted on this screen.

**15. Cancelled by navigation (tab switch).** Current stop-on-blur behavior
is kept, but silent: save if ≥ 10 s, no alert over foreign tabs; Today's
focus-reload shows the row, which is acknowledgment enough.

### Transition rules (summary)

Every guide state change: 300 ms spring (`duration.state`). Every pill text
change: crossfade 150 ms, VoiceOver live region (already implemented). No
state may flash for < 1 s (debounce derived states 8–9). The privacy badge is
bound to actual camera activity with zero exceptions — it is the one UI
element that is never animated late, never early.

---

## SECTION 4 — Design System Review

Verdict up front: **the system is right; keep it.** Everything below is
additive or corrective. No palette change, no radius change, no typographic
re-scale.

**Colors.** Keep all thirteen tokens and the "signal colors describe data,
never chrome" rule — it is being followed and it's the system's soul. Three
corrections: (1) lighten `ink-faint` to ~`#7E7E8F` (≈4.6:1) or demote it to
non-text use and introduce the lightened value for caption text; (2) audit
white-on-accent on the primary button (consider `#0B0B0F` text on accent, or
deepen accent for the fill — pick one, apply everywhere); (3) eliminate the
six hardcoded hex escapees listed in §2.9 by importing `tokens.ts`.

**Typography.** The named scale (metric/title1/title2 + Tailwind defaults) is
correct. Add: (1) `tabular-nums` (`fontVariant: ['tabular-nums']`) on every
live or comparative number — spec requires it, nothing implements it, and the
scan timer will visibly jitter without it; (2) a `maxFontSizeMultiplier`
policy — 1.4 for `metric`/`title1`, 2.0 for body — set once in shared
components, not per-screen; (3) retire ad-hoc `text-2xl/3xl/lg/[13px]/[15px]`
in favor of the scale (§2.9).

**Spacing.** The 4-pt scale is defined and mostly followed (16 pt gutters,
12 pt inter-card). Two drifts: onboarding uses `px-6` (24) while tabs use
`px-4` (16) — intentional for reading-focused vs. data-focused screens; if
so, *write that down as a rule* (content screens 24, dashboard screens 16).
Codify vertical rhythm: screen title → first content = 20 pt, section gap =
32 pt (`mt-8`, already the de-facto pattern).

**Corner radius.** Keep 18/24/999. Add the missing application: camera
preview bottom corners (24), and ensure sheets (when `Sheet.tsx` lands) use
24 with the system grabber.

**Icons.** The single biggest visual upgrade available. Adopt **SF Symbols**
via `expo-symbols` (Expo SDK module, iOS-native, no font bundling): tab bar
(`eye` / `camera.viewfinder` or `dot.circle.viewfinder` / `chart.bar` /
`person.crop.circle`), InfoRow glyphs, empty states, the privacy shield
(`checkmark.shield`), chevrons. Weight: regular; size: 20 pt tab, 17 pt
inline. This one change moves "premium feel" more than any other single item.
Keep the custom eye mark for the welcome hero only — brand belongs there, not
in chrome.

**Cards.** Consistent (`rounded-card border-hairline bg-canvas-raised p-4`)
but re-declared inline ~8 times. Extract a `Card` primitive (§5). Keep the
no-shadow decision — it is correct for this palette.

**Buttons.** Solid component. Changes: `min-h-14` instead of `h-14` (Dynamic
Type); pressed-state scale 0.97 with a 100 ms spring added to the existing
color step (spec §5.4, unimplemented); spinner colors from tokens; a
`textOnly` danger variant for rows like "Delete this session."

**Metric cards.** `MetricCard` is right for dashboards. Needed: the spec'd
optional **delta chip** prop (vs.-baseline, for results), an optional
`onPress`+chevron affordance for explainer navigation, and a separate compact
`LiveMetric` for the scan band (label 11 pt, value 22–28 pt, no card border —
tiles on the band, not cards in a wall). Do not stretch one component across
both jobs.

**Empty states.** `EmptyState` is well built (invitational tone rule is
documented in-component — excellent). Swap glyph strings for SF Symbols;
otherwise keep.

**Error states.** `ErrorState`/`InlineError` split is exactly right. Add the
missing third tier: a transient **toast** (bottom, above tab bar, 3 s,
slide+fade) for "too short to measure" and post-hoc save notices — the
current gap is why `Alert.alert` is being abused.

**Loading states.** Skeleton discipline is exemplary (mirrors layout,
VoiceOver-silent, Reduce Motion aware). Keep the opacity-pulse decision. Only
gap: range-switch crossfade on Insights when that lands.

**Animations.** The §5.4 motion table is design-frozen and unimplemented
outside onboarding. Implementation order of value: blink pulse → guide state
springs → ring/chart 600 ms fills → button press scale → toast slide. All
respect Reduce Motion via the established `ReduceMotion.System` pattern.

**Dark mode.** The app *is* dark mode; the risk is light leakage: set
`userInterfaceStyle: 'dark'` in `app.config.ts` (currently `'automatic'`),
add `keyboardAppearance="dark"` to `TextField`, and verify the share sheet /
alerts moments are acceptable as system-styled. Light theme stays out of
scope for v1 (spec decision — reaffirmed).

---

## SECTION 5 — Component Architecture

Current inventory is clean and the layering rules (ui/ renders props;
features may know domain shapes; screens compose) are being followed. The
spec's §6 component plan is endorsed as-is; below are the deltas and
corrections discovered by reading the code.

**New shared components (build in this order):**

1. `Card` — the `rounded-card border-hairline bg-canvas-raised` wrapper,
   with `padded` and `onPress` variants. Eliminates ~8 inline repetitions
   (Profile `Section`, Insights locked card, goals camera note, how-it-works
   footnote, SessionRow container, MetricCard container).
2. `SectionHeader` — the uppercase 12 pt label used on Today, Insights, and
   Profile; three inline copies today.
3. `Toast` — transient notice layer (§4); prerequisite for de-Alert-ing Scan.
4. `Screen` — SafeArea + gutter + title header (with optional date/avatar
   slot). Today, Insights, and Profile each hand-roll this.
5. `Icon` — thin wrapper over `expo-symbols` so symbol names are typed and
   tab/InfoRow/empty-state callers can't drift on size/weight.
6. Then the spec's list: `ProgressRing`, `Sheet`, `DisclosureRow`,
   `LiveMetric`, `FaceGuide`, `PrivacyBadge`, `TrendChart`, `InsightCard`,
   `DeltaRow`, `WellnessRing`, `SessionVerdict`.

**Components to merge.** The Scan screen's local `Centered` helper is
`EmptyState` minus the styling — delete it and use `EmptyState` (its
permission variants gain the standard tone for free). Profile's `Row` and the
spec's future settings rows should be one `InfoLine` (label/value/chevron)
component rather than two near-twins.

**Components to split.** `MetricCard` must *not* absorb live-tile duty; split
`LiveMetric` out (different type scale, no border, shimmer state).
`ErrorState.tsx` exports two components from one file; fine functionally, but
when `Toast` lands, group the three notice components under
`components/ui/feedback/` for discoverability.

**Duplication to eliminate.**
- Blink thresholds duplicated in `scan.tsx` vs `tokens.ts` — delete the local
  constants, use `blinkRateTone`/`thresholds`.
- The load/refresh/error/focus-reload state machine is copy-pasted between
  Today and Insights (~40 lines each) — extract `useSessionList(userId,
  limit)` into `features/sessions/`.
- Day formatting (`formatDayTitle`, `isToday`) is screen-local — move to
  `features/sessions/dates.ts`; the results screen and charts will need it.
- The privacy contract copy exists in onboarding *and* Profile in different
  words — when the explainer modal lands, both must render from one source
  (spec §4.6 already mandates this; enforce it with a shared
  `privacy-content.ts`).

**Props to standardize.**
- Every leaf component takes `className` and merges via `cn` — already
  consistent; freeze it as a rule.
- Standardize `tone: 'neutral' | 'ok' | 'warn' | 'bad'` (MetricCard's shape)
  everywhere tones appear; `InfoRow`'s divergent `'neutral' | 'accent' | 'ok'`
  should become `tone` + separate `accent` handling, or accept both scales
  but document them.
- Standardize `action?: { label, onPress }` (EmptyState's shape) for every
  component that offers one CTA (`InsightCard`, `ErrorState` should adopt it
  in place of `onRetry`/`retryLabel` pairs — or keep retry-specific naming
  but don't add a third pattern).
- Numbers-as-props: components render pre-formatted strings today
  (`value: string`) — keep that rule; formatting lives in feature code, which
  is what makes tabular-nums and unit placement consistent.

---

## SECTION 6 — Apple-Level Polish (microinteraction spec)

Haptics require adding `expo-haptics` (Expo SDK module; the one dependency
this document endorses beyond `expo-symbols`). Every animation uses
Reanimated with `ReduceMotion.System`, per the established pattern. Nothing
below is decorative; each item closes a feedback loop.

| Moment | Animation | Duration / easing | Haptic |
| --- | --- | --- | --- |
| Button press | Scale 1 → 0.97 + existing color step | 100 ms spring (damping 15) in, 200 ms spring out | none (buttons don't buzz) |
| Primary CTA success (save, onboarding complete) | none beyond navigation | — | `notificationAsync(Success)` |
| Tab switch | System default; no custom transition | — | none — HIG: tabs are silent |
| Onboarding advance | Existing 250 ms slide+fade (keep) | `duration.page` | none |
| Onboarding complete → tabs | Root fade (exists) + Today ring fills from 0 | 600 ms ease-out, 150 ms after mount | Success (once, on the tap) |
| Progress dots | Width/color tween on step change | 200 ms ease-out | none |
| Scan: begin | Badge fade-in, guide appears | 200 ms | `impactAsync(Light)` |
| Scan: face acquired | Guide color spring + 1.0→1.02→1.0 pulse | 300 ms spring | none (would fire too often) |
| Scan: calibrated → locked | Guide settles to `signal-ok`, breathing stops | 300 ms | `impactAsync(Light)` — the "locked on" moment |
| Blink tick | Blinks tile scale 1.0→1.06→1.0 | 120 ms ease-out (`duration.pulse`) | **never** — spec rule, reaffirmed |
| Scan: auto-complete | Guide `signal-ok` pulse, preview fade to 30%, replace-navigate | 400 ms ease-in | `notificationAsync(Success)` |
| Scan: ended early (< 10 s) | Toast slide-up + fade | 250 ms in, 3 s hold, 200 ms out | `impactAsync(Light)` |
| Scan: interruption | Pill crossfade, guide dim to 40% | 150 ms / 300 ms | `notificationAsync(Warning)` — one, not repeated |
| Results: hero verdict | Fade + 8 pt rise; delta chips shimmer→resolve | 350 ms ease-out, 100 ms stagger | none (haptic already fired at complete) |
| Ring/chart fills | 0 → value on first appear per visit | 600 ms ease-out (`duration.fill`) | none |
| Pull-to-refresh | System control (keep) | — | none (system provides) |
| Save/settings toggle | Optimistic UI (exists); no animation | — | `selectionAsync()` on segmented-control change |
| Error (full-screen or inline appears) | Fade-in 200 ms | — | `notificationAsync(Error)` — only for full-screen, never inline |
| Session row delete (future) | Swipe row collapse | 250 ms | `impactAsync(Medium)` on commit |

Explicit non-recommendations: no haptic per blink (spec rule), no haptics on
tab switches or button presses (iOS reserves those for the system), no
parallax, no confetti — a completion in this app is a soft green pulse, not a
celebration; the brand is calm.

---

## SECTION 7 — Privacy & Trust (first-time user walkthrough)

**Does the camera feel trustworthy?** At onboarding, yes — priming before the
system prompt, "only while you scan," the green-dot reference, and always
advancing on denial are best-in-class. During an actual scan, **no**: the
promised on-device badge doesn't exist, and a landmark mesh is drawn over the
user's face by default. The current scan experience visually contradicts the
onboarding contract. (Behavior is trustworthy — camera provably off until
Start — but the UI doesn't *show* it, and unshown privacy doesn't build
trust.)

**Does the app explain what is happening?** Statically yes (onboarding,
Profile privacy card). Dynamically, partially: the StatusPill narrates
tracking well, but calibration ("keep your eyes open") is the only moment
that explains *why*, and no number anywhere offers "what does this mean?"
The explainer modal (spec §4.7) is the missing piece.

**Does the app explain what is NOT collected?** Yes — this is the copy's
strongest suit ("No image, video, or face geometry is ever stored or
uploaded"), stated in onboarding, Profile, and the permission string
consistently. One gap: the sessions themselves never show it. The results
screen should carry one quiet footer line — "This check-in stored 10 numbers.
No images." — the receipt that makes the promise concrete.

**Would a cautious user feel comfortable?** At install and onboarding: yes,
unusually so. At first scan: uneasy — black void, then suddenly a mesh on
their face with no badge and no explanation of the mesh. After first session:
undermined — they were told they can delete their data anytime, and there is
no delete control anywhere in the app.

**Improvements, in priority order:**
1. `PrivacyBadge` bound truthfully to camera activity (Critical — §3).
2. Mesh off by default, behind the existing `show_landmarks` preference
   (Critical).
3. Data controls in Profile: delete session, delete all, delete account,
   export (Critical — also App Review).
4. Results-screen "10 numbers, no images" receipt line (High, cheap).
5. Privacy explainer modal reachable from badge tap, Profile, and onboarding
   ghost link — one content source (High).
6. Fix the sign-in "eye-health" copy drift (High, one line).

---

## SECTION 8 — App Store Readiness (as App Review would see it)

**Hard blockers (would reject or force resubmission):**
1. **No account deletion** — Guideline 5.1.1(v): apps supporting account
   creation must offer in-app account deletion. Schema cascades are already
   correct (`on delete cascade`); the flow and a Supabase deletion path
   (edge function or RPC — client anon key cannot delete auth users) must be
   built.
2. **No privacy policy URL** — required in App Store Connect metadata for all
   apps, and in-app for apps collecting any data. None exists in-app.
3. **Placeholder app icon / no App Store assets** — `assets/icon.png` is
   scaffold-grade; screenshots of the current scan screen would also hurt in
   review and on the store page.
4. **Core loop dead-ends** — Guideline 2.1 (app completeness): a reviewer
   who records a session reaches an Alert or a non-tappable row. Session
   results must exist.

**Likely questions / friction (prepare, not blockers):**
5. **Camera + face analysis will trigger biometric scrutiny.** The position is
   strong — on-device Vision, nothing persisted, no face templates, no
   identification — but it must be *stated*: App Review notes should say
   "face landmarks are processed in memory via Apple's Vision framework;
   no images or face geometry are stored or transmitted; no user
   identification is performed" and the privacy nutrition label must match
   (Health & Fitness data + identifiers linked to account; no "Data Used to
   Track"). The permission string in `app.plugin.js` is already excellent —
   keep it verbatim.
6. **Medical-adjacent claims** — Guideline 1.4.1. Framing is carefully
   non-medical everywhere except the sign-in "eye-health history" line; fix
   it, and keep the "wellness tool, not a medical device" line in Profile and
   the App Store description.
7. **Terms/EULA + privacy acknowledgment at sign-up** — add the standard
   footer line with links.
8. **Email confirmation dead-end** — the confirm screen says "open it on this
   device" but the app defines no verified deep-link handling for the
   confirmation return; a reviewer creating an account may stall. Verify the
   Supabase redirect → `ocular://` scheme path end-to-end.
9. **Data deletion promise vs. reality** — onboarding says users can delete
   their metrics "anytime"; review sometimes cross-checks stated privacy
   claims against the UI. Blocker 1's flow resolves this too.
10. **`userInterfaceStyle: 'automatic'`** with a hard-dark UI produces light
    system chrome moments (keyboard, alerts) — not a rejection, but visible
    jank in review videos. Set `'dark'`.

**Clean already (assets for review):** RLS on every table, Keychain sessions,
no tracking SDKs, no third-party analytics, honest permission copy, camera
usage string traveling with the module, `ITSAppUsesNonExemptEncryption`
declared, privacy manifest for UserDefaults present.

---

## SECTION 9 — Roadmap (implementation order)

Ordered to complete the *core loop* first, then trust, then depth, then
polish. No new features beyond the frozen spec; several spec items are
deliberately deferred.

**Milestone A — Close the loop (do first).**
1. Session Results screen (`session/[id]`) with in-memory post-scan path,
   `baseline.ts`, delete action, save-retry banner.
2. Wire `SessionRow` taps everywhere.
3. Scan: timer + duration chips + auto-complete (uses
   `default_session_seconds`), replace Alerts with Toast, silent stop-on-blur.

**Milestone B — Keep the promises (trust).**
4. `PrivacyBadge` + `FaceGuide`; mesh default off behind `show_landmarks`.
5. `LiveMetric` band replacing the five MetricCards; single Head figure.
6. Profile data controls: delete session(s), delete account (server path),
   export.
7. Copy fixes (sign-in), terms/privacy links, privacy policy URL.

**Milestone C — Give it a face (premium).**
8. SF Symbols via `expo-symbols` across tabs, rows, empty states; real app
   icon; welcome hero mark.
9. `expo-haptics` + the §6 motion table.
10. `WellnessRing` + daily sentence on Today (uses `daily_target_sessions`).
11. Dynamic Type clamps, `tabular-nums`, `ink-faint` contrast fix,
    keyboard appearance, `userInterfaceStyle: 'dark'`.

**Milestone D — Depth (only after A–C).**
12. Metric explainer modal (`metric-info/[metric]`), one content source with
    the privacy contract.
13. Insights charts (`TrendChart`, aggregator, W/M/6M, pattern + delta cards)
    and the sessions migration (§7.2: coverage, `end_reason`).
14. Offline save queue.
15. App Store assets, TestFlight, review notes.

Explicitly deferred (reaffirming spec non-goals): light theme, Android,
HealthKit, notifications, any new metric the pipeline doesn't produce.

---

## SECTION 10 — Final Verdict

**What separates Ocular from a Top-10 Health & Fitness app today?**
Not architecture, not taste, and not copy — those are already at or above
that bar. Three things: (1) **the loop has no payoff** — measurement without
a results moment is a chore, and the ring-less Today gives no reason to
return; (2) **the app doesn't perform its own values** — it promises a
privacy badge it doesn't show, deletion it doesn't offer, and calm it
contradicts with a face mesh and native alerts; (3) **it has no sensory
finish** — no icons, no haptics, no motion outside onboarding. Top-10 apps
are felt in the hands; this one is currently only read.

**Highest-leverage improvements (in order):**
1. Session Results screen — turns measurement into ritual; everything else
   points at it.
2. Privacy badge + mesh-off default — converts the app's best asset (its
   actual privacy architecture) into something users can *see*.
3. SF Symbols + app icon — cheapest large jump in perceived quality.
4. Scan timer/duration/auto-complete — makes the core ritual self-explanatory.
5. WellnessRing + daily sentence — gives Today a heart and the target
   setting a purpose.
6. Haptics + the motion table — the felt layer.
7. Account deletion + data controls — unblocks the store and completes the
   trust story.

**What should absolutely NOT be changed:**
- The color system, radius scale, and no-shadow depth model.
- The four-tab IA and pushed-results decision.
- The states discipline (skeleton-mirrors-layout, empty-vs-error distinction,
  stale-data-preserving inline errors) — this is rarer than it looks; protect
  it in review.
- The onboarding flow's structure, resumability, and permission ethics.
- The copy voice: behavioral, non-medical, never alarmist — including the
  rule that signal colors describe data, never chrome.
- The privacy architecture and its honest limits (gaps-not-zeros, no invented
  signals, coverage recorded rather than penalized).
- The native module boundary and pure-logic testing pattern
  (`session-aggregator` precedent).

### The next 25 implementation tasks

| # | Task | Difficulty | User impact |
| :-: | --- | :-: | :-: |
| 1 | Session Results screen (in-memory post-scan + from-history), with `baseline.ts` | Hard | High |
| 2 | Make `SessionRow` navigate to results on Today + Insights | Easy | High |
| 3 | Scan: elapsed timer + linear progress in control area (tabular-nums) | Medium | High |
| 4 | Scan: duration chips (1/2/5 min) persisted to `default_session_seconds`, auto-complete | Medium | High |
| 5 | `Toast` component; replace all `Alert.alert` on Scan; silent stop-on-blur | Medium | High |
| 6 | `PrivacyBadge` truthfully bound to camera activity, tap → privacy popover | Medium | High |
| 7 | `FaceGuide` oval with §3 state machine (searching/acquired/locked/lost) | Hard | High |
| 8 | Mesh off by default; wire `show_landmarks` profile toggle; drop `landmarks: true` | Easy | High |
| 9 | `LiveMetric` compact tile; replace Scan's five MetricCards; single Head figure with tap-expand | Medium | Medium |
| 10 | Adopt `expo-symbols`: tab bar, InfoRows, empty states, chevrons via typed `Icon` | Medium | High |
| 11 | Real app icon + welcome hero mark | Medium | High |
| 12 | Add `expo-haptics`; implement §6 haptic map | Easy | Medium |
| 13 | Motion pass: button press scale, guide springs, blink pulse, dot tweens | Medium | Medium |
| 14 | `WellnessRing` (`ProgressRing` + hero number + sentence) on Today, using `daily_target_sessions` | Hard | High |
| 15 | `daily-sentence.ts` pure rules + tests (spec §4.2 sentence logic) | Medium | Medium |
| 16 | Account deletion flow (client UI + server-side deletion path) | Hard | High |
| 17 | Profile data controls: delete session, delete all sessions (two-step), export JSON | Medium | High |
| 18 | Goal + name editing in Profile (sheet reusing GoalCard grid; inline name edit) | Medium | Medium |
| 19 | Dynamic Type: `maxFontSizeMultiplier` policy, `min-h` buttons, XL audit of goal grid | Medium | Medium |
| 20 | Contrast + dark chrome: lighten `ink-faint` for text, `keyboardAppearance="dark"`, `userInterfaceStyle: 'dark'` | Easy | Medium |
| 21 | Consistency sweep: tokens for all hardcoded hex, named type scale everywhere, extract `Card`/`SectionHeader`/`Screen`, dedupe thresholds + `useSessionList` | Medium | Low |
| 22 | Copy fixes: sign-in "eye-health"→"check-in history"; terms/privacy links at sign-up; privacy policy URL in Profile | Easy | Medium |
| 23 | Metric explainer modal (`metric-info/[metric]`) with single-source privacy content | Medium | Medium |
| 24 | Sessions migration §7.2 (`tracking_coverage`, `completed`, `end_reason`) + persist them | Easy | Low |
| 25 | Insights: SegmentedControl ranges + `TrendChart` + `insights-aggregator` with tests | Hard | High |

Tasks 1–9 complete the product's promise; 10–15 make it feel like an Apple
app; 16–22 make it shippable; 23–25 make it worth keeping. Quality over
feature count, throughout.

---

## Progress log

Deliberate amendments only; the review body above is left as written on
2026-07-19 and this log records what has changed since.

**2026-07-19 — Polish pass (Milestone C, partial).** Shipped: SF Symbols via
`expo-symbols` behind a typed `Icon` wrapper (tab bar, InfoRows, GoalCards,
EmptyStates, onboarding chevron, welcome hero `eye.fill`); `ink-faint`
lightened to `#7E7E8F` for WCAG AA caption contrast; hardcoded hex swept into
tokens; auth screens moved onto the named type scale with form-level error
slots and a modal grabber; sign-in "eye-health" copy fixed; dark keyboard
(`keyboardAppearance`) and `userInterfaceStyle: 'dark'`; button press-scale
spring and animated onboarding progress dots; Scan idle rest state (breathing
oval + "Camera stays off until you begin") with 24 pt preview bottom radius;
Scan thresholds deduped into `blinkRateTone`. Still open from Milestone C:
haptics (`expo-haptics` not yet added), WellnessRing, real app icon, Dynamic
Type clamps.

**2026-07-19 — First device test + fixes.** First hardware run surfaced five
issues (recorded in session memory); all fixed same day: (1) landmark mesh
rendered sideways — `OcularVisionView` now inverts the EXIF orientation
before `layerPointConverted` (the old code treated Vision-oriented points as
sensor-space points); (2) interruptions — the aggregator gained
`pause`/`resume` so backgrounded time no longer counts as measurement,
`TrackingStatus` gained an honest `interrupted` case ("Paused — camera
unavailable"), and the Blinks tile now shows the JS session total, which
survives the native detector's deliberate post-interruption reset; (3) auth
footers rebuilt as single nested Text runs to fix baseline misalignment; (4)
goals-screen copy now states check-ins are always user-initiated; (5)
**posture scoring redefined by product decision (Ansh):** score = drift from
a per-session baseline (first ~30 stable samples, ~2 s), not alignment with
the camera — camera-relative scoring pinned everyone at ~100. Sessions
shorter than the baseline window report `null`. Documented trade-off:
start-slumped-stay-slumped scores well; copy must describe *change within
the session*, never absolute posture. §3's scan-state design and the §10
checklist are unchanged by any of this.

**2026-07-20 — Milestone A, Tasks 1–2 (Session Results).** Shipped
`(app)/session/[id]` pushed over the tabs (the `(app)` group is now a Stack
whose base is a `(tabs)` group). Post-scan the summary arrives in memory via a
results-handoff store — save failure still opens the screen with an amber
"Not saved yet" banner and retry, and leaving an unsaved result asks first.
From history, rows fetch by id behind a layout-mirroring skeleton;
unknown/deleted ids get a friendly error. Hero: blink rate vs. a trailing
14-session duration-weighted baseline (`baseline.ts`, pure + 21 tests) with a
delta chip and a one-sentence verdict (rule order: no rate → first-ever →
thin history → absolutely low → significant delta → steady; baseline *load
failure* downgrades to absolute thresholds rather than claiming first-ever).
Metric row: blinks, head steadiness, duration. Delete with confirmation,
non-optimistic. `SessionRow` now navigates on Today and Insights; shared
`dates.ts` deduped day-title/duration formatting; Today's daily rate reuses
the baseline's weighted-rate math. Hero entrance is the §6 fade + 8 pt rise,
Reduce Motion respected throughout. Not in this slice (deliberate): head
position `DisclosureRow`, recommendation `InsightCard`, `metric-info` modals
(Task 23), Toast (Task 5).

**2026-07-20 — Milestone A, Tasks 3–5 (scan ritual).** Shipped the §3 state
machine within existing components: session clock (tabular-nums m:ss + thin
linear progress, pause-aware, mirroring the aggregator's interruption
semantics); 1/2/5-min duration chips persisted to `default_session_seconds`
(background write, applied locally at once); auto-complete at target (state
12: preview dims to 30% over 400 ms, then results); `Toast` component (250 ms
in / 3 s hold / 200 ms out) replacing every scan alert — "Under 10 seconds —
too short to measure", "This check-in ended unexpectedly"; silent stop-on-blur
(state 15, including silent save-failure per spec); interruption auto-end
after 10 s with partial save (state 11); error salvage (state 14: ≥ floor →
results, below → toast); coaching states 8–9 via pure `CoachingMonitor`
(1 s distance debounce both directions, 3 s low-visibility proxy, 16 tests)
surfacing as neutral pill copy; pill fades out 3 s into settled tracking;
blink tile 120 ms pulse; `danger-text` Button variant for "End session";
scan's `Centered` helper deleted in favor of `EmptyState` (§5 merge). Idle
metrics show em-dashes, not stale values. Not in this slice: haptics (§6 map,
Task 12), `FaceGuide`/`PrivacyBadge`/`LiveMetric` band (Tasks 6, 7, 9),
"Ended early" annotation on results (needs `end_reason`, Task 24).

**Next session:** Milestone B — `PrivacyBadge` + `FaceGuide` (Tasks 6–7),
mesh off by default behind `show_landmarks` (Task 8), `LiveMetric` band
(Task 9).

---

*End of design review. This document freezes the product vision; changes to
it should be deliberate, written, and rare.*
