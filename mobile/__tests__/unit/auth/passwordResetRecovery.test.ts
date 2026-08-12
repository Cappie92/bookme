import { resolvePasswordResetAuthGateRoute } from '@src/auth/authFlowRouting';
import { validateNewPassword } from '@src/auth/passwordResetValidation';

describe('password reset recovery policy', () => {
  it('resumes both valid stages after restart', () => {
    expect(resolvePasswordResetAuthGateRoute({
      isAuthenticated: false,
      pending: {
        stage: 'verification',
        phone: '+79990000001',
        challenge_token: 'challenge',
        call_id: 'call',
        expires_at: Date.now() + 60_000,
      },
      passwordResetNeedsLogin: false,
    })).toBe('/password-reset-verify');

    expect(resolvePasswordResetAuthGateRoute({
      isAuthenticated: false,
      pending: { stage: 'new_password', reset_token: 'reset', expires_at: Date.now() + 60_000 },
      passwordResetNeedsLogin: false,
    })).toBe('/reset-password');
  });

  it('routes expired, cancelled, or completed recovery to login', () => {
    expect(resolvePasswordResetAuthGateRoute({
      isAuthenticated: false,
      pending: null,
      passwordResetNeedsLogin: true,
    })).toBe('/login');
  });

  it('never turns recovery artifacts into an authenticated session', () => {
    expect(resolvePasswordResetAuthGateRoute({
      isAuthenticated: true,
      pending: { stage: 'new_password', reset_token: 'reset', expires_at: Date.now() + 60_000 },
      passwordResetNeedsLogin: true,
    })).toBeNull();
  });

  it('rejects a short password and a mismatch locally', () => {
    expect(validateNewPassword('short', 'short')).toContain('6');
    expect(validateNewPassword('newpassword', 'different')).toBe('Пароли не совпадают');
    expect(validateNewPassword('newpassword', 'newpassword')).toBeNull();
  });
});
