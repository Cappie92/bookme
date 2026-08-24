import {
  requireOptionalNativeModule,
  type EventSubscription,
  type NativeModule,
} from 'expo-modules-core';

export type StoreKitSubscriptionPeriod = {
  value: number;
  unit: 'day' | 'week' | 'month' | 'year' | 'unknown';
};

export type StoreKitProduct = {
  productId: string;
  displayName: string;
  description: string;
  displayPrice: string;
  price: number;
  currencyCode: string | null;
  subscriptionPeriod: StoreKitSubscriptionPeriod | null;
};

export type StoreKitTransaction = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate: string;
  expirationDate: string | null;
  signedTransaction: string;
};

export type StoreKitPurchaseResult =
  | { status: 'success'; transaction: StoreKitTransaction }
  | { status: 'user_cancelled' }
  | { status: 'pending' }
  | { status: 'unverified'; errorCode: string }
  | { status: 'unknown'; errorCode: string };

type DeDatoStoreKitEvents = {
  onTransactionUpdate: (event: StoreKitTransaction) => void;
  onTransactionError: (event: { code: string }) => void;
};

export interface DeDatoStoreKitNativeModule
  extends NativeModule<DeDatoStoreKitEvents> {
  getProducts(productIds: string[]): Promise<StoreKitProduct[]>;
  purchase(productId: string, appAccountToken: string): Promise<StoreKitPurchaseResult>;
  getCurrentEntitlements(): Promise<StoreKitTransaction[]>;
  restorePurchases(): Promise<void>;
  getUnfinishedTransactions(): Promise<StoreKitTransaction[]>;
  finishTransaction(transactionId: string): Promise<void>;
  startTransactionUpdates(): Promise<boolean>;
  stopTransactionUpdates(): Promise<void>;
  addListener<EventName extends keyof DeDatoStoreKitEvents>(
    eventName: EventName,
    listener: DeDatoStoreKitEvents[EventName]
  ): EventSubscription;
}

export const DeDatoStoreKit =
  requireOptionalNativeModule<DeDatoStoreKitNativeModule>('DeDatoStoreKit');

export default DeDatoStoreKit;
