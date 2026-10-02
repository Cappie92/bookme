import {
  acceptPublicBookingSlug,
  currentPublicBookingSlug,
  getVerificationRequiredRoute,
  isGenericUnauthenticatedRoute,
  isSpecialAuthFlowRoute,
  isUnauthenticatedRouteAllowed,
  publicIntentPreemptsRoleRouting,
  resolvePhoneVerificationAuthGateRoute,
  resolveUnauthenticatedWelcomeAction,
} from '@src/auth/authFlowRouting';

describe('phone verification auth routing', () => {
  it.each(['client', 'master'] as const)(
    'routes verification-required %s registration to verify-phone',
    (registrationRole) => {
      expect(
        getVerificationRequiredRoute({
          status: 'phone_verification_required',
          pending: {
            verification_token: 'restricted',
            phone: '+79990000001',
            expires_at: Date.now() + 60_000,
            origin: 'register',
            verification_kind: 'new_registration',
            registration_role: registrationRole,
          },
        })
      ).toBe('/verify-phone');
    }
  );

  it('routes an unverified login to verify-phone', () => {
    expect(
      getVerificationRequiredRoute({
        status: 'phone_verification_required',
        pending: {
          verification_token: 'restricted',
          phone: '+79990000001',
          expires_at: Date.now() + 60_000,
          origin: 'login',
          verification_kind: 'existing_account',
        },
      })
    ).toBe('/verify-phone');
  });

  it('does not override the verified login route', () => {
    expect(getVerificationRequiredRoute({ status: 'authenticated', user: null })).toBeNull();
  });

  it('reopens verify-phone on restart with valid pending state', () => {
    expect(
      resolvePhoneVerificationAuthGateRoute({
        isAuthenticated: false,
        hasPendingVerification: true,
        pendingVerificationNeedsLogin: false,
      })
    ).toBe('/verify-phone');
  });

  it('routes expired pending state to login', () => {
    expect(
      resolvePhoneVerificationAuthGateRoute({
        isAuthenticated: false,
        hasPendingVerification: false,
        pendingVerificationNeedsLogin: true,
      })
    ).toBe('/login');
  });

  it('gives a valid authenticated session priority over stale pending state', () => {
    expect(
      resolvePhoneVerificationAuthGateRoute({
        isAuthenticated: true,
        hasPendingVerification: true,
        pendingVerificationNeedsLogin: true,
      })
    ).toBeNull();
  });
});

const readySession = {
  bootstrapComplete: true,
  passwordResetBootstrapComplete: true,
  navigationReady: true,
  isAuthenticated: false,
  higherPriorityRoute: null,
  initialUrlResolved: true,
  pendingPublicSlug: null,
};

