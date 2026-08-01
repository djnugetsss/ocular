# RELEASE_CHECKLIST.md — Ocular RC1

**Date:** 2026-08-01
**Scope:** Production verification for TestFlight / App Store submission. No new features.
**Reviewer stance:** Apple App Review + senior iOS staff engineer.

Every box below is **PASS** or **FAIL**. A PASS means the code path was read end
to end and its automated verification is green. It does **not** mean the
behavior was seen on a physical iPhone — the Simulator has no camera, so
anything camera-dependent is code-verified only and is called out as such.

---

## Verification matrix

| #   | Area                   | Result          | Why                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Auth**               | **PASS**        | Supabase `onAuthStateChange` is the single writer of session state; sign-in/out never write it directly. Recovery links suspend the routing gate via `isRecovering` so the reset form cannot be replaced out from under the user. Keychain read failure falls through to signed-out, never a hung splash.         |
| 2   | **Camera**             | **PASS** (code) | Capture starts only on `isActive`, stops on blur, on `willMove(toWindow: nil)`, and on unmount. Interruptions (background, call, Split View, thermal) pause the aggregator and the display clock; >10 s ends the session with a partial save. Permission re-queried on foreground. **Device retest owed.**        |
| 3   | **Scan**               | **PASS** (code) | Full §3 state machine; no native alert over a live camera; sub-10 s sessions rejected with a toast, not a failure. Fixed this pass: a Vision failure no longer fires a JS event off the capture queue (see Fix 5). **Device retest owed.**                                                                        |
| 4   | **Results**            | **PASS**        | Two data paths (in-memory handoff, fetch-by-id) unify into one view model. A failed save keeps the measurement on screen with a retry rather than losing it. Leaving unsaved is guarded by a confirm. Delete is non-optimistic — the row goes only when the server agrees.                                        |
| 5   | **Today**              | **PASS**        | Aggregates computed from the _full_ fetched history, then the plan limit is applied to the list only. Reload-on-focus, pull-to-refresh, race-guarded. Stale data survives a failed refresh behind an inline banner instead of being destroyed.                                                                    |
| 6   | **Insights**           | **PASS**        | One widest-window fetch; W/M/6M derived in memory. Averages and comparisons use every session in range on every plan — the gate hides rows, never narrows the maths. Charts have spoken summaries for VoiceOver.                                                                                                  |
| 7   | **Profile**            | **PASS**        | Preferences write through a serialized queue so a rename cannot revert a toggle still in flight. Email always read from the auth session, so it survives a profile read failure. Camera row always actionable, honoring onboarding's "revoke later" promise.                                                      |
| 8   | **Overlay**            | **PASS** (code) | Landmark mesh off by default; when on, points map through `layerPointConverted(fromCaptureDevicePoint:)` with the EXIF orientation explicitly inverted. Rect conversion uses opposite corners to survive mirroring. **This is geometry only a real face proves — device retest owed.**                            |
| 9   | **Privacy**            | **PASS**        | One source of truth (`privacy-content.ts`) for onboarding and Profile, and every claim in it is literally true of the implementation: frames are analyzed on the capture queue and discarded, only scalars reach `sessions`. Policy URL live (HTTP 200 verified 2026-08-01).                                      |
| 10  | **Terms**              | **PASS**        | Live (HTTP 200 verified 2026-08-01), linked at the moment of consent on sign-up, in Profile → Legal, and on the paywall.                                                                                                                                                                                          |
| 11  | **Delete Account**     | **PASS**        | Guideline 5.1.1(v) satisfied: findable in Profile → Your data, three steps ending in a typed `DELETE`. Edge Function derives identity from the JWT only — no user id is accepted from the body. Hard delete, no soft-delete. FK cascades asserted by migration.                                                   |
| 12  | **Data Export**        | **PASS**        | Ungated on every plan, full-fidelity (`select('*')`, nothing summarized), shared as JSON via the system sheet. Fixed this pass: the paywall no longer claims export is Pro-only (Fix 3).                                                                                                                          |
| 13  | **Session deletion**   | **PASS**        | Per-session from Results; bulk from Profile behind a two-step confirm that states the real count. Both scoped by `user_id` in the query _and_ by RLS.                                                                                                                                                             |
| 14  | **Free Tier**          | **PASS**        | 3 check-ins/day counted server-side in device-local time; 10 most recent rows rendered. Limits are presentational and non-destructive — nothing is deleted, nothing stops being written, aggregates stay honest. Gate fails **open** on an unknown count.                                                         |
| 15  | **Premium**            | **PASS**        | Entitlement never touches a client-settable column; RevenueCat verifies server-side and is keyed on the Supabase user id. Dev tier override is compiled out of production builds. Cross-account leak prevented on sign-out. Fixed this pass: Fixes 2, 3, 4, 6.                                                    |
| 16  | **RevenueCat**         | **PASS** (code) | Single entitlement `pro`, both products mapped by id; an unrecognized product id collapses to free, so a stale receipt cannot grant Pro forever. Live update listener adopts renewals/revocations without relaunch. **Fix 1 removed a second, competing transaction observer.** Sandbox test owed.                |
| 17  | **Deep Links**         | **PASS**        | Per-variant schemes so side-by-side installs return to the build that sent the mail. Single-use code guarded by a ref against double-exchange. Expired/used links are reported from the redirect params, and offline is distinguished from spent.                                                                 |
| 18  | **Notifications**      | **PASS** (N/A)  | The app ships none — no `expo-notifications`, no permission request, and no copy anywhere promising a reminder. Nothing to wire, and nothing that would make App Review expect a notification prompt.                                                                                                             |
| 19  | **Error boundaries**   | **PASS**        | Added this pass (Fix 7): a root `ErrorBoundary` with a real recovery action, replacing Expo Router's developer-facing default that offers no way back.                                                                                                                                                            |
| 20  | **Build Verification** | **PASS**        | `tsc --noEmit`, `eslint --max-warnings 0`, prettier, and 258 Jest tests across 21 suites all green. Clean `expo prebuild` + `pod install`; `xcodebuild` of the `OcularDev` scheme exits 0. `ocular-store` is absent from both autolinking and `Podfile.lock`. Two pre-existing Swift warnings remain — see below. |
| 21  | **Device Testing**     | **FAIL**        | **Never performed against this tree.** Every camera behavior — mesh placement, backgrounding round-trip, interruption handling, posture believability — is code-verified only. This is the single largest remaining risk. See "Top 10 manual tests" below.                                                        |
| 22  | **TestFlight Ready**   | **FAIL**        | Blocked only by #21 and by `eas.json`'s `submit.production.ios` still holding `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` and `REPLACE_WITH_APPLE_TEAM_ID`. Both need real values before `eas submit` will run. The binary itself is ready to build.                                                                  |
| 23  | **App Store Ready**    | **FAIL**        | Blocked by #21 and #22, plus App Store Connect metadata that does not live in this repo: the two subscription products must be in "Ready to Submit", the privacy nutrition label filled in, screenshots uploaded, and a demo account provided (see Risks).                                                        |

