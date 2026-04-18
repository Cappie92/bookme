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
      <div className="py-4 lg:py-8">
        <div className="max-w-4xl mx-auto px-3 sm:px-4">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#4CAF50] mx-auto" />
            <p className="mt-3 text-sm text-gray-600">Загружаем заметки…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="py-4 lg:py-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6">
        <div className="mb-3 lg:mb-5">
          <h1 className="text-lg lg:text-xl font-semibold text-gray-900">Заметки</h1>
          <p className="text-gray-600 text-sm mt-1">
            Заметки о мастерах и салонах из ваших записей
          </p>
        </div>

        {/* Поиск */}
        <div className="mb-4">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
            <input
              type="search"
              enterKeyHint="search"
              placeholder="Имя, салон или текст…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#4CAF50]/40 focus:border-[#4CAF50] text-base lg:text-sm bg-white min-h-[44px]"
            />
          </div>
        </div>

        {/* Статистика */}
        <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-white rounded-lg border border-gray-100 px-2.5 py-2 sm:px-3 sm:py-2.5 shadow-sm">
            <div className="text-base sm:text-lg font-bold text-[#4CAF50] leading-tight tabular-nums">
              {(Array.isArray(notes) ? notes : []).length}
            </div>
            <div className="text-[11px] sm:text-xs text-gray-600 leading-tight">Заметок</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 px-2.5 py-2 sm:px-3 sm:py-2.5 shadow-sm">
            <div className="text-base sm:text-lg font-bold text-gray-800 leading-tight tabular-nums">
              {new Set((Array.isArray(notes) ? notes : []).map(note => note.master_id)).size}
            </div>
            <div className="text-[11px] sm:text-xs text-gray-600 leading-tight">Мастеров</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 px-2.5 py-2 sm:px-3 sm:py-2.5 shadow-sm">
            <div className="text-base sm:text-lg font-bold text-gray-800 leading-tight tabular-nums">
              {new Set((Array.isArray(notes) ? notes : []).map(note => note.salon_id)).size}
            </div>
            <div className="text-[11px] sm:text-xs text-gray-600 leading-tight">Салонов</div>
          </div>
        </div>

        {/* Сообщения об ошибках */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
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
          <div className="rounded-xl border border-dashed border-gray-200 bg-white/80 px-4 py-10 text-center">
            {searchQuery ? (
              <div>
                <MagnifyingGlassIcon className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  Ничего не найдено
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  По запросу «{searchQuery}»
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-sm font-medium text-[#4CAF50] hover:text-[#45A049] min-h-[44px] px-2"
                >
                  Сбросить поиск
                </button>
              </div>
            ) : (
              <div>
                <PencilIcon className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  Пока нет заметок
                </h3>
                <p className="text-sm text-gray-600 max-w-sm mx-auto">
                  Добавляйте заметки к записям в личном кабинете
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3 sm:p-4 lg:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
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
