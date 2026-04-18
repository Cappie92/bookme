import { useRef, useEffect } from 'react'

/**
 * Хук для отложенного закрытия hover-попапа (500ms задержка).
 * При наведении на попап — таймер отменяется.
 *
 * @param {number} delayMs — задержка закрытия (по умолчанию 500)
 * @param {function} onClose — вызывается при срабатывании таймера
 * @returns {{ scheduleClose: function, cancelClose: function }}
 */
export function useHoverCloseDelay(delayMs = 500, onClose) {
  const closeTimerRef = useRef(null)

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimerRef.current = setTimeout(() => {
      onClose?.()
      closeTimerRef.current = null
    }, delayMs)
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  return { scheduleClose, cancelClose }
}
