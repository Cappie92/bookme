import {
  exchangeOAuthTicket,
  getCurrentUser,
  getYandexLoginUrl,
  login,
  register,
  RegisterCredentials,
  LoginCredentials,
} from '@src/services/api/auth';
import { apiClient } from '@src/services/api/client';

describe('Auth API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const credentials: LoginCredentials = {
        phone: '+79999999999',
        password: 'password123',
      };
      const mockResponse = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        user: {
          id: 1,
          email: 'test@test.com',
          phone: '+79999999999',
          role: 'client',
          is_verified: true,
          is_phone_verified: true,
        },
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await login(credentials);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/auth/login',
        credentials,
        expect.objectContaining({ timeout: expect.any(Number) })
      );
      expect(result).toEqual(mockResponse);
      expect(result.access_token).toBe('test-token');
    });

    it('should handle login error', async () => {
      const credentials: LoginCredentials = {
        phone: '+79999999999',
        password: 'wrong',
      };
      const error = new Error('Invalid credentials');
      (apiClient.post as jest.Mock).mockRejectedValue(error);

      await expect(login(credentials)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    it('should register successfully with client role', async () => {
      const credentials: RegisterCredentials = {
        email: 'new@test.com',
        phone: '+78888888888',
        password: 'password123',
        full_name: 'New User',
        role: 'client',
      };
      const mockResponse = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        user: {
          id: 2,
          email: 'new@test.com',
          phone: '+78888888888',
          role: 'client',
          is_verified: false,
          is_phone_verified: false,
        },
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await register(credentials);

      expect(apiClient.post).toHaveBeenCalledWith('/api/auth/register', {
        ...credentials,
        role: 'client',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should register with default client role if not specified', async () => {
      const credentials: RegisterCredentials = {
        email: 'new@test.com',
        phone: '+78888888888',
        password: 'password123',
        full_name: 'New User',
      };
      const mockResponse = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      await register(credentials);

      expect(apiClient.post).toHaveBeenCalledWith('/api/auth/register', {
        ...credentials,
        role: 'client',
      });
    });

    it('should register with master role', async () => {
      const credentials: RegisterCredentials = {
        email: 'master@test.com',
        phone: '+77777777777',
        password: 'password123',
        full_name: 'Master User',
        role: 'master',
      };
      const mockResponse = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      await register(credentials);

      expect(apiClient.post).toHaveBeenCalledWith('/api/auth/register', {
        ...credentials,
        role: 'master',
      });
    });

    it('should send promo_code for master registration', async () => {
      const credentials: RegisterCredentials = {
        email: 'master@test.com',
        phone: '+77777777777',
        password: 'password123',
        full_name: 'Master User',
        role: 'master',
        promo_code: ' REF123 ',
      };
      const mockResponse = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      await register(credentials);

      expect(apiClient.post).toHaveBeenCalledWith('/api/auth/register', {
        email: 'master@test.com',
        phone: '+77777777777',
        password: 'password123',
        full_name: 'Master User',
        role: 'master',
        promo_code: 'REF123',
      });
    });

    it('should not send promo_code for client registration', async () => {
      const credentials: RegisterCredentials = {
        email: 'client@test.com',
        phone: '+78888888888',
        password: 'password123',
        full_name: 'Client User',
        role: 'client',
        promo_code: 'REF123',
      };
      const mockResponse = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      await register(credentials);

      expect(apiClient.post).toHaveBeenCalledWith('/api/auth/register', {
        email: 'client@test.com',
        phone: '+78888888888',
        password: 'password123',
        full_name: 'Client User',
        role: 'client',
      });
    });
  });

  describe('getCurrentUser', () => {
    it('should get current user', async () => {
      const mockUser = {
        id: 1,
        email: 'test@test.com',
        phone: '+79999999999',
        full_name: 'Test User',
        role: 'client',
        is_active: true,
        is_verified: true,
        is_phone_verified: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockUser });

      const result = await getCurrentUser();

      expect(apiClient.get).toHaveBeenCalledWith('/api/auth/users/me');
      expect(result).toEqual(mockUser);
    });
  });

  describe('Yandex OAuth scaffold', () => {
    it('builds backend Yandex login URL without launching browser flow', () => {
      (apiClient as any).defaults = { baseURL: 'https://dedato.ru' };

      expect(getYandexLoginUrl()).toBe('https://dedato.ru/api/auth/yandex/login');
    });

    it('exchanges OAuth ticket for auth tokens', async () => {
      const mockResponse = {
        access_token: 'oauth-token',
        refresh_token: 'oauth-refresh',
        token_type: 'bearer',
        user: {
          id: 3,
          email: 'oauth@test.com',
          phone: '',
          role: 'client',
          is_verified: true,
          is_phone_verified: false,
        },
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await exchangeOAuthTicket('one-time-ticket');

      expect(apiClient.post).toHaveBeenCalledWith('/api/auth/oauth/exchange', {
        ticket: 'one-time-ticket',
      });
      expect(result).toEqual(mockResponse);
    });
  });
});

