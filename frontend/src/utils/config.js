// Конфигурация API
export const API_BASE_URL = '' // Используем относительные пути для прокси Vite

// Функция для создания полного URL API
export const getApiUrl = (endpoint) => {
  return `${API_BASE_URL}${endpoint}`
}

// Функция для формирования URL изображения
export const getImageUrl = (imagePath) => {
  if (!imagePath) return null
  
  // Если это уже полный URL, возвращаем как есть
  if (imagePath.startsWith('http')) {
    return imagePath
  }
  
  // Иначе добавляем базовый URL
  return `${API_BASE_URL}/${imagePath}`
} 