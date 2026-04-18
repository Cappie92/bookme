import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, Bars3Icon } from '@heroicons/react/24/outline'
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api'

export default function MasterPageModules({ maxModules, currentCount }) {
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingModule, setEditingModule] = useState(null)

  useEffect(() => {
    loadModules()
  }, [])

  const loadModules = async () => {
    try {
      setLoading(true)
      const data = await apiGet('/api/master/page-modules')
      setModules(data)
    } catch (err) {
      console.error('Ошибка при загрузке модулей:', err)
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  const handleAddModule = async () => {
    if (currentCount >= maxModules) {
      alert(`Достигнут лимит модулей (${maxModules}). Обновите план для добавления большего количества модулей.`)
      return
    }

    // Простая форма для создания модуля
    const moduleType = prompt('Тип модуля (text, image, video):', 'text')
    if (!moduleType) return

    try {
      await apiPost('/api/master/page-modules', {
        module_type: moduleType,
        config: {},
        is_active: true
      })
      loadModules()
    } catch (err) {
      const errorData = err.response?.data || {}
      alert(`Ошибка: ${errorData.detail || 'Не удалось создать модуль'}`)
    }
  }

  const handleDeleteModule = async (moduleId) => {
    if (!confirm('Вы уверены, что хотите удалить этот модуль?')) return

    try {
      await apiDelete(`/api/master/page-modules/${moduleId}`)
      loadModules()
    } catch (err) {
      console.error('Ошибка при удалении модуля:', err)
      alert('Ошибка при удалении модуля')
    }
  }

  const handleToggleActive = async (module) => {
    try {
      await apiPut(`/api/master/page-modules/${module.id}`, {
        is_active: !module.is_active
      })
      loadModules()
    } catch (err) {
      console.error('Ошибка при обновлении модуля:', err)
      alert('Ошибка при обновлении модуля')
    }
  }

  if (loading) {
    return <div className="p-4 text-center">Загрузка модулей...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Модули на странице</h3>
          <p className="text-xs text-gray-500 mt-1">
            Использовано: {currentCount} / {maxModules === 999999 ? '∞' : maxModules}
          </p>
        </div>
        <button
          onClick={handleAddModule}
          disabled={currentCount >= maxModules}
          className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
            currentCount >= maxModules
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          <PlusIcon className="w-4 h-4 mr-1" />
          Добавить модуль
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {currentCount >= maxModules && maxModules !== 999999 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            Достигнут лимит модулей. <a href="/master?tab=tariff" className="underline">Обновите план</a> для добавления большего количества.
          </p>
        </div>
      )}

      {modules.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-gray-300 rounded-lg">
          <p className="text-sm text-gray-500">Модули не добавлены</p>
        </div>
      ) : (
        <div className="space-y-2">
          {modules.map((module, index) => (
            <div
              key={module.id}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center space-x-3 flex-1">
                <Bars3Icon className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    {module.module_type} (Позиция: {module.position})
                  </div>
                  <div className="text-xs text-gray-500">
                    {module.is_active ? 'Активен' : 'Неактивен'}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleToggleActive(module)}
                  className={`px-2 py-1 text-xs rounded ${
                    module.is_active
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {module.is_active ? 'Деактивировать' : 'Активировать'}
                </button>
                <button
                  onClick={() => handleDeleteModule(module.id)}
                  className="p-1 text-red-600 hover:text-red-800"
                  title="Удалить"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

