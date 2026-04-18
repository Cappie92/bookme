import React, { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { masterZClass } from '../config/masterOverlayZIndex'
import { useModal } from '../hooks/useModal'
import { useMasterOverlayScrollLock } from '../hooks/useMasterOverlayScrollLock'

export default function MasterLoyaltyHistoryFiltersModal({ isOpen, onClose, filters, onApply, onReset }) {
  const { handleBackdropClick, handleMouseDown } = useModal(onClose)
  
  const [draftFilters, setDraftFilters] = useState({
    clientId: '',
    transactionType: '',
    startDate: '',
    endDate: ''
  })

  useEffect(() => {
    if (isOpen) {
      setDraftFilters({
        clientId: filters.clientId || '',
        transactionType: filters.transactionType || '',
        startDate: filters.startDate || '',
        endDate: filters.endDate || ''
      })
    }
  }, [isOpen, filters])

  useMasterOverlayScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const handleApply = () => {
    onApply(draftFilters)
    onClose()
  }

  const handleReset = () => {
    const emptyFilters = {
      clientId: '',
      transactionType: '',
      startDate: '',
      endDate: ''
    }
    setDraftFilters(emptyFilters)
    onReset()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className={`fixed inset-0 ${masterZClass('base')} flex items-end justify-center bg-black/50 p-0 lg:items-center lg:p-4`}
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
      role="presentation"
    >
      <div
        className="flex max-h-[min(92dvh,720px)] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-xl lg:max-h-[80vh] lg:rounded-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="loyalty-filters-title"
      >
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 p-4 sm:p-6">
          <h2 id="loyalty-filters-title" className="text-lg font-semibold text-gray-900 sm:text-xl">
            Фильтры истории
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Закрыть"
          >
            <XMarkIcon className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 lg:pb-6">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Клиент (ID)
              </label>
              <input
                type="number"
                value={draftFilters.clientId}
                onChange={(e) => setDraftFilters({ ...draftFilters, clientId: e.target.value })}
                className="min-h-10 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4CAF50]"
                placeholder="ID клиента"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Тип операции
              </label>
              <select
                value={draftFilters.transactionType}
                onChange={(e) => setDraftFilters({ ...draftFilters, transactionType: e.target.value })}
                className="min-h-10 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4CAF50]"
              >
                <option value="">Все</option>
                <option value="earned">Начисление</option>
                <option value="spent">Списание</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Дата начала
              </label>
              <input
                type="date"
                value={draftFilters.startDate}
                onChange={(e) => setDraftFilters({ ...draftFilters, startDate: e.target.value })}
                className="min-h-10 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4CAF50]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Дата конца
              </label>
              <input
                type="date"
                value={draftFilters.endDate}
                onChange={(e) => setDraftFilters({ ...draftFilters, endDate: e.target.value })}
                className="min-h-10 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#4CAF50]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 p-4 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-3 sm:p-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-gray-300 px-4 py-3 text-gray-700 hover:bg-gray-50 sm:min-h-10 sm:py-2"
          >
            Закрыть
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="min-h-11 rounded-lg border border-gray-300 px-4 py-3 text-gray-700 hover:bg-gray-50 sm:min-h-10 sm:py-2"
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="min-h-11 rounded-lg bg-[#4CAF50] px-4 py-3 text-white hover:bg-[#45A049] sm:min-h-10 sm:py-2"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  )
}
