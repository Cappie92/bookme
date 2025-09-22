import React, { useState, useEffect } from 'react'
import { PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'
import { getApiUrl } from '../utils/config'
import { Button, Tabs } from './ui'

export default function LoyaltySystem({ getAuthHeaders }) {
  const [activeTab, setActiveTab] = useState('quick')
  const [templates, setTemplates] = useState([])
  const [quickDiscounts, setQuickDiscounts] = useState([])
  const [complexDiscounts, setComplexDiscounts] = useState([])
  const [personalDiscounts, setPersonalDiscounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingDiscount, setEditingDiscount] = useState(null)
  const [editDiscountValue, setEditDiscountValue] = useState('')
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [editTemplateValue, setEditTemplateValue] = useState('')
  const [showComplexForm, setShowComplexForm] = useState(false)
  const [complexForm, setComplexForm] = useState({
    name: '',
    description: '',
    discount_percent: '',
    conditions: []
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError('')
    
    try {
      // Загружаем шаблоны быстрых скидок
      const templatesResponse = await fetch(getApiUrl('/loyalty/templates'), {
        headers: getAuthHeaders()
      })
      if (templatesResponse.ok) {
        const templatesData = await templatesResponse.json()
        setTemplates(templatesData)
      }

      // Загружаем статус системы лояльности
      const statusResponse = await fetch(getApiUrl('/loyalty/status'), {
        headers: getAuthHeaders()
      })
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        setQuickDiscounts(statusData.quick_discounts)
        setComplexDiscounts(statusData.complex_discounts)
        setPersonalDiscounts(statusData.personal_discounts)
      }
    } catch (err) {
      console.error('Ошибка загрузки данных лояльности:', err)
      setError('Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateQuickDiscount = async (template, customDiscountPercent = null) => {
    try {
      const discountData = {
        discount_type: 'quick',
        name: template.name,
        description: template.description,
        discount_percent: customDiscountPercent || template.default_discount,
        max_discount_amount: null,
        conditions: template.conditions,
        is_active: true,
        priority: 1
      }

      const response = await fetch(getApiUrl('/loyalty/quick-discounts'), {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(discountData)
      })

      if (response.ok) {
        await loadData()
        setEditingTemplate(null)
        setEditTemplateValue('')
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Ошибка создания скидки')
      }
    } catch (err) {
      console.error('Ошибка создания скидки:', err)
      setError('Ошибка создания скидки')
    }
  }

  const handleDeleteQuickDiscount = async (discountId) => {
    if (!confirm('Вы уверены, что хотите удалить эту скидку?')) return

    try {
      const response = await fetch(getApiUrl(`/loyalty/quick-discounts/${discountId}`), {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        await loadData()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Ошибка удаления скидки')
      }
    } catch (err) {
      console.error('Ошибка удаления скидки:', err)
      setError('Ошибка удаления скидки')
    }
  }

  const handleCreatePersonalDiscount = async (formData) => {
    try {
      const response = await fetch(getApiUrl('/loyalty/personal-discounts'), {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        await loadData()
        return true
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Ошибка создания персональной скидки')
        return false
      }
    } catch (err) {
      console.error('Ошибка создания персональной скидки:', err)
      setError('Ошибка создания персональной скидки')
      return false
    }
  }

  const handleUpdateQuickDiscount = async (discountId, newDiscountPercent) => {
    try {
      const response = await fetch(getApiUrl(`/loyalty/quick-discounts/${discountId}`), {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          discount_percent: parseFloat(newDiscountPercent)
        })
      })

      if (response.ok) {
        await loadData()
        setEditingDiscount(null)
        setEditDiscountValue('')
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Ошибка обновления скидки')
      }
    } catch (err) {
      console.error('Ошибка обновления скидки:', err)
      setError('Ошибка обновления скидки')
    }
  }

  const handleCreateComplexDiscount = async (formData) => {
    try {
      const response = await fetch(getApiUrl('/loyalty/complex-discounts'), {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          discount_type: 'complex',
          name: formData.name,
          description: formData.description,
          discount_percent: parseFloat(formData.discount_percent),
          max_discount_amount: null,
          conditions: formData.conditions,
          is_active: true,
          priority: 1
        })
      })

      if (response.ok) {
        await loadData()
        setShowComplexForm(false)
        setComplexForm({
          name: '',
          description: '',
          discount_percent: '',
          conditions: []
        })
        return true
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Ошибка создания сложной скидки')
        return false
      }
    } catch (err) {
      console.error('Ошибка создания сложной скидки:', err)
      setError('Ошибка создания сложной скидки')
      return false
    }
  }

  const handleDeleteComplexDiscount = async (discountId) => {
    if (!confirm('Вы уверены, что хотите удалить эту скидку?')) return

    try {
      const response = await fetch(getApiUrl(`/loyalty/complex-discounts/${discountId}`), {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        await loadData()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Ошибка удаления скидки')
      }
    } catch (err) {
      console.error('Ошибка удаления скидки:', err)
      setError('Ошибка удаления скидки')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Система лояльности</h1>
        <Button
          onClick={loadData}
        >
          Обновить
        </Button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Вкладки */}
      <Tabs
        tabs={[
          { value: 'quick', label: 'Быстрые скидки' },
          { value: 'complex', label: 'Сложные скидки' },
          { value: 'personal', label: 'Персональные скидки' }
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Контент вкладок */}
              {activeTab === 'quick' && (
          <QuickDiscountsTab
            templates={templates}
            discounts={quickDiscounts}
            onCreateDiscount={handleCreateQuickDiscount}
            onDeleteDiscount={handleDeleteQuickDiscount}
            onUpdateDiscount={handleUpdateQuickDiscount}
            editingDiscount={editingDiscount}
            setEditingDiscount={setEditingDiscount}
            editDiscountValue={editDiscountValue}
            setEditDiscountValue={setEditDiscountValue}
            editingTemplate={editingTemplate}
            setEditingTemplate={setEditingTemplate}
            editTemplateValue={editTemplateValue}
            setEditTemplateValue={setEditTemplateValue}
          />
        )}

              {activeTab === 'complex' && (
          <ComplexDiscountsTab
            discounts={complexDiscounts}
            onDeleteDiscount={handleDeleteComplexDiscount}
            onCreateDiscount={handleCreateComplexDiscount}
            showForm={showComplexForm}
            setShowForm={setShowComplexForm}
            form={complexForm}
            setForm={setComplexForm}
          />
        )}

      {activeTab === 'personal' && (
        <PersonalDiscountsTab
          discounts={personalDiscounts}
          onCreateDiscount={handleCreatePersonalDiscount}
          onDeleteDiscount={handleDeleteQuickDiscount}
        />
      )}
    </div>
  )
}

// Компонент для быстрых скидок
function QuickDiscountsTab({ 
  templates, 
  discounts, 
  onCreateDiscount, 
  onDeleteDiscount, 
  onUpdateDiscount, 
  editingDiscount, 
  setEditingDiscount, 
  editDiscountValue, 
  setEditDiscountValue,
  editingTemplate,
  setEditingTemplate,
  editTemplateValue,
  setEditTemplateValue
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Быстрые скидки</h2>
        <p className="text-gray-600 mb-6">
          Предустановленные шаблоны скидок для быстрого масштабирования
        </p>
      </div>

      {/* Сетка шаблонов */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template) => {
          const isActive = discounts.some(d => 
            d.conditions?.condition_type === template.conditions.condition_type
          )
          
          return (
            <div
              key={template.id}
              className={`border rounded-lg p-6 transition-colors ${
                isActive
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-2xl">{template.icon}</div>
                {isActive && (
                  <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                    Активна
                  </span>
                )}
              </div>
              
              <h3 className="text-lg font-semibold mb-2">{template.name}</h3>
              <p className="text-gray-600 text-sm mb-4">{template.description}</p>
              
              <div className="flex items-center justify-between">
                {editingTemplate === template.id ? (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={editTemplateValue}
                        onChange={(e) => setEditTemplateValue(e.target.value)}
                        className="w-20 px-2 py-1 pr-6 border rounded text-sm"
                        placeholder="0"
                      />
                      <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 text-xs">
                        %
                      </span>
                    </div>
                    <button
                      onClick={() => onCreateDiscount(template, parseFloat(editTemplateValue))}
                      disabled={isActive}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      Сохранить
                    </button>
                    <button
                      onClick={() => {
                        setEditingTemplate(null)
                        setEditTemplateValue('')
                      }}
                      className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">
                        Скидка: {template.default_discount}%
                      </span>
                      {!isActive && (
                        <button
                          onClick={() => {
                            setEditingTemplate(template.id)
                            setEditTemplateValue(template.default_discount.toString())
                          }}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => onCreateDiscount(template)}
                      disabled={isActive}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-[#4CAF50] text-white hover:bg-[#45A049]'
                      }`}
                    >
                      {isActive ? 'Активна' : 'Активировать'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Список активных скидок */}
      {discounts.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Активные быстрые скидки</h3>
          <div className="space-y-4">
            {discounts.map((discount) => (
              <div
                key={discount.id}
                className="border border-gray-200 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <h4 className="font-semibold">{discount.name}</h4>
                  <p className="text-sm text-gray-600">{discount.description}</p>
                  {editingDiscount === discount.id ? (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editDiscountValue}
                          onChange={(e) => setEditDiscountValue(e.target.value)}
                          className="w-20 px-2 py-1 pr-6 border rounded text-sm"
                          placeholder="0"
                        />
                        <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 text-xs">
                          %
                        </span>
                      </div>
                      <button
                        onClick={() => onUpdateDiscount(discount.id, editDiscountValue)}
                        className="text-green-600 hover:text-green-800 text-sm"
                      >
                        Сохранить
                      </button>
                      <button
                        onClick={() => {
                          setEditingDiscount(null)
                          setEditDiscountValue('')
                        }}
                        className="text-gray-600 hover:text-gray-800 text-sm"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-sm text-blue-600">Скидка: {discount.discount_percent}%</p>
                      <button
                        onClick={() => {
                          setEditingDiscount(discount.id)
                          setEditDiscountValue(discount.discount_percent.toString())
                        }}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onDeleteDiscount(discount.id)}
                  className="text-red-600 hover:text-red-800 ml-4"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Компонент для сложных скидок
function ComplexDiscountsTab({ 
  discounts, 
  onDeleteDiscount, 
  onCreateDiscount, 
  showForm, 
  setShowForm, 
  form, 
  setForm 
}) {
  const [newCondition, setNewCondition] = useState({
    type: 'visits_count',
    operator: '>=',
    value: '',
    description: ''
  })

  const addCondition = () => {
    if (newCondition.value && newCondition.description) {
      setForm({
        ...form,
        conditions: [...form.conditions, { ...newCondition }]
      })
      setNewCondition({
        type: 'visits_count',
        operator: '>=',
        value: '',
        description: ''
      })
    }
  }

  const removeCondition = (index) => {
    setForm({
      ...form,
      conditions: form.conditions.filter((_, i) => i !== index)
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (form.name && form.description && form.discount_percent && form.conditions.length > 0) {
      onCreateDiscount(form)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Сложные скидки</h2>
        <p className="text-gray-600 mb-6">
          Настройка скидок с несколькими условиями
        </p>
      </div>

      {/* Форма создания сложной скидки */}
      {showForm ? (
        <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">Создать сложную скидку</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Название скидки
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Например: VIP клиенты"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Описание
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Описание условий скидки"
                rows="3"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Размер скидки (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.discount_percent}
                  onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="10"
                  required
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                  %
                </span>
              </div>
            </div>

            {/* Условия */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Условия скидки
              </label>
              
              {/* Список существующих условий */}
              {form.conditions.length > 0 && (
                <div className="space-y-2 mb-4">
                  {form.conditions.map((condition, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-white border rounded">
                      <span className="text-sm text-gray-600 flex-1">
                        {condition.description}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCondition(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Добавление нового условия */}
              <div className="border border-gray-300 rounded-md p-4 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                  <select
                    value={newCondition.type}
                    onChange={(e) => setNewCondition({ ...newCondition, type: e.target.value })}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="visits_count">Количество визитов</option>
                    <option value="total_spent">Общая сумма</option>
                    <option value="days_since_last">Дней с последнего визита</option>
                    <option value="service_category">Категория услуг</option>
                  </select>
                  
                  <select
                    value={newCondition.operator}
                    onChange={(e) => setNewCondition({ ...newCondition, operator: e.target.value })}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value=">=">≥</option>
                    <option value=">">&gt;</option>
                    <option value="=">=</option>
                    <option value="<">&lt;</option>
                    <option value="<=">≤</option>
                  </select>
                  
                  <input
                    type="number"
                    value={newCondition.value}
                    onChange={(e) => setNewCondition({ ...newCondition, value: e.target.value })}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                    placeholder="Значение"
                  />
                  
                  <button
                    type="button"
                    onClick={addCondition}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    Добавить
                  </button>
                </div>
                
                <input
                  type="text"
                  value={newCondition.description}
                  onChange={(e) => setNewCondition({ ...newCondition, description: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  placeholder="Описание условия (например: 'Более 5 визитов')"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049]"
              >
                Создать скидку
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      ) : (
        <Button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2"
        >
          <PlusIcon className="h-5 w-5" />
          Создать сложную скидку
        </Button>
      )}

      {/* Список существующих сложных скидок */}
      {discounts.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Активные сложные скидки</h3>
          <div className="space-y-4">
            {discounts.map((discount) => (
              <div
                key={discount.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">{discount.name}</h4>
                  <button
                    onClick={() => onDeleteDiscount(discount.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-2">{discount.description}</p>
                <p className="text-sm text-blue-600 mb-2">Скидка: {discount.discount_percent}%</p>
                
                {discount.conditions && discount.conditions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Условия:</p>
                    <div className="space-y-1">
                      {discount.conditions.map((condition, index) => (
                        <div key={index} className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">
                          {condition.description}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Компонент для персональных скидок
function PersonalDiscountsTab({ discounts, onCreateDiscount, onDeleteDiscount }) {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    client_phone: '',
    discount_percent: '',
    max_discount_amount: '',
    description: ''
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const success = await onCreateDiscount({
      client_phone: formData.client_phone,
      discount_percent: parseFloat(formData.discount_percent),
      max_discount_amount: formData.max_discount_amount ? parseFloat(formData.max_discount_amount) : null,
      description: formData.description || null,
      is_active: true
    })

    if (success) {
      setShowForm(false)
      setFormData({
        client_phone: '',
        discount_percent: '',
        max_discount_amount: '',
        description: ''
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold mb-4">Персональные скидки</h2>
          <p className="text-gray-600 mb-6">
            Скидки для конкретных клиентов по номеру телефона
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2"
        >
          <PlusIcon className="h-5 w-5" />
          Добавить пользователя
        </Button>
      </div>

      {/* Форма добавления */}
      {showForm && (
        <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">Добавить персональную скидку</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Номер телефона клиента *
              </label>
              <input
                type="tel"
                required
                value={formData.client_phone}
                onChange={(e) => setFormData({...formData, client_phone: e.target.value})}
                placeholder="+7 (999) 123-45-67"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Размер скидки (%) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.discount_percent}
                  onChange={(e) => setFormData({...formData, discount_percent: e.target.value})}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                  %
                </span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Максимальная сумма скидки (руб.)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.max_discount_amount}
                onChange={(e) => setFormData({...formData, max_discount_amount: e.target.value})}
                placeholder="Оставьте пустым для неограниченной скидки"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Описание
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Описание скидки (необязательно)"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Создать скидку
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Список персональных скидок */}
      <div className="space-y-4">
        {discounts.map((discount) => (
          <div
            key={discount.id}
            className="border border-gray-200 rounded-lg p-4 flex items-center justify-between"
          >
            <div>
              <h4 className="font-semibold">{discount.client_phone}</h4>
              <p className="text-sm text-gray-600">{discount.description}</p>
              <p className="text-sm text-blue-600">
                Скидка: {discount.discount_percent}%
                {discount.max_discount_amount && ` (макс. ${discount.max_discount_amount} руб.)`}
              </p>
            </div>
            <button
              onClick={() => onDeleteDiscount(discount.id)}
              className="text-red-600 hover:text-red-800"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        ))}
      </div>

      {discounts.length === 0 && !showForm && (
        <div className="text-center py-8 text-gray-500">
          Персональные скидки не настроены
        </div>
      )}
    </div>
  )
} 