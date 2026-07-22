import type { AnalyticsEvent } from './events';

/** Параметры события после нормализации (common + payload). */
export type AnalyticsPrimitive = string | number | boolean | null | undefined;

export type AnalyticsProperties = Record<string, AnalyticsPrimitive>;

export type AnalyticsUser = {
  /** Только стабильный backend user.id — без PII. */
  id: string | number;
  role?: string | null;
};

export type AnalyticsRevenue = {
  /** Сумма, реально оплаченная деньгами (не полный пакет с баллами). */
  price: number;
  currency: string;
  productID?: string;
  quantity?: number;
  payload?: AnalyticsProperties;
};

export type AnalyticsCommonContext = {
  platform: string;
  environment: string;
  app_version: string;
  build_number: string;
  role: string | null;
};

export interface AnalyticsProvider {
  readonly name: string;
  init(): Promise<void> | void;
  track(event: AnalyticsEvent, properties?: AnalyticsProperties): Promise<void> | void;
  setUser(user: AnalyticsUser): Promise<void> | void;
  clearUser(): Promise<void> | void;
  reportRevenue?(revenue: AnalyticsRevenue): Promise<void> | void;
  reportError?(identifier: string, message?: string): Promise<void> | void;
}

export type PendingSubscriptionPayment = {
  publicId: string;
  planMonths: number;
  planFullAmount: number;
  cashPaidAmount: number;
  pointsUsed: number;
  currency: string;
  startedAt: string;
  hasPromo: boolean;
};
