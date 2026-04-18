// TEMP DEBUG — remove import + all tempDebugLogHandledApiFailure(...) calls after fix
import { tempDebugLogHandledApiFailure } from '../tempDebugErrorCapture.js'

// Базовый URL для API
const API_BASE_URL = '' // Используем относительные пути для прокси Vite

// Префиксы эндпоинтов, которые требуют авторизации
const AUTH_REQUIRED_PREFIXES = [
  '/api/master/',
  '/api/loyalty/',
  '/api/master/loyalty/'
]

// Публичные эндпоинты внутри защищённых префиксов (исключения из auth-guard)
const PUBLIC_ENDPOINTS = [
  // Добавьте сюда другие публичные endpoints, если появятся
]

// Проверка, требует ли эндпоинт авторизации
const requiresAuth = (endpoint) => {
  // Сначала проверяем, не является ли endpoint публичным
  // Проверяем точное совпадение или начало с publicEndpoint + '?' или '/'
  // Это защищает от false positive (например, /api/master/publicity не должен считаться публичным)
  for (const publicEndpoint of PUBLIC_ENDPOINTS) {
    if (
      endpoint === publicEndpoint ||
      endpoint.startsWith(publicEndpoint + '?') ||
      endpoint.startsWith(publicEndpoint + '/')
    ) {
      return false
    }
  }
  // Затем проверяем префиксы
  return AUTH_REQUIRED_PREFIXES.some(prefix => endpoint.startsWith(prefix))
}

// Функция для создания полного URL
export const getApiUrl = (endpoint) => {
  // Убираем начальный слеш, если он есть
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  return `${API_BASE_URL}/${cleanEndpoint}`
}

// Функция для получения заголовков авторизации
export const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token')
  const headers = {
    'Content-Type': 'application/json'
  }
  
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  
  return headers
}

// Функция для выполнения API запросов
export const apiRequest = async (endpoint, options = {}) => {
  const method = (options.method || 'GET').toUpperCase()
  const isDemoMode = localStorage.getItem('demo_mode') === '1'
  if (isDemoMode && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const error = new Error('В демо-режиме изменение данных недоступно')
    error.response = {
      status: 403,
      statusText: 'Forbidden',
      headers: { get: () => null },
      data: { detail: 'В демо-режиме изменение данных недоступно' },
    }
    throw error
  }

  // Проверка авторизации для защищённых эндпоинтов
  if (requiresAuth(endpoint)) {
    const token = localStorage.getItem('access_token')
    if (!token) {
      // Выбрасываем ошибку в формате, совместимом с обработкой 401
      const error = new Error('HTTP error! status: 401')
      error.response = {
        status: 401,
        statusText: 'Unauthorized',
        headers: {
          get: () => null
        },
        data: {
          detail: 'Missing access token',
          message: 'Missing access token'
        }
      }
      throw error
    }
  }
  
  const url = getApiUrl(endpoint)
  const headers = getAuthHeaders()
  
  const config = {
    ...options,
    credentials: options.credentials ?? 'include',
    headers: {
      ...headers,
      ...options.headers
    }
  }
  
  try {
    const response = await fetch(url, config)
    
    if (!response.ok) {
      // Dev-диагностика 401
      if (response.status === 401 && import.meta.env?.DEV) {
        const hasAuth = !!(config.headers?.Authorization)
        const creds = config.credentials ?? 'not set'
        let detail = ''
        try {
          const clone = response.clone()
          const data = await clone.json().catch(() => ({}))
          detail = data?.detail ?? ''
        } catch { /* ignore */ }
        console.warn('[API 401]', { method: config.method || 'GET', url, hasAuthHeader: hasAuth, credentials: creds, detail: String(detail).slice(0, 100) })
      }
      // Сохраняем response для доступа к status и headers
      const error = new Error(`HTTP error! status: ${response.status}`)
      
      // Пытаемся получить JSON из ответа (клонируем response, так как body можно прочитать только один раз)
      let errorData = null
      try {
        const clonedResponse = response.clone()
        errorData = await clonedResponse.json()
      } catch {
        // Если не JSON, оставляем errorData = null
      }
      
      // Создаём объект headers для удобного доступа
      const headersObj = {}
      if (response.headers && response.headers.forEach) {
        response.headers.forEach((value, key) => {
          headersObj[key.toLowerCase()] = value
        })
      }
      
      error.response = {
        status: response.status,
        statusText: response.statusText,
        headers: {
          get: (name) => {
            // Пробуем сначала с оригинальным регистром, потом lowercase
            const lowerName = name.toLowerCase()
            return response.headers.get(name) || response.headers.get(lowerName) || headersObj[lowerName] || null
          },
          ...headersObj
        },
        data: errorData
      }
      
      if (response.status >= 400) {
        console.error(`[API] ${response.status} ${url}`, errorData || response.statusText)
      }

      // TEMP DEBUG — handled HTTP error (UI often maps this to «Ошибка сети»)
      tempDebugLogHandledApiFailure({
        source: 'apiRequest',
        endpoint,
        method,
        fullUrl: url,
        phase: 'http_error',
        status: response.status,
        statusText: response.statusText,
        responseBodyPreview:
          errorData != null
            ? typeof errorData === 'string'
              ? errorData
              : JSON.stringify(errorData)
            : '',
        errorMessage: error.message,
        errorStack: error.stack || '',
      })

      throw error
    }

    return await response.json()
  } catch (error) {
    // Если это уже наш error с response - пробрасываем как есть
    if (error.response) {
      throw error
    }
    // TEMP DEBUG — fetch failed, JSON parse, etc. (no error.response)
    const msg = error?.message != null ? String(error.message) : String(error)
    tempDebugLogHandledApiFailure({
      source: 'apiRequest',
      endpoint,
      method,
      fullUrl: url,
      phase:
        error?.name === 'SyntaxError' || msg.includes('JSON') || msg.includes('Unexpected token')
          ? 'parse'
          : 'network',
      errorMessage: msg,
      errorStack: error?.stack || '',
    })
    // Иначе логируем и пробрасываем
    console.error(`API request failed for ${endpoint}:`, error)
    throw error
  }
}

