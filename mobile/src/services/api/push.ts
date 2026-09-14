import { apiClient } from './client';

export type PushDevicePlatform = 'ios' | 'android';

export interface RegisterPushDevicePayload {
  installation_id: string;
  token: string;
  provider: 'expo';
  platform: PushDevicePlatform;
  app_version?: string;
  build_number?: string;
  locale?: string;
  timezone?: string;
}

export interface RegisterPushDeviceResult {
  id: number;
  installation_id: string;
  is_active: boolean;
}

export async function registerPushDevice(
  payload: RegisterPushDevicePayload,
  opts?: { signal?: AbortSignal; accessToken?: string; timeoutMs?: number }
): Promise<RegisterPushDeviceResult | void> {
  const headers = opts?.accessToken
    ? { Authorization: `Bearer ${opts.accessToken}` }
    : undefined;
  const response = await apiClient.put<RegisterPushDeviceResult>('/api/push/devices', payload, {
    signal: opts?.signal,
    timeout: opts?.timeoutMs ?? 8000,
    headers,
  });
  return response.data;
}

export async function deactivatePushDevice(
  installationId: string,
  opts?: { signal?: AbortSignal; accessToken?: string; timeoutMs?: number }
): Promise<void> {
  const headers = opts?.accessToken
    ? { Authorization: `Bearer ${opts.accessToken}` }
    : undefined;
  await apiClient.delete(`/api/push/devices/${encodeURIComponent(installationId)}`, {
    signal: opts?.signal,
    timeout: opts?.timeoutMs ?? 2500,
    headers,
  });
}
