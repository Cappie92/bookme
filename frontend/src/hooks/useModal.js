import { useCallback } from 'react'

/**
 * Хук для стандартизации поведения модальных окон
 * Предотвращает закрытие при перетаскивании курсора
 */
export const useModal = (onClose) => {
  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  const handleMouseDown = useCallback((e) => {
    // Предотвращаем закрытие при перетаскивании
    if (e.target === e.currentTarget) {
      e.preventDefault()
    }
  }, [])

  return {
    handleBackdropClick,
    handleMouseDown
  }
}
