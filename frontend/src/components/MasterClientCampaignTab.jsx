import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { getMasterCampaignChannelSummary } from '../services/contactPreferences'
import {
  CONTACT_CHANNEL_LABELS,
  SMS_SEGMENT_CHAR_LIMIT,
  countSmsSegments,
  computeCampaignChannelTotal,
  buildMasterPublicBookingUrl,
  appendPublicLinkToMessage,
} from 'shared/contactChannels'
import { IS_MAILING_FEATURE_LOCKED } from 'shared/mailingFeatureLocked'
import { formatMoney } from '../utils/formatMoney'
import { apiGet } from '../utils/api'

const CHANNEL_ORDER = ['push', 'email', 'sms']

export default function MasterClientCampaignTab() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [message, setMessage] = useState('')
  const [masterDomain, setMasterDomain] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const data = await getMasterCampaignChannelSummary()
        if (!cancelled) {
          setSummary(data)
          setError('')
        }
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.detail || e?.message || 'Не удалось загрузить каналы')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await apiGet('/api/master/settings')
        const domain = data?.master?.domain ?? null
        if (!cancelled) setMasterDomain(domain ? String(domain).trim() : null)
      } catch {
        if (!cancelled) setMasterDomain(null)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const channels = useMemo(() => {
    const list = summary?.channels || []
    const by = Object.fromEntries(list.map((c) => [c.channel, c]))
    return CHANNEL_ORDER.map((k) => by[k]).filter(Boolean)
  }, [summary])

  const selectedRow = channels.find((c) => c.channel === selectedChannel) || null
  const publicBookingUrl = useMemo(
    () => buildMasterPublicBookingUrl(typeof window !== 'undefined' ? window.location.origin : '', masterDomain),
    [masterDomain],
  )

  const total = useMemo(() => {
    if (!selectedRow) return 0
    return computeCampaignChannelTotal(
      selectedRow.channel,
      selectedRow.count,
      selectedRow.contact_price,
      message,
    )
  }, [selectedRow, message])

  const smsSegments =
    selectedRow?.channel === 'sms' && message.length > 0 ? countSmsSegments(message) : null
  const smsCharCount = selectedRow?.channel === 'sms' ? message.length : 0
  const smsCharLimit =
    smsSegments != null ? smsSegments * SMS_SEGMENT_CHAR_LIMIT : 0

  const rowDisplayTotal = (row) => {
    if (row.channel === 'sms' && selectedChannel === 'sms') {
      return computeCampaignChannelTotal(row.channel, row.count, row.contact_price, message)
    }
    return row.total_price
  }

  const onInsertLink = useCallback(() => {
    const { text } = appendPublicLinkToMessage(message, publicBookingUrl)
    setMessage(text)
  }, [message, publicBookingUrl])

  const onSubmit = () => {
    if (!selectedRow || !message.trim()) return
    alert(`MVP: рассылка подготовлена для канала ${CONTACT_CHANNEL_LABELS[selectedRow.channel]}`)
  }

  return (
    <div className="relative isolate min-h-[280px]">
      <div
        className={`space-y-4 ${IS_MAILING_FEATURE_LOCKED ? 'pointer-events-none select-none' : ''}`}
        aria-hidden={IS_MAILING_FEATURE_LOCKED}
      >
      <div className="rounded-lg border p-4 bg-white">
        <h3 className="text-lg font-semibold text-gray-900">Рассылки</h3>
        <p className="text-sm text-gray-600 mt-1">Клиенты агрегируются по приоритету: Push, затем E-mail, затем SMS</p>
      </div>

      {loading && <p className="text-gray-500">Загрузка...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && !error && (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Канал</th>
                <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Клиентов</th>
                <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Цена за контакт</th>
                <th className="px-4 py-2 text-left text-xs uppercase text-gray-500">Итог</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((row) => {
                const disabled = Number(row.count || 0) === 0
                const selected = selectedChannel === row.channel
                return (
                  <tr key={row.channel} className={selected ? 'bg-green-50' : ''}>
                    <td className="px-4 py-3">
                      <label className={`inline-flex items-center gap-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={selected}
                          onChange={() => setSelectedChannel(selected ? null : row.channel)}
                        />
                        <span>{CONTACT_CHANNEL_LABELS[row.channel]}</span>
                      </label>
                    </td>
                    <td className="px-4 py-3">{row.count}</td>
                    <td className="px-4 py-3">{formatMoney(row.contact_price)}</td>
                    <td className="px-4 py-3 font-medium">{formatMoney(rowDisplayTotal(row))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="p-4 border-t space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 min-h-0">
                <span className="text-sm font-medium text-gray-700 truncate pr-1">Текст рассылки</span>
                <button
                  type="button"
                  onClick={onInsertLink}
                  disabled={!publicBookingUrl}
                  title={!publicBookingUrl ? 'Укажите домен в настройках мастера' : 'Добавить ссылку на страницу записи'}
                  className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:text-gray-800 disabled:opacity-45 disabled:pointer-events-none"
                >
                  Вставить ссылку
                </button>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Введите текст рассылки..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 resize-y min-h-[5.5rem]"
              />
            </div>
            {smsSegments != null && (
              <p className="text-sm text-gray-600">
                Сегментов SMS: <strong>{smsSegments}</strong>{' '}
                <span className="text-gray-500">
                  ({smsCharCount}/{smsCharLimit})
                </span>
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">
                Итого: <strong>{formatMoney(total)}</strong>
              </span>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!selectedRow || !message.trim()}
                className="px-4 py-2 rounded-lg bg-[#4CAF50] text-white disabled:opacity-50"
              >
                Отправить рассылку
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {IS_MAILING_FEATURE_LOCKED && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/75 px-4 py-8 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <div className="max-w-md text-center">
            <p className="text-lg font-semibold text-gray-900" id="mailing-soon-title">
              Рассылки скоро появятся
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Мы готовим этот раздел. Здесь можно будет запускать рассылки по клиентской базе — следите за
              обновлениями.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

