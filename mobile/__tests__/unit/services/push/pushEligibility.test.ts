import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPushEducationState,
  isPushEducationPending,
  setPushEducationState,
} from '@src/services/push/pushEducationStorage';
import {
  canRegisterPushForUser,
  evaluatePushPermissionUx,
  isOrdinaryMasterRole,
  shouldRefreshPushOnAppState,
} from '@src/services/push/pushEligibility';
import { classifyPushPermission } from '@src/services/push/pushPermissions';

describe('push education + eligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('treats missing storage as unseen', async () => {
    await expect(getPushEducationState()).resolves.toBe('unseen');
    expect(isPushEducationPending('unseen')).toBe(true);
  });

  it('persists dismissed and accepted', async () => {
    await setPushEducationState('dismissed');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('dedato_push_education_v1', 'dismissed');
    await setPushEducationState('accepted');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('dedato_push_education_v1', 'accepted');
  });

  it('shows education only for undetermined + unseen + foreground', () => {
    expect(
      evaluatePushPermissionUx({
        eligible: true,
        permission: 'undetermined',
        education: 'unseen',
        foreground: true,
      })
    ).toEqual({ action: 'show_education' });
    expect(
      evaluatePushPermissionUx({
        eligible: true,
        permission: 'undetermined',
        education: 'dismissed',
        foreground: true,
      })
    ).toEqual({ action: 'idle' });
    expect(
      evaluatePushPermissionUx({
        eligible: true,
        permission: 'undetermined',
        education: 'unseen',
        foreground: false,
      })
    ).toEqual({ action: 'idle' });
    expect(
      evaluatePushPermissionUx({
        eligible: true,
        permission: 'undetermined',
        education: 'shown',
        foreground: true,
      })
    ).toEqual({ action: 'idle' });
  });

  it('registers when permission is already granted', () => {
    expect(
      evaluatePushPermissionUx({
        eligible: true,
        permission: 'registerable',
        education: 'unseen',
        foreground: true,
      })
    ).toEqual({ action: 'register' });
  });

  it('does not register CLIENT, ADMIN, indie or demo MASTER', () => {
    expect(isOrdinaryMasterRole('MASTER')).toBe(true);
    expect(canRegisterPushForUser({ id: 1, role: 'master' })).toBe(true);
    expect(canRegisterPushForUser({ id: 1, role: 'client' })).toBe(false);
    expect(canRegisterPushForUser({ id: 1, role: 'admin' })).toBe(false);
    expect(canRegisterPushForUser({ id: 1, role: 'indie' })).toBe(false);
    expect(canRegisterPushForUser({ id: 1, role: 'master', is_demo_session: true })).toBe(false);
    expect(canRegisterPushForUser(null)).toBe(false);
  });

  it('treats iOS provisional and ephemeral as registerable', () => {
    expect(classifyPushPermission({ status: 'undetermined', granted: false, ios: { status: 3 } })).toBe(
      'registerable'
    );
    expect(classifyPushPermission({ status: 'undetermined', granted: false, ios: { status: 4 } })).toBe(
      'registerable'
    );
    expect(classifyPushPermission({ status: 'denied', granted: false, ios: { status: 1 } })).toBe('denied');
    expect(classifyPushPermission({ status: 'undetermined', granted: false, ios: { status: 0 } })).toBe(
      'undetermined'
    );
  });

  it('refreshes once per background → active transition', () => {
    expect(shouldRefreshPushOnAppState('background', 'active')).toBe(true);
    expect(shouldRefreshPushOnAppState('inactive', 'active')).toBe(true);
    expect(shouldRefreshPushOnAppState('active', 'active')).toBe(false);
    expect(shouldRefreshPushOnAppState('active', 'background')).toBe(false);
  });
});
