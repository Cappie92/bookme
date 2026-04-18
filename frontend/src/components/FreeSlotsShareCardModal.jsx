/**
 * MVP: вертикальная карточка 9:16 со свободными **часами** для соцсетей.
 * Слоты — GET /api/public/masters/:slug/availability (как публичная запись).
 *
 * Экспорт PNG: отдельный полноразмерный слой в portal (без transform), не тот же DOM, что превью.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import html2canvas from 'html2canvas'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { getImageUrl } from '../utils/config'
import Calendar from './ui/Calendar'

const CARD_LOGO_SRC = '/dedato-logo-card.png'

const CARD_W = 1080
const CARD_H = 1920
const MAX_HOURS = 7
/** Как в PublicBookingWizard: окно доступности для публичной записи */
const DAYS_AHEAD = 14

function localTodayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatCardDateRu(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function shortBookingPath(bookingUrl) {
  if (!bookingUrl) return ''
  try {
    const u = new URL(bookingUrl)
    return `${u.host}${u.pathname}`.replace(/\/$/, '') || bookingUrl
  } catch {
    return String(bookingUrl).replace(/^https?:\/\//, '')
  }
}

/** Календарный день начала слота в TZ мастера (YYYY-MM-DD). */
function calendarDayInMasterTz(isoString, timeZone) {
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return ''
  const tz = timeZone && String(timeZone).trim() ? timeZone : 'Europe/Moscow'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Если начало слота в часовом поясе мастера ровно в :00 — вернуть «HH:00», иначе null (не округляем). */
function getWholeHourStartLabel(isoString, timeZone) {
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return null
  const tz = timeZone && String(timeZone).trim() ? timeZone : 'Europe/Moscow'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? 'NaN', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? 'NaN', 10)
  const second = parseInt(parts.find((p) => p.type === 'second')?.value ?? '0', 10)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  if (minute !== 0 || second !== 0) return null
  return `${String(hour).padStart(2, '0')}:00`
}

function slotSortKey(isoString) {
  const t = new Date(isoString).getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * Уникальные целые часы начала в TZ мастера, только будущие относительно «сейчас» (UTC instant),
 * только слоты на выбранный календарный день в TZ мастера.
 */
function buildWholeHourLabels(slots, selectedDate, masterTimezone) {
  if (!selectedDate || !slots?.length) return []
  const tz = masterTimezone || 'Europe/Moscow'
  const now = Date.now()
  const byLabel = new Map()
  for (const s of slots) {
    if (!s.start_time) continue
    if (calendarDayInMasterTz(s.start_time, tz) !== selectedDate) continue
    const startMs = slotSortKey(s.start_time)
    if (startMs <= now) continue
    const label = getWholeHourStartLabel(s.start_time, tz)
    if (!label) continue
    const prev = byLabel.get(label)
    const key = startMs
    if (!prev || key < prev) byLabel.set(label, key)
  }
  return [...byLabel.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label)
    .slice(0, MAX_HOURS)
}

function pickReferenceServiceId(services) {
  if (!services?.length) return ''
  const ranked = [...services].sort((a, b) => {
    const da = Number(a.duration) > 0 ? Number(a.duration) : 999999
    const db = Number(b.duration) > 0 ? Number(b.duration) : 999999
    if (da !== db) return da - db
    return (a.id || 0) - (b.id || 0)
  })
  return String(ranked[0].id)
}

function addDaysStr(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const y2 = dt.getFullYear()
  const m2 = String(dt.getMonth() + 1).padStart(2, '0')
  const d2 = String(dt.getDate()).padStart(2, '0')
  return `${y2}-${m2}-${d2}`
}

function enumerateDaysInclusive(fromStr, toStr) {
  const out = []
  let cur = fromStr
  while (cur && toStr && cur <= toStr) {
    out.push(cur)
    cur = addDaysStr(cur, 1)
  }
  return out
}

/** Ближайшая дата (локальный YYYY-MM-DD в пределах [fromStr, toStr]), на которой есть часы для карточки. */
function firstDateWithWholeCardHours(slots, fromStr, toStr, masterTimezone) {
  if (!fromStr || !toStr) return null
  const tz = masterTimezone || 'Europe/Moscow'
  for (const d of enumerateDaysInclusive(fromStr, toStr)) {
    if (buildWholeHourLabels(slots, d, tz).length > 0) return d
  }
  return null
}

function ymdToLocalNoonDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

function localDateToYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function waitForReadyForCapture(rootEl) {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* ignore */
    }
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  if (!rootEl) return
  const imgs = rootEl.querySelectorAll('img')
  await Promise.all(
    [...imgs].map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          setTimeout(done, 4000)
        })
    )
  )
  await new Promise((r) => setTimeout(r, 50))
}

