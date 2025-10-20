import { useEffect, useState } from "react"
import ConfirmCloseModal from './ConfirmCloseModal'

export default function ServiceModal({ open = false, onClose = () => {}, onCreated = () => {} }) {
  const [form, setForm] = useState({ name: '', category_id: '', price: '', duration: 30 })
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [catLoading, setCatLoading] = useState(false)
  const [showConfirmClose, setShowConfirmClose] = useState(false)

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token')
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  }

  useEffect(() => {
    if (open) {
      setForm({ name: '', category_id: '', price: '', duration: 30 })
      setError('')
      fetch('/salon/categories', {
        headers: getAuthHeaders()
      })
        .then(async r => {
          if (!r.ok) {
            const errorText = await r.text()
            throw new Error(`HTTP ${r.status}: ${errorText}`)
          }
          return r.json()
        })
        .then(data => setCategories(data))
        .catch(err => {
          console.error('Ошибка загрузки категорий:', err)
          setError(`Ошибка загрузки категорий: ${err.message}`)
        })
    }
  }, [open])

  const handleChange = e => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  const handleCreateCategory = async () => {
    if (!newCategory.trim()) return
    setCatLoading(true)
    try {
      console.log('Creating category:', newCategory)
      const res = await fetch('/salon/categories', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: newCategory })
      })
      if (res.ok) {
        const cat = await res.json()
        console.log('Category created:', cat)
        setCategories(cats => {
          console.log('Previous categories:', cats)
          const newCats = [...cats, cat]
          console.log('New categories:', newCats)
          return newCats
        })
        setForm(f => ({ ...f, category_id: cat.id }))
        setNewCategory('')
      } else {
        const errorText = await res.text()
        console.error('Category creation error:', errorText)
        setError(`Ошибка при создании категории: ${errorText}`)
      }
    } catch (err) {
      console.error('Ошибка создания категории:', err)
      setError(`Ошибка при создании категории: ${err.message}`)
    } finally {
      setCatLoading(false)
    }
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    if (!form.name || !form.category_id || !form.price || !form.duration) {
      setError('Заполните все поля')
      setLoading(false)
      return
    }
    try {
      console.log('Creating service with form data:', form)
      const serviceData = {
        name: form.name,
        category_id: Number(form.category_id),
        price: Number(form.price),
        duration: Number(form.duration)
      }
      console.log('Service data to send:', serviceData)
      
      const res = await fetch('/salon/services', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(serviceData)
      })
      if (res.ok) {
        const createdService = await res.json()
        console.log('Созданная услуга:', createdService)
        onCreated()
        onClose()
      } else {
        const errorText = await res.text()
        console.error('Service creation error:', errorText)
        setError(`Ошибка при создании услуги: ${errorText}`)
      }
    } catch (err) {
      console.error('Ошибка создания услуги:', err)
      setError(`Ошибка при создании услуги: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setShowConfirmClose(true)
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      setShowConfirmClose(true)
    }
  }

  const handleConfirmClose = () => {
    setShowConfirmClose(false)
    onClose()
  }

  const handleCancelClose = () => {
    setShowConfirmClose(false)
  }

  if (!open) return null

  return (
    <>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={handleBackdropClick}
      >
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-8 relative animate-fade-in">
          <button 
            onClick={handleClose} 
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-lg"
            type="button"
          >
            ✕
          </button>
          <h2 className="text-2xl font-bold mb-6 text-center">Создать услугу</h2>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium mb-1">Название услуги</label>
              <input name="name" value={form.name} onChange={handleChange} className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Категория</label>
              <div className="flex gap-2">
                <select name="category_id" value={form.category_id} onChange={handleChange} className="border rounded px-3 py-2 w-full">
                  <option value="">Выберите категорию</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
                <input type="text" placeholder="Новая категория" value={newCategory} onChange={e=>setNewCategory(e.target.value)} className="border rounded px-2 py-2 w-40" />
                <button type="button" onClick={handleCreateCategory} disabled={catLoading} className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600">+</button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Стоимость (₽)</label>
              <input name="price" type="number" min="0" value={form.price} onChange={handleChange} className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Длительность</label>
              <select name="duration" value={form.duration} onChange={handleChange} className="border rounded px-3 py-2 w-full">
                <option value="">Выберите длительность</option>
                {(() => {
                  const durationOptions = []
                  for (let minutes = 10; minutes <= 480; minutes += 10) {
                    const hours = Math.floor(minutes / 60)
                    const mins = minutes % 60
                    const displayText = hours > 0 
                      ? `${hours}ч${mins > 0 ? ` ${mins}мин` : ''}`
                      : `${mins}мин`
                    durationOptions.push({ value: minutes, label: displayText })
                  }
                  return durationOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))
                })()}
              </select>
            </div>
            {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
            <div className="flex gap-3 mt-4">
              <button 
                type="button" 
                onClick={handleClose}
                className="flex-1 bg-gray-200 text-gray-700 rounded py-2 font-semibold hover:bg-gray-300 transition-colors"
              >
                Отмена
              </button>
              <button 
                type="submit" 
                className="flex-1 bg-blue-600 text-white rounded py-2 font-semibold hover:bg-blue-700 transition-colors" 
                disabled={loading}
              >
                {loading ? 'Создание...' : 'Создать услугу'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <ConfirmCloseModal
        open={showConfirmClose}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        modalTitle="создание услуги"
      />
    </>
  )
} 