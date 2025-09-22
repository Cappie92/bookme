import React, { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token')
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  }

  const checkAuthStatus = async () => {
    const token = localStorage.getItem('access_token')
    
    if (!token) {
      setIsAuthenticated(false)
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/users/me', {
        headers: getAuthHeaders()
      })

      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        setIsAuthenticated(true)
      } else {
        // Токен недействителен
        localStorage.removeItem('access_token')
        setIsAuthenticated(false)
        setUser(null)
      }
    } catch (error) {
      console.error('Ошибка проверки авторизации:', error)
      setIsAuthenticated(false)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('new_client_setup')
    localStorage.removeItem('existing_client_verification')
    setIsAuthenticated(false)
    setUser(null)
    navigate('/')
  }

  const login = (userData) => {
    setUser(userData)
    setIsAuthenticated(true)
  }

  useEffect(() => {
    checkAuthStatus()
  }, [])

  const value = {
    isAuthenticated,
    user,
    loading,
    getAuthHeaders,
    logout,
    login,
    checkAuthStatus
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 