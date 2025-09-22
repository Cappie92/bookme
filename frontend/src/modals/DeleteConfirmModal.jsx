import { useState } from "react"
import ConfirmCloseModal from './ConfirmCloseModal'

export default function DeleteConfirmModal({ 
  open = false, 
  onClose = () => {}, 
  onConfirm = () => {}, 
  category = null 
}) {
  const [loading, setLoading] = useState(false)
  const [showConfirmClose, setShowConfirmClose] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      console.error('Ошибка удаления:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!open || !category) return null

  const isService = category.type === 'service'
  const title = isService ? 'Удалить услугу' : 'Удалить категорию'
  const message = isService 
    ? `Вы уверены, что хотите удалить услугу "${category.name}"?`
    : `Вы уверены, что хотите удалить категорию "${category.name}"? Вместе с ней будут удалены все связанные услуги!`

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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={handleBackdropClick}
      >
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative animate-fade-in">
          <button 
            onClick={handleCloseClick} 
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-lg"
          >
            ✕
          </button>
        
          <div className="text-center">
            <h2 className="text-xl font-bold mb-4">{title}</h2>
            
            <p className="text-gray-600 mb-6">
              {message}
            </p>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCloseClick}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-400 transition-colors"
              >
                Нет
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Удаление...' : 'Да'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <ConfirmCloseModal
        open={showConfirmClose}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        modalTitle="подтверждение удаления"
      />
    </>
  )
}