import React from 'react';
import { AuthContextType, User } from '@src/auth/AuthContext';

export const mockUser: User = {
  id: 1,
  email: 'test@test.com',
  phone: '+79999999999',
  full_name: 'Test User',
  role: 'client',
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

export const MockAuthProvider = ({ children, value = mockAuthContext }: any) => {
  const AuthContext = require('@src/auth/AuthContext').AuthContext;
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
