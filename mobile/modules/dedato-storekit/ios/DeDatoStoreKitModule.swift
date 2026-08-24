import ExpoModulesCore
import StoreKit
import UIKit

private let transactionUpdateEvent = "onTransactionUpdate"
private let transactionErrorEvent = "onTransactionError"

private enum TransactionProvenance: Hashable {
  case purchase
  case update
  case unfinished
  case entitlement

  var isFinishable: Bool {
    switch self {
    case .purchase, .update, .unfinished:
      return true
    case .entitlement:
      return false
    }
  }
}

private actor TransactionCache {
  private struct Entry {
    let transaction: Transaction
    var provenances: Set<TransactionProvenance>
  }

  private var transactions: [UInt64: Entry] = [:]

  func store(_ transaction: Transaction, provenance: TransactionProvenance) {
    if var entry = transactions[transaction.id] {
      entry.provenances.insert(provenance)
      transactions[transaction.id] = entry
      return
    }
    transactions[transaction.id] = Entry(
      transaction: transaction,
      provenances: [provenance]
    )
  }

  func getFinishable(_ transactionId: UInt64) -> Transaction? {
    guard let entry = transactions[transactionId],
          entry.provenances.contains(where: \.isFinishable) else {
      return nil
    }
    return entry.transaction
  }

  func remove(_ transactionId: UInt64) {
    transactions.removeValue(forKey: transactionId)
  }
}

public final class DeDatoStoreKitModule: Module {
  private let transactionCache = TransactionCache()
  private var updatesTask: Task<Void, Never>?
  private let dateFormatter = ISO8601DateFormatter()

  public func definition() -> ModuleDefinition {
    Name("DeDatoStoreKit")

    Events(transactionUpdateEvent, transactionErrorEvent)

    AsyncFunction("getProducts") { (productIds: [String]) async throws -> [[String: Any]] in
      let products = try await Product.products(for: productIds)
      return products.map { self.productPayload($0) }
    }

    AsyncFunction("purchase") { (productId: String, appAccountToken: String) async throws -> [String: Any] in
      guard let token = UUID(uuidString: appAccountToken) else {
        throw Exception(
          name: "InvalidAppAccountToken",
          description: "The backend-issued appAccountToken is invalid"
        )
      }
      guard let product = try await Product.products(for: [productId]).first else {
        throw Exception(name: "ProductNotFound", description: "StoreKit product not found")
      }

      let result = try await product.purchase(options: [.appAccountToken(token)])
      switch result {
      case .success(let verification):
        switch verification {
        case .verified(let transaction):
          let payload = await self.transactionPayload(
            transaction,
            signedTransaction: verification.jwsRepresentation,
            provenance: .purchase
          )
          return ["status": "success", "transaction": payload]
        case .unverified:
          return [
            "status": "unverified",
            "errorCode": "storekit_unverified_transaction"
          ]
        }
      case .userCancelled:
        return ["status": "user_cancelled"]
      case .pending:
        return ["status": "pending"]
      @unknown default:
        return [
          "status": "unknown",
          "errorCode": "storekit_unknown_purchase_result"
        ]
      }
    }

    AsyncFunction("getCurrentEntitlements") { () async -> [[String: Any]] in
      var transactions: [[String: Any]] = []
      for await verification in Transaction.currentEntitlements {
        if let payload = await self.verifiedPayload(verification, provenance: .entitlement) {
          transactions.append(payload)
        }
      }
      return transactions
    }

    AsyncFunction("restorePurchases") { () async throws in
      try await AppStore.sync()
    }

    AsyncFunction("showManageSubscriptions") { () async throws in
      guard let scene = await MainActor.run(body: {
        UIApplication.shared.connectedScenes
          .compactMap { $0 as? UIWindowScene }
          .first { $0.activationState == .foregroundActive }
      }) else {
        throw Exception(
          name: "WindowSceneUnavailable",
          description: "No active window scene is available"
        )
      }
      try await AppStore.showManageSubscriptions(in: scene)
    }

    AsyncFunction("getUnfinishedTransactions") { () async -> [[String: Any]] in
      var transactions: [[String: Any]] = []
      for await verification in Transaction.unfinished {
        if let payload = await self.verifiedPayload(verification, provenance: .unfinished) {
          transactions.append(payload)
        }
      }
      return transactions
    }

    AsyncFunction("finishTransaction") { (transactionId: String) async throws in
      guard let numericId = UInt64(transactionId),
            let transaction = await self.transactionCache.getFinishable(numericId) else {
        throw Exception(
          name: "TransactionNotFinishable",
          description: "The exact verified StoreKit transaction is not available for finish"
        )
      }
      await transaction.finish()
      await self.transactionCache.remove(numericId)
    }

    AsyncFunction("startTransactionUpdates") { () -> Bool in
      if self.updatesTask != nil {
        return false
      }
      self.updatesTask = Task { [weak self] in
        for await verification in Transaction.updates {
          guard let self, !Task.isCancelled else { break }
          if let payload = await self.verifiedPayload(verification, provenance: .update) {
            self.sendEvent(transactionUpdateEvent, payload)
          }
        }
      }
      return true
    }

    AsyncFunction("stopTransactionUpdates") {
      self.stopUpdates()
    }

    OnDestroy {
      self.stopUpdates()
    }
  }

  private func stopUpdates() {
    updatesTask?.cancel()
    updatesTask = nil
  }

  private func verifiedPayload(
    _ verification: VerificationResult<Transaction>,
    provenance: TransactionProvenance
  ) async -> [String: Any]? {
    switch verification {
    case .verified(let transaction):
      return await transactionPayload(
        transaction,
        signedTransaction: verification.jwsRepresentation,
        provenance: provenance
      )
    case .unverified:
      sendEvent(transactionErrorEvent, ["code": "storekit_unverified_transaction"])
      return nil
    }
  }

  private func transactionPayload(
    _ transaction: Transaction,
    signedTransaction: String,
    provenance: TransactionProvenance
  ) async -> [String: Any] {
    await transactionCache.store(transaction, provenance: provenance)
    return [
      "transactionId": String(transaction.id),
      "originalTransactionId": String(transaction.originalID),
      "productId": transaction.productID,
      "purchaseDate": dateFormatter.string(from: transaction.purchaseDate),
      "expirationDate": transaction.expirationDate.map(dateFormatter.string(from:)) ?? NSNull(),
      "signedTransaction": signedTransaction
    ]
  }

  private func productPayload(_ product: Product) -> [String: Any] {
    let period: Any
    if let subscriptionPeriod = product.subscription?.subscriptionPeriod {
      period = [
        "value": subscriptionPeriod.value,
        "unit": subscriptionPeriodUnit(subscriptionPeriod.unit)
      ]
    } else {
      period = NSNull()
    }

    return [
      "productId": product.id,
      "displayName": product.displayName,
      "description": product.description,
      "displayPrice": product.displayPrice,
      "price": NSDecimalNumber(decimal: product.price).doubleValue,
      "currencyCode": product.priceFormatStyle.currencyCode,
      "subscriptionPeriod": period
    ]
  }

  private func subscriptionPeriodUnit(_ unit: Product.SubscriptionPeriod.Unit) -> String {
    switch unit {
    case .day:
      return "day"
    case .week:
      return "week"
    case .month:
      return "month"
    case .year:
      return "year"
    @unknown default:
      return "unknown"
    }
  }
}