export default function FreeSlotsShareCardModal({
  open,
  onClose,
  slug,
  bookingUrl,
}) {
  const exportCardRef = useRef(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [rangeSlots, setRangeSlots] = useState([])
  const [rangeFromTo, setRangeFromTo] = useState(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  const referenceServiceId = useMemo(() => pickReferenceServiceId(profile?.services), [profile])

  const hourLabelsForCard = useMemo(
    () => buildWholeHourLabels(rangeSlots, selectedDate, profile?.master_timezone),
    [rangeSlots, selectedDate, profile?.master_timezone]
  )

  const availableDatesForCalendar = useMemo(() => {
    if (!rangeFromTo || !profile || !rangeSlots?.length) return []
    const tz = profile.master_timezone
    return enumerateDaysInclusive(rangeFromTo.fromStr, rangeFromTo.toStr)
      .filter((d) => buildWholeHourLabels(rangeSlots, d, tz).length > 0)
      .map(ymdToLocalNoonDate)
  }, [rangeFromTo, rangeSlots, profile])

  const cardProps = useMemo(
    () => ({
      masterName: profile?.master_name || 'Мастер',
      dateLabel: formatCardDateRu(selectedDate),
      hourLabels: hourLabelsForCard,
      shortLink: shortBookingPath(bookingUrl),
      avatarSrc: profile?.avatar_url ? getImageUrl(profile.avatar_url) : null,
    }),
    [profile, selectedDate, hourLabelsForCard, bookingUrl]
  )

  const loadProfile = useCallback(async () => {
    if (!slug) return
    setLoadingProfile(true)
    setProfileError(null)
    setProfile(null)
    try {
      const res = await fetch(`/api/public/masters/${encodeURIComponent(slug)}`)
      if (!res.ok) {
        if (res.status === 404) throw new Error('Страница записи не найдена. Проверьте адрес в настройках.')
        throw new Error('Не удалось загрузить профиль')
      }
      const data = await res.json()
      setProfile(data)
    } catch (e) {
      setProfileError(e.message || 'Ошибка загрузки')
      setProfile(null)
    } finally {
      setLoadingProfile(false)
    }
  }, [slug])

  useEffect(() => {
    if (open && slug) {
      loadProfile()
      setExportError(null)
    }
  }, [open, slug, loadProfile])

  useEffect(() => {
    if (!open || !slug || !profile?.services?.length || !referenceServiceId) return
    let cancelled = false
    ;(async () => {
      setLoadingSlots(true)
      setSlotsError(null)
      setRangeSlots([])
      setRangeFromTo(null)
      setSelectedDate('')
      try {
        const fromStr = localTodayStr()
        const toStr = addDaysStr(fromStr, DAYS_AHEAD)
        const q = new URLSearchParams({
          from_date: fromStr,
          to_date: toStr,
          service_id: referenceServiceId,
        })
        const res = await fetch(
          `/api/public/masters/${encodeURIComponent(slug)}/availability?${q.toString()}`
        )
        if (!res.ok) {
          const errText = await res.text()
          if (res.status === 400) throw new Error('Проверьте часовой пояс мастера.')
          throw new Error(errText || 'Не удалось загрузить слоты')
        }
        const data = await res.json()
        if (cancelled) return
        const slots = data.slots || []
        setRangeSlots(slots)
        setRangeFromTo({ fromStr, toStr })
        const tz = profile?.master_timezone
        const first = firstDateWithWholeCardHours(slots, fromStr, toStr, tz)
        setSelectedDate(first || fromStr)
      } catch (e) {
        if (!cancelled) {
          setSlotsError(e.message || 'Не удалось загрузить слоты')
          setRangeSlots([])
          setRangeFromTo(null)
          setSelectedDate(localTodayStr())
        }
      } finally {
        if (!cancelled) setLoadingSlots(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, slug, referenceServiceId, profile?.services?.length, profile?.master_timezone])

  const handleDownloadPng = async () => {
    const el = exportCardRef.current
    if (!el || !hourLabelsForCard.length) return
    setExporting(true)
    setExportError(null)
    try {
      await waitForReadyForCapture(el)
      const canvas = await html2canvas(el, {
        scale: 1,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#f9f7f6',
        width: CARD_W,
        height: CARD_H,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: CARD_W,
        windowHeight: CARD_H,
      })
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setExportError('Не удалось сформировать файл')
            setExporting(false)
            return
          }
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `dedato-slots-${slug || 'master'}-${selectedDate}.png`
          a.click()
          URL.revokeObjectURL(url)
          setExporting(false)
        },
        'image/png',
        1
      )
    } catch (e) {
      setExportError(e.message || 'Ошибка экспорта PNG')
      setExporting(false)
    }
  }

  const previewScale = 0.32

  const exportLayer =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        className="pointer-events-none"
        style={{
          position: 'fixed',
          left: '-12000px',
          top: 0,
          width: `${CARD_W}px`,
          height: `${CARD_H}px`,
          overflow: 'hidden',
          zIndex: 0,
          opacity: 1,
        }}
        aria-hidden
      >
        <CardFace ref={exportCardRef} {...cardProps} />
      </div>,
      document.body
    )

  if (!open) return null

  return (
    <>
      {exportLayer}
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-slots-card-title"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 id="free-slots-card-title" className="text-base font-semibold text-gray-900">
              Картинка со свободными часами
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="Закрыть"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="px-4 py-3 space-y-3 overflow-y-auto flex-1">
            {!slug && (
              <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                Сохраните адрес страницы записи (домен), чтобы сформировать карточку.
              </p>
            )}

            {loadingProfile && <p className="text-sm text-gray-500">Загрузка…</p>}
            {profileError && (
              <p className="text-sm text-red-600">{profileError}</p>
            )}

            {profile && !profile.services?.length && (
              <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                Нет услуг для записи. Добавьте услуги в разделе услуг / настройках профиля.
              </p>
            )}

            {profile?.services?.length > 0 && (
              <>
                {!loadingSlots && selectedDate && rangeFromTo && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Дата</label>
                    <Calendar
                      selectedDate={selectedDate}
                      initialMonthAnchor={selectedDate}
                      availableDates={availableDatesForCalendar}
                      onDateSelect={(d) => setSelectedDate(localDateToYmd(d))}
                      className="shadow-sm"
                    />
                  </div>
                )}
                <p className="text-[11px] text-gray-500 leading-snug">
                  На карточке — только целые часы (10:00, 11:00…), по расписанию. Прошедшие на сегодня не
                  показываются. Слоты считаются по услуге с минимальной длительностью; услуга на картинке не
                  видна. Зелёной рамкой отмечены дни, где есть такие часы в выбранном окне.
                </p>
              </>
            )}

            {loadingSlots && (
              <p className="text-sm text-gray-500">Подбор даты и загрузка слотов…</p>
            )}
            {slotsError && (
              <p className="text-sm text-red-600">{slotsError}</p>
            )}

            {!loadingSlots &&
              !slotsError &&
              referenceServiceId &&
              profile?.services?.length > 0 &&
              hourLabelsForCard.length === 0 &&
              !loadingProfile &&
              selectedDate &&
              rangeFromTo && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  Нет подходящих свободных часов на эту дату (ровный час начала и время ещё не прошло).
                  Выберите другую дату или проверьте расписание.
                </p>
              )}

            {hourLabelsForCard.length > 0 && (
              <>
                <p className="text-xs text-gray-500">Превью (масштаб уменьшен)</p>
                <div className="flex justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100 py-2">
                  <div
                    style={{
                      width: CARD_W * previewScale,
                      height: CARD_H * previewScale,
                    }}
                  >
                    <div
                      style={{
                        width: CARD_W,
                        height: CARD_H,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      <CardFace {...cardProps} />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              Закрыть
            </button>
            <button
              type="button"
              disabled={
                !hourLabelsForCard.length || exporting || loadingSlots || !profile
              }
              onClick={handleDownloadPng}
              className="px-4 py-2 text-sm rounded-lg bg-[#4CAF50] text-white hover:bg-[#43a047] disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="free-slots-download-png"
            >
              {exporting ? 'Сохранение…' : 'Скачать PNG'}
            </button>
          </div>
          {exportError && (
            <p className="px-4 pb-3 text-sm text-red-600">{exportError}</p>
          )}
        </div>
      </div>
    </>
  )
}

const CardFace = React.forwardRef(function CardFace(
  { masterName, dateLabel, hourLabels, shortLink, avatarSrc },
  ref
) {
  return (
    <div
      ref={ref}
      className="w-[1080px] h-[1920px] box-border bg-[#f9f7f6] text-gray-900 flex flex-col p-14 font-sans shrink-0"
      style={{
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <p className="text-[28px] text-gray-500 font-medium leading-tight mb-6 pt-0.5">
        Свободные часы
      </p>

      <div className="flex gap-8 items-start">
        <div className="w-[200px] h-[200px] shrink-0 rounded-2xl overflow-hidden bg-gray-200 border border-gray-200 flex items-center justify-center">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[22px] text-gray-400 text-center px-4">Нет фото</span>
          )}
        </div>
        <div className="flex-1 min-w-0 pt-2">
          <h1 className="text-[56px] font-bold leading-tight tracking-tight text-gray-900">{masterName}</h1>
        </div>
      </div>

      <div className="mt-12 h-1.5 w-28 bg-[#4CAF50] rounded-full" />

      <p className="mt-14 text-[44px] font-semibold text-gray-800 capitalize leading-snug">{dateLabel}</p>

      <div className="mt-14 flex flex-col gap-5">
        {hourLabels.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className="text-[52px] font-semibold text-gray-900 bg-white border-2 border-gray-200 rounded-2xl px-8 py-6 shadow-sm text-center"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="mt-auto pt-16">
        <div className="flex justify-between items-end gap-10">
          <p className="text-[32px] text-gray-500 leading-relaxed flex-1 min-w-0 pr-2">
            Запись:{' '}
            <span className="text-[#2f7d32] font-semibold break-all">
              {shortLink || 'dedato.ru/m/…'}
            </span>
          </p>
          <div className="shrink-0 pb-0.5 pl-2">
            <img
              src={CARD_LOGO_SRC}
              alt=""
              className="h-[84px] w-auto max-w-[280px] object-contain object-right"
            />
          </div>
        </div>
      </div>
    </div>
  )
})
