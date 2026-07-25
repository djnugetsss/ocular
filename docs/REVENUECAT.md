# RevenueCat — Ocular Pro

How subscriptions are wired, and the checklist to ship them. Supersedes the
native StoreKit module (see [STOREKIT.md](./STOREKIT.md)); that Swift module is
still in the repo but no longer on the entitlement path.

## Why RevenueCat

One cross-store entitlement model, server-side receipt verification, and a
single `CustomerInfo` update stream — so the app never has to be the StoreKit
transaction observer itself. The client reads a verified answer; it does not
compute one from raw transactions.

## Architecture

```
src/features/subscription/
├── products.ts               Product ids + the "pro" entitlement id. One home.
├── revenue-cat.ts            Null-safe RevenueCat adapter (the wire) + pure mappings.
├── entitlement-cache.ts      Per-user offline cache of the last verified tier.
├── entitlement-service.ts    Resolution precedence, identity, cache, dev mock.
├── purchase-manager.ts       Buy / restore, every outcome mapped explicitly.
├── entitlements.ts           What each tier grants. No store types here.
├── feature-flags.ts          FeatureGate: entitlement × availability → access.
├── subscription-provider.tsx Startup verify, live listener, purchase/restore.
└── use-products.ts           Live localized prices (static USD as a floor).
```

**The boundary that matters:** everything a screen sees is the resolved
`Entitlements` shape or a `FeatureAccess`. No `if (productId === …)` and no
RevenueCat type ever reaches a component. `revenue-cat.ts` owns the wire;
`entitlements.ts` owns what a tier _means_; `feature-flags.ts` owns whether a
capability has _shipped_.

**Graceful degradation.** `react-native-purchases` is loaded through a guarded
`require`, and the SDK key comes from `EXPO_PUBLIC_REVENUECAT_IOS_KEY`. Absent
either — Expo Go, web, Jest, a build with no key — `isPurchasesAvailable()` is
false and the app resolves from the offline cache, then free. Payments never
crash a launch.

## Tiers

|                         | Free     | Pro ($3.99/mo · $39.99/yr) |
| ----------------------- | -------- | -------------------------- |
| Daily check-ins         | 3        | Unlimited                  |
| Visible history         | last 10  | Unlimited                  |
| Insights + trend charts | locked   | Full                       |
| Export                  | disabled | Enabled                    |
| Background tracking     | —        | Entitled, **Coming Soon**  |

Limits are **presentational, never destructive**: every session is stored,
counts toward aggregates, and reappears on upgrade. `entitlements.ts` is the
single source of these numbers; a screen that hardcodes "10" or "3" has forked
the policy.

## Security invariants (each has a test)

- **`tierFromEntitlement`** grants Pro only for an _active_ entitlement on a
  product this build still sells. Inactive, or an active entitlement for a
  discontinued product, collapses to **free** — no stale-receipt forever-unlock.
- Entitlement is **never** a `profiles` column: a client-settable `is_pro` is
  bypassable with the anon key in the binary. RevenueCat verifies server-side
  and keys on the Supabase user id we pass as its app-user id.
- The resolution gate **fails open** mid-verification (`PENDING_ENTITLEMENTS`)
  so a subscriber is never briefly locked out on a cold launch, but it never
  reads back as "paid".
- A purchase "success" for an unrecognized product is treated as a **failure**
  that grants and caches nothing.

## Resolution precedence (`entitlement-service.ts`)

1. signed out → free
2. dev/preview mock override → explicit developer switch
3. RevenueCat (live) → authoritative; overwrites the offline cache
4. offline cache → last verified tier when the store is unreachable
5. default → free

The live `CustomerInfo` listener adopts renewals, expirations, revocations, and
Ask-to-Buy approvals without a relaunch.

## The FeatureGate (`feature-flags.ts`)

Two axes, deliberately separate:

- **Entitlement** — does the plan grant it? Read from `Entitlements`.
- **Availability** — has it shipped? `live` or `coming_soon`, owned here.

`featureAccess(entitlements, feature)` returns `{ allowed, reason }` where
`reason` is `ok` | `requires_pro` | `coming_soon`, so the UI shows an upgrade CTA
for one and a "Coming soon" note for the other. Adding a future premium feature
is a one-line registry entry plus its entitlement boolean.

## Query optimization

`listRecentSessionsPage` returns the newest-N window **and** the exact total in
one round trip (`{ count: 'exact' }`). Today renders only the free plan's ten
most recent but still says "N older kept" honestly, without ever fetching
hundreds of rows to count them. `visibleSessions(rows, entitlements, total)`
takes that total for an accurate `hiddenCount`.

## Configuration checklist

**RevenueCat dashboard**

1. Create the iOS app, connect it to App Store Connect (shared secret / in-app
   purchase key).
2. Add products `ocular.monthly` and `ocular.yearly` (must match
   `products.ts`).
3. Create one entitlement with identifier **`pro`** (matches
   `PRO_ENTITLEMENT_ID`) and attach both products to it.
4. Create an Offering (default `current`) with a Monthly and an Annual package
   pointing at those products.
5. Copy the **public** iOS SDK key.

**App**

6. `EXPO_PUBLIC_REVENUECAT_IOS_KEY=<public key>` in the build environment (EAS
   secret / `.env`). It is publishable and safe to ship, like the Supabase anon
   key.
7. `npm install` (declares `react-native-purchases`), then rebuild the dev
   client / run `expo prebuild` + `pod install` — the SDK is native and
   autolinks; no config plugin is required.

**App Store Connect**

8. Subscription group, both products, localized display names, prices, and the
   Paid Applications agreement — see the checklist in
   [STOREKIT.md](./STOREKIT.md), which still applies.

## Testing

- **JS suite** (`npm test`): the pure mappings, resolution precedence, purchase
  outcomes, and the FeatureGate are all unit-tested against a mocked adapter, no
  device. `react-native-purchases` is virtually mocked to absent in
  `jest.setup.js`.
- **Dev / Simulator**: with no SDK key, the **Simulated plan** switch in
  Profile → Plan forces a tier so both plans are walkable without an App Store
  account. A real purchase clears it.
- **Real purchase / restore / renewal**: requires a device with a Sandbox
  Apple Account and a configured RevenueCat project — the one path that cannot
  be verified off-device.
