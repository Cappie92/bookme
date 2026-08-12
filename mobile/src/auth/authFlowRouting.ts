import type { AuthFlowResult } from './AuthContext';
import type { PendingPasswordReset } from './pendingPasswordResetStorage';

export type PhoneVerificationAuthRoute = '/verify-phone' | '/login' | null;

export function getVerificationRequiredRoute(
  result: AuthFlowResult
): '/verify-phone' | null {
  return result.status === 'phone_verification_required' ? '/verify-phone' : null;
}

export function resolvePhoneVerificationAuthGateRoute(state: {
  isAuthenticated: boolean;
  hasPendingVerification: boolean;
  pendingVerificationNeedsLogin: boolean;
}): PhoneVerificationAuthRoute {
  if (state.isAuthenticated) return null;
  if (state.hasPendingVerification) return '/verify-phone';
  if (state.pendingVerificationNeedsLogin) return '/login';
  return null;
}

export type PasswordResetAuthRoute = '/password-reset-verify' | '/reset-password' | '/login' | null;

export function resolvePasswordResetAuthGateRoute(state: {
  isAuthenticated: boolean;
  pending: PendingPasswordReset | null;
  passwordResetNeedsLogin: boolean;
}): PasswordResetAuthRoute {
  if (state.isAuthenticated) return null;
  if (state.pending?.stage === 'verification') return '/password-reset-verify';
  if (state.pending?.stage === 'new_password') return '/reset-password';
  if (state.passwordResetNeedsLogin) return '/login';
  return null;
}
