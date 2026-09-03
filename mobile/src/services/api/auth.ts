import { isAxiosError } from 'axios';
import { apiClient } from './client';
import { normalizeRussianPhoneForApi } from '@src/utils/normalizeRussianPhoneForApi';
import { AUTH_REQUEST_TIMEOUT_MS } from '@src/utils/apiNetworkError';
import { env } from '@src/config/env';

// Типы для авторизации
export interface LoginCredentials {
  phone: string;
  password: string;
}

export interface AuthenticatedResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user?: {
    id: number;
    email: string;
    phone: string | null;
    role: string;
    is_verified: boolean;
    is_phone_verified: boolean;
    phone_required?: boolean;
    phone_verified?: boolean;
  };
}

export interface PhoneVerificationRequiredResponse {
  status: 'phone_verification_required';
  verification_token: string;
  phone: string;
  expires_in: number;
  verification_kind: 'new_registration' | 'existing_account';
}

export type AuthResponse = AuthenticatedResponse | PhoneVerificationRequiredResponse;
export type LoginResponse = AuthResponse;

export function isAuthenticatedResponse(value: unknown): value is AuthenticatedResponse {
  if (value == null || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  return (
    typeof response.access_token === 'string' &&
    response.access_token.length > 0 &&
    typeof response.refresh_token === 'string' &&
    response.refresh_token.length > 0 &&
    typeof response.token_type === 'string' &&
    response.token_type.length > 0
  );
}

export function isPhoneVerificationRequiredResponse(
  value: unknown
): value is PhoneVerificationRequiredResponse {
  if (value == null || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  return (
    response.status === 'phone_verification_required' &&
    typeof response.verification_token === 'string' &&
    response.verification_token.length > 0 &&
    typeof response.phone === 'string' &&
    response.phone.length > 0 &&
    typeof response.expires_in === 'number' &&
    Number.isFinite(response.expires_in) &&
    response.expires_in > 0 &&
    (response.verification_kind === 'new_registration' ||
      response.verification_kind === 'existing_account') &&
    response.access_token === undefined &&
    response.refresh_token === undefined
  );
}

function requireAuthResponse(value: unknown): AuthResponse {
  if (isAuthenticatedResponse(value) || isPhoneVerificationRequiredResponse(value)) {
    return value;
  }
  throw new Error('Сервер вернул неизвестный формат авторизации');
}

export type OAuthExchangeResponse = AuthenticatedResponse;

export interface RegisterCredentials {
  email: string;
  phone: string;
  password: string;
  full_name: string;
  role?: 'client' | 'master' | 'salon' | 'admin';
  city?: string;
  timezone?: string;
  promo_code?: string;
  accept_terms: boolean;
  accept_personal_data: boolean;
  marketing_opt_in?: boolean;
}

export interface User {
  id: number;
  email: string;
  phone: string | null;
  full_name: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  is_phone_verified?: boolean;
  phone_required?: boolean;
  phone_verified?: boolean;
  birth_date?: string;
  created_at: string;
  updated_at: string;
}

function maskPhoneForLog(phone: string): string {
  if (phone.length < 6) return '(short)';
  return `${phone.slice(0, 4)}…${phone.slice(-2)}`;
}

function pickLoginErrorDetail(data: unknown): string | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const d = data as { detail?: unknown; message?: unknown };
  if (typeof d.detail === 'string') return d.detail;
  if (Array.isArray(d.detail)) {
    return d.detail
      .map((x) => (x && typeof x === 'object' && 'msg' in x ? String((x as { msg?: unknown }).msg) : String(x)))
      .join(' ');
  }
  if (typeof d.message === 'string') return d.message;
  return undefined;
}

/**
 * Вход в систему (тот же контракт, что web: JSON `{ phone, password }`, телефон как в `normalizeRussianPhoneForApi`).
 */
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const phoneForApi = normalizeRussianPhoneForApi((credentials.phone ?? '').trim());
  const body = { phone: phoneForApi, password: credentials.password };

  try {
    const response = await apiClient.post<unknown>('/api/auth/login', body, {
      timeout: AUTH_REQUEST_TIMEOUT_MS,
    });
    return requireAuthResponse(response.data);
  } catch (err: unknown) {
    if (typeof __DEV__ !== 'undefined' && __DEV__ && isAxiosError(err)) {
      const detail = pickLoginErrorDetail(err.response?.data);
      console.log('[LOGIN/API] failed', {
        method: 'POST',
        path: '/api/auth/login',
        contentType: 'application/json',
        phoneNormalized: maskPhoneForLog(phoneForApi),
        status: err.response?.status,
        backendDetail: detail != null ? String(detail).slice(0, 200) : undefined,
      });
    }
    throw err;
  }
}

/**
 * Регистрация нового пользователя
 */
