/**
 * Логика выбора способа оплаты апгрейда подписки (mobile).
 * Источник истины — backend split: points → balance → card.
 */

export function shouldPaySubscriptionFromBalance(params: {
  finalPrice: number;
  availableBalance?: number | null;
  canPayFromBalance?: boolean | null;
  cardPortion?: number | null;
  balancePortion?: number | null;
  requiresRobokassa?: boolean | null;
}): boolean {
  const {
    finalPrice,
    availableBalance,
    canPayFromBalance,
    cardPortion,
    balancePortion,
    requiresRobokassa,
  } = params;

  if (finalPrice <= 0) return false;

  // Новый контракт: card_portion / requires_robokassa
  if (typeof cardPortion === 'number' && Number.isFinite(cardPortion)) {
    if (cardPortion > 0.001) return false;
    if (typeof balancePortion === 'number' && balancePortion > 0.001) return true;
    return canPayFromBalance === true;
  }
  if (requiresRobokassa === true) return false;
  if (requiresRobokassa === false && canPayFromBalance === true) return true;

  // Legacy fallback (старые ответы без split)
  if (canPayFromBalance === true) return true;
  if (canPayFromBalance === false) return false;
  const bal = availableBalance ?? 0;
  return bal + 0.001 >= finalPrice;
}

/** Сумма к оплате картой (Robokassa). 0 → без карты. */
export function resolveCardPortion(params: {
  finalPrice: number;
  cardPortion?: number | null;
  payFromBalance?: boolean;
}): number {
  const { finalPrice, cardPortion, payFromBalance } = params;
  if (payFromBalance) return 0;
  if (typeof cardPortion === 'number' && Number.isFinite(cardPortion)) {
    return Math.max(0, cardPortion);
  }
  return Math.max(0, finalPrice);
}

export function isLocalhostPaymentUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    const low = url.toLowerCase();
    return low.includes('localhost') || low.includes('127.0.0.1');
  }
}

/**
 * В preview/prod не открывать payment/success с localhost — подменить origin на WEB_URL.
 */
export function sanitizePaymentRedirectUrl(url: string, webUrl: string, isDev: boolean): string {
  if (!url?.trim() || isDev) return url;
  const web = (webUrl || '').trim().replace(/\/$/, '');
  if (!web || !isLocalhostPaymentUrl(url)) return url;
  try {
    const target = new URL(url);
    const base = new URL(web);
    return `${base.origin}${target.pathname}${target.search}${target.hash}`;
  } catch {
    return url;
  }
}
