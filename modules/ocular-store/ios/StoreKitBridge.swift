import Foundation
import StoreKit

/**
 StoreKit 2 access, with no reference to Expo, React, or any bridge type.

 The same boundary `FaceTrackingSession` draws around the Vision pipeline
 (PLAN.md §4): everything below is plain Swift over Apple's APIs, so it can be
 exercised from a Swift test target or a StoreKit-configuration harness without
 a JavaScript runtime in the picture. `OcularStoreModule` is the only file that
 knows this app has a bridge at all.

 Three rules run through this file, and they are security properties rather
 than style choices:

 1. **Only `.verified` grants anything.** `VerificationResult.unverified` means
    StoreKit could not check Apple's signature on the JWS payload — a jailbroken
    device, a tampered receipt, or a genuine bug. Every such result is dropped
    on the floor and never finished, so a later legitimate verification can
    still deliver it.
 2. **Entitlement is decided offline.** `Transaction.currentEntitlements` reads
    a locally cached, Apple-signed copy of the user's transactions, so it
    answers correctly on a plane. Renewal metadata (auto-renew, grace period)
    requires the network and is therefore *enrichment only* — its absence
    never downgrades a subscriber.
 3. **Transactions are finished exactly once, after they are honored.** An
    unfinished transaction is redelivered on every launch, which is the
    mechanism that makes interrupted purchases recoverable.
 */
enum StoreKitBridge {

  // MARK: - Entitlement

  /// The verified subscription state at one moment.
  struct EntitlementSnapshot {
    /// Mirrors `Product.SubscriptionInfo.RenewalState` plus an explicit "none".
    enum State: String {
      case none
      case subscribed
      case expired
      case inBillingRetry
      case inGracePeriod
      case revoked
    }

    var state: State = .none
    var productId: String?
    var expiresAtMs: Double?
    /// False once the user cancels — they keep access until `expiresAtMs`.
    var willAutoRenew = false
    /// Stable across renewals; the id a server-side receipt check would key on.
    var originalTransactionId: String?
    /// `production`, `sandbox`, or `xcode` — surfaced so the UI can label
    /// non-production entitlements instead of pretending they are real.
    var environment: String?
    var verifiedAtMs = Date().timeIntervalSince1970 * 1000

    /**
     Whether the user may use paid features right now.

     Billing retry is deliberately *not* active: without a billing grace period
     configured in App Store Connect the subscription has genuinely lapsed, and
     Apple's own guidance is to withhold content while retrying. Grace period
     is the opposite case and stays active — that is what it is for.
     */
    var isActive: Bool { state == .subscribed || state == .inGracePeriod }
  }

  /**
   Reads the current entitlement.

   `productIds` scopes the answer to this app's subscriptions; passing an empty
   list accepts any auto-renewable entitlement, which is what the transaction
   observer does before JS has had a chance to configure it.

   Never throws. A failure to reach the network can only cost the enrichment
   pass, and returning "no entitlement" because renewal metadata was
   unavailable would log a paying subscriber out of their own subscription.
   */
  static func currentEntitlement(productIds: [String]) async -> EntitlementSnapshot {
    var snapshot = EntitlementSnapshot()

    // Pick the entitlement that lasts longest: during an upgrade both the old
    // and new subscription can appear for a moment, and the user is entitled
    // to the better of the two.
    for await result in Transaction.currentEntitlements {
      guard case .verified(let transaction) = result else { continue }
      guard transaction.productType == .autoRenewable else { continue }
      guard productIds.isEmpty || productIds.contains(transaction.productID) else { continue }
      // `currentEntitlements` already excludes revoked transactions; this is
      // the belt to that suspender, and costs one comparison.
      guard transaction.revocationDate == nil else { continue }

      let expiresAtMs = transaction.expirationDate.map { $0.timeIntervalSince1970 * 1000 }
      let isLonger = (expiresAtMs ?? .greatestFiniteMagnitude)
        > (snapshot.expiresAtMs ?? -.greatestFiniteMagnitude)
      guard snapshot.productId == nil || isLonger else { continue }

      snapshot.state = .subscribed
      snapshot.productId = transaction.productID
      snapshot.expiresAtMs = expiresAtMs
      snapshot.originalTransactionId = String(transaction.originalID)
      snapshot.environment = environmentName(for: transaction)
      // Assumed until renewal info says otherwise: an active subscription that
      // the user has not cancelled is the overwhelmingly common case, and the
      // enrichment below corrects it whenever the network allows.
      snapshot.willAutoRenew = true
    }

    return await enrich(snapshot, productIds: productIds)
  }

