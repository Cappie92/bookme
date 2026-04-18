import { useState, useEffect } from 'react'
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'
import { API_BASE_URL } from '../utils/config'
import { useModal } from '../hooks/useModal'

export default function SubscriptionPlanForm({ 
  plan = null, 
  onSave, 
  onCancel 
}) {
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    subscription_type: 'master',
    price_1month: 0,
    price_3months: 0,
    price_6months: 0,
    price_12months: 0,
    freeze_days_1month: 0,
    freeze_days_3months: 0,
    freeze_days_6months: 0,
    freeze_days_12months: 0,
    features: {
      max_page_modules: 0,
      stats_retention_days: 0, // 0 = бесконечное хранение
      service_functions: []
    },
    limits: {
      services_count: 0,
      max_future_bookings: null
    },
    is_active: true,
    display_order: 0
  })
  const [serviceFunctions, setServiceFunctions] = useState([])
  const [loadingFunctions, setLoadingFunctions] = useState(false)
  const [functionsLoadError, setFunctionsLoadError] = useState(null)

  useEffect(() => {
    if (plan) {
      const planFeatures = plan.features || {}
      // Миграция старых функций из features в service_functions
      const serviceFunctionIds = planFeatures.service_functions || []
      
      // Если есть старые функции в features, но нет service_functions, нужно будет их мигрировать
      // Пока просто используем service_functions из плана
      
      setFormData({
        name: plan.name || '',
        display_name: plan.display_name || '',
        subscription_type: plan.subscription_type || 'master',
        price_1month: plan.price_1month || 0,
        price_3months: plan.price_3months || 0,
        price_6months: plan.price_6months || 0,
        price_12months: plan.price_12months || 0,
        freeze_days_1month: plan.freeze_days_1month || 0,
        freeze_days_3months: plan.freeze_days_3months || 0,
        freeze_days_6months: plan.freeze_days_6months || 0,
        freeze_days_12months: plan.freeze_days_12months || 0,
        features: {
          max_page_modules: planFeatures.max_page_modules || 0,
          stats_retention_days: planFeatures.stats_retention_days !== undefined ? planFeatures.stats_retention_days : 0, // 0 = бесконечное хранение
          service_functions: serviceFunctionIds
        },
        limits: plan.limits || {
          services_count: 0,
          max_future_bookings: null
        },
        is_active: plan.is_active !== undefined ? plan.is_active : true,
        display_order: plan.display_order || 0
      })
    }
  }, [plan])

  useEffect(() => {
    loadServiceFunctions()
  }, [])

  const loadServiceFunctions = async () => {
    try {
      setLoadingFunctions(true)
      setFunctionsLoadError(null)
      const token = localStorage.getItem('access_token')
      // Загружаем все активные функции (FREE и SUBSCRIPTION), так как базовая функция "Страница бронирования" тоже должна отображаться
      const response = await fetch(`${API_BASE_URL}/api/admin/service-functions?is_active=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Загружено service_functions:', data)
        // Фильтруем только функции, которые могут быть назначены планам (FREE и SUBSCRIPTION)
        // API возвращает function_type в нижнем регистре (free, subscription)
        const filteredData = data.filter(func => {
          const funcType = (func.function_type || '').toLowerCase()
          return funcType === 'free' || funcType === 'subscription'
        })
        console.log('Отфильтровано service_functions:', filteredData)
        setServiceFunctions(filteredData)
        if (!Array.isArray(data) || data.length === 0) {
          setFunctionsLoadError(
            'Справочник функций пуст. Проверьте таблицу service_functions в БД и примените миграции (alembic upgrade head).'
          )
        }
      } else {
        console.error('Ошибка загрузки service_functions:', response.status, response.statusText)
        const errorText = await response.text()
        console.error('Текст ошибки:', errorText)
        setFunctionsLoadError(
          `Не удалось загрузить список функций (HTTP ${response.status}). Войдите как администратор или проверьте API.`
        )
      }
    } catch (error) {
      console.error('Ошибка загрузки service_functions:', error)
      setFunctionsLoadError('Сеть или CORS: не удалось запросить /api/admin/service-functions')
    } finally {
      setLoadingFunctions(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    if (name.startsWith('features.')) {
      const featureKey = name.replace('features.', '')
      // Обрабатываем только max_page_modules и stats_retention_days
      if (featureKey === 'max_page_modules' || featureKey === 'stats_retention_days') {
        setFormData(prev => ({
          ...prev,
          features: {
            ...prev.features,
            [featureKey]: type === 'number' ? parseInt(value) || 0 : value
          }
        }))
      }
    } else if (name.startsWith('limits.')) {
      const limitKey = name.replace('limits.', '')
      setFormData(prev => ({
        ...prev,
        limits: {
          ...prev.limits,
          [limitKey]: type === 'number' ? parseInt(value) || 0 : value
        }
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) || 0 : value)
      }))
    }
  }

  const validatePrices = () => {
    if (formData.price_1month < formData.price_3months) {
      alert('Цена за 1 месяц не может быть меньше цены за 1 месяц в пакете на 3 месяца')
      return false
    }
    if (formData.price_3months < formData.price_6months) {
      alert('Цена за 1 месяц в пакете на 3 месяца не может быть меньше цены за 1 месяц в пакете на 6 месяцев')
      return false
    }
    if (formData.price_6months < formData.price_12months) {
      alert('Цена за 1 месяц в пакете на 6 месяцев не может быть меньше цены за 1 месяц в пакете на 12 месяцев')
      return false
    }
    return true
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validatePrices()) {
      return
    }
    onSave(formData)
  }

  const { handleBackdropClick, handleMouseDown } = useModal(onCancel)

  return (
    <div 
      className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            {plan ? 'Редактировать план' : 'Создать план подписки'}
          </h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Основная информация */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Название плана (техническое) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full border rounded px-3 py-2"
                placeholder="Free, Basic, Pro, Premium"
              />
              <p className="text-xs text-gray-500 mt-1">Используется в коде, должно быть уникальным</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Отображаемое название
              </label>
              <input
                type="text"
                name="display_name"
                value={formData.display_name}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2"
                placeholder="Бесплатный, Базовый, Профессиональный, Премиум"
              />
              <p className="text-xs text-gray-500 mt-1">Отображается пользователям. Если пусто, используется техническое название</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Тип подписки <span className="text-red-500">*</span>
              </label>
              <select
                name="subscription_type"
                value={formData.subscription_type}
                onChange={handleChange}
                required
                className="w-full border rounded px-3 py-2"
              >
                <option value="master">Мастер</option>
                <option value="salon">Салон</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Цена за месяц (пакет 1 месяц), ₽ <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="price_1month"
                value={formData.price_1month}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Цена за месяц (пакет 3 месяца), ₽ <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="price_3months"
                value={formData.price_3months}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full border rounded px-3 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">Общая стоимость: {Math.round(formData.price_3months * 3)} ₽</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Цена за месяц (пакет 6 месяцев), ₽ <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="price_6months"
                value={formData.price_6months}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full border rounded px-3 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">Общая стоимость: {Math.round(formData.price_6months * 6)} ₽</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Цена за месяц (пакет 12 месяцев), ₽ <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="price_12months"
                value={formData.price_12months}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full border rounded px-3 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">Общая стоимость: {Math.round(formData.price_12months * 12)} ₽</p>
            </div>
          </div>

          {/* Дни заморозки */}
          <div className="border-t pt-4">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Дни заморозки подписки</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Дни заморозки (1 месяц)
                </label>
                <input
                  type="number"
                  name="freeze_days_1month"
                  value={formData.freeze_days_1month}
                  onChange={handleChange}
                  min="0"
                  step="1"
                  className="w-full border rounded px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">Количество дней заморозки для подписки на 1 месяц</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Дни заморозки (3 месяца)
                </label>
                <input
                  type="number"
                  name="freeze_days_3months"
                  value={formData.freeze_days_3months}
                  onChange={handleChange}
                  min="0"
                  step="1"
                  className="w-full border rounded px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">Количество дней заморозки для подписки на 3 месяца</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Дни заморозки (6 месяцев)
                </label>
                <input
                  type="number"
                  name="freeze_days_6months"
                  value={formData.freeze_days_6months}
                  onChange={handleChange}
                  min="0"
                  step="1"
                  className="w-full border rounded px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">Количество дней заморозки для подписки на 6 месяцев</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Дни заморозки (12 месяцев)
                </label>
                <input
                  type="number"
                  name="freeze_days_12months"
                  value={formData.freeze_days_12months}
                  onChange={handleChange}
                  min="0"
                  step="1"
                  className="w-full border rounded px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">Количество дней заморозки для подписки на 12 месяцев</p>
              </div>
            </div>
          </div>

          {/* Основная информация - продолжение */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Порядок отображения
              </label>
              <input
                type="number"
                name="display_order"
                value={formData.display_order}
                onChange={handleChange}
                min="0"
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div className="flex items-center pt-6">
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 block text-sm text-gray-700">
                Активен
              </label>
            </div>
          </div>

          {/* Функции тарифа */}
          <div className="border-t pt-4">
            <h4 className="text-md font-semibold mb-3">Функции тарифа</h4>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-blue-800">
                <strong>💡 Важно:</strong> Выберите функции, которые будут входить в этот тарифный план.
                Эти функции будут отображаться в карточках тарифов (модальное окно покупки подписки) и на странице "Мой тариф".
                При удалении функции из плана она автоматически отключится для всех мастеров с этим планом.
              </p>
            </div>
            {loadingFunctions ? (
              <div className="text-center py-4">Загрузка функций...</div>
            ) : serviceFunctions.length === 0 ? (
              <div className="text-center py-4 text-gray-500 space-y-2">
                <div>Нет доступных функций</div>
                {functionsLoadError && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 text-left">
                    {functionsLoadError}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {serviceFunctions.map(func => (
                    <div key={func.id} className="flex items-start">
                      <input
                        type="checkbox"
                        checked={formData.features.service_functions?.includes(func.id) || false}
                        onChange={(e) => {
                          const currentIds = formData.features.service_functions || []
                          const newIds = e.target.checked
                            ? [...currentIds, func.id]
                            : currentIds.filter(id => id !== func.id)
                          setFormData(prev => ({
                            ...prev,
                            features: {
                              ...prev.features,
                              service_functions: newIds
                            }
                          }))
                        }}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                      />
                      <div className="ml-2 flex-1">
                        <label className="block text-sm text-gray-700 font-medium">
                          {func.display_name || func.name}
                        </label>
                        {func.description && (
                          <span className="text-xs text-gray-500 block mt-1">{func.description}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Дополнительные настройки для функций с параметрами */}
                {(() => {
                  const hasModules = serviceFunctions.find(f => f.id && formData.features.service_functions?.includes(f.id) && (f.name.includes('Модули') || f.name.includes('модули') || f.display_name?.includes('Модули') || f.display_name?.includes('модули')))
                  const hasStats = serviceFunctions.find(f => f.id && formData.features.service_functions?.includes(f.id) && (f.name.includes('статистика') || f.name.includes('Статистика') || f.display_name?.includes('статистика') || f.display_name?.includes('Статистика')))
                  
                  if (hasModules || hasStats) {
                    return (
                      <div className="mt-4 pt-4 border-t">
                        <h5 className="text-sm font-semibold text-gray-700 mb-3">Дополнительные настройки</h5>
                        
                        {/* Настройки для модулей страницы */}
                        {hasModules && (
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Максимальное количество модулей
                            </label>
                            <input
                              type="number"
                              name="features.max_page_modules"
                              value={formData.features.max_page_modules}
                              onChange={handleChange}
                              min="0"
                              className="w-full border rounded px-3 py-2"
                              placeholder="0 = безлимит"
                            />
                            <p className="text-xs text-gray-500 mt-1">Устанавливается только если выбрана функция "Модули страницы"</p>
                          </div>
                        )}
                        
                        {/* Настройки для расширенной статистики */}
                        {hasStats && (
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Период хранения статистики (дней)
                            </label>
                            <input
                              type="number"
                              name="features.stats_retention_days"
                              value={formData.features.stats_retention_days === 0 || formData.features.stats_retention_days === null || formData.features.stats_retention_days === undefined ? '' : formData.features.stats_retention_days}
                              onChange={(e) => {
                                const value = e.target.value === '' ? 0 : parseInt(e.target.value) || 0
                                setFormData(prev => ({
                                  ...prev,
                                  features: {
                                    ...prev.features,
                                    stats_retention_days: value
                                  }
                                }))
                              }}
                              min="0"
                              className="w-full border rounded px-3 py-2"
                              placeholder="0 = бесконечное хранение"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Устанавливается только если выбрана функция "Расширенная статистика". 
                              Укажите 0 или оставьте пустым для бесконечного хранения данных.
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  }
                  return null
                })()}
              </>
            )}
          </div>

          {/* Лимиты */}
          <div className="border-t pt-4">
            <h4 className="text-md font-semibold mb-3">Лимиты</h4>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-blue-800">
                  <strong>💡 Важно:</strong> Эти настройки определяют, что будет отображаться в карточках тарифов и на странице "Мой тариф". 
                  Изменения применяются автоматически во всех местах интерфейса.
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Количество услуг (0 = безлимит)
                  </label>
                  <input
                    type="number"
                    name="limits.services_count"
                    value={formData.limits.services_count}
                    onChange={handleChange}
                    min="0"
                    className="w-full border rounded px-3 py-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">Максимальное количество услуг</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Максимум активных записей (null/0 = безлимит)
                  </label>
                  <input
                    type="number"
                    name="limits.max_future_bookings"
                    value={formData.limits.max_future_bookings !== null && formData.limits.max_future_bookings !== undefined ? formData.limits.max_future_bookings : ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? null : parseInt(e.target.value) || 0
                      setFormData(prev => ({
                        ...prev,
                        limits: {
                          ...prev.limits,
                          max_future_bookings: value
                        }
                      }))
                    }}
                    min="0"
                    className="w-full border rounded px-3 py-2"
                    placeholder="30 (для Free плана) или оставьте пустым для безлимита"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Лимит на количество будущих записей. Используется для Free плана (например, 30). 
                    Для платных планов оставьте пустым или 0.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Кнопки */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
            >
              <CheckIcon className="w-4 h-4 inline mr-1" />
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