---

## What was fixed in this pass

Seven issues. One Critical, four High, two Medium. No low-priority polish was touched.

### Fix 1 — CRITICAL: a second StoreKit transaction observer was racing RevenueCat

`modules/ocular-store` was superseded by RevenueCat in July and nothing in `src/`
imports it — but "nothing imports it" is not the same as "it does not run". The
module was **autolinked** (confirmed in `ios/Podfile.lock`), so its Expo
`OnCreate` ran at every launch and started a lifetime `Transaction.updates`
observer that called `transaction.finish()` on **every** verified transaction.

`Transaction.updates` is a broadcast. RevenueCat's SDK observes it too, and it
must post a transaction to its backend _before_ that transaction is finished.
Two independent observers racing to finish the same transaction is a known cause
of a purchase that completes at Apple and never grants the entitlement — the
user is charged and stays on Free. That is real harm and an App Review
Guideline 3.1.1 rejection, and it would have been intermittent and close to
impossible to reproduce on demand.

Fixed at three layers so it cannot come back:

- `modules/ocular-store/expo-module.config.json` now declares no platforms, so
  the module is not autolinked or compiled. Verified with
  `npx expo-modules-autolinking search -p apple` — only `ocular-vision` remains.
- The `OnCreate`/`OnDestroy` observer wiring is removed from `OcularStoreModule.swift`.
- `StoreKitBridge.observeTransactionUpdates` is removed outright, so re-linking
  the module cannot silently restore the race.

