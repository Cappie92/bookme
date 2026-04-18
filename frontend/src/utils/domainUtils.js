/**
 * Утилиты для работы с поддоменами
 */

// Получить поддомен из текущего URL
export const getSubdomain = () => {
  const hostname = window.location.hostname
  
  // Для локальной разработки
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const pathParts = window.location.pathname.split('/').filter(Boolean)
    if (pathParts[0] === 'domain' && pathParts[1]) {
      return pathParts[1]
    }
    return null
  }
  
  // Для продакшена - извлекаем поддомен
  const parts = hostname.split('.')
  if (parts.length >= 3) {
    return parts[0]
  }
  
  return null
}

// Получить основной домен
export const getMainDomain = () => {
  const hostname = window.location.hostname
  
  // Для локальной разработки
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost:5173' // или другой порт
  }
  
  // Для продакшена
  const parts = hostname.split('.')
  if (parts.length >= 2) {
    return parts.slice(-2).join('.') // последние две части
  }
  
  return hostname
}

// Создать URL для поддомена
export const createSubdomainUrl = (subdomain, path = '') => {
  const mainDomain = getMainDomain()
  
  // Для локальной разработки
  if (mainDomain.includes('localhost')) {
    return `http://localhost:5173/domain/${subdomain}${path}`
  }
  
  // Для продакшена
  return `https://${subdomain}.${mainDomain}${path}`
}

// Проверить, является ли текущий URL поддоменом
export const isSubdomain = () => {
  return getSubdomain() !== null
}

// Получить тип владельца по поддомену
export const getOwnerTypeBySubdomain = async (subdomain) => {
  try {
    const response = await fetch(`/api/domain/${subdomain}/info`)
    if (response.ok) {
      const data = await response.json()
      return data.owner_type // 'salon' или 'master'
    }
  } catch (error) {
    console.error('Ошибка получения информации о поддомене:', error)
  }
  return null
}

// Получить ID владельца по поддомену
export const getOwnerIdBySubdomain = async (subdomain) => {
  try {
    const response = await fetch(`/api/domain/${subdomain}/info`)
    if (response.ok) {
      const data = await response.json()
      return data.owner_id
    }
  } catch (error) {
    console.error('Ошибка получения ID владельца:', error)
  }
  return null
} 