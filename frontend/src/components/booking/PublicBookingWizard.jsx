/**
 * Публичная запись к мастеру — wizard: Услуга → Дата → Время.
 * Только /api/public/masters/{slug}. Master-only, без indie.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { formatTimeShort, formatTimezoneLabel } from '../../utils/dateFormat'
import { useAuth } from '../../contexts/AuthContext'
import PublicBookingAuthPrompt from './PublicBookingAuthPrompt'
import { metrikaGoal } from '../../analytics/metrika'
import { M } from '../../analytics/metrikaEvents'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** Сетка календаря на месяц: доступные даты из availability, остальные disabled. */
function CalendarGrid({ availableDateSet, minDateStr, maxDateStr, selectedDate, onSelectDate }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const minDate = useMemo(() => (minDateStr ? new Date(minDateStr + 'T12:00:00') : null), [minDateStr])
  const maxDate = useMemo(() => (maxDateStr ? new Date(maxDateStr + 'T12:00:00') : null), [maxDateStr])

  const { firstDay, daysInMonth, startPadding } = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1)
    const last = new Date(viewYear, viewMonth + 1, 0)
    const firstWeekday = (first.getDay() + 6) % 7
    const daysInMonth = last.getDate()
    return {
      firstDay: first,
      daysInMonth,
      startPadding: firstWeekday,
    }
  }, [viewYear, viewMonth])

  const canPrev = useMemo(() => {
    if (!minDate) return false
    return viewMonth > minDate.getMonth() || viewYear > minDate.getFullYear()
  }, [viewYear, viewMonth, minDate])

  const canNext = useMemo(() => {
    if (!maxDate) return false
    return viewMonth < maxDate.getMonth() || viewYear < maxDate.getFullYear()
  }, [viewYear, viewMonth, maxDate])

  const isDateAvailable = useCallback(
    (y, m, d) => {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (!availableDateSet.has(dateStr)) return false
      if (minDateStr && dateStr < minDateStr) return false
      if (maxDateStr && dateStr > maxDateStr) return false
      return true
    },
    [availableDateSet, minDateStr, maxDateStr]
  )

  const cells = useMemo(() => {
    const list = []
    for (let i = 0; i < startPadding; i++) list.push({ type: 'pad', key: `p-${i}` })
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const available = isDateAvailable(viewYear, viewMonth, d)
      list.push({ type: 'day', dateStr, d, available, key: dateStr })
    }
    return list
  }, [viewYear, viewMonth, daysInMonth, startPadding, isDateAvailable])

  const monthLabel = `${new Date(viewYear, viewMonth).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <button
          type="button"
          onClick={() => {
            if (viewMonth === 0) {
              setViewYear((y) => y - 1)
              setViewMonth(11)
            } else setViewMonth((m) => m - 1)
          }}
          disabled={!canPrev}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
          data-testid="month-prev"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium text-gray-700 capitalize">{monthLabel}</span>
        <button
          type="button"
          onClick={() => {
            if (viewMonth === 11) {
              setViewYear((y) => y + 1)
              setViewMonth(0)
            } else setViewMonth((m) => m + 1)
          }}
          disabled={!canNext}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
          data-testid="month-next"
          aria-label="Следующий месяц"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-sm">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="py-1.5 text-gray-500 font-medium">
            {wd}
          </div>
        ))}
        {cells.map((cell) => {
          if (cell.type === 'pad') return <div key={cell.key} />
          const { dateStr, d, available } = cell
          const selected = selectedDate === dateStr
          return (
            <button
              key={cell.key}
              type="button"
              disabled={!available}
              onClick={() => available && onSelectDate(dateStr)}
              className={`py-2 rounded ${
                available
                  ? selected
                    ? 'bg-[#4CAF50] text-white font-medium'
                    : 'hover:bg-green-50 text-gray-900'
                  : 'text-gray-300 cursor-not-allowed'
              }`}
              data-testid={available ? `date-cell-${dateStr}` : undefined}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const DRAFT_KEY = 'public_booking_draft'
const DAYS_AHEAD = 14

/** Максимальный возраст черновика в sessionStorage; старше — удаляем (не восстанавливаем и не шлём POST). */
const DRAFT_TTL_MS = 20 * 60 * 1000

/**
 * Авто-POST после логина только если вход завершился вскоре после «Записаться».
 * Иначе — только восстановление формы и явное нажатие «Записаться» (слот мог занять другой клиент).
 */
const AUTO_SUBMIT_MAX_AGE_MS = 3 * 60 * 1000

const DRAFT_SOURCE_PUBLIC_BOOKING = 'public_booking'

/** Статусы draft для идемпотентности: pending — можно создавать; submitted — запрос ушёл; done — создано. */
function readDraftRaw() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function getDraft() {
  try {
    const d = readDraftRaw()
    if (!d?.slug || d?.service_id == null || !d?.start_time || !d?.end_time) return null
    if (d.source && d.source !== DRAFT_SOURCE_PUBLIC_BOOKING) return null
    const savedAt = typeof d.saved_at === 'number' ? d.saved_at : null
    if (savedAt == null || Date.now() - savedAt > DRAFT_TTL_MS) {
      sessionStorage.removeItem(DRAFT_KEY)
      return null
    }
    return d
  } catch (e) {
    return null
  }
}

function saveDraft(draft) {
  const payload = {
    ...draft,
    status: draft.status ?? 'pending',
    saved_at: typeof draft.saved_at === 'number' ? draft.saved_at : Date.now(),
    source: draft.source ?? DRAFT_SOURCE_PUBLIC_BOOKING,
  }
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
}

function updateDraftStatus(updates) {
  const draft = readDraftRaw()
  if (!draft) return
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, ...updates }))
}

function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY)
}

/** Последний успешный create по публичной записи — для восстановления UI и «свой конфликт слота». */
const LAST_BOOKING_SUCCESS_KEY = 'dedato_public_booking_last_success'
const LAST_BOOKING_SUCCESS_TTL_MS = 15 * 60 * 1000

function readLastBookingSuccess(slug) {
  try {
    const raw = sessionStorage.getItem(LAST_BOOKING_SUCCESS_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o?.slug || o.slug !== slug) return null
    const t = typeof o.saved_at === 'number' ? o.saved_at : 0
    if (!t || Date.now() - t > LAST_BOOKING_SUCCESS_TTL_MS) {
      sessionStorage.removeItem(LAST_BOOKING_SUCCESS_KEY)
      return null
    }
    if (o.id == null && !String(o.public_reference ?? '').trim()) return null
    return o
  } catch {
    return null
  }
}

function writeLastBookingSuccess({ slug, id, public_reference, service_id, start_time, end_time }) {
  try {
    sessionStorage.setItem(
      LAST_BOOKING_SUCCESS_KEY,
      JSON.stringify({
        slug,
        id,
        public_reference: public_reference ?? '',
        service_id,
        start_time,
        end_time,
        saved_at: Date.now(),
      })
    )
  } catch {
    /* ignore quota / private mode */
  }
}

function clearLastBookingSuccess() {
  try {
    sessionStorage.removeItem(LAST_BOOKING_SUCCESS_KEY)
  } catch {
    /* ignore */
  }
}

function lastBookingSuccessMatchesSlot(rec, serviceId, slot) {
  if (!rec || !slot || serviceId == null) return false
  return rec.service_id === serviceId && rec.start_time === slot.start_time && rec.end_time === slot.end_time
}

function groupByCategory(services) {
  const map = new Map()
  for (const s of services) {
    const cat = (s.category_name || '').trim() || 'Без категории'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat).push(s)
  }
  return Array.from(map.entries()).map(([name, svcs]) => ({ name, services: svcs }))
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return dateStr
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  if (target.getTime() === today.getTime()) return 'Сегодня'
  if (target.getTime() === tomorrow.getTime()) return 'Завтра'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()]
  return `${day}.${month}, ${wd}`
}

function buildDateOptionsFromSlots(slots) {
  const seen = new Set()
  const result = []
  for (const s of slots || []) {
    const dateStr = s.start_time?.slice(0, 10)
    if (!dateStr || seen.has(dateStr)) continue
    seen.add(dateStr)
    result.push({ dateStr, displayLabel: formatDateLabel(dateStr) })
  }
  result.sort((a, b) => a.dateStr.localeCompare(b.dateStr))
  return result
}

export default function PublicBookingWizard({
  slug,
  profile,
  currentUser,
  eligibility = null,
  onAuthRequired,
  onBookingSuccess,
  onBookingError,
}) {
  const { openAuthModal } = useAuth()
  const navigate = useNavigate()
  const autoSubmitSeqRef = useRef(0)
  const mountedRef = useRef(true)
  const [selectedService, setSelectedService] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const [slots, setSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [calendarError, setCalendarError] = useState(null)
  const [calendarDownloading, setCalendarDownloading] = useState(false)
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [expandedCategories, setExpandedCategories] = useState(new Set())
  /** После выбора даты календарь сворачиваем, чтобы не перегружать экран шагом «Время». */
  const [calendarExpanded, setCalendarExpanded] = useState(true)
  /** После логина с «длинной» паузой: форма восстановлена, нужно явно нажать «Записаться». */
  const [postLoginRestoreNotice, setPostLoginRestoreNotice] = useState(false)

  const services = profile?.services || []
  const groups = useMemo(() => {
    let list = services
    if (serviceSearch.trim()) {
      const q = serviceSearch.trim().toLowerCase()
      list = services.filter(
        (s) =>
          (s.name || '').toLowerCase().includes(q) ||
          (s.category_name || '').toLowerCase().includes(q)
      )
    }
    return groupByCategory(list)
  }, [services, serviceSearch])

  useEffect(() => {
    if (groups.length > 0 && expandedCategories.size === 0) {
      setExpandedCategories(new Set([groups[0].name]))
    }
  }, [groups])

  const dateOptions = useMemo(() => buildDateOptionsFromSlots(slots), [slots])
  const availableDateSet = useMemo(() => new Set(dateOptions.map((o) => o.dateStr)), [dateOptions])

  const authPromptSummary = useMemo(() => {
    if (!selectedService || !selectedDate || !selectedSlot) return null
    const dateLabel = dateOptions.find((d) => d.dateStr === selectedDate)?.displayLabel || selectedDate
    const timeLabel = `${formatTimeShort(selectedSlot.start_time)}–${formatTimeShort(selectedSlot.end_time)}`
    const timezoneOrCity = profile?.master_timezone
      ? formatTimezoneLabel(profile.master_timezone)
      : (profile?.city ?? '')
    return {
      serviceName: selectedService.name,
      price: String(selectedService.price ?? ''),
      duration: String(selectedService.duration ?? ''),
      dateLabel,
      timeLabel,
      timezoneOrCity,
    }
  }, [selectedService, selectedDate, selectedSlot, dateOptions, profile])
  const { minDateStr, maxDateStr } = useMemo(() => {
    const from = new Date()
    const to = new Date()
    to.setDate(to.getDate() + DAYS_AHEAD)
    return {
      minDateStr: from.toISOString().slice(0, 10),
      maxDateStr: to.toISOString().slice(0, 10),
    }
  }, [])
  const slotsForDate = useMemo(() => {
    if (!selectedDate) return []
    return (slots || [])
      .filter((s) => s.start_time?.startsWith(selectedDate))
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
  }, [slots, selectedDate])

  const loadAvailability = useCallback(async () => {
    if (!slug || !selectedService) return
    setSlotsLoading(true)
    setSlotsError(null)
    setSlots([])
    try {
      const from = new Date()
      const to = new Date()
      to.setDate(to.getDate() + DAYS_AHEAD)
      const fromStr = from.toISOString().slice(0, 10)
      const toStr = to.toISOString().slice(0, 10)
      const res = await fetch(
        `/api/public/masters/${encodeURIComponent(slug)}/availability?service_id=${selectedService.id}&from_date=${fromStr}&to_date=${toStr}`
      )
      if (!res.ok) throw new Error('Не удалось загрузить свободные слоты')
      const data = await res.json()
      setSlots(data.slots || [])
    } catch (err) {
      setSlotsError('Не удалось загрузить свободные слоты. Проверьте интернет и попробуйте ещё раз.')
      setSlots([])
    } finally {
      setSlotsLoading(false)
    }
  }, [slug, selectedService])

  useEffect(() => {
    if (selectedService) loadAvailability()
    else {
      setSlots([])
      setSlotsError(null)
    }
  }, [selectedService, loadAvailability])

  useEffect(() => {
    setCalendarExpanded(true)
  }, [selectedService])

  /** Слоты перезагрузились: выбранной даты нет среди доступных — сброс (в т.ч. «сегодня» без будущих слотов). */
  useEffect(() => {
    if (!selectedDate || slotsLoading) return
    if (dateOptions.length === 0) {
      setSelectedDate(null)
      setSelectedSlot(null)
      return
    }
    if (!dateOptions.some((o) => o.dateStr === selectedDate)) {
      setSelectedDate(null)
      setSelectedSlot(null)
    }
  }, [dateOptions, selectedDate, slotsLoading])

  /** После восстановления слота с сервера: выбранного интервала нет в списке — сброс (занято / устарело). */
  useEffect(() => {
    if (!selectedSlot || !selectedDate || slotsLoading) return
    if (slotsForDate.length === 0) return
    const ok = slotsForDate.some(
      (s) => s.start_time === selectedSlot.start_time && s.end_time === selectedSlot.end_time
    )
    if (!ok) {
      setSelectedSlot(null)
      setSubmitError('Выбранное время больше недоступно. Выберите другое.')
    }
  }, [selectedSlot, selectedDate, slotsForDate, slotsLoading])

  // Закрыть промпт «Подтвердите запись» после успешной авторизации
  useEffect(() => {
    if (currentUser) setShowAuthPrompt(false)
  }, [currentUser])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // После логина: либо быстрый авто-POST (свежее намерение), либо только восстановление формы + явный «Записаться».
  useEffect(() => {
    if (!slug || !profile || !currentUser || success) return
    const draft = getDraft()
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.debug('[public-booking] post-login effect', {
        hasDraft: !!draft,
        intent: draft?.intent,
        status: draft?.status,
        slugMatch: draft?.slug === slug,
        ageMs: draft?.saved_at != null ? Date.now() - draft.saved_at : null,
      })
    }
    if (!draft || draft.slug !== slug) return
    if (draft.intent !== 'create_after_auth') return
    // Идемпотентность: если auto-submit уже стартовал (submitted) — не стартуем второй раз
    if (draft.status === 'submitted') {
      const submittedAt = typeof draft.submitted_at === 'number' ? draft.submitted_at : 0
      const ageMs = submittedAt ? Date.now() - submittedAt : 0
      // safety valve: если submitted завис слишком давно — разрешаем повтор как pending
      if (ageMs > 30_000) {
        updateDraftStatus({ status: 'pending', submitted_at: null })
      } else {
        return
      }
    }
    if (draft.status === 'done' && (draft.created_booking_id || draft.created_public_reference)) {
      clearDraft()
      setSuccess({
        id: draft.created_booking_id,
        public_reference: draft.created_public_reference,
      })
      setSelectedService(null)
      setSelectedDate(null)
      setSelectedSlot(null)
      return
    }
    const svc = profile.services?.find((s) => s.id === draft.service_id)
    if (!svc) {
      clearDraft()
      return
    }

    const savedAt = typeof draft.saved_at === 'number' ? draft.saved_at : 0
    const ageMs = Date.now() - savedAt
    const allowAutoSubmit = ageMs >= 0 && ageMs <= AUTO_SUBMIT_MAX_AGE_MS

    if (!allowAutoSubmit) {
      clearDraft()
      setPostLoginRestoreNotice(true)
      setSubmitError(null)
      setSelectedService(svc)
      setSelectedDate(draft.start_time.slice(0, 10))
      setSelectedSlot({ start_time: draft.start_time, end_time: draft.end_time })
      setCalendarExpanded(false)
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.debug('[public-booking] post-login: restore form only (draft too old for auto-submit)', {
          ageMs,
          maxAutoMs: AUTO_SUBMIT_MAX_AGE_MS,
        })
      }
      return
    }

    const ac = new AbortController()
    const requestSeq = ++autoSubmitSeqRef.current
    const isActive = () => mountedRef.current && autoSubmitSeqRef.current === requestSeq
    const url = `/api/public/masters/${encodeURIComponent(slug)}/bookings`
    const payload = { service_id: draft.service_id, start_time: draft.start_time, end_time: draft.end_time }
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.debug('[public-booking] POST booking (draft fresh, auto after login)', { url, payload, ageMs })
    }

    ;(async () => {
      if (isActive()) {
        setSubmitting(true)
        setSubmitError(null)
      }
      // помечаем, что auto-submit начался, чтобы не сделать второй POST при повторных эффектах
      updateDraftStatus({ status: 'submitted', submitted_at: Date.now() })
      metrikaGoal(M.PUBLIC_BOOKING_FORM_SUBMIT, { slug, context: 'public_wizard_post_login' })
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: JSON.stringify(payload),
          signal: ac.signal,
        })
        const errBody = !res.ok ? await res.json().catch(() => ({})) : null
        if (!res.ok) {
          const msg = errBody?.detail || errBody?.message || res.statusText
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.debug('[public-booking] POST error', { status: res.status, body: errBody })
          }
          throw new Error(typeof msg === 'string' ? msg : 'Ошибка создания записи')
        }
        let result
        try {
          result = await res.json()
        } catch (e) {
          throw new Error('Сервер вернул 200, но ответ не удалось прочитать. Обновите страницу и попробуйте ещё раз.')
        }
        writeLastBookingSuccess({
          slug,
          id: result.id,
          public_reference: result.public_reference,
          service_id: payload.service_id,
          start_time: payload.start_time,
          end_time: payload.end_time,
        })
        if (!isActive()) return
        updateDraftStatus({
          status: 'done',
          created_booking_id: result.id,
          created_public_reference: result.public_reference,
        })
        clearDraft()
        setPostLoginRestoreNotice(false)
        setSuccess(result)
        setSelectedService(null)
        setSelectedDate(null)
        setSelectedSlot(null)
        onBookingSuccess?.(result)
      } catch (err) {
        if (err?.name === 'AbortError') return
        if (!isActive()) return
        const msg = (err.message || '').toString()
        const busy =
          msg.includes('уже занято') ||
          msg.includes('уже занят') ||
          msg.toLowerCase().includes('already') ||
          msg.includes('занят')
        const last = readLastBookingSuccess(slug)
        if (
          busy &&
          last &&
          lastBookingSuccessMatchesSlot(last, payload.service_id, {
            start_time: payload.start_time,
            end_time: payload.end_time,
          })
        ) {
          clearDraft()
          setSubmitError(null)
          const restored = { id: last.id, public_reference: last.public_reference || '' }
          setSuccess(restored)
          setSelectedService(null)
          setSelectedDate(null)
          setSelectedSlot(null)
          onBookingSuccess?.(restored)
          return
        }
        updateDraftStatus({ status: 'pending', submitted_at: null })
        setSubmitError(err.message || 'Ошибка создания записи')
        onBookingError?.(err.message)
      } finally {
        if (isActive()) setSubmitting(false)
      }
    })()

    return () => {
      ac.abort()
    }
  }, [slug, profile, currentUser, success]) // eslint-disable-line react-hooks/exhaustive-deps -- slug/profile/user/success

  /** Если запись уже создана, но React-state успеха потерян — восстановить success-screen по sessionStorage + текущему слоту. */
  useEffect(() => {
    if (success || !slug) return
    const r = readLastBookingSuccess(slug)
    if (!r) return
    if (!selectedService || !selectedSlot) return
    if (!lastBookingSuccessMatchesSlot(r, selectedService.id, selectedSlot)) return
    clearDraft()
    setPostLoginRestoreNotice(false)
    setSubmitError(null)
    const restored = { id: r.id, public_reference: r.public_reference || '' }
    setSuccess(restored)
    setSelectedService(null)
    setSelectedDate(null)
    setSelectedSlot(null)
    onBookingSuccess?.(restored)
  }, [slug, success, selectedService, selectedSlot, onBookingSuccess])

  const handleSelectService = (s) => {
    const prevLast = readLastBookingSuccess(slug)
    if (prevLast && prevLast.service_id !== s.id) clearLastBookingSuccess()
    setSelectedService(s)
    setSelectedDate(null)
    setSelectedSlot(null)
    setSubmitError(null)
    setPostLoginRestoreNotice(false)
    setShowServiceDropdown(false)
    setCalendarExpanded(true)
  }

  const handleSelectDate = (dateStr) => {
    setSelectedDate(dateStr)
    setSelectedSlot(null)
    setPostLoginRestoreNotice(false)
    setCalendarExpanded(false)
  }

  const handleSelectSlot = (slot) => {
    setSelectedSlot(slot)
    setPostLoginRestoreNotice(false)
  }

  const canSelectDate = !!selectedService
  const canSubmit = !!selectedService && !!selectedDate && !!selectedSlot
  const bookingBlocked = profile?.booking_blocked === true || eligibility?.booking_blocked === true
  const requiresAdvancePayment = profile?.requires_advance_payment === true || eligibility?.requires_advance_payment === true

  const handleSubmit = async () => {
    if (!canSubmit || bookingBlocked) return
    setSubmitError(null)
    if (!currentUser) {
      const attemptId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      saveDraft({
        slug,
        service_id: selectedService.id,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        status: 'pending',
        attempt_id: attemptId,
        intent: 'create_after_auth',
        source: DRAFT_SOURCE_PUBLIC_BOOKING,
      })
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.debug('[public-booking] No user: opening auth prompt', { intent: 'create_after_auth' })
      }
      metrikaGoal(M.PUBLIC_BOOKING_WIZARD_NEED_AUTH, { slug })
      setShowAuthPrompt(true)
      return
    }
    setSubmitting(true)
    metrikaGoal(M.PUBLIC_BOOKING_FORM_SUBMIT, { slug, context: 'public_wizard' })
    const url = `/api/public/masters/${encodeURIComponent(slug)}/bookings`
    const payload = { service_id: selectedService.id, start_time: selectedSlot.start_time, end_time: selectedSlot.end_time }
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.debug('[public-booking] POST booking', { url, payload })
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          service_id: selectedService.id,
          start_time: selectedSlot.start_time,
          end_time: selectedSlot.end_time,
        }),
      })
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.debug('[public-booking] POST response', { status: res.status, ok: res.ok })
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        const msg = errData.detail || errData.message
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.debug('[public-booking] handleSubmit POST error', { status: res.status, body: errData })
        }
        throw new Error(
          typeof msg === 'string' && msg.trim()
            ? msg
            : 'Не удалось создать запись. Попробуйте выбрать другое время или повторите позже.'
        )
      }
      let result
      try {
        result = await res.json()
      } catch {
        throw new Error('Сервер вернул 200, но ответ не удалось прочитать. Обновите страницу и попробуйте ещё раз.')
      }
      writeLastBookingSuccess({
        slug,
        id: result.id,
        public_reference: result.public_reference,
        service_id: selectedService.id,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
      })
      setPostLoginRestoreNotice(false)
      setSuccess(result)
      setSelectedService(null)
      setSelectedDate(null)
      setSelectedSlot(null)
      onBookingSuccess?.(result)
    } catch (err) {
      const msg = (err.message || '').toString()
      const busy =
        msg.includes('уже занято') ||
        msg.includes('уже занят') ||
        msg.toLowerCase().includes('already') ||
        msg.includes('занят')
      const last = readLastBookingSuccess(slug)
      if (
        busy &&
        last &&
        selectedService &&
        selectedSlot &&
        lastBookingSuccessMatchesSlot(last, selectedService.id, selectedSlot)
      ) {
        clearDraft()
        setSubmitError(null)
        const restored = { id: last.id, public_reference: last.public_reference || '' }
        setSuccess(restored)
        setSelectedService(null)
        setSelectedDate(null)
        setSelectedSlot(null)
        onBookingSuccess?.(restored)
      } else {
        setSubmitError(
          err.message || 'Не удалось создать запись. Попробуйте выбрать другое время или повторите позже.'
        )
        onBookingError?.(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const toggleCategory = (name) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (success) {
    const role = (
      currentUser?.role ??
      (typeof localStorage !== 'undefined' ? localStorage.getItem('user_role') : '') ??
      ''
    )
      .toString()
      .toLowerCase()
    let goToMyBookingsHref = '/client'
    if (role === 'master' || role === 'indie') goToMyBookingsHref = '/master'
    else if (role === 'salon') goToMyBookingsHref = '/salon'
    const btnBase =
      'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors min-h-[44px] px-5 py-3 w-full sm:w-auto'
    return (
      <div
        className="bg-white rounded-xl shadow-sm border border-green-200 p-6 sm:p-8 text-center"
        data-testid="success-screen"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-1">Запись создана</h3>
        <p className="text-gray-700 text-sm font-medium mb-1">
          {success.public_reference
            ? `Номер записи: ${success.public_reference}`
            : 'Запись создана — номер доступен в личном кабинете.'}
        </p>
        <p className="text-gray-600 text-sm mb-6">Мастер подтвердит запись. Вы можете посмотреть её в личном кабинете.</p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => navigate(goToMyBookingsHref)}
            className={`${btnBase} bg-[#4CAF50] text-white hover:bg-[#45a049]`}
            data-testid="go-to-my-bookings"
          >
            Перейти в личный кабинет
          </button>
          <button
            type="button"
            onClick={async () => {
              setCalendarError(null)
              const token = localStorage.getItem('access_token')
              if (!token) {
                setCalendarError('Чтобы добавить запись в календарь, нужно войти в аккаунт.')
                return
              }
              const url = success.public_reference
                ? `/api/client/bookings/ref/${encodeURIComponent(success.public_reference)}/calendar.ics?alarm_minutes=60`
                : `/api/client/bookings/${success.id}/calendar.ics?alarm_minutes=60`
              setCalendarDownloading(true)
              try {
                const res = await fetch(url, {
                  headers: { Authorization: `Bearer ${token}` },
                  credentials: 'include',
                })
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}))
                  throw new Error(err?.detail || 'Не удалось получить файл календаря')
                }
                const blob = await res.blob()
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                const pr = success.public_reference != null ? String(success.public_reference).trim() : ''
                a.download = pr ? `booking-${pr}.ics` : `booking-${success.id}.ics`
                a.click()
                URL.revokeObjectURL(a.href)
              } catch (e) {
                setCalendarError(e?.message || 'Не удалось добавить в календарь')
              } finally {
                setCalendarDownloading(false)
              }
            }}
            disabled={calendarDownloading}
            className={`${btnBase} bg-white text-gray-700 border-2 border-gray-200 hover:border-gray-300 disabled:opacity-60`}
            data-testid="add-to-calendar"
          >
            <CalendarIcon className="w-5 h-5 shrink-0" />
            {calendarDownloading ? 'Загрузка…' : 'Добавить в календарь'}
          </button>
        </div>
        {calendarError ? (
          <p className="mt-4 text-sm text-rose-700" data-testid="calendar-error">
            {calendarError}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {postLoginRestoreNotice && (
        <div
          className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-sky-900 text-sm flex gap-2 justify-between items-start"
          role="status"
          data-testid="public-booking-restore-notice"
        >
          <span>
            Прошло больше времени с момента выбора слота. Проверьте дату и время — при необходимости выберите другое окно — и нажмите «Записаться».
          </span>
          <button
            type="button"
            onClick={() => setPostLoginRestoreNotice(false)}
            className="shrink-0 text-sm text-sky-700 hover:text-sky-900 underline font-medium px-1"
          >
            Скрыть
          </button>
        </div>
      )}
      {bookingBlocked && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
          Запись недоступна
        </div>
      )}
      {requiresAdvancePayment && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-sm">
          Требуется предоплата для подтверждения записи
        </div>
      )}

      {/* Step 1: Service */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">1. Услуга</label>
        <div className="relative">
          {services.length === 0 ? (
            <div className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500 text-sm">
              У мастера пока нет услуг
            </div>
          ) : (
          <>
          <button
            type="button"
            onClick={() => setShowServiceDropdown(!showServiceDropdown)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-white border border-gray-200 rounded-lg text-left hover:border-gray-300 focus:ring-2 focus:ring-[#4CAF50] focus:border-[#4CAF50]"
            data-testid="service-picker-button"
          >
            <span className={selectedService ? 'text-gray-900' : 'text-gray-500'}>
              {selectedService
                ? `${selectedService.name} — ${selectedService.price} ₽, ${selectedService.duration} мин`
                : 'Выберите услугу'}
            </span>
            {showServiceDropdown ? (
              <ChevronUpIcon className="w-5 h-5 text-gray-400 shrink-0" />
            ) : (
              <ChevronDownIcon className="w-5 h-5 text-gray-400 shrink-0" />
            )}
          </button>
          {showServiceDropdown && (
            <>
              <div
                className="fixed inset-0 z-[35] bg-black/40 md:bg-transparent md:z-10"
                aria-hidden="true"
                onClick={() => setShowServiceDropdown(false)}
              />
              <div
                className="
                  z-[45] md:z-20 bg-white border border-gray-200 shadow-lg flex flex-col min-h-0 overflow-hidden
                  max-md:fixed max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:rounded-t-2xl max-md:border-b-0 max-md:shadow-2xl
                  max-md:h-[calc(100svh-10px)] max-md:max-h-[calc(100svh-10px)] max-md:pb-[env(safe-area-inset-bottom,0px)]
                  md:absolute md:top-full md:left-0 md:right-0 md:mt-1 md:h-auto md:rounded-lg md:max-h-80
                "
                role="dialog"
                aria-modal="true"
                aria-label="Выбор услуги"
              >
                <div className="shrink-0 bg-white border-b border-gray-200 max-md:pt-[max(env(safe-area-inset-top),0.5rem)]">
                  <div className="flex md:hidden justify-center pt-1 pb-2" aria-hidden="true">
                    <span className="h-1 w-11 rounded-full bg-gray-300" />
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 pb-2 md:py-2 md:px-2">
                    <span className="text-base md:text-sm font-semibold text-gray-900">Услуга</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full text-gray-600 hover:bg-gray-100 active:bg-gray-200"
                        aria-label="Закрыть без выбора"
                        onClick={() => setShowServiceDropdown(false)}
                      >
                        <XMarkIcon className="w-6 h-6" />
                      </button>
                      <button
                        type="button"
                        className="min-h-[44px] px-4 rounded-xl bg-[#4CAF50] text-white text-sm font-semibold shadow-sm active:opacity-90"
                        onClick={() => setShowServiceDropdown(false)}
                      >
                        Готово
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-2 border-b border-gray-100 flex items-center gap-2 shrink-0">
                  <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    type="text"
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    placeholder="Поиск по названию..."
                    className="flex-1 min-w-0 py-1.5 text-sm border-0 focus:ring-0 focus:outline-none"
                  />
                  <button
                    type="button"
                    className="shrink-0 py-2 px-2 text-sm font-semibold text-[#4CAF50] md:hidden"
                    onClick={() => setShowServiceDropdown(false)}
                  >
                    Закрыть
                  </button>
                </div>
                <div className="overflow-y-auto overscroll-contain p-1.5 space-y-1 flex-1 min-h-0" role="listbox">
                  {groups.map((g) => (
                    <div
                      key={g.name}
                      className="rounded-lg border border-gray-100 bg-white overflow-hidden shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => toggleCategory(g.name)}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left bg-gray-50/95 hover:bg-gray-100 transition-colors"
                        aria-expanded={expandedCategories.has(g.name)}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 truncate">
                            {g.name}
                          </span>
                          <span
                            className="inline-flex shrink-0 items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-md bg-gray-200/90 text-[10px] font-medium text-gray-600 tabular-nums"
                            title="Количество услуг в категории"
                          >
                            {g.services.length}
                          </span>
                        </span>
                        {expandedCategories.has(g.name) ? (
                          <ChevronUpIcon className="w-4 h-4 shrink-0 text-gray-500" />
                        ) : (
                          <ChevronDownIcon className="w-4 h-4 shrink-0 text-gray-500" />
                        )}
                      </button>
                      {expandedCategories.has(g.name) && (
                        <div className="border-t border-gray-100 bg-white px-1 py-1 space-y-0.5">
                          {g.services.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleSelectService(s)}
                              className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                                selectedService?.id === s.id
                                  ? 'bg-green-50 ring-1 ring-inset ring-[#4CAF50] text-gray-900'
                                  : 'hover:bg-gray-50 ring-1 ring-inset ring-transparent text-gray-900'
                              }`}
                              data-testid={`service-option-${s.id}`}
                            >
                              <div className="font-medium leading-snug">{s.name}</div>
                              <div className="text-gray-500 text-xs mt-0.5 tabular-nums">
                                {s.price} ₽ · {s.duration} мин
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          </>
          )}
        </div>
      </div>

      {/* Step 2: Дата — календарь-сетка */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">2. Дата</label>
        {!canSelectDate ? (
          <div className="py-4 px-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 text-sm text-center">
            Сначала выберите услугу
          </div>
        ) : slotsLoading ? (
          <div className="py-8 text-center text-gray-500 text-sm">Загрузка дат...</div>
        ) : slotsError ? (
          <div className="py-4 text-center text-red-600 text-sm">{slotsError}</div>
        ) : dateOptions.length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-sm" data-testid="date-empty-state">
            Нет свободных дат на ближайшие 14 дней. Попробуйте выбрать другую услугу или загляните позже.
          </div>
        ) : (
          <>
            {selectedDate && !calendarExpanded && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5 mb-2">
                <p className="text-sm text-gray-800">
                  <span className="text-gray-500">Выбрано: </span>
                  <span className="font-medium">
                    {dateOptions.find((d) => d.dateStr === selectedDate)?.displayLabel || selectedDate}
                  </span>
                </p>
                <button
                  type="button"
                  className="text-sm font-semibold text-[#4CAF50] py-1 px-2 -ml-2 sm:ml-0 rounded-lg hover:bg-green-50 min-h-[44px] sm:min-h-0 text-left sm:text-right"
                  onClick={() => setCalendarExpanded(true)}
                >
                  Изменить дату
                </button>
              </div>
            )}
            {(calendarExpanded || !selectedDate) && (
              <CalendarGrid
                availableDateSet={availableDateSet}
                minDateStr={minDateStr}
                maxDateStr={maxDateStr}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
              />
            )}
          </>
        )}
      </div>

      {/* Step 3: Time */}
      {selectedDate && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">3. Время</label>
          {slotsLoading ? (
            <p className="text-gray-500 text-sm">Загрузка слотов...</p>
          ) : slotsForDate.length === 0 ? (
            <p className="text-gray-500 text-sm">На выбранную дату нет свободного времени. Выберите другую дату.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {slotsForDate.map((slot, i) => {
                const isSelected =
                  selectedSlot?.start_time === slot.start_time &&
                  selectedSlot?.end_time === slot.end_time
                const slotStartId = (slot.start_time || '').replace(/[:.]/g, '-')
                return (
                  <button
                    key={`${slot.start_time}-${i}`}
                    type="button"
                    onClick={() => handleSelectSlot(slot)}
                    className={`w-full min-h-[44px] inline-flex items-center justify-center px-1.5 py-2 sm:px-2 sm:py-2 rounded-lg text-xs sm:text-sm font-medium tabular-nums leading-tight text-center border-2 ${
                      isSelected
                        ? 'bg-[#4CAF50] border-[#4CAF50] text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                    data-testid={slotStartId ? `slot-${slotStartId}` : undefined}
                  >
                    {formatTimeShort(slot.start_time)}–{formatTimeShort(slot.end_time)}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Сводка выбора */}
      {selectedService && selectedDate && selectedSlot && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 space-y-1">
          <div>Услуга: {selectedService.name} — {selectedService.price} ₽, {selectedService.duration} мин</div>
          <div>Дата: {dateOptions.find((d) => d.dateStr === selectedDate)?.displayLabel || selectedDate}</div>
          <div>Время: {formatTimeShort(selectedSlot.start_time)}–{formatTimeShort(selectedSlot.end_time)}</div>
        </div>
      )}

      {/* CTA */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
          {submitError}
        </div>
      )}

      {canSubmit && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (submitting || bookingBlocked) {
              if (typeof __DEV__ !== 'undefined' && __DEV__) {
                console.debug('[public-booking] CTA skipped (disabled)', { submitting, bookingBlocked })
              }
              return
            }
            const payload = {
              serviceId: selectedService?.id,
              date: selectedDate,
              slot: selectedSlot ? { start_time: selectedSlot.start_time, end_time: selectedSlot.end_time } : null,
              hasCurrentUser: !!currentUser,
              draftStatus: getDraft()?.status,
            }
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.debug('[public-booking] CTA click', payload)
            }
            handleSubmit()
          }}
          disabled={submitting || bookingBlocked}
          className={`w-full py-3.5 rounded-lg font-semibold text-white ${
            submitting || bookingBlocked
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-[#4CAF50] hover:bg-[#45a049]'
          }`}
          data-testid="cta-book"
        >
          {submitting ? 'Создание записи...' : bookingBlocked ? 'Запись недоступна' : 'Записаться'}
        </button>
      )}

      <PublicBookingAuthPrompt
        open={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
        profile={profile}
        summary={authPromptSummary}
        onLogin={() => {
          metrikaGoal(M.PUBLIC_BOOKING_AUTH_CHOICE, { choice: 'login' })
          openAuthModal('client', 'login', { redirectMode: 'stay', returnToPath: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '', flow: 'publicBookingConfirm' })
        }}
        onRegister={() => {
          metrikaGoal(M.PUBLIC_BOOKING_AUTH_CHOICE, { choice: 'register' })
          openAuthModal('client', 'register', { redirectMode: 'stay', returnToPath: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '', flow: 'publicBookingConfirm' })
        }}
      />
    </div>
  )
}
