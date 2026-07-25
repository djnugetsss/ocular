import Foundation
import StoreKit

/**
 The contract with TypeScript, constructed in exactly one place.

 Mirrors `src/OcularStore.types.ts` the way `OcularVisionPayload.swift` mirrors
 `OcularVision.types.ts` (PLAN.md §4): changing one without the other is the
 main way this module can break, so serialization is centralized here rather
 than spread across the module definition.

 Everything crossing the bridge is a JSON-safe primitive. Dates travel as
 milliseconds since the epoch — `Date` has no bridge representation, and a
 number is what JavaScript's `new Date(...)` wants anyway.
 */
enum OcularStorePayload {

  static func entitlement(_ snapshot: StoreKitBridge.EntitlementSnapshot) -> [String: Any] {
    return [
      "isActive": snapshot.isActive,
      "state": snapshot.state.rawValue,
      "productId": snapshot.productId as Any,
      "expiresAt": snapshot.expiresAtMs as Any,
      "willAutoRenew": snapshot.willAutoRenew,
      "originalTransactionId": snapshot.originalTransactionId as Any,
      "environment": snapshot.environment as Any,
      "verifiedAt": snapshot.verifiedAtMs,
    ]
  }

  static func product(_ product: Product) -> [String: Any] {
    var payload: [String: Any] = [
      "id": product.id,
      "displayName": product.displayName,
      "description": product.description,
      // Localized and currency-formatted by StoreKit. The app displays this
      // verbatim — App Review rejects hardcoded prices, and a hand-formatted
      // number is wrong in most storefronts on earth.
      "displayPrice": product.displayPrice,
      "price": NSDecimalNumber(decimal: product.price).doubleValue,
      "currencyCode": product.priceFormatStyle.currencyCode,
    ]

    if let subscription = product.subscription {
      payload["period"] = period(subscription.subscriptionPeriod)
      if let offer = subscription.introductoryOffer {
        payload["introductoryOffer"] = introductoryOffer(offer)
      }
    }

    return payload
  }

  private static func period(_ period: Product.SubscriptionPeriod) -> [String: Any] {
    return ["unit": unitName(period.unit), "value": period.value]
  }

  private static func unitName(_ unit: Product.SubscriptionPeriod.Unit) -> String {
    switch unit {
    case .day: return "day"
    case .week: return "week"
    case .month: return "month"
    case .year: return "year"
    @unknown default: return "unknown"
    }
  }

  private static func introductoryOffer(_ offer: Product.SubscriptionOffer) -> [String: Any] {
    let paymentMode: String
    switch offer.paymentMode {
    case .freeTrial: paymentMode = "freeTrial"
    case .payAsYouGo: paymentMode = "payAsYouGo"
    case .payUpFront: paymentMode = "payUpFront"
    default: paymentMode = "unknown"
    }

    return [
      "displayPrice": offer.displayPrice,
      "paymentMode": paymentMode,
      "period": period(offer.period),
      "periodCount": offer.periodCount,
    ]
  }

  static func purchaseResult(_ outcome: StoreKitBridge.PurchaseOutcome) -> [String: Any] {
    switch outcome {
    case .success(let snapshot):
      return ["outcome": "success", "entitlement": entitlement(snapshot)]
    case .userCancelled:
      return ["outcome": "userCancelled"]
    case .pending:
      return ["outcome": "pending"]
    case .unverified:
      return ["outcome": "unverified"]
    case .productUnavailable:
      return ["outcome": "productUnavailable"]
    }
  }
}
