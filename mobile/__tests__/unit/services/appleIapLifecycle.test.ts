jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn() },
  Platform: { OS: 'ios' },
}));
jest.mock('@src/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@src/services/purchases/AppleIapService', () => ({ appleIapService: {} }));

import { shouldEnableAppleIapLifecycle } from '@src/components/subscriptions/AppleIapLifecycle';

describe('Apple IAP lifecycle gating', () => {
  it.each(['master', 'MASTER', 'indie'])(
    'enables authenticated iOS subscription lifecycle for %s',
    (role) => {
      expect(shouldEnableAppleIapLifecycle('ios', true, role)).toBe(true);
    }
  );

  it.each([
    ['ios', true, 'client'],
    ['android', true, 'master'],
    ['web', true, 'master'],
    ['ios', false, 'master'],
  ])('does not enable lifecycle for platform=%s auth=%s role=%s', (platform, auth, role) => {
    expect(shouldEnableAppleIapLifecycle(platform, auth as boolean, role)).toBe(false);
  });
});
