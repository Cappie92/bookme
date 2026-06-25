import { apiClient } from './client';

export type MasterReferralBonusRules = Record<string, unknown>;

export interface MasterReferralCodeResponse {
  code?: string | null;
  referral_url?: string | null;
  beneficiary_bonus_rules?: MasterReferralBonusRules | null;
  referrer_bonus_rules?: MasterReferralBonusRules | null;
  stats?: Record<string, unknown> | null;
}

export interface ApplyMasterPromoCodeResponse {
  success?: boolean;
  code?: string | null;
  promo_code?: string | null;
  message?: string | null;
  redemption_id?: number | null;
  status?: string | null;
  [key: string]: unknown;
}

export interface CurrentMasterPromoCodeResponse {
  code?: string | null;
  promo_code?: string | { code?: string | null; status?: string | null } | null;
  status?: string | null;
  applied_at?: string | null;
  redemption_id?: number | null;
  current_promo?: { code?: string | null; promo_code?: string | null; status?: string | null } | null;
  promo?: { code?: string | null; promo_code?: string | null; status?: string | null } | null;
  [key: string]: unknown;
}

export interface SubscriptionPointsLedgerItem {
  id?: number | string;
  amount?: number | string | null;
  direction?: string | null;
  status?: string | null;
  source?: string | null;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  trace?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface SubscriptionPointsResponse {
  balance?: number | string | null;
  items?: SubscriptionPointsLedgerItem[];
  ledger?: SubscriptionPointsLedgerItem[];
  history?: SubscriptionPointsLedgerItem[];
  [key: string]: unknown;
}

export async function getMasterReferralCode(): Promise<MasterReferralCodeResponse> {
  const response = await apiClient.get<MasterReferralCodeResponse>('/api/master/referral-code');
  return response.data;
}

export async function applyMasterPromoCode(code: string): Promise<ApplyMasterPromoCodeResponse> {
  const response = await apiClient.post<ApplyMasterPromoCodeResponse>('/api/master/promo-code/apply', { code });
  return response.data;
}

export async function getCurrentMasterPromoCode(): Promise<CurrentMasterPromoCodeResponse> {
  const response = await apiClient.get<CurrentMasterPromoCodeResponse>('/api/master/promo-code/current');
  return response.data;
}

export async function getSubscriptionPoints(): Promise<SubscriptionPointsResponse> {
  const response = await apiClient.get<SubscriptionPointsResponse>('/api/master/subscription-points');
  return response.data;
}
