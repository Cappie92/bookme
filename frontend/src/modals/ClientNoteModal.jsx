import React, { useState, useEffect } from 'react'
import { apiGet, apiGetSilent, apiPost, apiDelete } from '../utils/api'
import { useModal } from '../hooks/useModal'

const ClientNoteModal = ({ 
  isOpen, 
  onClose, 
  booking, 
  onNoteSaved 
}) => {
  const [salonNote, setSalonNote] = useState('')
  const [masterNote, setMasterNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [existingSalonNote, setExistingSalonNote] = useState(null)
  const [existingMasterNote, setExistingMasterNote] = useState(null)

  // Определяем тип заметки и ID цели
  const getNoteTypeAndTarget = () => {
    if (!booking) return { noteType: null, targetId: null }
    
    if (booking.salon_id && booking.salon_name !== '-') {
      if (booking.master_id && booking.master_name !== '-') {
        // Мастер в салоне - показываем оба поля
        return { noteType: 'master_in_salon', targetId: booking.master_id }
      } else {
        // Салон
        return { noteType: 'salon', targetId: booking.salon_id }
      }
    } else if (booking.indie_master_id && booking.master_name !== '-') {
      // Индивидуальный мастер
      return { noteType: 'indie_master', targetId: booking.indie_master_id }
    }
    
    return { noteType: null, targetId: null }
  }

  const { noteType, targetId } = getNoteTypeAndTarget()

  // Загружаем существующие заметки при открытии модального окна
  useEffect(() => {
    if (isOpen && noteType && targetId) {
      loadExistingNotes()
    }
  }, [isOpen, noteType, targetId])

  const loadExistingNotes = async () => {
    try {
      setLoading(true)
      
      if (noteType === 'master_in_salon') {
        // Загружаем заметку о мастере
        try {
          const masterNote = await apiGetSilent(`client/master-notes/${targetId}`)
          if (masterNote) {
            setExistingMasterNote(masterNote)
            setMasterNote(masterNote.note || '')
          }
        } catch (error) {
          console.log('Заметка о мастере не найдена')
        }
        
        // Загружаем заметку о салоне
        try {
          let salonUrl = `client/salon-notes/${booking.salon_id}`
          if (booking.branch_id) {
            salonUrl += `?branch_id=${booking.branch_id}`
          }
          const salonNote = await apiGetSilent(salonUrl)
          if (salonNote) {
            setExistingSalonNote(salonNote)
            setSalonNote(salonNote.note || '')
          }
        } catch (error) {
          console.log('Заметка о салоне не найдена')
        }
      } else {
        // Для других типов загружаем как раньше
        try {
          const note = await apiGetSilent(`client/notes/${noteType}/${targetId}`)
          if (note) {
            if (noteType === 'salon') {
              setExistingSalonNote(note)
              setSalonNote(note.note || '')
            } else {
              setExistingMasterNote(note)
              setMasterNote(note.note || '')
            }
          }
        } catch (error) {
          console.log(`Заметка о ${noteType} не найдена`)
        }
      }
    } catch (error) {
      console.error('Ошибка при загрузке заметок:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!noteType || !targetId) return

    try {
      setSaving(true)
      
      if (noteType === 'master_in_salon') {
        // Сохраняем заметку о мастере
        if (masterNote.trim()) {
          await apiPost('client/master-notes', {
            master_id: targetId,
            salon_id: booking.salon_id,
            note: masterNote.trim()
          })
        }
        
        // Сохраняем заметку о салоне
        if (salonNote.trim()) {
          await apiPost('client/salon-notes', {
            salon_id: booking.salon_id,
            branch_id: booking.branch_id,
            note: salonNote.trim()
          })
        }
        
        // Обновляем состояние
        if (masterNote.trim()) {
          setExistingMasterNote({ note: masterNote.trim() })
        }
        if (salonNote.trim()) {
          setExistingSalonNote({ note: salonNote.trim() })
        }
      } else {
        // Для других типов сохраняем как раньше
        const noteData = {
          note_type: noteType,
          target_id: targetId,
          note: noteType === 'salon' ? salonNote.trim() : masterNote.trim()
        }
        
        const savedNote = await apiPost('client/notes', noteData)
        if (noteType === 'salon') {
          setExistingSalonNote(savedNote)
        } else {
          setExistingMasterNote(savedNote)
        }
      }
      
      if (onNoteSaved) {
        onNoteSaved({ salonNote, masterNote })
      }
      
      // Показываем уведомление об успехе
      alert('Заметки сохранены!')
      
      // Закрываем модальное окно после успешного сохранения
      handleClose()
      
    } catch (error) {
      console.error('Ошибка при сохранении заметок:', error)
      alert('Ошибка при сохранении заметок')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!noteType || !targetId) return

    if (noteType === 'master_in_salon') {
      // Удаляем заметки по отдельности
      if (existingMasterNote && confirm('Удалить заметку о мастере?')) {
        try {
          await apiDelete(`client/master-notes/${targetId}`)
          setExistingMasterNote(null)
          setMasterNote('')
        } catch (error) {
          console.error('Ошибка при удалении заметки о мастере:', error)
        }
      }
      
      if (existingSalonNote && confirm('Удалить заметку о салоне?')) {
        try {
          let url = `client/salon-notes/${booking.salon_id}`
          if (booking.branch_id) {
            url += `?branch_id=${booking.branch_id}`
          }
          await apiDelete(url)
          setExistingSalonNote(null)
          setSalonNote('')
        } catch (error) {
          console.error('Ошибка при удалении заметки о салоне:', error)
        }
      }
    } else {
      // Для других типов удаляем как раньше
      if (!existingSalonNote && !existingMasterNote) return
      
      if (!confirm('Вы уверены, что хотите удалить заметку?')) return

      try {
        setDeleting(true)
        await apiDelete(`client/notes/${noteType}/${targetId}`)
        
        setExistingSalonNote(null)
        setExistingMasterNote(null)
        setSalonNote('')
        setMasterNote('')
        
        if (onNoteSaved) {
          onNoteSaved(null)
        }
        
        alert('Заметка удалена!')
        
      } catch (error) {
        console.error('Ошибка при удалении заметки:', error)
        alert('Ошибка при удалении заметки')
      } finally {
        setDeleting(false)
      }
    }
  }

  const handleClose = () => {
    // Сбрасываем состояние при закрытии
    setSalonNote('')
    setMasterNote('')
    setExistingSalonNote(null)
    setExistingMasterNote(null)
    onClose()
  }

  if (!isOpen) return null

  // Определяем заголовки и поля в зависимости от типа заметки
  const getModalContent = () => {
    if (noteType === 'salon') {
      return {
        title: `Заметка о салоне "${booking.salon_name}"`,
        fields: [
          {
            label: 'Заметка о салоне',
            value: salonNote,
            onChange: setSalonNote,
            placeholder: 'Опишите ваши впечатления о салоне...'
          }
        ]
      }
    } else if (noteType === 'master_in_salon') {
      return {
        title: `Заметки о записи: ${booking.master_name} (${booking.salon_name})`,
        fields: [
          {
            label: 'Заметка о салоне',
            value: salonNote,
            onChange: setSalonNote,
            placeholder: 'Опишите ваши впечатления о салоне...'
          },
          {
            label: 'Заметка о мастере',
            value: masterNote,
            onChange: setMasterNote,
            placeholder: 'Опишите ваши впечатления о мастере...'
          }
        ]
      }
    } else if (noteType === 'indie_master') {
      return {
        title: `Заметка о мастере ${booking.master_name}`,
        fields: [
          {
            label: 'Заметка о мастере',
            value: masterNote,
            onChange: setMasterNote,
            placeholder: 'Опишите ваши впечатления о мастере...'
          }
        ]
      }
    }
    
    return { title: 'Заметка', fields: [] }
  }

  const { title, fields } = getModalContent()
  const { handleBackdropClick, handleMouseDown } = useModal(onClose)

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button 
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">Загрузка заметок...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Поля для заметок */}
            {fields.map((field, index) => (
              <div key={index}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {field.label}
                </label>
                <textarea
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.placeholder}
                  maxLength={400}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <div className="text-sm text-gray-500 mt-1 text-right">
                  {field.value.length}/400 символов
                </div>
              </div>
            ))}

            {/* Кнопки действий */}
            <div className="flex justify-end space-x-3 pt-4">
              {(existingSalonNote || existingMasterNote) && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Удаление...' : 'Удалить заметки'}
                </button>
              )}
              
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Отмена
              </button>
              
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ClientNoteModal
