import { apiClient } from '@src/services/api/client';
import { deactivatePushDevice, registerPushDevice } from '@src/services/api/push';

describe('push API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.put as jest.Mock).mockResolvedValue({
      data: { id: 7, installation_id: '11111111-2222-4333-8444-555555555555', is_active: true },
    });
    (apiClient.delete as jest.Mock).mockResolvedValue({ status: 204 });
  });

  it('PUTs /api/push/devices', async () => {
    await registerPushDevice({
      installation_id: '11111111-2222-4333-8444-555555555555',
      token: 'ExponentPushToken[zzzzzz]',
      provider: 'expo',
      platform: 'android',
      app_version: '1.0.1',
      build_number: '2',
      locale: 'ru-RU',
      timezone: 'Europe/Moscow',
    });
    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/push/devices',
      expect.objectContaining({
        provider: 'expo',
        platform: 'android',
      }),
      expect.any(Object)
    );
  });

  it('DELETEs /api/push/devices/{installation_id}', async () => {
    await deactivatePushDevice('11111111-2222-4333-8444-555555555555');
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/api/push/devices/11111111-2222-4333-8444-555555555555',
      expect.any(Object)
    );
  });
});