describe('unauthenticated route policy', () => {
  it('allows only the exact logged-out screens and the current public booking', () => {
    expect(isUnauthenticatedRouteAllowed('/welcome', ['welcome'])).toBe(true);
    expect(isUnauthenticatedRouteAllowed('/login', ['login'])).toBe(true);
    expect(isUnauthenticatedRouteAllowed('/forgot-password', ['forgot-password'])).toBe(true);
    expect(isUnauthenticatedRouteAllowed('/m/master-a', ['(public)', 'm', 'master-a'])).toBe(true);
    expect(isUnauthenticatedRouteAllowed('/m/master-a', ['m', 'master-a'])).toBe(true);
    expect(currentPublicBookingSlug('/m/master-a', ['m', 'master-a'])).toBe('master-a');

    for (const [pathname, segments] of [
      ['/', ['(master)']],
      ['/master/settings', ['(master)', 'master', 'settings']],
      ['/master/services', ['(master)', 'master', 'services']],
      ['/client/dashboard', ['(client)', 'client', 'dashboard']],
      ['/subscriptions', ['(master)', 'subscriptions']],
      ['/settings', ['(client)', 'settings']],
      ['/notes', ['(client)', 'notes']],
      ['/bookings/15', ['(master)', 'bookings', '15']],
      ['/bookings/15', ['(client)', 'bookings', '15']],
      ['/m/a/b', ['m', 'a', 'b']],
      ['/m/[slug]', ['m', '[slug]']],
    ] as const) {
      expect(isUnauthenticatedRouteAllowed(pathname, segments)).toBe(false);
    }
  });

  it('does not treat a longer path as login or welcome', () => {
    expect(isUnauthenticatedRouteAllowed('/login/extra', ['login', 'extra'])).toBe(false);
    expect(isUnauthenticatedRouteAllowed('/client/welcome', ['(client)', 'welcome'])).toBe(false);
  });

  it.each(['/', '/master/settings', '/client/dashboard', '/subscriptions', '/bookings/15'] as const)(
    'redirects unauthenticated %s to welcome',
    (pathname) => {
      expect(
        resolveUnauthenticatedWelcomeAction({
          ...readySession,
          pathname,
          segments: pathname === '/' ? ['(master)'] : pathname.slice(1).split('/'),
        })
      ).toBe('replace-welcome');
    }
  );

  it('keeps welcome, login, and forgot-password without a redirect', () => {
    expect(resolveUnauthenticatedWelcomeAction({ ...readySession, pathname: '/welcome', segments: ['welcome'] })).toBe('allow');
    expect(resolveUnauthenticatedWelcomeAction({ ...readySession, pathname: '/login', segments: ['login'] })).toBe('allow');
    expect(
      resolveUnauthenticatedWelcomeAction({
        ...readySession,
        pathname: '/forgot-password',
        segments: ['forgot-password'],
      })
    ).toBe('allow');
  });

  it('allows the current public booking and defers only while its target is pending', () => {
    expect(
      resolveUnauthenticatedWelcomeAction({
        ...readySession,
        pathname: '/m/master-a',
        segments: ['(public)', 'm', 'master-a'],
      })
    ).toBe('allow');
    expect(
      resolveUnauthenticatedWelcomeAction({
        ...readySession,
        pathname: '/',
        segments: ['(master)'],
        pendingPublicSlug: 'master-a',
      })
    ).toBe('defer-public-target');
    expect(
      resolveUnauthenticatedWelcomeAction({
        ...readySession,
        pathname: '/',
        segments: ['(master)'],
        pendingPublicSlug: 'master-b',
      })
    ).toBe('defer-public-target');
    expect(
      resolveUnauthenticatedWelcomeAction({
        ...readySession,
        pathname: '/',
        segments: ['(master)'],
        pendingPublicSlug: null,
      })
    ).toBe('replace-welcome');
  });

  it('waits for bootstrap, password-reset bootstrap, the initial URL, and navigator readiness', () => {
    expect(resolveUnauthenticatedWelcomeAction({ ...readySession, bootstrapComplete: false, pathname: '/', segments: [] })).toBe('wait');
    expect(
      resolveUnauthenticatedWelcomeAction({
        ...readySession,
        passwordResetBootstrapComplete: false,
        pathname: '/',
        segments: [],
      })
    ).toBe('wait');
    expect(resolveUnauthenticatedWelcomeAction({ ...readySession, initialUrlResolved: false, pathname: '/', segments: [] })).toBe('wait');
    expect(resolveUnauthenticatedWelcomeAction({ ...readySession, navigationReady: false, pathname: '/', segments: [] })).toBe('wait');
  });

  it('does not let the welcome guard override verification, reset, or an authenticated session', () => {
    expect(
      resolveUnauthenticatedWelcomeAction({
        ...readySession,
        pathname: '/',
        segments: [],
        higherPriorityRoute: '/verify-phone',
      })
    ).toBe('allow');
    expect(
      resolveUnauthenticatedWelcomeAction({
        ...readySession,
        pathname: '/',
        segments: [],
        higherPriorityRoute: '/password-reset-verify',
      })
    ).toBe('allow');
    expect(
      resolveUnauthenticatedWelcomeAction({
        ...readySession,
        pathname: '/',
        segments: [],
        higherPriorityRoute: '/reset-password',
      })
    ).toBe('allow');
    expect(
      resolveUnauthenticatedWelcomeAction({
        ...readySession,
        isAuthenticated: true,
        pathname: '/master/settings',
        segments: ['(master)', 'master', 'settings'],
      })
    ).toBe('allow');
    expect(
      resolveUnauthenticatedWelcomeAction({
        ...readySession,
        isAuthenticated: true,
        pathname: '/client/dashboard',
        segments: ['(client)', 'client', 'dashboard'],
      })
    ).toBe('allow');
  });

  it('delegates special auth screens to their own guards when no pending route is active', () => {
    for (const pathname of ['/verify-phone', '/password-reset-verify', '/reset-password'] as const) {
      const segments = [pathname.slice(1)];
      expect(isGenericUnauthenticatedRoute(pathname, segments)).toBe(false);
      expect(isSpecialAuthFlowRoute(pathname, segments)).toBe(true);
      expect(isUnauthenticatedRouteAllowed(pathname, segments)).toBe(false);
      expect(resolveUnauthenticatedWelcomeAction({ ...readySession, pathname, segments })).toBe('allow');
    }
  });

  it('rejects an invalid public slug for pending intent and the current route', () => {
    expect(acceptPublicBookingSlug(null)).toBeNull();
    expect(acceptPublicBookingSlug('')).toBeNull();
    expect(acceptPublicBookingSlug('[slug]')).toBeNull();
    expect(acceptPublicBookingSlug('a/b')).toBeNull();
    expect(acceptPublicBookingSlug('foo%2Fbar')).toBeNull();
    expect(acceptPublicBookingSlug('alice')).toBe('alice');
    expect(currentPublicBookingSlug('/m/foo%2Fbar', ['m', 'foo%2Fbar'])).toBeNull();
    expect(publicIntentPreemptsRoleRouting('[slug]', null)).toBe(false);
    expect(publicIntentPreemptsRoleRouting('alice', null)).toBe(true);
    expect(publicIntentPreemptsRoleRouting('alice', 'alice')).toBe(false);
    expect(publicIntentPreemptsRoleRouting(null, null)).toBe(false);
  });

  it.each(['.', '..', 'alice?foo', 'alice#foo', 'a\\b', '%', '%E0%A4%A', 'alice\n', '\uD800'])(
    'rejects non-canonical slug %p without deferring protected routing', (slug) => {
      expect(acceptPublicBookingSlug(slug)).toBeNull();
      expect(publicIntentPreemptsRoleRouting(slug, null)).toBe(false);
      expect(resolveUnauthenticatedWelcomeAction({
        ...readySession, pathname: '/', segments: ['(master)'], pendingPublicSlug: slug,
      })).toBe('replace-welcome');
    }
  );

  it('does not let stale public segments override a protected or malformed pathname', () => {
    expect(currentPublicBookingSlug('/', ['m', 'alice'])).toBeNull();
    expect(currentPublicBookingSlug('/m/alice/extra', ['m', 'alice'])).toBeNull();
    expect(currentPublicBookingSlug('/m/%2e%2e', ['m', 'alice'])).toBeNull();
    expect(currentPublicBookingSlug('/m/alice%3Ffoo', ['m', 'alice'])).toBeNull();
    expect(currentPublicBookingSlug('/m/%D0%BC%D0%B0%D1%81%D1%82%D0%B5%D1%80', ['m', '[slug]'])).toBe('мастер');
  });

  it.each(['/verify-phone/extra', '/password-reset-verify/extra', '/reset-password/extra'])(
    'does not delegate a longer pseudo-special route %s', (pathname) => {
      expect(resolveUnauthenticatedWelcomeAction({
        ...readySession, pathname, segments: pathname.slice(1).split('/'),
      })).toBe('replace-welcome');
    }
  );
});
