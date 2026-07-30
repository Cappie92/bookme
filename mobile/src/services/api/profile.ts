import { apiClient } from './client';

export interface ClientProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  birth_date?: string | null;
  created_at: string;
}

export interface UpdateProfileData {
  email?: string;
  phone?: string;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}

export interface DeleteAccountData {
  password: string;
}

/**
 * Получить профиль клиента
 */
export async function getClientProfile(): Promise<ClientProfile> {
  const response = await apiClient.get<ClientProfile>('/api/client/profile');
  return response.data;
}

/**
 * Обновить профиль клиента
 */
export async function updateClientProfile(data: UpdateProfileData): Promise<{ message: string }> {
  const response = await apiClient.put<{ message: string }>('/api/client/profile', data);
  return response.data;
}

/**
 * Сменить пароль
 */
export async function changePassword(data: ChangePasswordData): Promise<{ message: string }> {
  const response = await apiClient.put<{ message: string }>('/api/client/change-password', data);
  return response.data;
}

/**
 * Удалить аккаунт
 */
export async function deleteAccount(data: DeleteAccountData): Promise<{ message: string }> {
  // Axios delete поддерживает data через config
  const response = await apiClient.delete<{ message: string }>('/api/client/account', {
    data,
  });
  return response.data;
}

/** Запрос звонка с кодом для удаления аккаунта мастера */
export async function requestMasterDeleteAccountCall(): Promise<{
  message: string;
  success: boolean;
  call_id?: string;
}> {
  const response = await apiClient.delete<{
    message: string;
    success: boolean;
    call_id?: string;
  }>('/api/auth/delete-account');
  return response.data;
}

/** Подтверждение удаления аккаунта мастера по коду из звонка */
export async function confirmMasterDeleteAccount(code: string): Promise<{
  message: string;
  success?: boolean;
  already_deleted?: boolean;
}> {
  const response = await apiClient.post<{
    message: string;
    success?: boolean;
    already_deleted?: boolean;
  }>(`/api/auth/confirm-delete-account?code=${encodeURIComponent(code)}`);
  return response.data;
}