**The app now has exactly one transaction observer and it belongs to RevenueCat.**

### Fix 2 — HIGH: the paywall sold a feature that does not exist

`PLAN_COMPARISON` listed **"Background tracking — Free: —, Pro: ✓ (Soon)"**. The
feature is not built; `feature-flags.ts` marks it `coming_soon` and gates it
closed even for entitled Pro users. A subscription sheet is a sales contract, and
attaching an unshipped promise to a price is exactly Guideline 3.1.2's complaint.
The row is removed. The `upcoming` flag and the entire feature-flag machinery
stay, so the row can return the day availability flips to `live` — and a test now
asserts nothing on the table carries `upcoming`.

### Fix 3 — HIGH: the paywall misdescribed the free plan

The table listed **"Data export — Free: —, Pro: ✓"**, but Profile's "Export my
data" has never been gated and `handleExport` has no entitlement check. The
paywall was selling free users something they already had.

Two ways to reconcile that. Gating export would have been the wrong one: a user's
own measurements should be theirs to take with them on any plan, and a free tier
that data goes into but cannot come out of is a data-portability liability quite
apart from how it reads. So the copy and the record were corrected to match the
shipped behavior — `FREE.hasExport` is now `true` and the row reads as included
on both plans.

### Fix 4 — HIGH: the paywall quoted invented prices and offered to charge them

When RevenueCat's product fetch failed on a real device, `premium.tsx` fell back
to the hardcoded USD literals (`$3.99` / `$39.99`) and left the Buy button live.
Two failures at once:

- A user outside the US storefront is quoted a price they will not be charged
  (Guideline 2.3.1 / 3.1.2).
- There is no package to purchase, so "Continue" cannot complete — the
  "tapping Buy does nothing" that Guideline 2.1 rejections are made of. Reviewers
  test on flaky office Wi-Fi; this was reachable.

Now a price is shown only when it is quotable: either RevenueCat returned live,
localized, storefront-correct prices, or the build has no store at all
(Simulator / Expo Go, where the static labels are an honest development stand-in
and the mock purchase path runs). On a real device with a failed fetch, the cards
show `—`, the CTA is disabled and reads "Prices unavailable", and the user gets
the reason plus a **Try again** that re-fetches.

### Fix 5 — HIGH: a Vision failure fired a JS event off the main thread

`FaceTrackingSession.captureOutput` called the delegate's `didFailWith` directly
on `captureQueue`, unlike every other failure path, which routes through
`fail(with:)` and hops to main. The delegate fires an Expo `EventDispatcher`,
which must only be touched from the main thread — a crash waiting for a Vision
request to fail under memory or thermal pressure. It also skipped the `.failed`
state transition, so a dead pipeline kept reporting itself as `running` and the
scan screen went on showing a live-looking session that could never produce
another frame. Now routed through `fail(with:)` like everything else.

### Fix 6 — MEDIUM: the paywall never named the subscription

Guideline 3.1.2 requires the subscription's title, length, and price on the
purchase surface. Length and price were on the plan cards and the CTA, but
**"Ocular Pro" appeared nowhere** — the hero led with a benefit line and the
comparison column just said "Pro". The name is now above the headline.

### Fix 7 — MEDIUM: no error boundary

Expo Router falls back to a developer-facing boundary (stack trace, no recovery
action). A render throw in a release build left the user stuck until a force-quit,
and a cold launch landing on the same failure would loop. `app/_layout.tsx` now
exports an `ErrorBoundary` covering every route: plain explanation, a reassurance
that check-ins are stored on the account rather than on the screen, the error
message (quietly — it is what makes a TestFlight report actionable), and a
working **Try again**. It also hides the splash, since a throw during the routing
gate can happen while the splash is still up.

**Also changed:** app version `0.1.0` → `1.0.0` for RC1. This is a metadata
judgment call and a one-line revert if you disagree; `runtimeVersion` follows
`appVersion`, so it correctly fences OTA updates to binaries built from this
version.

