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

const UNAUTHENTICATED_STATIC_ROUTES = new Set(['/welcome', '/login', '/forgot-password']);
const SPECIAL_AUTH_FLOW_ROUTES = new Set(['/verify-phone', '/password-reset-verify', '/reset-password']);

export type UnauthenticatedWelcomeAction = 'wait' | 'allow' | 'defer-public-target' | 'replace-welcome';

export function normalizeAuthPathname(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0];
  if (path === '' || path === '/') return '/';
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Same slug check for a parsed URL, a pending target, and the current /m/<slug> route. */
export function acceptPublicBookingSlug(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0 || value === '[slug]') return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  // These are path syntax, not a stable route parameter: /m/.. becomes /,
  // and ?/# change the destination URL rather than the slug.
  if (
    decoded !== value || value === '.' || value === '..' ||
    /[/\\?#\u0000-\u001f\u007f]/.test(value)
  ) return null;
  try { encodeURIComponent(value); } catch { return null; }
  return value;
}

/** Slug of the current public booking screen, or null when the route is not that screen. */
export function currentPublicBookingSlug(pathname: string, segments: readonly string[]): string | null {
  const path = normalizeAuthPathname(pathname);
  const fromPath = path.match(/^\/m\/([^/]+)$/);
  // Stale/dynamic segments must not make a protected pathname public.
  if (fromPath) {
    try { return acceptPublicBookingSlug(decodeURIComponent(fromPath[1])); } catch { return null; }
  }
  return null;
}

export function isCurrentPublicBookingRoute(pathname: string, segments: readonly string[]): boolean {
  return currentPublicBookingSlug(pathname, segments) != null;
}

/** Active public intent still waiting for its own route. Failed and invalid targets do not qualify. */
export function publicIntentPreemptsRoleRouting(pendingSlug: string | null, currentSlug: string | null): boolean {
  const active = acceptPublicBookingSlug(pendingSlug);
  return active != null && currentSlug !== active;
}

/** Generic logged-out pages. Special auth screens are a separate set. */
export function isGenericUnauthenticatedRoute(pathname: string, segments: readonly string[]): boolean {
  const path = normalizeAuthPathname(pathname);
  if (UNAUTHENTICATED_STATIC_ROUTES.has(path)) return true;
  if (
    segments.length === 1 &&
    (segments[0] === 'welcome' || segments[0] === 'login' || segments[0] === 'forgot-password') &&
    path === `/${segments[0]}`
  ) {
    return true;
  }
  return false;
}

/** Screens whose own guards own the fallback when their pending state is missing. */
export function isSpecialAuthFlowRoute(pathname: string, segments: readonly string[]): boolean {
  const path = normalizeAuthPathname(pathname);
  if (SPECIAL_AUTH_FLOW_ROUTES.has(path)) return true;
  return (
    segments.length === 1 &&
    SPECIAL_AUTH_FLOW_ROUTES.has(`/${segments[0]}`) &&
    path === `/${segments[0]}`
  );
}

/** Exact unauthenticated routes plus the current public booking screen. Not a prefix/includes match. */
export function isUnauthenticatedRouteAllowed(pathname: string, segments: readonly string[]): boolean {
  return isGenericUnauthenticatedRoute(pathname, segments) || isCurrentPublicBookingRoute(pathname, segments);
}

/**
 * Welcome redirect for a logged-out session.
 * Idempotent: the answer depends on the current route and a concrete pending public target,
 * never on a one-shot redirect flag.
 */
export function resolveUnauthenticatedWelcomeAction(input: {
  bootstrapComplete: boolean;
  passwordResetBootstrapComplete: boolean;
  navigationReady: boolean;
  isAuthenticated: boolean;
  pathname: string;
  segments: readonly string[];
  higherPriorityRoute: string | null;
  initialUrlResolved: boolean;
  pendingPublicSlug: string | null;
}): UnauthenticatedWelcomeAction {
  if (
    !input.bootstrapComplete ||
    !input.passwordResetBootstrapComplete ||
    !input.navigationReady ||
    !input.initialUrlResolved
  ) {
    return 'wait';
  }
  if (input.isAuthenticated || input.higherPriorityRoute) return 'allow';
  if (isSpecialAuthFlowRoute(input.pathname, input.segments)) return 'allow';
  const pendingSlug = acceptPublicBookingSlug(input.pendingPublicSlug);
  if (pendingSlug && currentPublicBookingSlug(input.pathname, input.segments) !== pendingSlug) {
    return 'defer-public-target';
  }
  if (isUnauthenticatedRouteAllowed(input.pathname, input.segments)) return 'allow';
  return 'replace-welcome';
}
