import React, { useState, useEffect } from 'react'
import { PencilIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline'

const ClientSalonNote = ({ salonId, branchId, salonName, branchName, onNoteChange }) => {
  const [note, setNote] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Загружаем существующую заметку при монтировании
  useEffect(() => {
    loadNote()
  }, [salonId, branchId])

  const loadNote = async () => {
    try {
      let url = `/client/salon-notes/${salonId}`
      if (branchId) {
        url += `?branch_id=${branchId}`
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setNote(data.note)
      } else if (response.status === 404) {
        // Заметка не найдена - это нормально
        setNote('')
      }
    } catch (err) {
      console.error('Ошибка загрузки заметки:', err)
    }
  }

  const saveNote = async () => {
    if (!note.trim()) {
      setError('Заметка не может быть пустой')
      return
    }

    if (note.length > 400) {
      setError('Заметка не может быть длиннее 400 символов')
      return
    }

    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/client/salon-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
          salon_id: salonId,
          branch_id: branchId,
          note: note.trim()
        })
      })

      if (response.ok) {
        setSuccess('Заметка сохранена')
        setIsEditing(false)
        if (onNoteChange) {
          onNoteChange(note.trim())
        }
        
        // Очищаем сообщение об успехе через 3 секунды
        setTimeout(() => setSuccess(''), 3000)
      } else {
        const errorData = await response.json()
        setError(`Ошибка сохранения: ${errorData.detail || 'Неизвестная ошибка'}`)
      }
    } catch (err) {
      console.error('Ошибка сохранения заметки:', err)
      setError('Ошибка сети при сохранении заметки')
    } finally {
      setIsLoading(false)
    }
  }

  const deleteNote = async () => {
    if (!confirm('Вы уверены, что хотите удалить эту заметку?')) {
      return
    }

    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      let url = `/client/salon-notes/${salonId}`
      if (branchId) {
        url += `?branch_id=${branchId}`
      }

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })

      if (response.ok) {
        setNote('')
        setSuccess('Заметка удалена')
        if (onNoteChange) {
          onNoteChange('')
        }
        
        // Очищаем сообщение об успехе через 3 секунды
        setTimeout(() => setSuccess(''), 3000)
      } else {
        const errorData = await response.json()
        setError(`Ошибка удаления: ${errorData.detail || 'Неизвестная ошибка'}`)
      }
    } catch (err) {
      console.error('Ошибка удаления заметки:', err)
      setError('Ошибка сети при удалении заметки')
    } finally {
      setIsLoading(false)
    }
  }

  const startEditing = () => {
    setIsEditing(true)
    setError('')
    setSuccess('')
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setError('')
    setSuccess('')
    // Восстанавливаем оригинальную заметку
    loadNote()
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      saveNote()
    }
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-700">
          📝 Моя заметка к салону
        </h4>
        <div className="flex items-center space-x-2">
          {!isEditing && note ? (
            <>
              <button
                onClick={startEditing}
                className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                title="Редактировать заметку"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
              <button
                onClick={deleteNote}
                disabled={isLoading}
                className="p-1 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50"
                title="Удалить заметку"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </>
          ) : !isEditing && !note ? (
            <button
              onClick={startEditing}
              className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
              title="Добавить заметку"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Введите вашу заметку о салоне (максимум 400 символов)..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows="3"
              maxLength="400"
            />
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-gray-500">
                {note.length}/400 символов
              </span>
              <span className="text-xs text-gray-400">
                Ctrl+Enter для сохранения
              </span>
            </div>
          </div>
          
          <div className="flex justify-end space-x-2">
            <button
              onClick={cancelEditing}
              disabled={isLoading}
              className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={saveNote}
              disabled={isLoading || !note.trim()}
              className="px-3 py-1 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          {note ? (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{note}</p>
              <div className="mt-2 text-xs text-gray-500">
                Обновлено: {new Date().toLocaleDateString('ru-RU')}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">Нет заметки</p>
              <p className="text-xs mt-1">Нажмите + чтобы добавить заметку</p>
            </div>
          )}
        </div>
      )}

      {/* Сообщения об ошибках и успехе */}
      {error && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      
      {success && (
        <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-600">{success}</p>
        </div>
      )}

      {/* Информация о салоне */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          <div>Салон: <span className="font-medium">{salonName}</span></div>
          {branchName && (
            <div>Филиал: <span className="font-medium">{branchName}</span></div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ClientSalonNote

