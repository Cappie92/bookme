// Система управления функциями приложения
// Этот файл позволяет централизованно управлять видимостью различных функций

// Получаем настройки из localStorage или используем значения по умолчанию
const getFeatureSettings = () => {
  try {
    const stored = localStorage.getItem('appointo_feature_settings')
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.warn('Ошибка загрузки настроек функций:', error)
  }
  
  // Значения по умолчанию
  return {
    enableSalonFeatures: false, // По умолчанию функции салона отключены
    enableBlog: true,
    enableReviews: true,
    enableRegistration: true
  }
}

// Сохраняем настройки в localStorage
const saveFeatureSettings = (settings) => {
  try {
    localStorage.setItem('appointo_feature_settings', JSON.stringify(settings))
  } catch (error) {
    console.warn('Ошибка сохранения настроек функций:', error)
  }
}

// Обновляем настройки
const updateFeatureSettings = (updates) => {
  const current = getFeatureSettings()
  const updated = { ...current, ...updates }
  saveFeatureSettings(updated)
  return updated
}

// Экспортируем функции и настройки
export const featureSettings = getFeatureSettings()

export const updateFeatures = updateFeatureSettings

export { getFeatureSettings }

// Функции для проверки доступности функций
export const isSalonFeaturesEnabled = () => {
  return getFeatureSettings().enableSalonFeatures
}

export const isBlogEnabled = () => {
  return getFeatureSettings().enableBlog
}

export const isReviewsEnabled = () => {
  return getFeatureSettings().enableReviews
}

export const isRegistrationEnabled = () => {
  return getFeatureSettings().enableRegistration
}
