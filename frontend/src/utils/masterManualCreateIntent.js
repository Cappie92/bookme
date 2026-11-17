import { useEffect } from 'react'
import { formatLocalDate } from './scheduleDates'

/** Состояние CalendarB3Composer для новой ручной записи на выбранную локальную дату. */
export function manualCreateComposerState(today = new Date()) {
  return {
    mode: 'manual',
    dateStr: formatLocalDate(today),
    event: null,
  }
}

/**
 * Одноразово открывает composer при ненулевом intentKey.
 * Родитель обнуляет key в onConsumed, чтобы повторные рендеры не открывали форму снова.
 */
export function useConsumeManualCreateIntent({ intentKey, onConsumed, setComposer }) {
  useEffect(() => {
    if (!intentKey) return
    setComposer(manualCreateComposerState())
    onConsumed?.()
  }, [intentKey, onConsumed, setComposer])
}
