import type { PushEducationState } from './pushEducationStorage';
import { isPushEducationPending } from './pushEducationStorage';

export type PushAuthUser = {
  id: number;
  role?: string | null;
  is_demo_session?: boolean | null;
};

export type PushPermissionKind = 'undetermined' | 'denied' | 'registerable';

export type PushUxDecision =
  | { action: 'skip' }
  | { action: 'register' }
  | { action: 'show_education' }
  | { action: 'idle' };

/**
 * Stage 2 registers ordinary MASTER only.
 * CLIENT / ADMIN / indie / salon / unauthenticated are skipped even if AuthGate
 * routes some non-client roles into the master tree.
 */
export function isOrdinaryMasterRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'master';
}

/** Authoritative demo flag from /api/auth/users/me — never infer from phone/name. */
export function isDemoSessionUser(user: PushAuthUser | null | undefined): boolean {
  return user?.is_demo_session === true;
}

export function canRegisterPushForUser(user: PushAuthUser | null | undefined): boolean {
  if (!user || typeof user.id !== 'number') return false;
  if (isDemoSessionUser(user)) return false;
  return isOrdinaryMasterRole(user.role);
}

export function evaluatePushPermissionUx(input: {
  eligible: boolean;
  permission: PushPermissionKind;
  education: PushEducationState;
  foreground: boolean;
}): PushUxDecision {
  if (!input.eligible) return { action: 'skip' };
  if (input.permission === 'registerable') return { action: 'register' };
  if (input.permission === 'denied') return { action: 'idle' };
  if (
    input.permission === 'undetermined' &&
    input.foreground &&
    isPushEducationPending(input.education)
  ) {
    return { action: 'show_education' };
  }
  return { action: 'idle' };
}

export function shouldRefreshPushOnAppState(
  previous: string | null | undefined,
  next: string
): boolean {
  return next === 'active' && previous !== 'active';
}
