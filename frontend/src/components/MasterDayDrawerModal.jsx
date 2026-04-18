import React, { useMemo, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiPost } from '../utils/api'
import {
  SLOT_MINUTE_STEPS,
  resolveDayRangeMinutes,
  thirtyMinuteSlotsInRange,
} from '../utils/dayAvailabilityRange'

const HOURS_0_23 = Array.from({ length: 24 }, (_, i) => i)
const HOURS_END_0_24 = Array.from({ length: 25 }, (_, i) => i)

function slotOverlapsBooking(dateStr, hour, minute, booking) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const slotStart = new Date(y, mo - 1, d, hour, minute, 0, 0)
  const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000)
  const bs = new Date(booking.start_time)
  const be = new Date(booking.end_time)
  return bs < slotEnd && be > slotStart
}

function bookingBlocksSlotClose(booking) {
  const s = String(booking.status || '').toLowerCase()
  if (
    s === 'cancelled' ||
    s === 'cancelled_by_client_early' ||
    s === 'cancelled_by_client_late' ||
    s === 'completed'
  ) {
    return false
  }
  return true
}

function formatPriceRub(price) {
  if (price == null || price === '') return null
  const n = Number(price)
  if (Number.isNaN(n)) return null
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
  }).format(n)
}

/**
 * Меню дня: локальная правка слотов на одну дату (POST /api/master/schedule/day, на backend также есть PUT).
 */
