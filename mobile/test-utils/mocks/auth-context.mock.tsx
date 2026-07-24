import React from 'react';
import { AuthContext, type AuthContextType, type User } from '@src/auth/AuthContext';

export const mockUser: User = {
  id: 1,
  email: 'test@test.com',
  phone: '+79999999999',
  full_name: 'Test User',
  role: 'client',
  is_active: true,
  is_verified: true,
  created_at: '2020-01-01T00:00:00Z',
  updated_at: '2020-01-01T00:00:00Z',
};

export const mockAuthContext: AuthContextType = {
  user: mockUser,
  token: 'mock-token',
  isLoading: false,
  isAuthenticated: true,
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
  refreshUser: jest.fn(),
  retryInit: jest.fn(),
  ensureNoTokenOnLogin: jest.fn().mockResolvedValue(undefined),
};

export const MockAuthProvider = ({
  children,
  value = mockAuthContext,
}: {
  children: React.ReactNode;
  value?: AuthContextType;
}) => {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