  /**
   Best-effort renewal metadata.

   Requires the network, so every failure path leaves the snapshot exactly as
   it arrived. The one thing this *can* do is describe a lapsed subscription
   (expired, revoked, in billing retry) that `currentEntitlements` omitted
   entirely — which is how the UI gets to say "there's a problem with your
   payment method" rather than silently reverting someone to Free.
   */
  private static func enrich(
    _ snapshot: EntitlementSnapshot,
    productIds: [String]
  ) async -> EntitlementSnapshot {
    guard !productIds.isEmpty else { return snapshot }

    var enriched = snapshot
    guard let products = try? await Product.products(for: productIds) else { return snapshot }

    for product in products {
      guard let subscription = product.subscription else { continue }
      guard let statuses = try? await subscription.status else { continue }

      for status in statuses {
        guard case .verified(let renewalInfo) = status.renewalInfo else { continue }
        // The transaction inside the status identifies which product this
        // status describes; an unverified one cannot be attributed safely.
        guard case .verified(let transaction) = status.transaction else { continue }

        if let entitledProductId = snapshot.productId {
          guard transaction.productID == entitledProductId else { continue }
          enriched.willAutoRenew = renewalInfo.willAutoRenew
          enriched.state = mapped(status.state, fallback: .subscribed)
        } else {
          // No live entitlement: describe the most informative lapsed state
          // rather than leaving the UI with a bare "none".
          let mappedState = mapped(status.state, fallback: .none)
          if mappedState != .none && enriched.state == .none {
            enriched.state = mappedState
            enriched.productId = transaction.productID
            enriched.expiresAtMs = transaction.expirationDate
              .map { $0.timeIntervalSince1970 * 1000 }
            enriched.originalTransactionId = String(transaction.originalID)
            enriched.environment = environmentName(for: transaction)
            enriched.willAutoRenew = renewalInfo.willAutoRenew
          }
        }
      }
    }

    return enriched
  }

  private static func mapped(
    _ state: Product.SubscriptionInfo.RenewalState,
    fallback: EntitlementSnapshot.State
  ) -> EntitlementSnapshot.State {
    switch state {
    case .subscribed: return .subscribed
    case .expired: return .expired
    case .inBillingRetryPeriod: return .inBillingRetry
    case .inGracePeriod: return .inGracePeriod
    case .revoked: return .revoked
    default: return fallback
    }
  }

  private static func environmentName(for transaction: Transaction) -> String {
    // `environment` is iOS 16+; the deployment target is 16.4, so this is
    // unconditional — but it is read through a helper so a future backport
    // has one place to add the availability check.
    return transaction.environment.rawValue
  }

  // MARK: - Products

  /// Localized products, in the order the caller asked for them.
  static func products(for ids: [String]) async throws -> [Product] {
    let products = try await Product.products(for: ids)
    return ids.compactMap { id in products.first { $0.id == id } }
  }

  // MARK: - Purchase

  enum PurchaseOutcome {
    case success(EntitlementSnapshot)
    /// The user dismissed Apple's sheet. Not an error, and never treated as one.
    case userCancelled
    /// Ask to Buy, or SCA. Resolution arrives later through `Transaction.updates`.
    case pending
    /// Signature check failed. Nothing is granted and nothing is finished.
    case unverified
    /// The product id is not available in this storefront or build.
    case productUnavailable
  }

  /**
   Runs Apple's purchase sheet for one product.

   `appAccountToken` ties the transaction to our own user id so a future
   server-side receipt check can attribute it without asking the client. Apple
   requires a UUID; a non-UUID string is dropped rather than rejected, since a
   missing token is a lesser failure than a blocked purchase.
   */
  static func purchase(
    productId: String,
    appAccountToken: UUID?
  ) async throws -> PurchaseOutcome {
    guard let product = try await products(for: [productId]).first else {
      return .productUnavailable
    }

    var options: Set<Product.PurchaseOption> = []
    if let token = appAccountToken {
      options.insert(.appAccountToken(token))
    }

    let result = try await product.purchase(options: options)

    switch result {
    case .success(let verification):
      guard case .verified(let transaction) = verification else {
        return .unverified
      }
      // Finish only after the entitlement is computed and about to be
      // returned: an app killed between these lines gets the transaction
      // redelivered on next launch, which is the outcome we want.
      let snapshot = await currentEntitlement(productIds: [productId])
      await transaction.finish()
      return .success(snapshot)

    case .userCancelled:
      return .userCancelled

    case .pending:
      return .pending

    @unknown default:
      // A future StoreKit result. Treating it as pending is the conservative
      // read: nothing is granted, and `Transaction.updates` still resolves it.
      return .pending
    }
  }

  // MARK: - Restore

  /**
   Restores purchases.

   `AppStore.sync()` re-authenticates and refreshes the local transaction
   cache; it prompts for the App Store password, so it belongs behind an
   explicit "Restore Purchases" tap and nowhere else. Ordinary entitlement
   refreshes use `currentEntitlement` instead, which needs no authentication.
   */
  static func restore(productIds: [String]) async throws -> EntitlementSnapshot {
    try await AppStore.sync()
    return await currentEntitlement(productIds: productIds)
  }

  // MARK: - Transaction updates

  /**
   Long-lived observer for renewals, revocations, refunds, family-sharing
   changes, and purchases completed outside the app.

   Must be started at launch and never cancelled for the app's lifetime, per
   Apple's guidance — transactions that arrive with no observer attached are
   redelivered, but only on the next launch, which would leave a renewal
   invisible for a whole session.
   */
  static func observeTransactionUpdates(
    productIds: @escaping () -> [String],
    onChange: @escaping (EntitlementSnapshot, String) async -> Void
  ) -> Task<Void, Never> {
    return Task.detached {
      for await result in Transaction.updates {
        guard case .verified(let transaction) = result else {
          // Never finished: an unverified transaction stays in the queue so a
          // legitimate later verification can still deliver it.
          continue
        }

        let reason = transaction.revocationDate == nil ? "updated" : "revoked"
        await transaction.finish()

        let snapshot = await currentEntitlement(productIds: productIds())
        await onChange(snapshot, reason)
      }
    }
  }
}
