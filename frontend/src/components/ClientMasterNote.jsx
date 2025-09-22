import React, { useState, useEffect } from 'react'
import { PencilIcon } from '@heroicons/react/24/outline'
import { apiGet, apiPost, apiDelete } from '../utils/api'

const ClientMasterNote = ({ masterId, salonId, masterName, salonName, branchId, branchName, onNoteChange }) => {
  const [masterNote, setMasterNote] = useState('')

  // Загружаем существующие заметки при монтировании
  useEffect(() => {
    loadNotes()
  }, [masterId, salonId])

  const loadNotes = async () => {
    try {
      // Загружаем заметку о мастере
      try {
        const masterData = await apiGet(`client/master-notes/${masterId}`)
        if (masterData.note) {
          setMasterNote(masterData.note)
        }
      } catch (error) {
        // Заметка о мастере не найдена - это нормально
        console.log('Заметка о мастере не найдена')
      }


    } catch (error) {
      console.error('Ошибка загрузки заметок:', error)
    }
  }

  const saveMasterNote = async () => {
    if (!masterNote.trim()) {
      return
    }

    try {
      await apiPost(`client/master-notes/${masterId}`, { note: masterNote })
      if (onNoteChange) onNoteChange()
    } catch (error) {
      console.error('Ошибка сохранения заметки:', error)
    }
  }



  const deleteMasterNote = async () => {
    try {
      await apiDelete(`client/master-notes/${masterId}`)
      setMasterNote('')
      if (onNoteChange) onNoteChange()
    } catch (error) {
      console.error('Ошибка удаления заметки:', error)
    }
  }



  const displayName = branchName ? `${salonName} (${branchName})` : salonName

  return (
    <button
      onClick={() => {
        // Простое редактирование заметки
        const newNote = prompt('Редактировать заметку о мастере:', masterNote || '')
        if (newNote !== null) {
          setMasterNote(newNote)
          if (newNote.trim()) {
            saveMasterNote()
          } else if (masterNote) {
            deleteMasterNote()
          }
        }
      }}
      className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
      title="Редактировать заметку"
    >
      <PencilIcon className="h-4 w-4" />
    </button>
  )
}

export default ClientMasterNote
