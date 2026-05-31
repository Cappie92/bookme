/**
 * Логика выбора способа оплаты апгрейда подписки (mobile).
 */

export function shouldPaySubscriptionFromBalance(params: {
  finalPrice: number;
  availableBalance?: number | null;
  canPayFromBalance?: boolean | null;
  upgradeType?: string | null;
}): boolean {
  const { finalPrice, availableBalance, canPayFromBalance, upgradeType } = params;
  if (upgradeType && upgradeType !== 'immediate') return false;
  if (finalPrice <= 0) return false;
  if (canPayFromBalance === true) return true;
  if (canPayFromBalance === false) return false;
  const bal = availableBalance ?? 0;
  return bal + 0.001 >= finalPrice;
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
