jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('dedato-storekit', () => ({ __esModule: true, default: null }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AppleIapError,
  AppleIapService,
} from '@src/services/purchases/AppleIapService';
import { listAppleIapProductIds } from '@src/services/purchases/appleProductMap';
import type {
  DeDatoStoreKitNativeModule,
  StoreKitTransaction,
} from 'dedato-storekit';

const productId = listAppleIapProductIds()[0];

function transaction(id = '101'): StoreKitTransaction {
  return {
    transactionId: id,
    originalTransactionId: '100',
    productId,
    purchaseDate: '2026-08-20T00:00:00Z',
    expirationDate: '2026-09-20T00:00:00Z',
    signedTransaction: `signed-${id}`,
  };
}

function nativeMock() {
  const listeners = new Map<string, (event: any) => void>();
  const native = {
    getProducts: jest.fn(async (ids: string[]) =>
      ids.map((id) => ({
        productId: id,
        displayName: 'Basic',
        description: 'Subscription',
        displayPrice: '₽999',
        price: 999,
        currencyCode: 'RUB',
        subscriptionPeriod: { value: 1, unit: 'month' as const },
      }))
    ),
    purchase: jest.fn(async () => ({ status: 'success', transaction: transaction() })),
    getCurrentEntitlements: jest.fn(async () => []),
    restorePurchases: jest.fn(async () => undefined),
    showManageSubscriptions: jest.fn(async () => undefined),
    getUnfinishedTransactions: jest.fn(async () => []),
    finishTransaction: jest.fn(async () => undefined),
    startTransactionUpdates: jest.fn(async () => true),
    stopTransactionUpdates: jest.fn(async () => undefined),
    addListener: jest.fn((event: string, listener: (value: any) => void) => {
      listeners.set(event, listener);
      return { remove: jest.fn(() => listeners.delete(event)) };
    }),
  };
  return { native: native as unknown as DeDatoStoreKitNativeModule, listeners };
}

function backendMock() {
  return {
    fetchIdentity: jest.fn(async () => ({ app_account_token: '8d84e539-8f28-4b61-9073-d8e38eabbad8' })),
    fetchEligibility: jest.fn(async () => ({ allowed: true })),
    verifyTransaction: jest.fn(async ({ source }: { source: string }) => ({
      verified: true,
      recorded: true,
      finish_transaction: true,
      source,
    })),
    refreshSubscriptions: jest.fn(async () => ({
      verified: true,
      recorded: true,
      refreshed: 1,
      subscriptions: [],
    })),
  };
}

function service() {
  const { native, listeners } = nativeMock();
  const backend = backendMock();
  return {
    service: new AppleIapService(native, backend as any, 'ios', true),
    native: native as any,
    backend,
    listeners,
  };
}

async function flushAsyncWork() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('AppleIapService direct StoreKit orchestration', () => {
  it('makes zero native and backend calls when the product model is disabled', async () => {
    const { native } = nativeMock();
    const backend = backendMock();
    const instance = new AppleIapService(native, backend as any, 'ios', false);

    instance.beginSession(7);
    expect(instance.isAvailable()).toBe(false);
    await expect(instance.startTransactionUpdates()).resolves.toBe(false);
    await expect(instance.recoverUnfinishedTransactions()).resolves.toEqual({ recovered: 0, failed: 0 });
    await expect(instance.runLifecycleSync()).resolves.toMatchObject({ verifiedCount: 0, ignoredCount: 0 });
    await expect(instance.getProducts()).rejects.toMatchObject({ code: 'apple_iap_disabled' });
    await expect(instance.purchase(productId)).rejects.toMatchObject({ code: 'apple_iap_disabled' });
    await expect(instance.restorePurchases()).rejects.toMatchObject({ code: 'apple_iap_disabled' });
    await expect(instance.showManageSubscriptions()).rejects.toMatchObject({ code: 'apple_iap_disabled' });

    for (const mock of Object.values(native as any)) {
      if (typeof mock === 'function' && 'mock' in mock) expect(mock).not.toHaveBeenCalled();
    }
    for (const mock of Object.values(backend)) expect(mock).not.toHaveBeenCalled();
  });

  it('fails safely when the native module is unavailable', async () => {
    const instance = new AppleIapService(null, backendMock() as any, 'ios', true);
    expect(instance.isAvailable()).toBe(false);
    await expect(instance.getProducts()).rejects.toMatchObject({
      code: 'apple_iap_native_module_unavailable',
    });
  });

  it('does not invoke the Apple module on Android', async () => {
    const { native } = nativeMock();
    const instance = new AppleIapService(native, backendMock() as any, 'android', true);
    expect(await instance.recoverUnfinishedTransactions()).toEqual({ recovered: 0, failed: 0 });
    await expect(instance.purchase(productId)).rejects.toBeInstanceOf(AppleIapError);
    expect((native as any).purchase).not.toHaveBeenCalled();
  });

  it('loads StoreKit products with localized prices', async () => {
    const ctx = service();
    const products = await ctx.service.getProducts([productId]);
    expect(products).toEqual([
      expect.objectContaining({ productId, displayPrice: '₽999', currencyCode: 'RUB' }),
    ]);
  });

  it('rejects a missing StoreKit product', async () => {
    const ctx = service();
    ctx.native.getProducts.mockResolvedValueOnce([]);
    await expect(ctx.service.getProduct(productId)).rejects.toMatchObject({
      code: 'apple_product_not_found',
    });
  });

  it('checks eligibility immediately before purchase and blocks the sheet', async () => {
    const ctx = service();
    ctx.backend.fetchEligibility.mockResolvedValueOnce({
      allowed: false,
      reason: 'blocked_by_active_non_apple_subscription',
    } as any);
    await expect(ctx.service.purchase(productId)).resolves.toMatchObject({ status: 'blocked' });
    expect(ctx.native.purchase).not.toHaveBeenCalled();
    expect(ctx.backend.fetchIdentity).toHaveBeenCalledTimes(1);
  });

  it('finishes a verified purchase only after durable backend acceptance', async () => {
    const ctx = service();
    const result = await ctx.service.purchase(productId);
    expect(result.status).toBe('accepted');
    expect(ctx.backend.verifyTransaction).toHaveBeenCalledWith({
      signed_transaction: 'signed-101',
      source: 'purchase',
    });
    expect(ctx.native.finishTransaction).toHaveBeenCalledWith('101');
    expect(ctx.backend.verifyTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.native.finishTransaction.mock.invocationCallOrder[0]
    );
    expect(ctx.backend.fetchEligibility.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.native.purchase.mock.invocationCallOrder[0]
    );
  });

  it('never sends or finishes an unverified purchase', async () => {
    const ctx = service();
    ctx.native.purchase.mockResolvedValueOnce({
      status: 'unverified',
      errorCode: 'storekit_unverified_transaction',
    });
    await expect(ctx.service.purchase(productId)).rejects.toMatchObject({
      code: 'storekit_unverified_transaction',
    });
    expect(ctx.backend.verifyTransaction).not.toHaveBeenCalled();
    expect(ctx.native.finishTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['user_cancelled', 'cancelled'],
    ['pending', 'pending'],
  ] as const)('handles %s purchase without backend mutation', async (nativeStatus, status) => {
    const ctx = service();
    ctx.native.purchase.mockResolvedValueOnce({ status: nativeStatus });
    await expect(ctx.service.purchase(productId)).resolves.toMatchObject({ status });
    expect(ctx.backend.verifyTransaction).not.toHaveBeenCalled();
    expect(ctx.native.finishTransaction).not.toHaveBeenCalled();
  });

  it('surfaces a StoreKit purchase failure', async () => {
    const ctx = service();
    ctx.native.purchase.mockRejectedValueOnce(new Error('storekit failed'));
    await expect(ctx.service.purchase(productId)).rejects.toThrow('storekit failed');
    expect(ctx.backend.verifyTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['network failure', new Error('network')],
    ['timeout', Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })],
    ['provider conflict', Object.assign(new Error('conflict'), { response: { status: 409 } })],
  ])('does not finish after backend %s', async (_label, error) => {
    const ctx = service();
    ctx.backend.verifyTransaction.mockRejectedValueOnce(error);
    await expect(ctx.service.purchase(productId)).rejects.toBe(error);
    expect(ctx.native.finishTransaction).not.toHaveBeenCalled();
  });

  it('does not finish a malformed backend success response', async () => {
    const ctx = service();
    ctx.backend.verifyTransaction.mockResolvedValueOnce({
      verified: true,
      recorded: true,
      finish_transaction: false,
      source: 'purchase',
    });
    await expect(ctx.service.purchase(productId)).rejects.toMatchObject({
      code: 'apple_backend_acceptance_incomplete',
    });
    expect(ctx.native.finishTransaction).not.toHaveBeenCalled();
  });

  it('recovers unfinished transactions and deduplicates repeated transaction IDs', async () => {
    const ctx = service();
    ctx.native.getUnfinishedTransactions.mockResolvedValueOnce([
      transaction('201'),
      transaction('201'),
    ]);
    await expect(ctx.service.recoverUnfinishedTransactions()).resolves.toEqual({
      recovered: 1,
      failed: 0,
    });
    expect(ctx.backend.verifyTransaction).toHaveBeenCalledTimes(1);
    expect(ctx.native.finishTransaction).toHaveBeenCalledTimes(1);
  });

  it('retries an unfinished transaction after a previous backend failure', async () => {
    const ctx = service();
    ctx.native.getUnfinishedTransactions.mockResolvedValue([transaction('202')]);
    ctx.backend.verifyTransaction.mockRejectedValueOnce(new Error('offline'));
    await expect(ctx.service.recoverUnfinishedTransactions()).resolves.toEqual({
      recovered: 0,
      failed: 1,
    });
    expect(ctx.native.finishTransaction).not.toHaveBeenCalled();
    await expect(ctx.service.recoverUnfinishedTransactions()).resolves.toEqual({
      recovered: 1,
      failed: 0,
    });
    expect(ctx.native.finishTransaction).toHaveBeenCalledWith('202');
  });

  it('syncs current entitlements without finishing historical transactions', async () => {
    const ctx = service();
    ctx.native.getCurrentEntitlements.mockResolvedValueOnce([transaction('301')]);
    const result = await ctx.service.syncCurrentEntitlements();
    expect(result.verifiedCount).toBe(1);
    expect(ctx.backend.verifyTransaction).toHaveBeenCalledWith({
      signed_transaction: 'signed-301',
      source: 'current_entitlement',
    });
    expect(ctx.backend.refreshSubscriptions).toHaveBeenCalledTimes(1);
    expect(ctx.native.restorePurchases).not.toHaveBeenCalled();
    expect(ctx.native.finishTransaction).not.toHaveBeenCalled();
  });

  it('restores only through explicit sync and handles no purchases', async () => {
    const ctx = service();
    const result = await ctx.service.restorePurchases();
    expect(ctx.native.restorePurchases).toHaveBeenCalledTimes(1);
    expect(result.verifiedCount).toBe(0);
    expect(ctx.backend.refreshSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('verifies restored entitlement and leaves it unfinished', async () => {
    const ctx = service();
    ctx.native.getCurrentEntitlements.mockResolvedValueOnce([transaction('401')]);
    await ctx.service.restorePurchases();
    expect(ctx.backend.verifyTransaction).toHaveBeenCalledWith({
      signed_transaction: 'signed-401',
      source: 'restore',
    });
    expect(ctx.native.finishTransaction).not.toHaveBeenCalled();
  });

  it('opens StoreKit system subscription management through the native module', async () => {
    const ctx = service();
    await expect(ctx.service.showManageSubscriptions()).resolves.toBeUndefined();
    expect(ctx.native.showManageSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('surfaces wrong-account restore rejection without finishing', async () => {
    const ctx = service();
    ctx.native.getCurrentEntitlements.mockResolvedValueOnce([transaction('402')]);
    ctx.backend.verifyTransaction.mockRejectedValueOnce(
      Object.assign(new Error('wrong account'), { response: { status: 403 } })
    );
    await expect(ctx.service.restorePurchases()).rejects.toThrow('wrong account');
    expect(ctx.native.finishTransaction).not.toHaveBeenCalled();
  });

  it('starts the transaction listener once, deduplicates updates, and stops on logout', async () => {
    const ctx = service();
    ctx.service.beginSession(7);
    await expect(ctx.service.startTransactionUpdates()).resolves.toBe(true);
    await expect(ctx.service.startTransactionUpdates()).resolves.toBe(false);
    expect(ctx.native.startTransactionUpdates).toHaveBeenCalledTimes(1);

    const update = ctx.listeners.get('onTransactionUpdate');
    update?.(transaction('501'));
    update?.(transaction('501'));
    await flushAsyncWork();
    expect(ctx.backend.verifyTransaction).toHaveBeenCalledTimes(1);
    expect(ctx.native.finishTransaction).toHaveBeenCalledTimes(1);

    ctx.service.stopAndReset();
    expect(ctx.native.stopTransactionUpdates).toHaveBeenCalledTimes(1);
  });

  it('does not finish a transaction when its backend response arrives after logout', async () => {
    const ctx = service();
    let resolveVerification!: (value: any) => void;
    ctx.backend.verifyTransaction.mockImplementationOnce(
      () => new Promise((resolve) => { resolveVerification = resolve; })
    );

    ctx.service.beginSession(7);
    const purchase = ctx.service.purchase(productId);
    await flushAsyncWork();
    ctx.service.stopAndReset();
    resolveVerification({ verified: true, recorded: true, finish_transaction: true });

    await expect(purchase).rejects.toMatchObject({ code: 'apple_iap_session_changed' });
    expect(ctx.native.finishTransaction).not.toHaveBeenCalled();
  });

  it('does not verify a purchase started by login A after login B replaces the session', async () => {
    const ctx = service();
    let resolvePurchase!: (value: any) => void;
    ctx.native.purchase.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePurchase = resolve; })
    );

    ctx.service.beginSession(7);
    const purchase = ctx.service.purchase(productId);
    await flushAsyncWork();

    ctx.service.stopAndReset();
    ctx.service.beginSession(8);
    resolvePurchase({ status: 'success', transaction: transaction('550') });

    await expect(purchase).rejects.toMatchObject({ code: 'apple_iap_session_changed' });
    expect(ctx.backend.verifyTransaction).not.toHaveBeenCalled();
    expect(ctx.native.finishTransaction).not.toHaveBeenCalled();
  });

  it('does not let an async listener start or callback cross from login A into login B', async () => {
    const ctx = service();
    let resolveFirstStart!: (value: boolean) => void;
    ctx.native.startTransactionUpdates
      .mockImplementationOnce(
        () => new Promise<boolean>((resolve) => { resolveFirstStart = resolve; })
      )
      .mockResolvedValueOnce(true);

    ctx.service.beginSession(7);
    const startA = ctx.service.startTransactionUpdates();
    const callbackA = ctx.listeners.get('onTransactionUpdate');

    ctx.service.stopAndReset();
    ctx.service.beginSession(8);
    const startB = ctx.service.startTransactionUpdates();

    callbackA?.(transaction('601'));
    await flushAsyncWork();
    expect(ctx.backend.verifyTransaction).not.toHaveBeenCalled();

    resolveFirstStart(true);
    await expect(startA).resolves.toBe(false);
    await expect(startB).resolves.toBe(true);
    expect(ctx.native.stopTransactionUpdates).toHaveBeenCalledTimes(1);
    expect(ctx.native.startTransactionUpdates).toHaveBeenCalledTimes(2);

    callbackA?.(transaction('602'));
    ctx.listeners.get('onTransactionUpdate')?.(transaction('603'));
    await flushAsyncWork();

    expect(ctx.backend.verifyTransaction).toHaveBeenCalledTimes(1);
    expect(ctx.backend.verifyTransaction).toHaveBeenCalledWith({
      signed_transaction: 'signed-603',
      source: 'transaction_update',
    });
    expect(ctx.native.finishTransaction).toHaveBeenCalledWith('603');
  });

  it('reports safe native update errors without transaction data', async () => {
    const ctx = service();
    const onError = jest.fn();
    await ctx.service.startTransactionUpdates(onError);
    ctx.listeners.get('onTransactionError')?.({ code: 'storekit_unverified_transaction' });
    expect(onError).toHaveBeenCalledWith('storekit_unverified_transaction');
    expect(ctx.backend.verifyTransaction).not.toHaveBeenCalled();
  });
});

describe('DeDatoStoreKit native transaction provenance contract', () => {
  const swiftSource = readFileSync(
    join(__dirname, '../../../modules/dedato-storekit/ios/DeDatoStoreKitModule.swift'),
    'utf8'
  );

  it('does not make current or restored entitlements finishable', () => {
    expect(swiftSource).toContain(
      'self.verifiedPayload(verification, provenance: .entitlement)'
    );
    expect(swiftSource).toMatch(/case \.entitlement:\s+return false/);
    expect(swiftSource).toContain('try await AppStore.sync()');
  });

  it('uses the documented StoreKit system subscription management sheet', () => {
    expect(swiftSource).toContain('AsyncFunction("showManageSubscriptions")');
    expect(swiftSource).toContain('AppStore.showManageSubscriptions(in: scene)');
    expect(swiftSource).not.toContain('apps.apple.com/account/subscriptions');
  });

  it.each([
    ['purchase', 'provenance: .purchase'],
    ['unfinished', 'provenance: .unfinished'],
    ['transaction update', 'provenance: .update'],
  ])('allows finishable provenance only for %s', (_label, route) => {
    expect(swiftSource).toContain(route);
  });

  it('requires finishable provenance and does not replace cached transactions on ID reuse', () => {
    expect(swiftSource).toContain('getFinishable(numericId)');
    expect(swiftSource).toContain('entry.provenances.contains(where: \\.isFinishable)');
    expect(swiftSource).toContain('let transaction: Transaction');
    expect(swiftSource).not.toContain('entry.transaction = transaction');
  });
});
