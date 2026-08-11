import { Platform } from 'react-native';

const IOS_ONLY_ERROR = 'iOS only';

type PurchasesModule = typeof import('react-native-purchases').default;

function resolveRevenueCatIosApiKey(): string {
  try {
    const fromProcess =
      (typeof process !== 'undefined' &&
        process.env &&
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY) ||
      '';
    if (typeof fromProcess === 'string' && fromProcess.trim()) {
      return fromProcess.trim();
    }
  } catch {
    /* ignore */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: Record<string, unknown> };
    };
    const extra = Constants.expoConfig?.extra ?? {};
    const fromExtra = extra.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
    if (typeof fromExtra === 'string' && fromExtra.trim()) {
      return fromExtra.trim();
    }
  } catch {
    /* ignore */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const envMod = require('@env') as { EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?: string };
    const fromDotenv = envMod.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '';
    if (typeof fromDotenv === 'string' && fromDotenv.trim()) {
      return fromDotenv.trim();
    }
  } catch {
    /* @env may be absent in some test runners */
  }

  return '';
}

class RevenueCatService {
  private configured = false;
  private purchases: PurchasesModule | null = null;

  private assertIos(): void {
    if (Platform.OS !== 'ios') {
      throw new Error(IOS_ONLY_ERROR);
    }
  }

  private async loadPurchases(): Promise<PurchasesModule> {
    if (this.purchases) return this.purchases;
    // Dynamic require keeps Android/web bundles from hard-failing at import time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-purchases');
    this.purchases = (mod.default ?? mod) as PurchasesModule;
    return this.purchases;
  }

  async configureIfNeeded(): Promise<void> {
    this.assertIos();
    if (this.configured) return;
    const apiKey = resolveRevenueCatIosApiKey();
    if (!apiKey) {
      throw new Error('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is not configured');
    }
    const Purchases = await this.loadPurchases();
    Purchases.configure({ apiKey });
    this.configured = true;
  }

  async login(appUserId: string): Promise<void> {
    this.assertIos();
    await this.configureIfNeeded();
    const Purchases = await this.loadPurchases();
    await Purchases.logIn(appUserId);
  }

  async getOfferingsOrProducts(): Promise<unknown> {
    this.assertIos();
    await this.configureIfNeeded();
    const Purchases = await this.loadPurchases();
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings?.current || (offerings?.all && Object.keys(offerings.all).length > 0)) {
        return offerings;
      }
    } catch {
      /* fall through to products */
    }
    const { listAppleIapProductIds } = require('./appleProductMap') as typeof import('./appleProductMap');
    return Purchases.getProducts(listAppleIapProductIds());
  }


  async getLocalizedPriceString(productId: string): Promise<string | null> {
    this.assertIos();
    await this.configureIfNeeded();
    const Purchases = await this.loadPurchases();
    const products = await Purchases.getProducts([productId]);
    const product = products?.[0] as { priceString?: string } | undefined;
    const price = product?.priceString?.trim();
    return price || null;
  }

  async purchaseProductId(productId: string): Promise<unknown> {
    this.assertIos();
    await this.configureIfNeeded();
    const Purchases = await this.loadPurchases();
    return Purchases.purchaseProduct(productId);
  }

  async restore(): Promise<unknown> {
    this.assertIos();
    await this.configureIfNeeded();
    const Purchases = await this.loadPurchases();
    return Purchases.restorePurchases();
  }

  async getCustomerInfo(): Promise<unknown> {
    this.assertIos();
    await this.configureIfNeeded();
    const Purchases = await this.loadPurchases();
    return Purchases.getCustomerInfo();
  }
}

export const revenueCatService = new RevenueCatService();
export { IOS_ONLY_ERROR };
