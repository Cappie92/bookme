import React, { useState, useEffect } from 'react'
import { HandThumbDownIcon, PencilSquareIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { getImageUrl } from '../../utils/config'
import { formatTimezoneLabel } from '../../utils/dateFormat'
import FavoriteButton from '../FavoriteButton'

export default function MasterBookingSidebar({
  ownerInfo,
  ownerType,
  ownerId,
  currentUser,
  /** IANA timezone мастера для блока "Время записи" (например Europe/Moscow) */
  masterTimezone = null,
}) {
  const [note, setNote] = useState(null)
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteLoading, setNoteLoading] = useState(false)
  const [rating, setRating] = useState(null)
  const [ratingLoading, setRatingLoading] = useState(false)

  useEffect(() => {
    if (currentUser && ownerId) {
      loadNote()
    } else {
      setNote(null)
      setNoteText('')
      setRating(null)
    }
  }, [currentUser, ownerId])

  const loadNote = async () => {
    if (!currentUser || !ownerId) return
    
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/client/profile/master-notes/${ownerId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setNote(data)
        setNoteText(data.note || '')
        setRating(data.rating || null)
      } else if (response.status === 404) {
        // Заметки нет, это нормально
        setNote(null)
        setNoteText('')
        setRating(null)
      }
    } catch (error) {
      console.error('Ошибка загрузки заметки:', error)
    }
  }

  const handleSaveNote = async () => {
    if (!currentUser || !ownerId) return
    
    setNoteLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      // Для индивидуальных мастеров salon_id может быть null
      const salonId = null
      
      const response = await fetch('/api/client/profile/master-notes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          master_id: ownerId,
          salon_id: salonId,
          note: noteText
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        setNote(data)
        setIsEditingNote(false)
      } else {
        console.error('Ошибка сохранения заметки')
      }
    } catch (error) {
      console.error('Ошибка сохранения заметки:', error)
    } finally {
      setNoteLoading(false)
    }
  }

  const handleCancelEdit = () => {
    setNoteText(note?.note || '')
    setIsEditingNote(false)
  }

  const handleToggleRating = async () => {
    if (!currentUser || !ownerId) return
    
    setRatingLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const newRating = rating === 'dislike' ? null : 'dislike'
      
      const response = await fetch(`/api/client/profile/master-notes/${ownerId}/rating`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rating: newRating
        })
      })
      
      if (response.ok) {
        setRating(newRating)
        // Обновляем заметку, если её нет, она будет создана
        if (!note) {
          loadNote()
        }
      } else {
        console.error('Ошибка сохранения оценки')
      }
    } catch (error) {
      console.error('Ошибка сохранения оценки:', error)
    } finally {
      setRatingLoading(false)
    }
  }

  if (!ownerInfo) return null

  return (
    <aside className="hidden md:block w-64 bg-white border-r border-gray-200 fixed left-0 top-24 h-[calc(100vh-96px)] overflow-y-auto shadow-sm z-30">
      <div className="p-6 space-y-6">
        {/* Фото мастера */}
        {ownerInfo.logo && (
          <div className="flex justify-center">
            <img 
              src={getImageUrl(ownerInfo.logo)}
              alt={ownerInfo.name}
              className="w-[150px] h-[150px] rounded-lg object-cover"
            />
          </div>
        )}

        {/* Текстовый блок */}
        {ownerInfo.site_description && (
          <div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {ownerInfo.site_description}
            </p>
          </div>
        )}

        {/* Адрес */}
        {(ownerInfo.address || ownerInfo.city) && (
          <div data-testid="public-master-address">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Адрес</h3>
            <p className="text-sm text-gray-700">
              {ownerInfo.city}
              {ownerInfo.address && (
                <span className="block mt-1">{ownerInfo.address}</span>
              )}
            </p>
          </div>
        )}

        {/* Время записи (таймзона мастера) — один раз, человекочитаемо */}
        {masterTimezone && (
          <div data-testid="public-master-timezone">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Время записи</h3>
            <p className="text-sm text-gray-700">{formatTimezoneLabel(masterTimezone)}</p>
          </div>
        )}

        {/* Номер телефона */}
        {ownerInfo.phone && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Телефон</h3>
            <a 
              href={`tel:${ownerInfo.phone}`}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {ownerInfo.phone}
            </a>
          </div>
        )}

        {/* Особые заметки (только для авторизованных) */}
        {currentUser && (
          <div className="border-t pt-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-4">Особые заметки</h3>
            
            {/* Заметки */}
            <div className="mb-4">
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700">Заметки</h4>
                {!isEditingNote && (
                  <button
                    onClick={() => setIsEditingNote(true)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Редактировать заметку"
                  >
                    <PencilSquareIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {isEditingNote ? (
                <div className="space-y-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows="3"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    placeholder="Введите заметку..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveNote}
                      disabled={noteLoading}
                      className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      <CheckIcon className="w-3 h-3" />
                      Сохранить
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300 transition-colors"
                    >
                      <XMarkIcon className="w-3 h-3" />
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <p className={`text-sm ${note?.note ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                  {note?.note || 'Заметки пока нет'}
                </p>
              )}
            </div>

            {/* Отметка */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Отметка</h4>
              <div className="flex items-center gap-3">
                <FavoriteButton
                  type={ownerType === 'master' || ownerType === 'indie_master' ? 'indie_master' : 'master'}
                  itemId={ownerId}
                  itemName={ownerInfo.name}
                  size="md"
                />
                <button
                  onClick={handleToggleRating}
                  disabled={ratingLoading}
                  className={`p-2 rounded transition-colors ${
                    rating === 'dislike' 
                      ? 'text-red-600 bg-red-50 hover:bg-red-100' 
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  } disabled:opacity-50`}
                  title={rating === 'dislike' ? 'Убрать отметку "Не понравилось"' : 'Отметить "Не понравилось"'}
                >
                  <HandThumbDownIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

