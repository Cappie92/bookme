import { Platform } from 'react-native';
import DeDatoStoreKit, {
  type DeDatoStoreKitNativeModule,
  type StoreKitProduct,
  type StoreKitPurchaseResult,
  type StoreKitTransaction,
} from 'dedato-storekit';
import {
  fetchAppleBillingIdentity,
  fetchApplePurchaseEligibility,
  refreshAppleSubscriptions,
  verifyAppleTransaction,
  type ApplePurchaseEligibilityResponse,
  type AppleSubscriptionRefreshResponse,
  type AppleTransactionSource,
  type AppleTransactionVerifyResponse,
} from '@src/services/api/payments';
import { listAppleIapProductIds } from './appleProductMap';

const MAX_RECOVERY_TRANSACTIONS = 20;

type AppleBackendApi = {
  fetchIdentity: typeof fetchAppleBillingIdentity;
  fetchEligibility: typeof fetchApplePurchaseEligibility;
  verifyTransaction: typeof verifyAppleTransaction;
  refreshSubscriptions: typeof refreshAppleSubscriptions;
};

export type ApplePurchaseOutcome =
  | { status: 'accepted'; transactionId: string; response: AppleTransactionVerifyResponse }
  | { status: 'blocked'; eligibility: ApplePurchaseEligibilityResponse }
  | { status: 'cancelled' }
  | { status: 'pending' };

export type AppleEntitlementSyncResult = {
  verifiedCount: number;
  ignoredCount: number;
  refresh: AppleSubscriptionRefreshResponse;
};

export class AppleIapError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message || code);
    this.name = 'AppleIapError';
  }
}

const defaultBackend: AppleBackendApi = {
  fetchIdentity: fetchAppleBillingIdentity,
  fetchEligibility: fetchApplePurchaseEligibility,
  verifyTransaction: verifyAppleTransaction,
  refreshSubscriptions: refreshAppleSubscriptions,
};

function isDurablyAccepted(response: AppleTransactionVerifyResponse): boolean {
  return (
    response?.verified === true &&
    response?.recorded === true &&
    response?.finish_transaction === true
  );
}

export class AppleIapService {
  private readonly allowedProductIds = new Set(listAppleIapProductIds());
  private readonly verifyInFlight = new Map<string, Promise<AppleTransactionVerifyResponse>>();
  private readonly finishInFlight = new Map<string, Promise<void>>();
  private readonly acceptedTransactions = new Map<string, AppleTransactionVerifyResponse>();
  private readonly finishedTransactions = new Set<string>();
  private listenerSubscriptions: Array<{ remove(): void }> = [];
  private listenerStarted = false;
  private listenerStartInFlight: Promise<boolean> | null = null;
  private lifecycleInFlight: Promise<AppleEntitlementSyncResult> | null = null;
  private sessionUserId: number | null = null;
  private sessionGeneration = 0;

  constructor(
    private readonly nativeModule: DeDatoStoreKitNativeModule | null = DeDatoStoreKit,
    private readonly backend: AppleBackendApi = defaultBackend,
    private readonly platform: string = Platform.OS
  ) {}

  isAvailable(): boolean {
    return this.platform === 'ios' && this.nativeModule != null;
  }

  beginSession(userId: number): void {
    if (this.sessionUserId === userId) return;
    this.stopAndReset();
    this.sessionUserId = userId;
  }

  private requireNative(): DeDatoStoreKitNativeModule {
    if (this.platform !== 'ios') {
      throw new AppleIapError('apple_iap_ios_only', 'Apple IAP доступен только на iOS');
    }
    if (!this.nativeModule) {
      throw new AppleIapError(
        'apple_iap_native_module_unavailable',
        'StoreKit module недоступен в этой сборке'
      );
    }
    return this.nativeModule;
  }

  private assertCurrentSession(generation: number): void {
    if (generation !== this.sessionGeneration) {
      throw new AppleIapError('apple_iap_session_changed');
    }
  }

  private requireAllowedTransaction(transaction: StoreKitTransaction): void {
    if (!transaction || !this.allowedProductIds.has(transaction.productId)) {
      throw new AppleIapError('apple_product_not_allowed');
    }
    if (
      !transaction.transactionId ||
      !transaction.originalTransactionId ||
      !transaction.signedTransaction
    ) {
      throw new AppleIapError('storekit_malformed_verified_transaction');
    }
  }

  async getProducts(productIds: string[] = listAppleIapProductIds()): Promise<StoreKitProduct[]> {
    const native = this.requireNative();
    const requested = [...new Set(productIds)].filter((id) => this.allowedProductIds.has(id));
    if (requested.length === 0) return [];
    const products = await native.getProducts(requested);
    return products.filter(
      (product) =>
        requested.includes(product.productId) && this.allowedProductIds.has(product.productId)
    );
  }

  async getProduct(productId: string): Promise<StoreKitProduct> {
    if (!this.allowedProductIds.has(productId)) {
      throw new AppleIapError('apple_product_not_allowed');
    }
    const products = await this.getProducts([productId]);
    const product = products.find((item) => item.productId === productId);
    if (!product) throw new AppleIapError('apple_product_not_found');
    return product;
  }