export async function register(credentials: RegisterCredentials): Promise<AuthResponse> {
  const role = credentials.role || 'client';
  const payload: Record<string, unknown> = {
    email: (credentials.email ?? '').trim().toLowerCase(),
    phone: normalizeRussianPhoneForApi((credentials.phone ?? '').trim()),
    password: credentials.password,
    full_name: credentials.full_name,
    role,
    accept_terms: credentials.accept_terms,
    accept_personal_data: credentials.accept_personal_data,
  };
  if (credentials.marketing_opt_in !== undefined) {
    payload.marketing_opt_in = credentials.marketing_opt_in;
  }
  if (role === 'master' && credentials.city?.trim()) {
    payload.city = credentials.city.trim();
  }
  if (role === 'master' && credentials.timezone?.trim()) {
    payload.timezone = credentials.timezone.trim();
  }
  if (role === 'master' && credentials.promo_code?.trim()) {
    payload.promo_code = credentials.promo_code.trim();
  }
  const response = await apiClient.post<unknown>('/api/auth/register', payload);
  return requireAuthResponse(response.data);
}

export interface SignupPhoneVerificationChallengeResponse {
  message: string;
  success: boolean;
  call_id?: string | null;
  verification_number?: string | null;
}

export async function requestSignupPhoneVerification(
  verificationToken: string
): Promise<SignupPhoneVerificationChallengeResponse> {
  const response = await apiClient.post<SignupPhoneVerificationChallengeResponse>(
    '/api/auth/request-signup-phone-verification',
    undefined,
    { headers: { Authorization: `Bearer ${verificationToken}` } }
  );
  return response.data;
}

export async function confirmSignupPhoneVerification(
  verificationToken: string,
  body: { call_id: string; phone_digits: string }
): Promise<AuthenticatedResponse> {
  const response = await apiClient.post<unknown>(
    '/api/auth/confirm-signup-phone-verification',
    body,
    { headers: { Authorization: `Bearer ${verificationToken}` } }
  );
  if (!isAuthenticatedResponse(response.data)) {
    throw new Error('Сервер не вернул полноценную auth-сессию');
  }
  return response.data;
}

export async function cancelSignupPhoneVerification(
  verificationToken: string
): Promise<void> {
  await apiClient.post(
    '/api/auth/cancel-signup-phone-verification',
    undefined,
    { headers: { Authorization: `Bearer ${verificationToken}` } }
  );
}

export interface RequestPasswordResetPhoneResponse {
  status: 'verification_required';
  message: string;
  challenge_token: string;
  call_id: string;
  expires_in: number;
}

export interface ConfirmPasswordResetPhoneResponse {
  status: 'reset_token_issued';
  reset_token: string;
  expires_in: number;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
  user_id?: number | null;
}

export async function requestPasswordResetPhone(
  phone: string
): Promise<RequestPasswordResetPhoneResponse> {
  const normalizedPhone = normalizeRussianPhoneForApi(phone.trim());
  const response = await apiClient.post<RequestPasswordResetPhoneResponse>(
    '/api/auth/request-password-reset-phone',
    { phone: normalizedPhone },
    { timeout: AUTH_REQUEST_TIMEOUT_MS }
  );
  return response.data;
}

export async function confirmPasswordResetPhone(body: {
  challenge_token: string;
  call_id: string;
  phone_digits: string;
}): Promise<ConfirmPasswordResetPhoneResponse> {
  const response = await apiClient.post<ConfirmPasswordResetPhoneResponse>(
    '/api/auth/confirm-password-reset-phone',
    body,
    { timeout: AUTH_REQUEST_TIMEOUT_MS }
  );
  return response.data;
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<ResetPasswordResponse> {
  const response = await apiClient.post<ResetPasswordResponse>(
    '/api/auth/reset-password',
    { token, new_password: newPassword },
    { timeout: AUTH_REQUEST_TIMEOUT_MS }
  );
  return response.data;
}

export function getYandexLoginUrl(): string {
  const baseURL = String(env.WEB_URL || env.API_URL || apiClient.defaults?.baseURL || '').replace(/\/$/, '');
  return `${baseURL}/api/auth/yandex/login`;
}

// TODO(mobile-yandex-auth): after App Store / Google Play publication, configure
// Yandex mobile platforms, add redirect/deep link scheme, implement AuthSession/browser flow,
// handle /auth/oauth/callback?ticket=..., call exchangeOAuthTicket(), then save tokens via AuthContext.
export async function exchangeOAuthTicket(ticket: string): Promise<OAuthExchangeResponse> {
  const response = await apiClient.post<unknown>('/api/auth/oauth/exchange', { ticket });
  if (!isAuthenticatedResponse(response.data)) {
    throw new Error('Сервер не вернул полноценную OAuth-сессию');
  }
  return response.data;
}

/**
 * Получить данные текущего пользователя
 * Требует авторизации (токен в заголовках)
 */
export async function getCurrentUser(): Promise<User> {
  const response = await apiClient.get<User>('/api/auth/users/me');
  return response.data;
}


export type WebHandoffOrigin = 'ios_app' | 'android_app';
export type WebHandoffDestination = 'schedule' | 'services' | 'settings';

export interface WebHandoffResponse {
  code: string;
  url: string;
  expires_in: number;
}

/**
 * One-time opaque code for opening a web session from the mobile app.
 * Never put JWT into the URL — backend returns https://…/auth/mobile-handoff?code=…
 */
export async function createWebHandoff(
  origin: WebHandoffOrigin,
  destination?: WebHandoffDestination
): Promise<WebHandoffResponse> {
  const response = await apiClient.post<WebHandoffResponse>('/api/auth/web-handoff', {
    origin,
    ...(destination ? { destination } : {}),
  });
  return response.data;
}
