import React, { useState, useEffect } from 'react'
import { 
  UserPlusIcon, 
  UserMinusIcon, 
  ExclamationTriangleIcon, 
  CreditCardIcon,
  TrashIcon,
  PencilIcon
} from '@heroicons/react/24/outline'

const ClientRestrictionsManager = ({ 
  salonId, 
  indieMasterId, 
  apiEndpoint,
  onRestrictionsChange 
}) => {
  const [restrictions, setRestrictions] = useState({
    blacklist: [],
    advance_payment_only: [],
    total_restrictions: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingRestriction, setEditingRestriction] = useState(null)
  
  // Форма добавления/редактирования
  const [formData, setFormData] = useState({
    client_phone: '',
    restriction_type: 'blacklist',
    reason: ''
  })

  useEffect(() => {
    loadRestrictions()
  }, [])

  const loadRestrictions = async () => {
    try {
      setLoading(true)
      const response = await fetch(apiEndpoint, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setRestrictions(data)
      } else {
        setError('Ошибка загрузки ограничений')
      }
    } catch (err) {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      const url = editingRestriction 
        ? `${apiEndpoint}/${editingRestriction.id}`
        : apiEndpoint
      
      const method = editingRestriction ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(formData)
      })
      
      if (response.ok) {
        await loadRestrictions()
        resetForm()
        onRestrictionsChange?.()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Ошибка сохранения')
      }
    } catch (err) {
      setError('Ошибка сети')
    }
  }

  const handleDelete = async (restrictionId) => {
    if (!confirm('Вы уверены, что хотите удалить это ограничение?')) return
    
    try {
      const response = await fetch(`${apiEndpoint}/${restrictionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        await loadRestrictions()
        onRestrictionsChange?.()
      } else {
        setError('Ошибка удаления')
      }
    } catch (err) {
      setError('Ошибка сети')
    }
  }

  const handleEdit = (restriction) => {
    setEditingRestriction(restriction)
    setFormData({
      client_phone: restriction.client_phone,
      restriction_type: restriction.restriction_type,
      reason: restriction.reason || ''
    })
    setShowAddForm(true)
  }

  const resetForm = () => {
    setFormData({
      client_phone: '',
      restriction_type: 'blacklist',
      reason: ''
    })
    setEditingRestriction(null)
    setShowAddForm(false)
    setError('')
  }

  const formatPhone = (phone) => {
    // Форматируем телефон для отображения
    if (phone.startsWith('+7')) {
      return `+7 (${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8, 10)}-${phone.slice(10, 12)}`
    }
    return phone
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Заголовок и статистика */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Ограничения клиентов</h3>
          <p className="text-sm text-gray-600">
            Всего ограничений: {restrictions.total_restrictions}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
        >
          <UserPlusIcon className="h-4 w-4" />
          <span>Добавить ограничение</span>
        </button>
      </div>

      {/* Форма добавления/редактирования */}
      {showAddForm && (
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium">
              {editingRestriction ? 'Редактировать ограничение' : 'Добавить ограничение'}
            </h4>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Номер телефона клиента <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.client_phone}
                onChange={(e) => setFormData({...formData, client_phone: e.target.value})}
                placeholder="+7XXXXXXXXXX"
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Тип ограничения <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.restriction_type}
                onChange={(e) => setFormData({...formData, restriction_type: e.target.value})}
                className="border rounded px-3 py-2 w-full"
                required
              >
                <option value="blacklist">Черный список</option>
                <option value="advance_payment_only">Только предоплата</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Причина (необязательно)
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                placeholder="Укажите причину ограничения..."
                className="border rounded px-3 py-2 w-full h-20"
                maxLength={500}
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.reason.length}/500 символов
              </p>
            </div>

            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
              >
                {editingRestriction ? 'Сохранить' : 'Добавить'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition-colors"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Черный список */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <UserMinusIcon className="h-5 w-5 text-red-600" />
          <h4 className="text-lg font-medium text-gray-900">Черный список</h4>
          <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
            {restrictions.blacklist.length}
          </span>
        </div>
        
        {restrictions.blacklist.length === 0 ? (
          <p className="text-gray-500 text-sm">Черный список пуст</p>
        ) : (
          <div className="space-y-3">
            {restrictions.blacklist.map((restriction) => (
              <div key={restriction.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {formatPhone(restriction.client_phone)}
                  </div>
                  {restriction.reason && (
                    <div className="text-sm text-gray-600 mt-1">
                      Причина: {restriction.reason}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Добавлено: {new Date(restriction.created_at).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleEdit(restriction)}
                    className="text-blue-600 hover:text-blue-700 p-1"
                    title="Редактировать"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(restriction.id)}
                    className="text-red-600 hover:text-red-700 p-1"
                    title="Удалить"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Только предоплата */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <CreditCardIcon className="h-5 w-5 text-blue-600" />
          <h4 className="text-lg font-medium text-gray-900">Только предоплата</h4>
          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
            {restrictions.advance_payment_only.length}
          </span>
        </div>
        
        {restrictions.advance_payment_only.length === 0 ? (
          <p className="text-gray-500 text-sm">Список пуст</p>
        ) : (
          <div className="space-y-3">
            {restrictions.advance_payment_only.map((restriction) => (
              <div key={restriction.id} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {formatPhone(restriction.client_phone)}
                  </div>
                  {restriction.reason && (
                    <div className="text-sm text-gray-600 mt-1">
                      Причина: {restriction.reason}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Добавлено: {new Date(restriction.created_at).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleEdit(restriction)}
                    className="text-blue-600 hover:text-blue-700 p-1"
                    title="Редактировать"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(restriction.id)}
                    className="text-red-600 hover:text-red-700 p-1"
                    title="Удалить"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Информация */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-2">Как работают ограничения:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>Черный список:</strong> Клиент не сможет забронировать время</li>
              <li><strong>Только предоплата:</strong> Клиент сможет забронировать только с предоплатой</li>
              <li>Ограничения применяются по номеру телефона</li>
              <li>При попытке бронирования клиент получит "Неизвестную ошибку"</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ClientRestrictionsManager
