import { useState, useEffect } from "react"
import ConfirmCloseModal from './ConfirmCloseModal'

export default function CategoryEditModal({ open = false, onClose = () => {}, onSave = () => {}, category = null }) {
  if (!open) return null;
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showConfirmClose, setShowConfirmClose] = useState(false)

  useEffect(() => {
    if (category) {
      setName(category.name)
    } else {
      setName('')
    }
    setError('') // Очищаем ошибку при изменении категории
  }, [category])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError('')
    try {
      await onSave({ name: name.trim() })
    } catch (err) {
      console.error('Ошибка сохранения категории:', err)
      setError(err.message || 'Ошибка сохранения категории')
    } finally {
      setLoading(false)
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      setShowConfirmClose(true)
    }
  }

  const handleCloseClick = () => {
    setShowConfirmClose(true)
  }

  const handleConfirmClose = () => {
    setShowConfirmClose(false)
    onClose()
  }

  const handleCancelClose = () => {
    setShowConfirmClose(false)
  }

  return (
    <>
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={handleBackdropClick}
      >
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <h2 className="text-xl font-semibold mb-4">
            {category ? 'Изменить категорию' : 'Создать категорию'}
          </h2>
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Название категории
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Введите название категории"
                required
              />
            </div>
            
            {error && (
              <div className="mb-4 text-red-500 text-sm">{error}</div>
            )}
            
            <div className="flex gap-3 justify-end">
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
                disabled={loading || !name.trim()}
              >
                {loading ? 'Сохранение...' : (category ? 'Сохранить' : 'Создать')}
              </button>
            </div>
          </form>
        </div>
      </div>
      <ConfirmCloseModal
        open={showConfirmClose}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        modalTitle={category ? "редактирование категории" : "создание категории"}
      />
    </>
  )
} 