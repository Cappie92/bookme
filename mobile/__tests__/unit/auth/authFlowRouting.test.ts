import {
  getVerificationRequiredRoute,
  resolvePhoneVerificationAuthGateRoute,
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