---

## Audited and found correct — no change needed

These were read closely and are genuinely right. Listing them so the next pass
does not re-litigate them:

- **The check-in gate fails open.** An unknown count allows a check-in. Wrongly
  allowing one costs nothing; wrongly blocking one costs the user the
  measurement they opened the app to take.
- **Interruption accounting.** Paused time is excluded from duration in both the
  aggregator and the display clock, with the open-pause-at-end case handled
  non-destructively. A 2-minute session backgrounded for 1 minute is honestly a
  1-minute measurement.
- **Race guards.** Monotonic request ids in `useSessionList`, `profile-store`,
  `use-check-in-gate`, and `subscription-provider` all correctly discard
  superseded responses. The subscription provider additionally pins the user id
  across the await in its entitlement listener, so an update racing an account
  switch cannot show one user another's Pro.
- **RLS.** `anon` reaches nothing in `public`; `profiles` has no INSERT or DELETE
  policy _and_ the grants are revoked; cascades to `auth.users` are asserted by
  migration rather than assumed.
- **Post-scan navigation ordering.** The push to Results is deferred to an effect
  gated on `!isActive`, making "camera off before navigation" a React guarantee
  rather than a timing bet.
- **Paywall presentation ethics.** Nothing auto-presents it — no timer, no
  session count, no launch. Every entry point is a tap on something that named it.
  No countdowns, no manufactured urgency.
- **App icon.** 1024×1024, no alpha channel (colortype 2) — will not be rejected
  on the icon.
- **`ITSAppUsesNonExemptEncryption: false`** is declared, so export compliance
  will not prompt on every build.

---

## Known, accepted, and deliberately not "fixed"

- **`PENDING_ENTITLEMENTS` grants everything while the tier resolves.** A free
  user can see full Insights for the beat before resolution lands. Deliberate
  and documented: the window is a local storage read behind the splash, and
  gating a paying subscriber out of their own app on a cold launch is far worse
  than a brief flash of generosity.
- **Posture is drift-from-baseline, not absolute alignment.** A user who starts
  slumped and stays slumped scores well. This is a measurement choice, and the
  copy is careful not to claim more ("Drift from your start").
- **Two Swift warnings in `ocular-vision`**, both pre-existing, neither
  behavioral, both left alone as low-priority polish. Recording them because
  `VERIFIED.md` claims "zero warnings from the `ocular-vision` Swift module",
  and that claim is now stale — a newer SDK produced them, not a regression:
  - `FaceTrackingSession.swift:425 — switch must be exhaustive, add missing
case '.sensitiveContentMitigationActivated'`. That interruption reason
    (Sensitive Content Analysis pausing the camera, iOS 18.4+) currently falls
    to `@unknown default` and reports the generic "The capture session was
    interrupted." Truthful, just not specific. Naming it properly needs an
    `#available` dance around a case newer than the 16.4 deployment target,
    which is more churn than an RC wants for one string.
  - `OcularVisionModule.swift:11 — 'Constants' is deprecated: use 'Constant' or
'Property'`. Deprecated, not removed; works unchanged.
- **15 dependencies have patch updates available within SDK 57** (including
  `react-native` 0.86.0 → 0.86.2). Deliberately **not** applied. Bumping native
  dependencies is a change that invalidates device testing, and device testing
  is the one thing still owed. **Your call, and the ordering matters:** if you
  want these, take them _now_ and then do the device pass once — not after.

---

## Blocking items that are not code

None of these can be fixed from this repo. All of them block submission.

1. `eas.json` → `submit.production.ios.ascAppId` and `appleTeamId` are still
   `REPLACE_WITH_...` placeholders.
2. Both subscription products (`ocular.monthly`, `ocular.yearly`) must be in
   **Ready to Submit** in App Store Connect, attached to the RevenueCat `pro`
   entitlement, with localized display names and a review screenshot. Products
   not submitted alongside the binary are the most common IAP rejection.
3. Every build variant's redirect URL (`ocular://callback`, `ocular-dev://…`,
   `ocular-preview://…`) must be listed in Supabase → Authentication → URL
   Configuration. An unlisted redirect is silently replaced with the Site URL,
   which is how "the link opens a browser and never reaches the app" happens.
