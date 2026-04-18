import { useCallback, useRef } from 'react'

/**
 * Хук для стандартизации поведения модальных окон
 * Предотвращает закрытие при перетаскивании курсора
 * Закрытие происходит только если mousedown произошел сразу на backdrop
 */
export const useModal = (onClose) => {
  const mouseDownOnBackdrop = useRef(false)

  const handleMouseDown = useCallback((e) => {
    // Запоминаем, что mousedown произошел на backdrop (не внутри модального окна)
    if (e.target === e.currentTarget) {
      mouseDownOnBackdrop.current = true
      e.preventDefault()
    } else {
      // mousedown произошел внутри модального окна
      mouseDownOnBackdrop.current = false
    }
  }, [])

  const handleBackdropClick = useCallback((e) => {
    // Закрываем только если клик произошел на backdrop И mousedown тоже был на backdrop
    if (e.target === e.currentTarget && mouseDownOnBackdrop.current) {
      onClose()
    }
    // Сбрасываем флаг после обработки клика
    mouseDownOnBackdrop.current = false
  }, [onClose])

  return {
    handleBackdropClick,
    handleMouseDown
  }
}
