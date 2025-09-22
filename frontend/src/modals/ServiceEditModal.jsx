import { useState, useEffect } from "react"

export default function ServiceEditModal({ service, categories, onSave, onClose, onCategoryCreated, open }) {
  if (!open) return null;
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration: 30,
    price: '',
    category_id: ''
  })
  const [loading, setLoading] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [catLoading, setCatLoading] = useState(false)
  const [localCategories, setLocalCategories] = useState([])
  const [error, setError] = useState('')

  // Генерируем варианты длительности от 30 минут до 8 часов
  const durationOptions = []
  for (let minutes = 30; minutes <= 480; minutes += 30) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    const displayText = hours > 0 
      ? `${hours}ч${mins > 0 ? ` ${mins}мин` : ''}`
      : `${mins}мин`
    durationOptions.push({ value: minutes, label: displayText })
  }

  useEffect(() => {
    setLocalCategories(categories)
  }, [categories])

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name || '',
        description: service.description || '',
        duration: service.duration || 30,
        price: service.price || '',
        category_id: service.category_id || ''
      })
    } else {
      setFormData({
        name: '',
        description: '',
        duration: 30,
        price: '',
        category_id: localCategories.length > 0 ? localCategories[0].id : ''
      })
    }
  }, [service, localCategories])

  const handleCreateCategory = async () => {
    if (!newCategory.trim()) return
    setCatLoading(true)
    setError('')
    try {
      const res = await fetch('/api/master/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({ name: newCategory.trim() })
      })
      if (res.ok) {
        const cat = await res.json()
        setLocalCategories(cats => [...cats, cat])
        setFormData(prev => ({ ...prev, category_id: cat.id }))
        setNewCategory('')
        onCategoryCreated(cat)
      } else {
        const errorData = await res.json()
        setError(errorData.detail || 'Ошибка создания категории')
      }
    } catch (err) {
      console.error('Ошибка создания категории:', err)
      setError('Ошибка сети при создании категории')
    } finally {
      setCatLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.category_id || !formData.price || !formData.duration) return

    setLoading(true)
    setError('')
    try {
      await onSave({
        name: formData.name.trim(),
        description: formData.description.trim(),
        duration: parseInt(formData.duration),
        price: parseFloat(formData.price),
        category_id: parseInt(formData.category_id)
      })
    } catch (err) {
      console.error('Ошибка сохранения услуги:', err)
      setError(err.message || 'Ошибка сохранения услуги')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleCloseClick = () => {
    onClose()
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">
          {service ? 'Изменить услугу' : 'Создать услугу'}
        </h2>
      
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Название услуги *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Введите название услуги"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Категория *
            </label>
            <div className="flex gap-2">
              <select
                value={formData.category_id}
                onChange={(e) => handleChange('category_id', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Выберите категорию</option>
                {localCategories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Новая категория"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-40 px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={catLoading || !newCategory.trim()}
                className="bg-blue-500 text-white px-3 py-2 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {catLoading ? '...' : '+'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Описание
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Описание услуги"
              rows="3"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Цена (₽) *
              </label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => handleChange('price', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
                min="0"
                step="0.01"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Длительность *
              </label>
              <select
                value={formData.duration}
                onChange={(e) => handleChange('duration', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {durationOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {error && (
            <div className="text-red-500 text-sm mt-2">{error}</div>
          )}
          
          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={handleCloseClick}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={loading || !formData.name.trim() || !formData.category_id || !formData.price || !formData.duration}
            >
              {loading ? 'Сохранение...' : (service ? 'Сохранить' : 'Создать')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}