  private async verifyOnce(
    transaction: StoreKitTransaction,
    source: AppleTransactionSource
  ): Promise<AppleTransactionVerifyResponse> {
    this.requireAllowedTransaction(transaction);
    const accepted = this.acceptedTransactions.get(transaction.transactionId);
    if (accepted) return accepted;

    const existing = this.verifyInFlight.get(transaction.transactionId);
    if (existing) return existing;

    const sessionGeneration = this.sessionGeneration;
    const promise = (async () => {
      const response = await this.backend.verifyTransaction({
        signed_transaction: transaction.signedTransaction,
        source,
      });
      if (sessionGeneration !== this.sessionGeneration) {
        throw new AppleIapError('apple_iap_session_changed');
      }
      if (!isDurablyAccepted(response)) {
        throw new AppleIapError('apple_backend_acceptance_incomplete');
      }
      this.acceptedTransactions.set(transaction.transactionId, response);
      return response;
    })();
    this.verifyInFlight.set(transaction.transactionId, promise);
    try {
      return await promise;
    } finally {
      this.verifyInFlight.delete(transaction.transactionId);
    }
  }

  private async finishOnce(transactionId: string): Promise<void> {
    if (this.finishedTransactions.has(transactionId)) return;
    const native = this.requireNative();
    const existing = this.finishInFlight.get(transactionId);
    if (existing) return existing;
    const promise = (async () => {
      await native.finishTransaction(transactionId);
      this.finishedTransactions.add(transactionId);
    })();
    this.finishInFlight.set(transactionId, promise);
    try {
      await promise;
    } finally {
      this.finishInFlight.delete(transactionId);
    }
  }

  private async processTransaction(
    transaction: StoreKitTransaction,
    source: AppleTransactionSource,
    finishAfterAcceptance: boolean
  ): Promise<AppleTransactionVerifyResponse> {
    const processingGeneration = this.sessionGeneration;
    const response = await this.verifyOnce(transaction, source);
    if (processingGeneration !== this.sessionGeneration) {
      throw new AppleIapError('apple_iap_session_changed');
    }
    if (finishAfterAcceptance) {
      await this.finishOnce(transaction.transactionId);
    }
    return response;
  }

  async purchase(productId: string): Promise<ApplePurchaseOutcome> {
    const native = this.requireNative();
    const purchaseGeneration = this.sessionGeneration;
    if (!this.allowedProductIds.has(productId)) {
      throw new AppleIapError('apple_product_not_allowed');
    }

    const identity = await this.backend.fetchIdentity();
    this.assertCurrentSession(purchaseGeneration);
    if (!identity?.app_account_token) {
      throw new AppleIapError('apple_billing_identity_missing');
    }

    // Keep this request immediately before opening the StoreKit sheet.
    const eligibility = await this.backend.fetchEligibility();
    this.assertCurrentSession(purchaseGeneration);
    if (eligibility?.allowed !== true) {
      return { status: 'blocked', eligibility };
    }

    const purchaseResult: StoreKitPurchaseResult = await native.purchase(
      productId,
      identity.app_account_token
    );
    this.assertCurrentSession(purchaseGeneration);
    if (purchaseResult.status === 'user_cancelled') return { status: 'cancelled' };
    if (purchaseResult.status === 'pending') return { status: 'pending' };
    if (purchaseResult.status === 'unverified') {
      throw new AppleIapError(purchaseResult.errorCode || 'storekit_unverified_transaction');
    }
    if (purchaseResult.status !== 'success') {
      throw new AppleIapError(purchaseResult.errorCode || 'storekit_unknown_purchase_result');
    }
    if (purchaseResult.transaction.productId !== productId) {
      throw new AppleIapError('storekit_product_mismatch');
    }

    const response = await this.processTransaction(
      purchaseResult.transaction,
      'purchase',
      true
    );
    return {
      status: 'accepted',
      transactionId: purchaseResult.transaction.transactionId,
      response,
    };
  }

  async recoverUnfinishedTransactions(): Promise<{ recovered: number; failed: number }> {
    if (!this.isAvailable()) return { recovered: 0, failed: 0 };
    const native = this.requireNative();
    const recoveryGeneration = this.sessionGeneration;
    const unfinishedById = new Map(
      (await native.getUnfinishedTransactions())
        .filter((transaction) => this.allowedProductIds.has(transaction.productId))
        .map((transaction) => [transaction.transactionId, transaction])
    );
    this.assertCurrentSession(recoveryGeneration);
    const unfinished = [...unfinishedById.values()].slice(0, MAX_RECOVERY_TRANSACTIONS);
    let recovered = 0;
    let failed = 0;
    for (const transaction of unfinished) {
      this.assertCurrentSession(recoveryGeneration);
      try {
        await this.processTransaction(transaction, 'transaction_update', true);
        recovered += 1;
      } catch {
        failed += 1;
      }
    }
    return { recovered, failed };
  }