4. **A demo account is mandatory.** The app requires sign-up _and_ email
   confirmation, so a reviewer cannot self-serve. Supply a pre-confirmed
   account in App Review notes, and say plainly that the camera features
   require a physical device.
5. Privacy nutrition label in App Store Connect, and the privacy policy URL in
   the metadata field (the app's in-binary link does not satisfy this).
6. The legal pages are served from `ocular-website-beta.vercel.app`. They return
   200 today, but a `-beta` vercel.app subdomain as the permanent home of a
   privacy policy is worth replacing with a real domain before submission.

---

# Release report

## Production readiness

**~85%.**

That number splits cleanly, and the split is the whole story:

- **Everything a machine can verify: ~100%.** Typecheck, lint at
  `--max-warnings 0`, prettier, 258 tests across 21 suites, a clean prebuild,
  a resolved pod graph, and an `xcodebuild` that exits 0. The logic layer —
  aggregation, interruption accounting, scoring, routing, entitlement
  resolution, plan gating — is unit-tested against the exact failure modes
  previous device rounds found.
- **Everything only a phone can verify: 0%.** Not "partially" — zero. No build
  of this tree has ever run on an iPhone. The Simulator has no camera, so the
  entire scan feature is code-verified and nothing more.

The 15% gap is not distributed thinly across the app. It is concentrated
entirely in the camera path, and it is the reason three checkboxes read FAIL.

## Remaining risks

**Ranked by what would actually cost a release.**

1. **The device pass has never happened.** Landmark geometry is the classic
   example of code that reviews as correct and is visibly wrong on a face —
   the orientation inverse provably matches the declared EXIF orientations, and
   that is still not proof. Backgrounding, phone calls, and thermal
   interruptions are all wired end to end and all unwitnessed.
2. **RevenueCat has never completed a sandbox purchase in this tree.** Fix 1
   changed the transaction landscape by removing a competing observer. That
   makes the purchase path _more_ correct, but "more correct and untested" is
   still untested, and IAP failures are the rejection that costs a full cycle.
3. **The App Store Connect side is entirely unbuilt** from this repo's point of
   view: products, nutrition label, screenshots, demo account, submit
   credentials. Any one missing is a rejection.
4. **Sub-10s and error paths are exercised only by tests.** The save-failure
   banner, the retry, and the "leave without saving" guard have never been seen
   by a human on a device.
5. **Dependency drift.** 15 patch updates are available and deliberately not
   taken. Low risk to leave, moderate risk to take _after_ device testing.

## App Store review risk

**Before this pass: high.** Three independent rejection vectors were live —
an unshipped feature sold on the paywall (3.1.2), hardcoded non-localized
prices behind a Buy button that could not complete (2.3.1 / 2.1), and a
transaction-observer race that could take payment without granting the
subscription (3.1.1). The last of those is the kind that gets found by a
reviewer's sandbox purchase and is nearly impossible to reproduce afterward.

**After this pass: moderate, and no longer code-shaped.** The guideline
surfaces the code controls are now clean:

| Guideline                      | Status                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.1** App completeness       | No dead buttons on the purchase path; the CTA disables itself when it cannot transact. **Still needs a demo account** or the reviewer cannot get in. |
| **2.3.1** Accurate metadata    | Prices are the store's localized ones or are not shown at all.                                                                                       |
| **3.1.1** In-app purchase      | One transaction observer, RevenueCat's. Restore is present and reachable. Manage Subscription deep-links to Apple's sheet.                           |
| **3.1.2** Subscriptions        | Title, length, price, Terms, Privacy, and Restore all on the purchase surface. Nothing unshipped is advertised.                                      |
| **4.8** Sign in with Apple     | Not applicable — email/password only, no third-party login service, so no equivalent-option requirement is triggered.                                |
| **5.1.1(v)** Account deletion  | Findable in-app, hard delete, server-side, identity from the JWT only.                                                                               |
| **5.1.1** Data collection      | Camera use is purpose-limited and explained before the prompt; privacy copy matches the implementation literally.                                    |
| **5.1.5** Location/permissions | Camera only, requested in context, revocable, and the app remains usable when denied indefinitely.                                                   |

The residual risk is now almost entirely **metadata and reviewer experience**,
not code — with one honest exception: a reviewer who cannot get the camera to
behave on their device will reject under 2.1, and nobody has yet confirmed it
behaves on any device.

## Top 10 things Apple reviewers will test

1. **Sign in with the demo account.** If email confirmation blocks them, the
   review ends here with a 2.1.
2. **Tap Buy.** Sandbox purchase of both monthly and annual, watching for the
   entitlement to actually unlock. This is where a transaction race would have
   surfaced.
3. **Tap Restore Purchases** — on a fresh install, expecting Pro back.
4. **Look for Terms, Privacy, price, and subscription length on the paywall**
   before they buy anything. All four are now present.
5. **Deny the camera permission** and confirm the app is still usable and
   explains itself, rather than dead-ending.
6. **Find account deletion.** They will look in Settings/Profile and expect it
   to be reachable without contacting support.
7. **Run the app with no network** — airplane mode on launch, then on the paywall.
8. **Open the Privacy Policy and Terms links** and expect HTTP 200, not a 404.
9. **Check that the camera indicator behaves** and that nothing records in the
   background, given the privacy claims the app makes so prominently.
10. **Turn on the largest Dynamic Type size and VoiceOver** and sweep the main
    screens for clipped or unreachable content.

## Top 10 manual tests to run on a physical iPhone before Submit

Ordered so that a failure in the first three stops you before you waste the
rest of the session.

1. **Mesh on a real face.** Enable Show face mesh, run a scan, and watch the
   overlay at the frame edges and in both portrait grips. Edge drift is the
   signature failure of this coordinate math.
2. **Sandbox purchase, both products.** Buy monthly, confirm Pro unlocks
   immediately, force-quit, relaunch, confirm it is still Pro. Then buy annual
   on a second sandbox account. **This is the single most important test in
   this list** — it is the one Fix 1 changed.
3. **Restore Purchases on a clean install.** Delete the app, reinstall, sign in,
   tap Restore, confirm Pro returns.
4. **Background mid-session and return.** Blinks tile must keep its total, the
   status must read paused rather than "Starting camera…", and the duration
   must exclude the gap. Then background for over 10 seconds and confirm the
   session ends with a partial save rather than hanging.
5. **Take a real phone call mid-session.** The second interruption path, which
   is wired differently from backgrounding and has never been exercised.
6. **Posture believability.** Hold steady for a two-minute session and expect a
   high score; deliberately slump halfway and expect it to degrade; run a
   15-second session and expect _no_ score rather than a fabricated one.
7. **Paywall with the network off.** Confirm you see "Prices unavailable", a
   disabled CTA, and a working Try again — not `$3.99` next to a live button.
   This is Fix 4, and it is only observable on a device with a real store.
8. **Full cold-start onboarding** on a device that has never run the app:
   sign up, confirm the email link opens _this_ build, complete onboarding,
   record one session, see it on Today.
9. **Delete your account for real.** Confirm you are signed out, then try to
   sign in again with the same credentials and confirm the account is gone —
   not soft-deleted and holding the email hostage.
10. **VoiceOver + largest Dynamic Type** across Today, Scan, Results, Insights,
    Profile, and the paywall. Particularly the paywall comparison table, which
    is the densest layout in the app and the one a reviewer will read.

## Expected chance of first-pass approval

**~65% if submitted today. ~85% after the device pass and the App Store Connect
work above.**

The gap between those two numbers is not code quality — the code is in good
shape, and the three guideline-facing defects that would most likely have caused
a rejection are fixed. The gap is that **App Review's first action is to sign in
and buy something**, and neither of those has been done once on real hardware
with this tree.

The most likely first-pass rejection reasons, in order:

1. Missing or non-working demo account (2.1) — entirely preventable, costs a
   full cycle.
2. IAP products not submitted with the binary (3.1.1) — the most common
   subscription rejection there is.
3. Something camera-shaped failing on the reviewer's device (2.1) — the risk
   that only device testing retires.

Nothing in the remaining risk list is a redesign. All of it is verification and
metadata, which is the right shape for a release candidate to be in.