// Функция для выполнения API запросов без логирования ошибок 404
export const apiRequestSilent = async (endpoint, options = {}) => {
  const method = (options.method || 'GET').toUpperCase()
  const isDemoMode = localStorage.getItem('demo_mode') === '1'
  if (isDemoMode && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const error = new Error('В демо-режиме изменение данных недоступно')
    error.response = {
      status: 403,
      statusText: 'Forbidden',
      headers: { get: () => null },
      data: { detail: 'В демо-режиме изменение данных недоступно' },
    }
    throw error
  }

  // Проверка авторизации для защищённых эндпоинтов
  if (requiresAuth(endpoint)) {
    const token = localStorage.getItem('access_token')
    if (!token) {
      const error = new Error('HTTP error! status: 401')
      error.response = {
        status: 401,
        statusText: 'Unauthorized',
        headers: {
          get: () => null
        },
        data: {
          detail: 'Missing access token',
          message: 'Missing access token'
        }
      }
      throw error
    }
  }
  
  const url = getApiUrl(endpoint)
  const headers = getAuthHeaders()
  
  const config = {
    ...options,
    credentials: options.credentials ?? 'include',
    headers: {
      ...headers,
      ...options.headers
    }
  }
  
  try {
    const response = await fetch(url, config)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    // Не логируем ошибки 404, так как это нормальное поведение для несуществующих заметок
    if (!error.message.includes('status: 404')) {
      console.error(`API request failed for ${endpoint}:`, error)
    }
    throw error
  }
}

// Функция для выполнения fetch запросов без автоматического парсинга JSON
export const apiFetch = async (endpoint, options = {}) => {
  const method = (options.method || 'GET').toUpperCase()
  const isDemoMode = localStorage.getItem('demo_mode') === '1'
  if (isDemoMode && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return new Response(
      JSON.stringify({ detail: 'В демо-режиме изменение данных недоступно' }),
      { status: 403, statusText: 'Forbidden', headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Проверка авторизации для защищённых эндпоинтов
  if (requiresAuth(endpoint)) {
    const token = localStorage.getItem('access_token')
    if (!token) {
      // Для apiFetch возвращаем Response с 401 статусом
      return new Response(
        JSON.stringify({ detail: 'Missing access token', message: 'Missing access token' }),
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
  }
  
  const url = getApiUrl(endpoint)
  const authHeaders = getAuthHeaders()
  // Для FormData не ставим Content-Type (браузер установит с boundary), но Authorization оставляем!
  const isFormData = options.body instanceof FormData
  const headersToUse = isFormData
    ? (authHeaders.Authorization ? { Authorization: authHeaders.Authorization } : {})
    : authHeaders

  const config = {
    ...options,
    credentials: 'include',
    headers: {
      ...headersToUse,
      ...options.headers
    }
  }
  // Для FormData не должно быть Content-Type (fetch установит автоматически)
  if (isFormData && config.headers['Content-Type']) {
    delete config.headers['Content-Type']
  }

  const response = await fetch(url, config)

  // Dev-диагностика 401: без секретов
  if (response.status === 401 && import.meta.env?.DEV) {
    const hasAuth = !!(config.headers?.Authorization)
    const creds = config.credentials ?? 'not set'
    let detail = ''
    try {
      const clone = response.clone()
      const data = await clone.json().catch(() => ({}))
      detail = data?.detail ?? ''
    } catch { /* ignore */ }
    console.warn('[API 401]', {
      method: config.method || 'GET',
      url,
      hasAuthHeader: hasAuth,
      credentials: creds,
      detail: String(detail).slice(0, 100)
    })
  }

  return response
}

// Удобные функции для разных HTTP методов
export const apiGet = (endpoint) => apiRequest(endpoint, { method: 'GET' })
export const apiGetSilent = (endpoint) => apiRequestSilent(endpoint, { method: 'GET' })
export const apiPost = (endpoint, data) => apiRequest(endpoint, { 
  method: 'POST', 
  body: JSON.stringify(data) 
})
export const apiPut = (endpoint, data) => apiRequest(endpoint, { 
  method: 'PUT', 
  body: JSON.stringify(data) 
})
export const apiPatch = (endpoint, data) => apiRequest(endpoint, { 
  method: 'PATCH', 
  body: JSON.stringify(data) 
})
export const apiDelete = (endpoint) => apiRequest(endpoint, { method: 'DELETE' })
