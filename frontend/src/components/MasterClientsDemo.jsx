import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { PencilIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { masterZClass } from '../config/masterOverlayZIndex'
import { useMasterOverlayScrollLock } from '../hooks/useMasterOverlayScrollLock'
import { formatMoney } from '../utils/formatMoney'
import { clientsDemo } from 'shared/demo'

const MOBILE_SORT_OPTIONS = [
  { value: 'last_visit_at:desc', label: 'Последний визит (сначала новые)' },
  { value: 'last_visit_at:asc', label: 'Последний визит (сначала старые)' },
  { value: 'completed_count:desc', label: 'Больше визитов' },
  { value: 'completed_count:asc', label: 'Меньше визитов' },
  { value: 'total_revenue:desc', label: 'Доход (по убыванию)' },
  { value: 'total_revenue:asc', label: 'Доход (по возрастанию)' },
]

/**
 * Демо-режим раздела «Клиенты» — отображает статичные данные без API.
 * Показывается при !hasClientsAccess. Редактирование и поиск по API отключены.
 * Вёрстка согласована с MasterClients: карточки на &lt;lg, таблица на lg+.
 */
export default function MasterClientsDemo() {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('last_visit_at')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedKey, setSelectedKey] = useState(null)

  const setSort = useCallback((col, dir) => {
    setSortBy(col)
    setSortDir(dir)
  }, [])

  const filteredAndSorted = useMemo(() => {
    let list = [...clientsDemo]
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((c) => {
        const name = (c.master_client_name || c.client_phone || '').toLowerCase()
        const phone = (c.client_phone || '').replace(/\D/g, '')
        const qDigits = q.replace(/\D/g, '')
        return name.includes(q) || (qDigits && phone.includes(qDigits))
      })
    }
    list.sort((a, b) => {
      let va = a[sortBy]
      let vb = b[sortBy]
      if (sortBy === 'last_visit_at') {
        va = va ? new Date(va).getTime() : 0
        vb = vb ? new Date(vb).getTime() : 0
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      va = String(va || '')
      vb = String(vb || '')
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return list
  }, [search, sortBy, sortDir])

  const displayName = (c) => c.master_client_name || c.client_phone || 'Клиент'
  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('ru-RU') : '—')

  const detail = selectedKey ? clientsDemo.find((c) => c.client_key === selectedKey) : null

  const SORT_COLUMNS = { completed_count: 'Визиты', total_revenue: 'Доход', last_visit_at: 'Последний визит' }

  const handleSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else setSortBy(col)
  }

  const closeDetail = useCallback(() => setSelectedKey(null), [])

  useMasterOverlayScrollLock(!!selectedKey)

  useEffect(() => {
    if (!selectedKey) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedKey, closeDetail])

  const mobileSortValue = `${sortBy}:${sortDir}`

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold lg:text-2xl">Клиенты</h2>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <input
          type="text"
          placeholder="Поиск по телефону или имени..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-10 w-full min-w-0 flex-1 rounded-lg border px-3 py-2 sm:max-w-md"
        />
        <span className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-800 sm:min-h-0">
          Демо
        </span>
      </div>

      <div className="lg:hidden">
        <label className="mb-1 block text-xs font-medium text-gray-500">Сортировка</label>
        <select
          value={mobileSortValue}
          onChange={(e) => {
            const [col, dir] = e.target.value.split(':')
            setSort(col, dir)
          }}
          className="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {MOBILE_SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {filteredAndSorted.length === 0 ? (
        <p className="text-gray-500">Нет записей по фильтру</p>
      ) : (
        <>
          <div className="space-y-2 lg:hidden">
            {filteredAndSorted.map((c) => (
              <button
                key={c.client_key}
                type="button"
                onClick={() => setSelectedKey(c.client_key)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors active:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">{displayName(c)}</p>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {c.has_note ? (
                      <span className="inline-flex shrink-0 p-1.5 text-amber-800" title="Есть заметка" aria-label="Есть заметка">
                        <InformationCircleIcon className="h-4 w-4" aria-hidden />
                      </span>
                    ) : null}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedKey(c.client_key)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation()
                          e.preventDefault()
                          setSelectedKey(c.client_key)
                        }
                      }}
                      className="inline-flex shrink-0 rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
                      aria-label="Открыть карточку"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </span>
                  </div>
                </div>
                <p className="mt-1 truncate text-sm text-gray-600">
                  {c.completed_count} визитов · {formatMoney(c.total_revenue)} · {formatDate(c.last_visit_at)}
                </p>
              </button>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-lg border lg:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-1.5 text-left text-xs font-medium uppercase text-gray-500">Телефон</th>
                  {Object.entries(SORT_COLUMNS).map(([key, label]) => (
                    <th key={key} className="px-3 py-1.5 text-left text-xs font-medium uppercase text-gray-500">
                      <button type="button" onClick={() => handleSort(key)} className="hover:underline">
                        {label}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-1.5 text-right text-xs font-medium uppercase text-gray-500">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white text-sm">
                {filteredAndSorted.map((c) => (
                  <tr key={c.client_key} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{displayName(c)}</span>
                        {c.has_note && <InformationCircleIcon className="h-4 w-4 text-gray-400" />}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">{c.completed_count}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{formatMoney(c.total_revenue)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{formatDate(c.last_visit_at)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedKey(c.client_key)}
                        className="inline-flex rounded-md p-1.5 text-gray-600 hover:bg-gray-100"
                        aria-label="Открыть карточку"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detail && (
        <div
          className={`fixed inset-0 ${masterZClass('base')} flex items-end justify-center bg-black/50 p-0 lg:items-center lg:p-4`}
          onClick={closeDetail}
          role="presentation"
        >
          <div
            className="max-h-[min(92dvh,920px)] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl lg:max-h-[90vh] lg:rounded-xl lg:p-6 lg:pb-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-client-detail-title"
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 id="demo-client-detail-title" className="break-words text-lg font-semibold">
                  {displayName(detail)}
                </h3>
                {detail.client_phone && (
                  <p className="mt-0.5 break-all text-sm text-gray-500">{detail.client_phone}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Закрыть"
              >
                <XMarkIcon className="h-6 w-6" strokeWidth={2} />
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <p>
                <span className="text-gray-500">Завершённых визитов:</span> {detail.completed_count}
              </p>
              <p>
                <span className="text-gray-500">Доход всего:</span> {formatMoney(detail.total_revenue)}
              </p>
              <p>
                <span className="text-gray-500">Последний визит:</span> {formatDate(detail.last_visit_at)}
              </p>
              <p className="text-xs text-amber-600">Редактирование доступно в полной версии</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
