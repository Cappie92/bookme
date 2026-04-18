import { apiClient } from './client';

// Типы для авторизации
export interface LoginCredentials {
  phone: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user?: {
    id: number;
    email: string;
    phone: string;
    role: string;
    is_verified: boolean;
    is_phone_verified: boolean;
  };
}

export interface RegisterCredentials {
  email: string;
  phone: string;
  password: string;
  full_name: string;
  role?: 'client' | 'master' | 'salon' | 'admin';
  city?: string;
  timezone?: string;
}

export interface User {
  id: number;
  email: string;
  phone: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  is_phone_verified?: boolean;
  birth_date?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Вход в систему
 */
export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/api/auth/login', credentials);
  return response.data;
}

/**
 * Регистрация нового пользователя
 */
export async function register(credentials: RegisterCredentials): Promise<LoginResponse> {
  const payload: Record<string, unknown> = {
    ...credentials,
    role: credentials.role || 'client',
  };
  if (credentials.role === 'master' && credentials.city?.trim()) {
    payload.city = credentials.city.trim();
  }
  if (credentials.role === 'master' && credentials.timezone?.trim()) {
    payload.timezone = credentials.timezone.trim();
  }
  const response = await apiClient.post<LoginResponse>('/api/auth/register', payload);
  return response.data;
}

/**
 * Получить данные текущего пользователя
 * Требует авторизации (токен в заголовках)
 */
export async function getCurrentUser(): Promise<User> {
  const response = await apiClient.get<User>('/api/auth/users/me');
  return response.data;
}

