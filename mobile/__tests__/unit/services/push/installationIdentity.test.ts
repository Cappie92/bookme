import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  __resetInstallationIdentityCacheForTests,
  getOrCreateInstallationId,
  peekInstallationId,
} from '@src/services/push/installationIdentity';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('installationIdentity', () => {
  beforeEach(() => {
    __resetInstallationIdentityCacheForTests();
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('creates a UUID v4 on first call', async () => {
    const id = await getOrCreateInstallationId();
    expect(id).toMatch(UUID_RE);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('dedato_install_id_v1', id);
  });

  it('returns the same id on subsequent calls', async () => {
    const first = await getOrCreateInstallationId();
    const second = await getOrCreateInstallationId();
    expect(second).toBe(first);
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });

  it('reuses a valid stored id', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    const id = await getOrCreateInstallationId();
    expect(id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('regenerates when stored value is malformed', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('not-a-uuid');
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('also-bad');
    const id = await getOrCreateInstallationId();
    expect(id).toMatch(UUID_RE);
    expect(id).not.toBe('not-a-uuid');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('dedato_install_id_v1', id);
  });

  it('returns an in-memory id when persistence fails', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('secure fail'));
    (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('async fail'));
    const id = await getOrCreateInstallationId();
    expect(id).toMatch(UUID_RE);
    const again = await getOrCreateInstallationId();
    expect(again).toBe(id);
  });

  it('peek does not create a new id', async () => {
    await expect(peekInstallationId()).resolves.toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