  private async syncEntitlements(
    source: 'restore' | 'current_entitlement'
  ): Promise<AppleEntitlementSyncResult> {
    const native = this.requireNative();
    const syncGeneration = this.sessionGeneration;
    const transactions = await native.getCurrentEntitlements();
    this.assertCurrentSession(syncGeneration);
    let verifiedCount = 0;
    let ignoredCount = 0;
    let firstError: unknown = null;

    for (const transaction of transactions) {
      this.assertCurrentSession(syncGeneration);
      if (!this.allowedProductIds.has(transaction.productId)) {
        ignoredCount += 1;
        continue;
      }
      try {
        // Current entitlements may already be finished; never finish them arbitrarily.
        await this.processTransaction(transaction, source, false);
        verifiedCount += 1;
      } catch (error) {
        if (!firstError) firstError = error;
      }
    }

    this.assertCurrentSession(syncGeneration);
    const refresh = await this.backend.refreshSubscriptions();
    this.assertCurrentSession(syncGeneration);
    if (refresh?.verified !== true || refresh?.recorded !== true) {
      throw new AppleIapError('apple_subscription_refresh_incomplete');
    }
    if (firstError) throw firstError;
    return { verifiedCount, ignoredCount, refresh };
  }

  async syncCurrentEntitlements(): Promise<AppleEntitlementSyncResult> {
    return this.syncEntitlements('current_entitlement');
  }

  async restorePurchases(): Promise<AppleEntitlementSyncResult> {
    const native = this.requireNative();
    const restoreGeneration = this.sessionGeneration;
    // AppStore.sync is intentionally reachable only through this explicit user action.
    await native.restorePurchases();
    this.assertCurrentSession(restoreGeneration);
    return this.syncEntitlements('restore');
  }

  async showManageSubscriptions(): Promise<void> {
    const native = this.requireNative();
    await native.showManageSubscriptions();
  }

  async startTransactionUpdates(onError?: (code: string) => void): Promise<boolean> {
    if (!this.isAvailable() || this.listenerStarted) return false;
    const startGeneration = this.sessionGeneration;

    if (this.listenerStartInFlight) {
      try {
        await this.listenerStartInFlight;
      } catch (error) {
        if (startGeneration === this.sessionGeneration) throw error;
      }
      if (startGeneration !== this.sessionGeneration || this.listenerStarted) return false;
      return this.startTransactionUpdates(onError);
    }

    const native = this.requireNative();
    const subscriptions = [
      native.addListener('onTransactionUpdate', (transaction) => {
        if (startGeneration !== this.sessionGeneration) return;
        if (!this.allowedProductIds.has(transaction.productId)) return;
        void this.processTransaction(transaction, 'transaction_update', true).catch(() => undefined);
      }),
      native.addListener('onTransactionError', ({ code }) => {
        if (startGeneration !== this.sessionGeneration) return;
        onError?.(code || 'storekit_transaction_update_failed');
      }),
    ];
    this.listenerSubscriptions = subscriptions;

    const startPromise = (async () => {
      try {
        await native.startTransactionUpdates();
        if (startGeneration !== this.sessionGeneration) {
          subscriptions.forEach((subscription) => subscription.remove());
          await native.stopTransactionUpdates().catch(() => undefined);
          return false;
        }
        this.listenerStarted = true;
        return true;
      } catch (error) {
        subscriptions.forEach((subscription) => subscription.remove());
        if (this.listenerSubscriptions === subscriptions) {
          this.listenerSubscriptions = [];
        }
        if (startGeneration !== this.sessionGeneration) return false;
        throw error;
      }
    })();
    this.listenerStartInFlight = startPromise;

    try {
      return await startPromise;
    } finally {
      if (this.listenerStartInFlight === startPromise) {
        this.listenerStartInFlight = null;
      }
    }
  }

  async runLifecycleSync(): Promise<AppleEntitlementSyncResult> {
    if (!this.isAvailable()) {
      return {
        verifiedCount: 0,
        ignoredCount: 0,
        refresh: { verified: true, recorded: true, refreshed: 0, subscriptions: [] },
      };
    }
    if (this.lifecycleInFlight) return this.lifecycleInFlight;
    const promise = (async () => {
      await this.recoverUnfinishedTransactions();
      return this.syncCurrentEntitlements();
    })();
    this.lifecycleInFlight = promise;
    try {
      return await promise;
    } finally {
      this.lifecycleInFlight = null;
    }
  }

  stopAndReset(): void {
    this.sessionGeneration += 1;
    this.listenerSubscriptions.forEach((subscription) => subscription.remove());
    this.listenerSubscriptions = [];
    if (this.listenerStarted && this.nativeModule) {
      void this.nativeModule.stopTransactionUpdates().catch(() => undefined);
    }
    this.listenerStarted = false;
    this.verifyInFlight.clear();
    this.finishInFlight.clear();
    this.acceptedTransactions.clear();
    this.finishedTransactions.clear();
    this.lifecycleInFlight = null;
    this.sessionUserId = null;
  }
}

export const appleIapService = new AppleIapService();
