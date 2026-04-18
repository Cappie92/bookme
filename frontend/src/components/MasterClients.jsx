import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { masterZClass } from '../config/masterOverlayZIndex'
import { useMasterOverlayScrollLock } from '../hooks/useMasterOverlayScrollLock'
import { apiGet, apiPost, apiPatch, apiDelete } from '../utils/api'
import { PencilIcon, ChevronUpIcon, ChevronDownIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { formatMoney } from '../utils/formatMoney'
import NotePopover from './ui/NotePopover'
import MasterClientCampaignTab from './MasterClientCampaignTab'

const SORT_COLUMNS = {
  completed_count: 'Визиты',
  total_revenue: 'Доход',
  last_visit_at: 'Последний визит',
}

const MOBILE_SORT_OPTIONS = [
  { value: 'last_visit_at:desc', label: 'Последний визит (сначала новые)' },
  { value: 'last_visit_at:asc', label: 'Последний визит (сначала старые)' },
  { value: 'completed_count:desc', label: 'Больше визитов' },
  { value: 'completed_count:asc', label: 'Меньше визитов' },
  { value: 'total_revenue:desc', label: 'Доход (по убыванию)' },
  { value: 'total_revenue:asc', label: 'Доход (по возрастанию)' },
]

function SortableTh({ label, sortKey, sortBy, sortDir, onClick }) {
  const isActive = sortBy === sortKey
  return (
    <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        title={`Сортировать по: ${label}`}
        className={`group inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-medium transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-1 ${isActive ? 'text-gray-900' : 'text-gray-600'}`}
      >
        <span className="border-b border-transparent group-hover:border-gray-400">{label}</span>
        {isActive ? (
          sortDir === 'asc' ? <ChevronUpIcon className="w-4 h-4 flex-shrink-0" /> : <ChevronDownIcon className="w-4 h-4 flex-shrink-0" />
        ) : (
          <span className="inline-flex flex-col -my-0.5 opacity-50" aria-hidden>
            <ChevronUpIcon className="w-3 h-3 -mb-1" />
            <ChevronDownIcon className="w-3 h-3" />
          </span>
        )}
      </button>
    </th>
  )
}

export default function MasterClients({ onMetadataSaved }) {
  const [clientsSubtab, setClientsSubtab] = useState('base')
  const [searchParams, setSearchParams] = useSearchParams()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [detail, setDetail] = useState(null)
  const [showCancellations, setShowCancellations] = useState(false)
  const [showAddRestriction, setShowAddRestriction] = useState(false)
  const [showAddPersonalDiscount, setShowAddPersonalDiscount] = useState(false)
  const [personalDiscountPercent, setPersonalDiscountPercent] = useState('10')
  const [editAlias, setEditAlias] = useState('')
  const [editNote, setEditNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [notePopover, setNotePopover] = useState(null) // { clientKey, anchorRect } | null
  /** idle | loading | ready | error — загрузка карточки клиента (не путать со списком) */
  const [detailLoadState, setDetailLoadState] = useState('idle')

  const sortBy = searchParams.get('sort_by') || 'last_visit_at'
  const sortDir = searchParams.get('sort_dir') || 'desc'

  const setSort = useCallback((col, dir) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('sort_by', col)
      next.set('sort_dir', dir)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const handleSortClick = useCallback((col) => {
    const nextDir = col === sortBy
      ? (sortDir === 'asc' ? 'desc' : 'asc')
      : 'asc'
    setSort(col, nextDir)
  }, [sortBy, sortDir, setSort])

  useEffect(() => {
    loadClients()
  }, [sortBy, sortDir])

  const closeClientDetail = useCallback(() => {
    setSelectedClient(null)
    setDetail(null)
    setDetailLoadState('idle')
    setShowCancellations(false)
    setShowAddRestriction(false)
    setShowAddPersonalDiscount(false)
    setNotePopover(null)
    setPersonalDiscountPercent('10')
  }, [])

  useEffect(() => {
    if (!selectedClient) {
      setDetail(null)
      setDetailLoadState('idle')
      return
    }
    let cancelled = false
    setDetailLoadState('loading')
    setDetail(null)
    ;(async () => {
      try {
        const data = await apiGet(`/api/master/clients/${encodeURIComponent(selectedClient)}`)
        if (cancelled) return
        setDetail(data)
        setEditAlias(data.master_client_name ?? '')
        setEditNote(data.note ?? '')
        setDetailLoadState('ready')
      } catch {
        if (cancelled) return
        setDetail(null)
        setDetailLoadState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedClient])

  const refreshClientDetail = useCallback(async () => {
    if (!selectedClient) return
    try {
      const data = await apiGet(`/api/master/clients/${encodeURIComponent(selectedClient)}`)
      setDetail(data)
      setEditAlias(data.master_client_name ?? '')
      setEditNote(data.note ?? '')
      setDetailLoadState('ready')
    } catch {
      setDetail(null)
      setDetailLoadState('error')
    }
  }, [selectedClient])

  const loadClients = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      params.set('sort_by', sortBy)
      params.set('sort_dir', sortDir)
      const data = await apiGet(`/api/master/clients?${params}`)
      setClients(data)
      setError('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка загрузки')
      setClients([])
    } finally {
      setLoading(false)
    }
  }, [search, sortBy, sortDir])

  const handleSaveMetadata = async () => {
    if (!selectedClient) return
    setSaving(true)
    try {
      const payload = {
        alias_name: editAlias.trim() || null,
        note: editNote.length > 280 ? editNote.slice(0, 280) : (editNote.trim() || null),
      }
      await apiPatch(`/api/master/clients/${encodeURIComponent(selectedClient)}`, payload)
      if (import.meta.env?.DEV) {
        console.log('[MasterClients] PATCH clients OK:', { client_key: selectedClient, ...payload })
      }
      await refreshClientDetail()
      loadClients()
      onMetadataSaved?.()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleShowNote = useCallback((clientKey, e) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    if (notePopover?.clientKey === clientKey) {
      setNotePopover(null)
      return
    }
    setNotePopover({ clientKey, anchorRect: rect })
  }, [notePopover?.clientKey])

  const closeNotePopover = useCallback(() => setNotePopover(null), [])

  const handleAddRestriction = async (type) => {
    if (!selectedClient) return
    try {
      await apiPost(`/api/master/clients/${encodeURIComponent(selectedClient)}/restrictions`, {
        restriction_type: type,
        reason: null,
      })
      await refreshClientDetail()
      setShowAddRestriction(false)
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
  }

  const handleAddPersonalDiscount = async () => {
    if (!detail?.client_phone) return
    const pct = parseFloat(personalDiscountPercent)
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      alert('Введите корректный процент (1-100)')
      return
    }
    try {
      await apiPost('/api/loyalty/personal-discounts', {
        client_phone: detail.client_phone,
        discount_percent: pct,
        max_discount_amount: null,
        description: 'Персональная скидка',
      })
      await refreshClientDetail()
      setShowAddPersonalDiscount(false)
      setPersonalDiscountPercent('10')
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
  }

  const handleRemoveRestriction = async (rid) => {
    if (!selectedClient) return
    try {
      await apiDelete(`/api/master/clients/${encodeURIComponent(selectedClient)}/restrictions/${rid}`)
      await refreshClientDetail()
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка')
    }
  }

  const detailOverlayOpen =
    !!selectedClient || showAddRestriction || (showAddPersonalDiscount && !!detail?.client_phone)

  useMasterOverlayScrollLock(detailOverlayOpen)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (showAddPersonalDiscount) {
        setShowAddPersonalDiscount(false)
        return
      }
      if (showAddRestriction) {
        setShowAddRestriction(false)
        return
      }
      if (selectedClient) closeClientDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedClient, showAddRestriction, showAddPersonalDiscount, closeClientDetail])

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('ru-RU') : '—')

  const mobileSortValue = `${sortBy}:${sortDir}`

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold lg:text-2xl">Клиенты</h2>
      <div className="flex w-full rounded-lg bg-gray-100 p-1 sm:inline-flex sm:w-auto">
        <button
          type="button"
          onClick={() => setClientsSubtab('base')}
          className={`min-h-10 flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:min-h-0 sm:flex-none ${
            clientsSubtab === 'base'
              ? 'bg-white text-[#4CAF50] shadow-sm'
              : 'text-gray-700 hover:text-gray-900'
          }`}
        >
          База клиентов
        </button>
        <button
          type="button"
          onClick={() => setClientsSubtab('campaigns')}
          className={`min-h-10 flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:min-h-0 sm:flex-none ${
            clientsSubtab === 'campaigns'
              ? 'bg-white text-[#4CAF50] shadow-sm'
              : 'text-gray-700 hover:text-gray-900'
          }`}
        >
          Рассылки
        </button>
      </div>

      {clientsSubtab === 'campaigns' ? (
        <MasterClientCampaignTab />
      ) : (
        <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <input
          type="text"
          placeholder="Поиск по телефону или имени..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadClients()}
          className="min-h-10 w-full min-w-0 flex-1 rounded-lg border px-3 py-2 sm:max-w-md"
        />
        <button
          type="button"
          onClick={loadClients}
          className="min-h-10 w-full shrink-0 rounded-lg bg-[#4CAF50] px-4 py-2 text-white hover:opacity-90 sm:w-auto"
        >
          Найти
        </button>
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

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-gray-500">Загрузка...</p>}
      {!loading && clients.length === 0 && <p className="text-gray-500">Нет клиентов с завершёнными визитами</p>}
      {!loading && clients.length > 0 && (
        <div className="space-y-2 lg:hidden">
          {clients.map((c) => (
            <button
              key={c.client_key}
              type="button"
              onClick={() => setSelectedClient(c.client_key)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors active:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">
                  {c.master_client_name || c.client_phone || 'Клиент'}
                </p>
                <div className="flex shrink-0 items-center gap-0.5">
                  {c.has_note ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleShowNote(c.client_key, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation()
                          e.preventDefault()
                          handleShowNote(c.client_key, e)
                        }
                      }}
                      className="inline-flex shrink-0 rounded-md p-1.5 text-gray-700 hover:bg-gray-100"
                      aria-label="Показать заметку"
                    >
                      <InformationCircleIcon className="h-4 w-4" />
                    </span>
                  ) : null}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedClient(c.client_key)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        e.preventDefault()
                        setSelectedClient(c.client_key)
                      }
                    }}
                    className="inline-flex shrink-0 rounded-md p-1.5 text-[#4CAF50] hover:bg-green-50"
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
      )}
      {!loading && clients.length > 0 && (
        <div className="hidden overflow-hidden rounded-lg border lg:block">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase">Телефон</th>
                {(['completed_count', 'total_revenue', 'last_visit_at']).map((col) => (
                  <SortableTh
                    key={col}
                    label={SORT_COLUMNS[col]}
                    sortKey={col}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onClick={handleSortClick}
                  />
                ))}
                <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm">
              {clients.map((c) => (
                <tr key={c.client_key} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="min-w-0 font-medium">{c.master_client_name || c.client_phone || 'Клиент'}</span>
                      {c.client_phone && c.master_client_name ? (
                        <span className="shrink-0 text-gray-500">{c.client_phone}</span>
                      ) : null}
                      {c.has_note ? (
                        <button
                          type="button"
                          onClick={(e) => handleShowNote(c.client_key, e)}
                          className="note-trigger-btn shrink-0 cursor-pointer rounded p-0.5 text-gray-900 no-underline hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
                          aria-label="Показать заметку"
                          title="Показать заметку"
                        >
                          <InformationCircleIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">{c.completed_count}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{formatMoney(c.total_revenue)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{formatDate(c.last_visit_at)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => { setSelectedClient(c.client_key); setEditAlias(c.master_client_name || ''); setEditNote(c.note || ''); }}
                      className="inline-flex rounded-md p-1.5 text-[#4CAF50] hover:bg-green-50"
                      aria-label="Редактировать"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedClient && (
        <div
          className={`fixed inset-0 ${masterZClass('base')} flex items-end justify-center bg-black/50 p-0 lg:items-center lg:p-4`}
          onClick={closeClientDetail}
          role="presentation"
        >
          <div
            className="max-h-[min(92dvh,920px)] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl lg:max-h-[90vh] lg:rounded-xl lg:p-6 lg:pb-6 lg:shadow-none"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="master-client-detail-title"
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 id="master-client-detail-title" className="text-lg font-semibold break-words">
                  {detailLoadState === 'loading' && 'Загрузка…'}
                  {detailLoadState === 'error' && 'Не удалось загрузить'}
                  {detailLoadState === 'ready' && detail &&
                    (detail.master_client_name || detail.client_phone || 'Клиент')}
                </h3>
                {detailLoadState === 'ready' && detail?.client_phone && (
                  <p className="mt-0.5 break-all text-sm text-gray-500">{detail.client_phone}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeClientDetail}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Закрыть"
              >
                <XMarkIcon className="h-6 w-6" strokeWidth={2} />
              </button>
            </div>
            {detailLoadState === 'loading' && (
              <div className="flex justify-center py-12 text-gray-500">Загрузка карточки…</div>
            )}
            {detailLoadState === 'error' && (
              <div className="space-y-4 text-sm">
                <p className="text-gray-600">Проверьте соединение и попробуйте снова.</p>
                <button
                  type="button"
                  onClick={() => refreshClientDetail()}
                  className="min-h-11 w-full rounded-lg border border-gray-300 px-4 py-3 font-medium hover:bg-gray-50 lg:w-auto lg:py-2"
                >
                  Повторить
                </button>
              </div>
            )}
            {detailLoadState === 'ready' && detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <p><span className="text-gray-500">Завершённых визитов:</span> {detail.completed_count}</p>
                <p className="text-red-600">
                  <span className="font-medium">Отменённых:</span>{' '}
                  <button
                    type="button"
                    onClick={() => setShowCancellations(!showCancellations)}
                    className="text-red-600 font-semibold hover:underline"
                  >
                    {detail.cancelled_count}
                  </button>
                </p>
                <p><span className="text-gray-500">Последний визит:</span> {formatDate(detail.last_visit_at)}</p>
                <p><span className="text-gray-500">Доход всего:</span> {formatMoney(detail.total_revenue)}</p>
              </div>
              {showCancellations && detail.cancellations_breakdown?.length > 0 && (
                <div className="border rounded p-3 bg-gray-50">
                  <p className="font-medium mb-2">Причины отмен:</p>
                  {detail.cancellations_breakdown.map((cb, i) => (
                    <p key={i}>{cb.reason_label}: {cb.count}</p>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-gray-500 mb-1">Имя клиента (для вас)</label>
                <p className="text-xs text-gray-400 mb-1">Это имя видно только вам и используется в записях и дашборде.</p>
                <input value={editAlias} onChange={(e) => setEditAlias(e.target.value)} className="min-h-10 w-full rounded border px-3 py-2" placeholder="Как вы зовёте клиента" />
              </div>
              <div>
                <label className="block text-gray-500 mb-1">Заметка (макс. 280)</label>
                <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} maxLength={280} rows={3} className="min-h-[5rem] w-full rounded border px-3 py-2" />
                <span className="text-gray-400 text-xs">{editNote.length}/280</span>
              </div>
              <button
                type="button"
                onClick={handleSaveMetadata}
                disabled={saving}
                className="min-h-11 w-full rounded-lg bg-[#4CAF50] px-4 py-3 text-white hover:opacity-90 disabled:opacity-50 sm:min-h-0 sm:w-auto sm:py-2"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <div>
                <p className="font-medium mb-2">Скидки</p>
                {detail.applicable_discounts?.length > 0 ? (
                  <ul className="space-y-1">
                    {detail.applicable_discounts.map((d, i) => (
                      <li key={i}>{d.name} — {d.discount_percent}%</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">У клиента нет скидок</p>
                )}
                <button onClick={() => setShowAddPersonalDiscount(true)} className="mt-2 text-[#4CAF50] hover:underline text-sm">
                  + Добавить персональную скидку
                </button>
              </div>
              <div>
                <p className="font-medium mb-2">Ограничения</p>
                {detail.restrictions?.length > 0 ? (
                  <ul className="space-y-1">
                    {detail.restrictions.map((r) => (
                      <li key={r.id} className="flex justify-between">
                        <span>{r.type === 'blacklist' ? 'Черный список' : 'Предоплата'}{r.reason ? `: ${r.reason}` : ''}</span>
                        <button onClick={() => handleRemoveRestriction(r.id)} className="text-red-600 text-xs">Удалить</button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">Ограничений нет</p>
                )}
                <button onClick={() => setShowAddRestriction(true)} className="mt-2 text-[#4CAF50] hover:underline text-sm">
                  + Добавить ограничение
                </button>
              </div>
              {detail.top_services?.length > 0 && (
                <div>
                  <p className="font-medium mb-2">Популярные услуги</p>
                  <ul>
                    {detail.top_services.map((s, i) => (
                      <li key={i}>{s.service_name} — {s.count} раз</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      )}

      {notePopover && (
        <div className="hidden lg:block">
          <NotePopover
            clientKey={notePopover.clientKey}
            anchorRect={notePopover.anchorRect}
            onClose={closeNotePopover}
          />
        </div>
      )}

      {showAddRestriction && selectedClient && (
        <div
          className={`fixed inset-0 ${masterZClass('nested')} flex items-end justify-center bg-black/50 p-0 lg:items-center lg:p-4`}
          onClick={() => setShowAddRestriction(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-6 lg:rounded-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h4 className="mb-4 font-medium">Добавить ограничение</h4>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleAddRestriction('blacklist')}
                className="block min-h-11 w-full rounded-lg border px-4 py-3 text-left hover:bg-gray-50 lg:min-h-0 lg:py-2"
              >
                Черный список
              </button>
              <button
                type="button"
                onClick={() => handleAddRestriction('advance_payment_only')}
                className="block min-h-11 w-full rounded-lg border px-4 py-3 text-left hover:bg-gray-50 lg:min-h-0 lg:py-2"
              >
                Только предоплата
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowAddRestriction(false)}
              className="mt-4 min-h-10 w-full text-gray-500 lg:w-auto"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {showAddPersonalDiscount && detail?.client_phone && (
        <div
          className={`fixed inset-0 ${masterZClass('nested')} flex items-end justify-center bg-black/50 p-0 lg:items-center lg:p-4`}
          onClick={() => setShowAddPersonalDiscount(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-6 lg:rounded-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h4 className="mb-4 font-medium">Добавить персональную скидку</h4>
            <p className="mb-2 break-all text-sm text-gray-500">Клиент: {detail.client_phone}</p>
            <label className="mb-1 block text-sm">Процент скидки</label>
            <input
              type="number"
              min="1"
              max="100"
              value={personalDiscountPercent}
              onChange={(e) => setPersonalDiscountPercent(e.target.value)}
              className="mb-4 min-h-10 w-full rounded border px-3 py-2"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleAddPersonalDiscount}
                className="min-h-11 rounded-lg bg-[#4CAF50] px-4 py-3 text-white lg:min-h-0 lg:py-2"
              >
                Добавить
              </button>
              <button
                type="button"
                onClick={() => setShowAddPersonalDiscount(false)}
                className="min-h-11 rounded-lg px-4 py-3 text-gray-600 hover:bg-gray-50 lg:min-h-0 lg:py-2"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