export default function MasterDayDrawerModal({
  isOpen,
  onClose,
  dateStr,
  slotsForDay,
  bookings,
  onSaved,
}) {
  const [saving, setSaving] = useState(false)
  const [closePickerOpen, setClosePickerOpen] = useState(false)
  const [keysToClose, setKeysToClose] = useState(() => new Set())
  const [openRangeVisible, setOpenRangeVisible] = useState(false)
  const [rangeStartH, setRangeStartH] = useState(9)
  const [rangeStartM, setRangeStartM] = useState(0)
  const [rangeEndH, setRangeEndH] = useState(18)
  const [rangeEndM, setRangeEndM] = useState(0)

  const dayBookings = useMemo(() => {
    return (bookings || [])
      .filter((b) => {
        const bd = new Date(b.start_time).toISOString().split('T')[0]
        return bd === dateStr
      })
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
  }, [bookings, dateStr])

  const openKeySet = useMemo(() => {
    const set = new Set()
    ;(slotsForDay || []).forEach((s) => {
      if (s.is_working) set.add(`${s.hour}_${s.minute}`)
    })
    return set
  }, [slotsForDay])

  const closableSlots = useMemo(() => {
    return (slotsForDay || []).filter((s) => {
      if (!s.is_working) return false
      const blocked = dayBookings.some(
        (b) => bookingBlocksSlotClose(b) && slotOverlapsBooking(dateStr, s.hour, s.minute, b)
      )
      return !blocked
    })
  }, [slotsForDay, dayBookings, dateStr])

  const submitOpenKeys = async (nextSet) => {
    const open_slots = Array.from(nextSet)
      .map((k) => {
        const [h, m] = k.split('_').map(Number)
        return { hour: h, minute: m }
      })
      .sort((a, b) => a.hour - b.hour || a.minute - b.minute)
    setSaving(true)
    try {
      await apiPost('/api/master/schedule/day', { schedule_date: dateStr, open_slots })
      onSaved?.()
      onClose()
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Не удалось сохранить'
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setSaving(false)
    }
  }

  const openAvailabilityForm = () => {
    if (saving) return
    setRangeStartH(9)
    setRangeStartM(0)
    setRangeEndH(18)
    setRangeEndM(0)
    setOpenRangeVisible(true)
  }

  const applyOpenAvailabilityRange = () => {
    if (saving) return
    const resolved = resolveDayRangeMinutes(rangeStartH, rangeStartM, rangeEndH, rangeEndM)
    if (!resolved.ok) {
      alert(resolved.error)
      return
    }
    const gridSlots = thirtyMinuteSlotsInRange(resolved.startMin, resolved.endMin)
    const next = new Set(openKeySet)
    let newlyAdded = 0
    for (const { hour, minute } of gridSlots) {
      const k = `${hour}_${minute}`
      if (!next.has(k)) newlyAdded += 1
      next.add(k)
    }
    if (newlyAdded === 0) {
      alert(
        'Все слоты в выбранном интервале на этот день уже открыты. Укажите другой интервал или расширьте его.'
      )
      setOpenRangeVisible(false)
      return
    }
    setOpenRangeVisible(false)
    void submitOpenKeys(next)
  }

  const openClosePicker = () => {
    if (closableSlots.length === 0) {
      alert(
        'Нет слотов для закрытия: нет свободных открытых окон без записей на этот день.'
      )
      return
    }
    setKeysToClose(new Set())
    setClosePickerOpen(true)
  }

  const applyCloseSlots = () => {
    if (saving) return
    const next = new Set(openKeySet)
    keysToClose.forEach((k) => next.delete(k))
    setClosePickerOpen(false)
    setKeysToClose(new Set())
    void submitOpenKeys(next)
  }

  if (!isOpen || !dateStr) return null

  const dateTitle = new Date(dateStr + 'T12:00:00').toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const availableCount = (slotsForDay || []).filter((s) => s.is_working).length
  const availableHours = (availableCount * 30) / 60
  const bookedHours =
    dayBookings.reduce((sum, b) => {
      const dur = (new Date(b.end_time) - new Date(b.start_time)) / (1000 * 60)
      return sum + dur
    }, 0) / 60

  const selectCls =
    'border border-gray-300 rounded-lg px-2 py-2 text-sm w-full bg-white text-gray-900'

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-[60]"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-lg max-h-[85vh] flex flex-col shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-start px-4 py-3 border-b">
            <div>
              <h2 className="text-lg font-bold text-gray-900 capitalize">{dateTitle}</h2>
              <p className="text-xs text-gray-500">Локальные правки только на эту дату · правило недели не меняется</p>
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <XMarkIcon className="h-6 w-6" strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="flex justify-around py-2 border-b bg-gray-50 text-sm">
            <div className="text-center">
              <div className="text-gray-500 text-xs">Доступно</div>
              <div className="font-semibold">{availableHours.toFixed(1)} ч</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 text-xs">Занято</div>
              <div className="font-semibold">{bookedHours.toFixed(1)} ч</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 text-xs">Записей</div>
              <div className="font-semibold">{dayBookings.length}</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {dayBookings.length === 0 && availableCount === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">Нет записей и открытых слотов</p>
            ) : (
              <>
                {dayBookings.map((b) => {
                  const priceStr = formatPriceRub(b.service_price)
                  return (
                    <div key={b.id} className="border border-gray-200 rounded-lg p-2 text-sm bg-orange-50/40">
                      <div className="font-medium text-gray-900">{b.service_name || 'Услуга'}</div>
                      <div className="text-gray-700">
                        {(b.client_display_name || b.client_name) || 'Клиент'}
                      </div>
                      <div className="text-xs text-gray-600">
                        {new Date(b.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} –{' '}
                        {new Date(b.end_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {priceStr ? <div className="text-xs font-semibold text-green-700 mt-1">{priceStr}</div> : null}
                    </div>
                  )
                })}
                {availableCount > 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-800">
                    Свободные окна: ~{availableHours.toFixed(1)} ч
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="px-4 py-3 border-t space-y-2 bg-white">
            <button
              type="button"
              disabled={saving}
              onClick={openAvailabilityForm}
              className="w-full py-2.5 rounded-lg bg-green-600 text-white font-semibold text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Сохранение…' : 'Открыть слот'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={openClosePicker}
              className="w-full py-2.5 rounded-lg border border-green-600 text-green-700 font-semibold text-sm hover:bg-green-50 disabled:opacity-50"
            >
              Закрыть слоты
            </button>
          </div>
        </div>
      </div>

      {openRangeVisible && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[70] p-4"
          onClick={() => setOpenRangeVisible(false)}
          role="presentation"
        >
          <div
            className="bg-white rounded-lg max-w-md w-full shadow-xl p-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-gray-900 text-base">Интервал доступности</h3>
            <p className="text-xs text-gray-600 mt-1 mb-3">
              Только :00 и :30 — как в сетке расписания. Слоты открываются строго внутри интервала [начало, конец) и
              добавляются к уже открытым. Конец не входит; для конца дня — 24:00.
            </p>

            <p className="text-xs font-semibold text-gray-800 mb-1">Начало</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Часы</label>
                <select
                  className={selectCls}
                  value={rangeStartH}
                  onChange={(e) => setRangeStartH(Number(e.target.value))}
                >
                  {HOURS_0_23.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Минуты</label>
                <select
                  className={selectCls}
                  value={rangeStartM}
                  onChange={(e) => setRangeStartM(Number(e.target.value))}
                >
                  {SLOT_MINUTE_STEPS.map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-xs font-semibold text-gray-800 mb-1">Конец</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Часы</label>
                <select
                  className={selectCls}
                  value={rangeEndH}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setRangeEndH(v)
                    if (v === 24) setRangeEndM(0)
                  }}
                >
                  {HOURS_END_0_24.map((h) => (
                    <option key={h} value={h}>
                      {h === 24 ? '24 (конец дня)' : String(h).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Минуты</label>
                <select
                  className={selectCls}
                  value={rangeEndM}
                  disabled={rangeEndH === 24}
                  onChange={(e) => setRangeEndM(Number(e.target.value))}
                >
                  {SLOT_MINUTE_STEPS.map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                onClick={() => setOpenRangeVisible(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                onClick={applyOpenAvailabilityRange}
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {closePickerOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[70] p-4"
          onClick={() => setClosePickerOpen(false)}
        >
          <div
            className="bg-white rounded-lg max-w-md w-full max-h-[70vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b">
              <h3 className="font-bold text-gray-900">Закрыть свободные слоты</h3>
              <p className="text-xs text-gray-600 mt-1">
                Отметьте интервалы, которые нужно закрыть только на этот день. Слоты с записями недоступны.
              </p>
            </div>
            <div className="overflow-y-auto px-4 py-2 flex-1">
              {closableSlots.map((s) => {
                const key = `${s.hour}_${s.minute}`
                const label = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
                const checked = keysToClose.has(key)
                return (
                  <label key={key} className="flex items-center justify-between py-2 border-b border-gray-100 cursor-pointer">
                    <span className="text-sm font-medium text-gray-800">{label}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setKeysToClose((prev) => {
                          const n = new Set(prev)
                          if (e.target.checked) n.add(key)
                          else n.delete(key)
                          return n
                        })
                      }}
                      className="h-4 w-4 accent-green-600"
                    />
                  </label>
                )
              })}
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                onClick={() => setClosePickerOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                onClick={applyCloseSlots}
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
