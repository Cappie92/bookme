import React, { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiGetSilent, apiPost, apiDelete } from '../utils/api'
import { useModal } from '../hooks/useModal'

/**
 * Заметка клиента о мастере. Сущности «салон» в текущей системе нет —
 * модалка показывает только поле «Заметка о мастере».
 * Контракт backend: /api/client/master-notes/{master_id} (см. backend/routers/client.py).
 *
 * Источник master_id:
 *   1) booking.master_id        (мастер в составе филиала)
 *   2) booking.indie_master_id  (индивидуальный мастер)
 */
const ClientNoteModal = ({
  isOpen,
  onClose,
  booking,
  onNoteSaved,
}) => {
  const [masterNote, setMasterNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [existingMasterNote, setExistingMasterNote] = useState(null)

  // Единый id мастера для API заметок.
  const getMasterTargetId = () => {
    if (!booking) return null
    if (booking.master_id && booking.master_name && booking.master_name !== '-') {
      return Number(booking.master_id)
    }
    if (booking.indie_master_id && booking.master_name && booking.master_name !== '-') {
      return Number(booking.indie_master_id)
    }
    return null
  }

  const targetId = getMasterTargetId()
  const masterDisplayName = booking?.master_name && booking.master_name !== '-' ? booking.master_name : null

  // Загружаем существующую заметку при открытии
  useEffect(() => {
    if (isOpen && targetId) {
      loadExistingNote()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, targetId])

  const loadExistingNote = async () => {
    try {
      setLoading(true)
      try {
        const note = await apiGetSilent(`client/master-notes/${targetId}`)
        if (note) {
          setExistingMasterNote(note)
          setMasterNote(note.note || '')
        } else {
          setExistingMasterNote(null)
          setMasterNote('')
        }
      } catch {
        // 404 — заметки нет, это нормально
        setExistingMasterNote(null)
        setMasterNote('')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!targetId) return
    const text = masterNote.trim()
    if (!text) return

    try {
      setSaving(true)
      const saved = await apiPost('client/master-notes', {
        master_id: targetId,
        // salon_id оставляем null — сущности «салон» в системе нет.
        salon_id: null,
        note: text,
      })
      setExistingMasterNote(saved || { note: text })

      if (onNoteSaved) {
        onNoteSaved({ masterNote: text })
      }
      handleClose()
    } catch (error) {
      console.error('Ошибка при сохранении заметки:', error)
      alert('Ошибка при сохранении заметки')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!targetId || !existingMasterNote) return
    // eslint-disable-next-line no-alert
    if (!confirm('Удалить заметку о мастере?')) return

    try {
      setDeleting(true)
      await apiDelete(`client/master-notes/${targetId}`)
      setExistingMasterNote(null)
      setMasterNote('')
      if (onNoteSaved) {
        onNoteSaved(null)
      }
      handleClose()
    } catch (error) {
      console.error('Ошибка при удалении заметки:', error)
      alert('Ошибка при удалении заметки')
    } finally {
      setDeleting(false)
    }
  }

  const handleClose = () => {
    setMasterNote('')
    setExistingMasterNote(null)
    onClose()
  }

  const { handleBackdropClick, handleMouseDown } = useModal(handleClose)

  if (!isOpen) return null

  const title = masterDisplayName
    ? `Заметка о мастере ${masterDisplayName}`
    : 'Заметка о мастере'

  return (
    <div
      className="fixed inset-0 z-50 isolate bg-black/70 lg:flex lg:items-center lg:justify-center lg:bg-black/60"
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div
        className="fixed inset-x-0 bottom-0 top-[calc(6rem+env(safe-area-inset-top,0px))] flex flex-col overflow-hidden bg-white lg:relative lg:inset-auto lg:mx-4 lg:h-auto lg:max-h-[85vh] lg:max-w-lg lg:rounded-xl lg:shadow-xl lg:w-full"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-note-title"
      >
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#E7E2DF] bg-white px-4 py-[14px] lg:px-5">
          <h2
            id="client-note-title"
            className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-snug text-[#2D2D2D] lg:text-lg"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Закрыть"
            className="relative z-30 shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F4F1EF] text-[#6B6B6B] hover:bg-[#EAE4E0] focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 lg:h-10 lg:w-10 lg:rounded-full lg:bg-white lg:text-neutral-900 lg:shadow-md lg:ring-1 lg:ring-neutral-300 lg:hover:bg-neutral-50 lg:hover:ring-neutral-400"
          >
            <XMarkIcon className="h-4 w-4 lg:h-5 lg:w-5" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 lg:px-5">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4CAF50] mx-auto"></div>
              <p className="text-gray-600 mt-2 text-sm">Загрузка заметки...</p>
            </div>
          ) : !targetId ? (
            <p className="text-sm text-gray-500 text-center py-6">
              Невозможно создать заметку: у этой записи не определён мастер.
            </p>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Заметка о мастере
              </label>
              <textarea
                value={masterNote}
                onChange={(e) => setMasterNote(e.target.value)}
                placeholder="Опишите ваши впечатления о мастере..."
                maxLength={400}
                rows={5}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#86EFAC] focus-visible:border-[#4CAF50] resize-none text-sm"
              />
              <div className="text-xs text-gray-500 mt-1 text-right">
                {masterNote.length}/400 символов
              </div>
            </div>
          )}
        </div>

        {!loading && targetId && (
          <div className="border-t border-[#E7E2DF] bg-white px-4 py-3 lg:px-5 flex flex-col-reverse gap-2 lg:flex-row lg:items-center lg:justify-end">
            {existingMasterNote && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="px-4 py-2 text-sm font-semibold rounded-lg border-2 border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed lg:mr-auto"
              >
                {deleting ? 'Удаление...' : 'Удалить заметку'}
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              disabled={saving || deleting}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || deleting || !masterNote.trim()}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#4CAF50] text-white hover:bg-[#45A049] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ClientNoteModal
