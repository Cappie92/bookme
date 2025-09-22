// Базовый URL для API
const API_BASE_URL = '' // Используем относительные пути для прокси Vite

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
  const url = getApiUrl(endpoint)
  const headers = getAuthHeaders()
  
  const config = {
    ...options,
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
    console.error(`API request failed for ${endpoint}:`, error)
    throw error
  }
}

// Функция для выполнения API запросов без логирования ошибок 404
export const apiRequestSilent = async (endpoint, options = {}) => {
  const url = getApiUrl(endpoint)
  const headers = getAuthHeaders()
  
  const config = {
    ...options,
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
  const url = getApiUrl(endpoint)
  const headers = getAuthHeaders()
  
  const config = {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  }
  
  return await fetch(url, config)
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
export const apiDelete = (endpoint) => apiRequest(endpoint, { method: 'DELETE' })
