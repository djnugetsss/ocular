import ExpoModulesCore
import Foundation
import StoreKit
import UIKit

/**
 Expo glue for StoreKit 2 — props, promises, and events, and nothing else.

 All of the actual StoreKit reasoning lives in `StoreKitBridge`; this file
 exists to move its results across the bridge and to own the one piece of
 state that must outlive any single call: the transaction observer.

 The observer is started in `OnCreate` rather than on demand from JavaScript.
 Apple requires an update listener to exist for the app's whole lifetime, and
 tying its lifetime to a JS subscription would mean a renewal arriving during
 a reload is simply lost until the next launch.
 */
public class OcularStoreModule: Module {

  /// Product ids this app sells, supplied by JS so the ids have one home.
  private var productIds: [String] = []
  private var updatesTask: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("OcularStore")

    Events("onEntitlementChange")

    Constants([
      // StoreKit itself runs on the Simulator, but only against a local
      // `.storekit` configuration — there is no App Store account behind it,
      // so real products resolve to nothing. Surfacing this lets the UI say
      // so instead of rendering an empty, unexplained paywall.
      "isSimulator": Self.isSimulator
    ])

    OnCreate { [weak self] in
      guard let self else { return }
      self.updatesTask = StoreKitBridge.observeTransactionUpdates(
        productIds: { [weak self] in self?.productIds ?? [] },
        onChange: { [weak self] snapshot, reason in
          guard let self else { return }
          var payload = OcularStorePayload.entitlement(snapshot)
          payload["reason"] = reason
          self.sendEvent("onEntitlementChange", payload)
        }
      )
    }

    OnDestroy { [weak self] in
      self?.updatesTask?.cancel()
      self?.updatesTask = nil
    }

    /// Registers the product ids. Idempotent; called once at startup.
    AsyncFunction("configure") { (productIds: [String], promise: Promise) in
      self.productIds = productIds
      promise.resolve(nil)
    }

    AsyncFunction("getProducts") { (productIds: [String], promise: Promise) in
      Task {
        do {
          let products = try await StoreKitBridge.products(for: productIds)
          promise.resolve(products.map(OcularStorePayload.product))
        } catch {
          let failure = Self.describe(error)
          promise.reject(failure.code, failure.message)
        }
      }
    }

    /// The entitlement read every gate ultimately depends on. Cannot fail:
    /// `currentEntitlement` answers from StoreKit's local signed cache.
    AsyncFunction("getEntitlement") { (promise: Promise) in
      Task { [productIds = self.productIds] in
        let snapshot = await StoreKitBridge.currentEntitlement(productIds: productIds)
        promise.resolve(OcularStorePayload.entitlement(snapshot))
      }
    }

    AsyncFunction("purchase") { (productId: String, appAccountToken: String?, promise: Promise) in
      Task {
        do {
          let outcome = try await StoreKitBridge.purchase(
            productId: productId,
            // A malformed token is dropped rather than failing the purchase:
            // attribution is useful, but never worth blocking a sale over.
            appAccountToken: appAccountToken.flatMap(UUID.init(uuidString:))
          )
          promise.resolve(OcularStorePayload.purchaseResult(outcome))
        } catch {
          let failure = Self.describe(error)
          promise.reject(failure.code, failure.message)
        }
      }
    }

    AsyncFunction("restore") { (promise: Promise) in
      Task { [productIds = self.productIds] in
        do {
          let snapshot = try await StoreKitBridge.restore(productIds: productIds)
          promise.resolve(OcularStorePayload.entitlement(snapshot))
        } catch {
          // `AppStore.sync()` throws when the user dismisses the App Store
          // sign-in prompt, which is a cancellation rather than a failure —
          // `describe` codes it as such and the JS layer treats it that way.
          let failure = Self.describe(error)
          promise.reject(failure.code, failure.message)
        }
      }
    }

    /// Apple's own manage-subscriptions sheet — where a cancellation actually
    /// happens. Required by App Review wherever a subscription is sold.
    AsyncFunction("presentManageSubscriptions") { (promise: Promise) in
      Task { @MainActor in
        guard let scene = Self.activeScene() else {
          promise.reject("ERR_STORE_NO_SCENE", "No active window scene.")
          return
        }
        do {
          try await AppStore.showManageSubscriptions(in: scene)
          promise.resolve(nil)
        } catch {
          let failure = Self.describe(error)
          promise.reject(failure.code, failure.message)
        }
      }
    }
  }

  // MARK: - Helpers

  @MainActor
  private static func activeScene() -> UIWindowScene? {
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
      ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
  }

  /**
   Classifies a StoreKit failure into a stable code plus localized text.

   The code is what JavaScript branches on — parsing an error *message* to
   decide whether a purchase failed or was merely cancelled would break the
   first time Apple rewords a string or the device changes language. The
   message is passed through from StoreKit rather than replaced with our own
   guess, because Apple's copy is already localized and usually more accurate
   about what went wrong.
   */
  private static func describe(_ error: Error) -> (code: String, message: String) {
    if let storeKitError = error as? StoreKitError {
      switch storeKitError {
      case .networkError(let underlying):
        return ("ERR_STORE_NETWORK", underlying.localizedDescription)
      case .userCancelled:
        return ("ERR_STORE_CANCELLED", "Cancelled.")
      case .notAvailableInStorefront:
        return (
          "ERR_STORE_UNAVAILABLE",
          "This subscription isn't available in your region's App Store."
        )
      case .notEntitled:
        return (
          "ERR_STORE_UNAVAILABLE",
          "This Apple Account isn't entitled to make this purchase."
        )
      case .systemError(let underlying):
        return ("ERR_STORE_UNKNOWN", underlying.localizedDescription)
      case .unknown:
        return ("ERR_STORE_UNKNOWN", "The App Store returned an unknown error.")
      @unknown default:
        return ("ERR_STORE_UNKNOWN", error.localizedDescription)
      }
    }

    if let purchaseError = error as? Product.PurchaseError {
      switch purchaseError {
      case .productUnavailable:
        return ("ERR_STORE_UNAVAILABLE", "This subscription is not available right now.")
      case .purchaseNotAllowed:
        return (
          "ERR_STORE_NOT_ALLOWED",
          "Purchases are not allowed on this device. Check Screen Time restrictions."
        )
      case .ineligibleForOffer, .invalidOfferIdentifier, .invalidOfferPrice,
        .invalidOfferSignature, .missingOfferParameters:
        return ("ERR_STORE_UNAVAILABLE", "This offer is no longer available.")
      @unknown default:
        return ("ERR_STORE_UNKNOWN", error.localizedDescription)
      }
    }

    // `URLError` shows up when the device is offline before StoreKit even
    // gets to classify it.
    if (error as? URLError) != nil {
      return ("ERR_STORE_NETWORK", error.localizedDescription)
    }

    return ("ERR_STORE_UNKNOWN", error.localizedDescription)
  }

  private static var isSimulator: Bool {
    #if targetEnvironment(simulator)
      return true
    #else
      return false
    #endif
  }
}
