import {
  exchangeOAuthTicket,
  getCurrentUser,
  getYandexLoginUrl,
  confirmSignupPhoneVerification,
  isAuthenticatedResponse,
  isPhoneVerificationRequiredResponse,
  login,
  register,
  requestSignupPhoneVerification,
  requestPasswordResetPhone,
  confirmPasswordResetPhone,
  resetPassword,
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
      expect(isAuthenticatedResponse(result)).toBe(true);
      if (isAuthenticatedResponse(result)) expect(result.access_token).toBe('test-token');
    });

    it('returns an explicit verification-required variant for an unverified user', async () => {
      const mockResponse = {
        status: 'phone_verification_required',
        verification_token: 'restricted-login',
        phone: '+79999999999',
        expires_in: 900,
        verification_kind: 'existing_account',
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await login({ phone: '+79999999999', password: 'password123' });

      expect(isPhoneVerificationRequiredResponse(result)).toBe(true);
      expect(result).toEqual(mockResponse);
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
    it.each(['client', 'master'] as const)(
      'returns verification-required for %s without pretending it is Token',
      async (role) => {
        const response = {
          status: 'phone_verification_required',
          verification_token: `restricted-${role}`,
          phone: '+78888888888',
          expires_in: 900,
          verification_kind: 'new_registration',
        };
        (apiClient.post as jest.Mock).mockResolvedValue({ data: response });

        const result = await register({
          email: `${role}@test.com`,
          phone: '+78888888888',
          password: 'password123',
          full_name: `${role} user`,
          role,
          accept_terms: true,
          accept_personal_data: true,
        });

        expect(isPhoneVerificationRequiredResponse(result)).toBe(true);
        expect(result).toEqual(response);
        expect('access_token' in result).toBe(false);
      }
    );

    it('should register successfully with client role', async () => {
      const credentials: RegisterCredentials = {
        email: 'new@test.com',
        phone: '+78888888888',
        password: 'password123',
        full_name: 'New User',
        role: 'client',
        accept_terms: true,
        accept_personal_data: true,
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
        accept_terms: true,
        accept_personal_data: true,
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
        accept_terms: true,
        accept_personal_data: true,
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
        accept_terms: true,
        accept_personal_data: true,
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
        accept_terms: true,
        accept_personal_data: true,
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
        accept_terms: true,
        accept_personal_data: true,
      });
    });

    it('should not send promo_code for client registration', async () => {
      const credentials: RegisterCredentials = {
        email: 'client@test.com',
        phone: '+78888888888',
        password: 'password123',
        full_name: 'Client User',
        role: 'client',
        accept_terms: true,
        accept_personal_data: true,
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
        accept_terms: true,
        accept_personal_data: true,
      });
    });
  });

  describe('signup phone verification', () => {
    it('uses the restricted token explicitly and never sends a phone target', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({
        data: { success: true, message: 'ok', call_id: 'call-1' },
      });

      await requestSignupPhoneVerification('restricted-token');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/auth/request-signup-phone-verification',
        undefined,
        { headers: { Authorization: 'Bearer restricted-token' } }
      );
    });

    it('confirms with call/digits only and requires a full token response', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({
        data: {
          access_token: 'full-access',
          refresh_token: 'full-refresh',
          token_type: 'bearer',
        },
      });

      const result = await confirmSignupPhoneVerification('restricted-token', {
        call_id: 'call-1',
        phone_digits: '1234',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/auth/confirm-signup-phone-verification',
        { call_id: 'call-1', phone_digits: '1234' },
        { headers: { Authorization: 'Bearer restricted-token' } }
      );
      expect(result.access_token).toBe('full-access');
    });

    it('rejects ambiguous or malformed auth responses', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({
        data: { status: 'phone_verification_required', phone: '+79999999999' },
      });

      await expect(login({ phone: '+79999999999', password: 'password123' })).rejects.toThrow(
        'неизвестный формат'
      );
    });
  });

  describe('phone password reset', () => {
    it('normalizes the phone and starts the dedicated challenge', async () => {
      const response = {
        status: 'verification_required',
        message: 'generic',
        challenge_token: 'challenge-token',
        call_id: 'call-id',
        expires_in: 300,
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: response });

      await expect(requestPasswordResetPhone('8 (999) 123-45-67')).resolves.toEqual(response);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/auth/request-password-reset-phone',
        { phone: '+79991234567' },
        expect.objectContaining({ timeout: expect.any(Number) })
      );
    });

    it('confirms only the purpose-bound challenge artifacts and digits', async () => {
      const response = {
        status: 'reset_token_issued',
        reset_token: 'one-time-reset-token',
        expires_in: 900,
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: response });

      await confirmPasswordResetPhone({
        challenge_token: 'challenge-token',
        call_id: 'call-id',
        phone_digits: '1234',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/auth/confirm-password-reset-phone',
        {
          challenge_token: 'challenge-token',
          call_id: 'call-id',
          phone_digits: '1234',
        },
        expect.objectContaining({ timeout: expect.any(Number) })
      );
    });

    it('sets the password with the reset token and does not request auth tokens', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({
        data: { success: true, message: 'Пароль успешно изменен' },
      });

      const result = await resetPassword('one-time-reset-token', 'newpassword');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/auth/reset-password',
        { token: 'one-time-reset-token', new_password: 'newpassword' },
        expect.objectContaining({ timeout: expect.any(Number) })
      );
      expect(result.success).toBe(true);
      expect(result).not.toHaveProperty('access_token');
      expect(result).not.toHaveProperty('refresh_token');
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
    it('builds web Yandex login URL without launching browser flow', () => {
      (apiClient as any).defaults = { baseURL: 'https://dedato.ru' };

      expect(getYandexLoginUrl()).toBe('http://localhost:5173/api/auth/yandex/login');
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

    it('accepts nullable phone in OAuth auth response', async () => {
      const mockResponse = {
        access_token: 'oauth-token-null-phone',
        refresh_token: 'oauth-refresh-null-phone',
        token_type: 'bearer',
        user: {
          id: 4,
          email: 'oauth-null-phone@test.com',
          phone: null,
          role: 'client',
          is_verified: true,
          is_phone_verified: false,
          phone_required: true,
          phone_verified: false,
        },
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await exchangeOAuthTicket('one-time-ticket-null-phone');

      expect(result.user?.phone).toBeNull();
      expect(result.user?.phone_required).toBe(true);
      expect(result).toEqual(mockResponse);
    });
  });
});
