import React, { useState, useEffect } from 'react'
import { PencilIcon, TrashIcon, PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ClientMasterNote from '../components/ClientMasterNote'
import { apiGet } from '../utils/api'

const ClientMasterNotes = () => {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredNotes, setFilteredNotes] = useState([])

  useEffect(() => {
    loadNotes()
  }, [])

  useEffect(() => {
    // Фильтруем заметки по поисковому запросу
    if (searchQuery.trim()) {
      const filtered = (Array.isArray(notes) ? notes : []).filter(note => 
        note.master_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.salon_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.note.toLowerCase().includes(searchQuery.toLowerCase())
      )
      setFilteredNotes(filtered)
    } else {
      setFilteredNotes(Array.isArray(notes) ? notes : [])
    }
  }, [searchQuery, notes])

  const loadNotes = async () => {
    try {
      setLoading(true)
      const data = await apiGet('client/all-notes')
      const notesArray = Array.isArray(data) ? data : (data?.notes || [])
      setNotes(notesArray)
      setFilteredNotes(notesArray)
      setError('')
    } catch (err) {
      console.error('Ошибка загрузки заметок:', err)
      setError('Ошибка при загрузке заметок')
    } finally {
      setLoading(false)
    }
  }

  const handleNoteChange = (noteId, newNote) => {
    setNotes(prevNotes => 
      prevNotes.map(note => 
        note.id === noteId 
          ? { ...note, note: newNote, updated_at: new Date().toISOString() }
          : note
      )
    )
  }

  const handleNoteDelete = (noteId) => {
    setNotes(prevNotes => prevNotes.filter(note => note.id !== noteId))
  }



  if (loading) {
    return (
      <div className="py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Загружаем заметки...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="py-8">
      <div className="max-w-7xl mx-auto px-6 pt-8">
        {/* Описание */}
        <div className="mb-6 text-center">
          <p className="text-gray-600">
            Здесь вы можете просматривать и управлять всеми вашими заметками о мастерах
          </p>
        </div>

        {/* Поиск */}
        <div className="mb-6">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по имени мастера, салону или тексту заметки..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Статистика */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-blue-600">{(Array.isArray(notes) ? notes : []).length}</div>
            <div className="text-sm text-gray-600">Всего заметок</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-green-600">
              {new Set((Array.isArray(notes) ? notes : []).map(note => note.master_id)).size}
            </div>
            <div className="text-sm text-gray-600">Мастера</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-purple-600">
              {new Set((Array.isArray(notes) ? notes : []).map(note => note.salon_id)).size}
            </div>
            <div className="text-sm text-gray-600">Салоны</div>
          </div>
        </div>

        {/* Сообщения об ошибках */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
            <button
              onClick={loadNotes}
              className="mt-2 text-sm text-red-600 hover:text-red-700 underline"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {/* Список заметок */}
        {filteredNotes.length === 0 ? (
          <div className="text-center py-12">
            {searchQuery ? (
              <div>
                <div className="text-gray-400 mb-4">
                  <MagnifyingGlassIcon className="h-16 w-16 mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Заметки не найдены
                </h3>
                <p className="text-gray-600 mb-4">
                  По запросу "{searchQuery}" ничего не найдено
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-blue-600 hover:text-blue-700 underline"
                >
                  Очистить поиск
                </button>
              </div>
            ) : (
              <div>
                <div className="text-gray-400 mb-4">
                  <PencilIcon className="h-16 w-16 mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  У вас пока нет заметок
                </h3>
                <p className="text-gray-600">
                  Создавайте заметки о мастерах при бронировании услуг
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredNotes.map((note, index) => (
              <div key={`${note.type}-${note.id}-${index}`} className="bg-gray-50 rounded-lg border p-3 flex flex-col h-full">
                  {/* Заголовок заметки */}
                  <div className="mb-2 flex-grow">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        note.type === 'master' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {note.type === 'master' ? 'О мастере' : 'О салоне'}
                      </span>
                      <h3 className="font-medium text-gray-900 text-sm">
                        {note.type === 'master' 
                          ? (note.master_name || 'Неизвестный мастер')
                          : (note.salon_name || 'Неизвестный салон')
                        }
                      </h3>
                    </div>
                    {note.type === 'master' && note.salon_name && (
                      <p className="text-xs text-gray-600">
                        {note.salon_name}
                      </p>
                    )}
                    {note.type === 'salon' && note.branch_name && (
                      <p className="text-xs text-gray-600">
                        Филиал: {note.branch_name}
                      </p>
                    )}
                  </div>

                  {/* Текст заметки */}
                  <div className="mb-2 flex-grow">
                    <p className="text-gray-800 whitespace-pre-wrap text-sm">{note.note}</p>
                  </div>

                  {/* Действия - всегда внизу */}
                  <div className="flex justify-end mt-auto">
                    {note.type === 'master' ? (
                      <ClientMasterNote
                        masterId={note.master_id}
                        salonId={note.salon_id}
                        masterName={note.master_name}
                        salonName={note.salon_name}
                        onNoteChange={(newNote) => handleNoteChange(note.id, newNote)}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          // Для заметок о салонах пока просто показываем информацию
                          alert('Заметка о салоне. Редактирование через модальное окно записи.')
                        }}
                        className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                        title="Редактировать заметку"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
              </div>
            ))}
            </div>
          </div>
        )}


      </div>
    </div>
  )
}

export default ClientMasterNotes
