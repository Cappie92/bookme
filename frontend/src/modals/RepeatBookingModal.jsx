import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { XMarkIcon, UserIcon, TagIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { apiGet, apiRequest } from '../utils/api'
import { CalendarGrid } from '../components/booking/PublicBookingCalendarGrid'
import { useModal } from '../hooks/useModal'
import {
  bookingLikeFromSuccess,
  downloadClientBookingIcsFile,
  triggerIcsBlobDownload,
  icsDownloadFilename,
  fetchClientGoogleCalendarUrl,
  sendClientCalendarEmail,
} from '../utils/clientBookingCalendarActions'

/** Не более N параллельных GET к available-slots-repeat (раньше было до 90 сразу → шторм и 504). */
const SLOT_FETCH_CONCURRENCY = 5

/** Плоский список слотов публичного availability → карта по дате (как дальше фильтрует PublicBookingWizard). */
function slotsFlatToByDate(slots) {
  const map = {}
  for (const s of slots || []) {
    const st = s?.start_time
    if (!st) continue
    const dateKey = String(st).slice(0, 10)
    if (!map[dateKey]) map[dateKey] = []
    map[dateKey].push(s)
  }
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
  }
  return map
}

/**
 * Публичный API ждёт MasterService.id; в записи клиента booking.service_id — FK на services.id.
 * Сопоставляем с услугами из GET /api/public/masters/{slug} (те же id, что на /m/:slug).
 * Без «угадывания» первой услуги в списке — иначе тихий неверный id и путаница со слотами.
 */
function resolveMasterServiceId(profile, booking, serviceInfo) {
  const list = profile?.services
  if (!Array.isArray(list) || list.length === 0) return null
  const name = String(serviceInfo?.name || booking?.service_name || '').trim()
  const dur = serviceInfo?.duration ?? booking?.duration

  if (name && dur != null) {
    const exact = list.find(
      (s) => String(s.name).trim() === name && Number(s.duration) === Number(dur)
    )
    if (exact) return exact.id
  }
  if (name) {
    const matches = list.filter((s) => String(s.name).trim() === name)
    if (matches.length === 1) return matches[0].id
  }
  return null
}

export default function RepeatBookingModal({ 
  isOpen, 
  onClose, 
  booking,
  onBookingSuccess 
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [createdBooking, setCreatedBooking] = useState(null)
  const [accountEmailForCal, setAccountEmailForCal] = useState(null)
  const [calendarError, setCalendarError] = useState(null)
  const [calendarDownloading, setCalendarDownloading] = useState(false)
  const [googleCalLoading, setGoogleCalLoading] = useState(false)
  const [emailRemindStatus, setEmailRemindStatus] = useState('idle')
  const [availableSlots, setAvailableSlots] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [serviceInfo, setServiceInfo] = useState(null)
  // Карта доступности: { 'YYYY-MM-DD': Slot[] }.
  const [slotsByDate, setSlotsByDate] = useState({})
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [clientName, setClientName] = useState('')
  /** null | 'public' — один GET availability как на /m/:slug; 'repeat' — дозагрузка месяцев через available-slots-repeat */
  const [availabilitySource, setAvailabilitySource] = useState(null)
  /** Сообщение под календарём: нет сопоставления услуги и т.п. (без шторма repeat) */
  const [availabilityHint, setAvailabilityHint] = useState('')

  const uiMasterName = booking?.master_name || ''
  const uiServiceName = booking?.service_name || ''
  const uiDuration = booking?.duration
  const uiPrice = booking?.price

  /** Приоритет полей booking; примитивы для deps — без лишнего перезапуска эффекта при том же наборе значений после setServiceInfo. */
  const resolveName = String(booking?.service_name || serviceInfo?.name || '').trim()
  const resolveDuration =
    booking?.duration !== undefined && booking?.duration !== null
      ? booking.duration
      : serviceInfo?.duration
  const resolvePrice =
    booking?.price !== undefined && booking?.price !== null
      ? booking.price
      : serviceInfo?.price

  const owner = useMemo(() => {
    // Master-only canon: сначала мастер (как публичная запись и get_available_slots для MASTER),
    // indie / salon только если мастера нет.
    if (booking?.master_id) return { owner_type: 'master', owner_id: booking.master_id }
    if (booking?.indie_master_id) return { owner_type: 'indie_master', owner_id: booking.indie_master_id }
    if (booking?.salon_id) return { owner_type: 'salon', owner_id: booking.salon_id }
    return { owner_type: '', owner_id: 0 }
  }, [booking?.indie_master_id, booking?.master_id, booking?.salon_id])

  // Минимальная дата — завтра. Максимальная — +90 дней (возможна навигация по календарю).
  const minDateStr = useMemo(() => {
    const t = new Date()
    t.setDate(t.getDate() + 1)
    return t.toISOString().split('T')[0]
  }, [])
  const maxDateStr = useMemo(() => {
    const t = new Date()
    t.setDate(t.getDate() + 90)
    return t.toISOString().split('T')[0]
  }, [])

  /** Уже загруженные месяцы (y-m0) в рамках открытой модалки — без повторного шторма при смене месяца туда-обратно. */
  const loadedMonthsRef = useRef(new Set())
  const monthLoadAbortRef = useRef(null)

  useEffect(() => {
    if (isOpen && booking) {
      loadedMonthsRef.current = new Set()
      setAvailabilitySource(null)
      setAvailabilityHint('')
      setServiceInfo(null)
      setSlotsByDate({})
      setCalendarLoading(false)
      monthLoadAbortRef.current?.abort()
      monthLoadAbortRef.current = null
      setSubmitSuccess(false)
      setCreatedBooking(null)
      setAccountEmailForCal(null)
      setCalendarError(null)
      setCalendarDownloading(false)
      setGoogleCalLoading(false)
      setEmailRemindStatus('idle')
      loadBookingDetails()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, booking])

  useEffect(() => {
    if (!submitSuccess || !createdBooking) {
      setAccountEmailForCal(null)
      setEmailRemindStatus('idle')
      return
    }
    let cancelled = false
    setAccountEmailForCal(null)
    setEmailRemindStatus('idle')
    ;(async () => {
      try {
        const me = await apiGet('/api/auth/users/me')
        if (!cancelled) {
          const em = me?.email != null ? String(me.email).trim() : ''
          setAccountEmailForCal(em)
        }
      } catch {
        if (!cancelled) setAccountEmailForCal('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [submitSuccess, createdBooking])

  const downloadRepeatBookingIcs = async () => {
    if (!createdBooking) return
    setCalendarError(null)
    setCalendarDownloading(true)
    try {
      const like = bookingLikeFromSuccess(createdBooking)
      const blob = await downloadClientBookingIcsFile(like, 60)
      triggerIcsBlobDownload(blob, icsDownloadFilename(like))
    } catch (e) {
      setCalendarError(e?.message || 'Не удалось скачать файл календаря')
    } finally {
      setCalendarDownloading(false)
    }
  }

  const openGoogleCalendarFromRepeatSuccess = async () => {
    if (!createdBooking) return
    setCalendarError(null)
    setGoogleCalLoading(true)
    try {
      const url = await fetchClientGoogleCalendarUrl(bookingLikeFromSuccess(createdBooking), 60)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      const d = e?.detail
      setCalendarError(typeof d === 'string' ? d : e?.message || 'Не удалось открыть Google Календарь')
    } finally {
      setGoogleCalLoading(false)
    }
  }

  const sendEmailReminderFromRepeatSuccess = async () => {
    if (!createdBooking || !accountEmailForCal) return
    setCalendarError(null)
    setEmailRemindStatus('loading')
    try {
      await sendClientCalendarEmail(bookingLikeFromSuccess(createdBooking), 60)
      setEmailRemindStatus('sent')
    } catch (e) {
      const d = e?.detail
      setCalendarError(typeof d === 'string' ? d : e?.message || 'Не удалось отправить письмо')
      setEmailRemindStatus('idle')
    }
  }

  /**
   * Один месяц: только дни в [minDateStr, maxDateStr], чанки по SLOT_FETCH_CONCURRENCY,
   * AbortController отменяет при закрытии модалки / смене параметров (499 на nginx при уходе).
   */
  const loadAvailabilityMonth = useCallback(
    async (year, month0, signal, serviceDurationPassed) => {
      const serviceDuration = serviceDurationPassed ?? booking?.duration
      if (serviceDuration == null || !owner.owner_type || !owner.owner_id) return
      const lastDay = new Date(year, month0 + 1, 0).getDate()
      const days = []
      for (let day = 1; day <= lastDay; day++) {
        const dateStr = `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        if (dateStr < minDateStr || dateStr > maxDateStr) continue
        days.push(dateStr)
      }

      for (let i = 0; i < days.length; i += SLOT_FETCH_CONCURRENCY) {
        if (signal.aborted) return
        const chunk = days.slice(i, i + SLOT_FETCH_CONCURRENCY)
        const results = await Promise.all(
          chunk.map(async (dateStr) => {
            const [y, mo, d] = dateStr.split('-').map((x) => parseInt(x, 10))
            const q = new URLSearchParams({
              owner_type: owner.owner_type,
              owner_id: String(owner.owner_id),
              year: String(y),
              month: String(mo),
              day: String(d),
              service_duration: String(serviceDuration),
            })
            const path = `/api/bookings/available-slots-repeat?${q.toString()}`
            try {
              const slots = await apiRequest(path, { method: 'GET', signal })
              return { dateStr, slots: Array.isArray(slots) ? slots : [] }
            } catch (e) {
              if (e?.name === 'AbortError') throw e
              return { dateStr, slots: [] }
            }
          })
        )
        if (signal.aborted) return
        const patch = {}
        for (const { dateStr, slots } of results) {
          if (slots.length > 0) patch[dateStr] = slots
        }
        if (Object.keys(patch).length > 0) {
          setSlotsByDate((prev) => ({ ...prev, ...patch }))
        }
      }
    },
    [booking?.duration, owner.owner_type, owner.owner_id, minDateStr, maxDateStr]
  )

  useEffect(() => {
    if (!isOpen || !booking) {
      return
    }

    const slug = String(booking?.master_domain || booking?.master_slug || '').trim()
    const canUsePublicMaster = Boolean(slug && booking?.master_id)
    const nameForResolve = resolveName
    const durationForRepeat = resolveDuration

    console.log('[RepeatBookingModal] availability precheck', {
      canUsePublicMaster,
      slug,
      master_id: booking?.master_id,
      bookingId: booking?.id,
      resolveName,
      resolveDuration,
      resolvePrice,
      serviceInfoPresent: Boolean(serviceInfo),
    })

    const resolveReady = nameForResolve.length > 0 && resolveDuration != null

    if (canUsePublicMaster && !resolveReady) {
      console.warn(
        '[RepeatBookingModal] public-flow отложен: нет названия или длительности услуги для сопоставления с MasterService',
        { nameForResolve, duration: resolveDuration }
      )
      return
    }

    if (!canUsePublicMaster && (durationForRepeat == null || !owner.owner_type || !owner.owner_id)) {
      console.warn('[RepeatBookingModal] узкий fallback repeat невозможен: нет slug/master_id или нет duration/owner', {
        slug,
        owner,
        durationForRepeat,
      })
      return
    }

    const ac = new AbortController()
    setSlotsByDate({})
    setAvailabilityHint('')
    setCalendarLoading(true)

    const runFallbackInitial = async (signal, serviceDuration) => {
      console.warn('[RepeatBookingModal] fallback → available-slots-repeat (узкий резерв)', {
        reason: 'нет master_domain+master_id или ошибка загрузки публичного профиля',
        slug: slug || null,
        owner,
      })
      if (!owner.owner_type || !owner.owner_id || serviceDuration == null) return
      loadedMonthsRef.current = new Set()
      const min = new Date(minDateStr + 'T12:00:00')
      const minY = min.getFullYear()
      const minM = min.getMonth()
      loadedMonthsRef.current.add(`${minY}-${minM}`)

      const now = new Date()
      const viewY = now.getFullYear()
      const viewM = now.getMonth()
      if (`${viewY}-${viewM}` !== `${minY}-${minM}`) {
        loadedMonthsRef.current.add(`${viewY}-${viewM}`)
      }

      await loadAvailabilityMonth(minY, minM, signal, serviceDuration)
      if (signal.aborted) return
      if (`${viewY}-${viewM}` !== `${minY}-${minM}`) {
        await loadAvailabilityMonth(viewY, viewM, signal, serviceDuration)
      }
    }

    ;(async () => {
      try {
        if (canUsePublicMaster) {
          let profile
          try {
            console.log('[RepeatBookingModal] public-flow: GET profile', slug)
            profile = await apiRequest(`/api/public/masters/${encodeURIComponent(slug)}`, {
              method: 'GET',
              signal: ac.signal,
            })
          } catch (e) {
            if (e?.name === 'AbortError') throw e
            console.warn('[RepeatBookingModal] public profile недоступен → узкий fallback repeat', e?.message || e)
            await runFallbackInitial(ac.signal, resolveDuration)
            if (!ac.signal.aborted && owner.owner_type && owner.owner_id) {
              setAvailabilitySource('repeat')
            }
            return
          }

          if (ac.signal.aborted) return

          const nServices = Array.isArray(profile?.services) ? profile.services.length : 0
          console.log('[RepeatBookingModal] profile OK', { slug, servicesCount: nServices })

          const msId = resolveMasterServiceId(profile, booking, {
            name: resolveName,
            duration: resolveDuration,
            price: resolvePrice,
          })
          console.log('[RepeatBookingModal] resolveMasterServiceId →', msId)

          if (!msId) {
            console.warn(
              '[RepeatBookingModal] MasterService.id не сопоставлена; массовый repeat НЕ запускаем',
              { slug, resolveName, resolveDuration, sampleServices: (profile?.services || []).slice(0, 5) }
            )
            setAvailabilityHint(
              'Не удалось сопоставить услугу записи с услугами мастера на публичной странице. Обратитесь в поддержку или выберите время у мастера по ссылке на его страницу записи.'
            )
            setSlotsByDate({})
            setAvailabilitySource(null)
            return
          }

          const q = new URLSearchParams({
            service_id: String(msId),
            from_date: minDateStr,
            to_date: maxDateStr,
          })
          console.log('[RepeatBookingModal] public-flow: GET availability', slug, q.toString())
          const data = await apiRequest(
            `/api/public/masters/${encodeURIComponent(slug)}/availability?${q.toString()}`,
            { method: 'GET', signal: ac.signal }
          )
          if (ac.signal.aborted) return
          setSlotsByDate(slotsFlatToByDate(data.slots || []))
          setAvailabilitySource('public')
          return
        }

        await runFallbackInitial(ac.signal, durationForRepeat)
        if (!ac.signal.aborted && owner.owner_type && owner.owner_id) {
          setAvailabilitySource('repeat')
        }
      } catch (e) {
        if (e?.name === 'AbortError') return
        console.error('Ошибка загрузки доступности:', e)
      } finally {
        if (!ac.signal.aborted) setCalendarLoading(false)
      }
    })()

    return () => {
      ac.abort()
    }
  }, [
    isOpen,
    booking?.id,
    booking?.master_domain,
    booking?.master_slug,
    booking?.master_id,
    resolveName,
    resolveDuration,
    resolvePrice,
    minDateStr,
    maxDateStr,
    owner.owner_type,
    owner.owner_id,
    loadAvailabilityMonth,
  ])

  const handleCalendarMonthChange = useCallback(
    ({ year, month }) => {
      if (availabilitySource !== 'repeat') return
      if (!isOpen || !owner.owner_type || !owner.owner_id) return
      const repeatDur = booking?.duration ?? serviceInfo?.duration
      if (repeatDur == null) return
      const monthKey = `${year}-${month}`
      if (loadedMonthsRef.current.has(monthKey)) return
      loadedMonthsRef.current.add(monthKey)

      monthLoadAbortRef.current?.abort()
      const ac = new AbortController()
      monthLoadAbortRef.current = ac

      ;(async () => {
        try {
          await loadAvailabilityMonth(year, month, ac.signal, repeatDur)
        } catch (e) {
          if (e?.name !== 'AbortError') console.error('Ошибка дозагрузки месяца:', e)
        }
      })()
    },
    [availabilitySource, isOpen, booking?.duration, serviceInfo?.duration, owner.owner_type, owner.owner_id, loadAvailabilityMonth]
  )

  // Адаптер для CalendarGrid.
  const availableDateSet = useMemo(() => {
    return new Set(Object.keys(slotsByDate))
  }, [slotsByDate])

  // Авто-выбор ближайшей доступной даты после загрузки availability,
  // если selectedDate ещё не выбрана пользователем или больше не доступна.
  useEffect(() => {
    if (calendarLoading) return
    const dates = Object.keys(slotsByDate).sort()
    if (dates.length === 0) return
    if (!selectedDate || !slotsByDate[selectedDate]) {
      setSelectedDate(dates[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsByDate, calendarLoading])

  // Слоты для выбранной даты — производное от кэша.
  useEffect(() => {
    if (!selectedDate) {
      setAvailableSlots([])
      return
    }
    const list = slotsByDate[selectedDate] || []
    setAvailableSlots(list)
    setSelectedSlot(null)
  }, [selectedDate, slotsByDate])

  const loadBookingDetails = async () => {
    try {
      setLoading(true)
      setError('')

      // Минимизируем сетевые запросы: UI берём из booking.
      // Догружаем service profile только если из booking не хватает name/duration/price.
      const hasServiceBasics = Boolean(uiServiceName) && uiDuration != null && uiPrice != null
      if (hasServiceBasics) {
        setServiceInfo({ id: booking.service_id, name: uiServiceName, duration: uiDuration, price: uiPrice })
      } else if (booking.service_id) {
        const serviceResponse = await apiGet(`/api/client/bookings/service/${booking.service_id}/profile`)
        setServiceInfo(serviceResponse)
      }

      // client_name требуется backend-у в BookingCreate; берём из booking если есть, иначе из /me
      const nameFromBooking = booking.client_name || booking.clientName || ''
      if (nameFromBooking) {
        setClientName(nameFromBooking)
      } else {
        try {
          const me = await apiGet('/api/auth/users/me')
          setClientName(me?.full_name || me?.name || '')
        } catch {
          setClientName('')
        }
      }

      // selectedDate автоматически выберется как ближайшая доступная
      // после загрузки availability (см. useEffect ниже).
      setSelectedSlot(null)
    } catch (error) {
      console.error('Ошибка загрузки деталей записи:', error)
      setError('Не удалось загрузить детали записи')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!selectedDate || !selectedSlot?.start_time || !selectedSlot?.end_time) {
      setError('Выберите дату и время')
      return
    }

    try {
      setLoading(true)
      setError('')

      const serviceNameForCreate = serviceInfo?.name || uiServiceName || ''
      const serviceDurationForCreate = serviceInfo?.duration ?? uiDuration
      const servicePriceForCreate = serviceInfo?.price ?? uiPrice

      if (!booking?.service_id || !serviceNameForCreate || serviceDurationForCreate == null || servicePriceForCreate == null) {
        setError('Не удалось определить параметры услуги для повтора записи')
        return
      }
      if (!clientName) {
        setError('Не удалось определить имя клиента для создания записи')
        return
      }

      // Backend контракт: ровно один из master_id / indie_master_id, не оба
      // (см. backend/utils/booking_factory.py:validate_booking_invariants).
      // Master-only canon: предпочитаем master_id, indie_master_id шлём только
      // если master_id отсутствует.
      const masterIdForCreate = booking.master_id || null
      const indieMasterIdForCreate = masterIdForCreate ? null : (booking.indie_master_id || null)

      // salon_id / branch_id больше не передаём из фронта: backend сам их
      // нормализует через normalize_booking_fields (выводит salon_id из
      // service.salon_id, если service салонный). После удаления «салонного
      // мастера» из контракта клиента — это всё равно не наша забота.
      const bookingData = {
        service_id: booking.service_id,
        master_id: masterIdForCreate,
        indie_master_id: indieMasterIdForCreate,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        client_name: clientName,
        service_name: serviceNameForCreate,
        service_duration: Number(serviceDurationForCreate),
        service_price: Number(servicePriceForCreate),
        notes: `Повторная запись от ${new Date().toLocaleDateString('ru-RU')}`,
      }

      const response = await fetch('/api/client/bookings/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify(bookingData),
      })

      if (response.ok) {
        const result = await response.json()
        setSubmitSuccess(true)
        setCreatedBooking(result)
        onBookingSuccess?.(result)
      } else {
        const errorData = await response.json().catch(() => ({}))
        // FastAPI может вернуть detail как строку или как массив (422 валидация).
        // Печатаем JSON-строкой (а не объектом), чтобы DevTools не сворачивал в `{…}`.
        console.error(
          '[Repeat] booking creation failed',
          'status=', response.status,
          'body=', JSON.stringify(errorData),
          'payload=', JSON.stringify(bookingData),
        )
        const detail = errorData?.detail
        let msg
        if (typeof detail === 'string') {
          msg = detail
        } else if (Array.isArray(detail)) {
          msg = detail.map((e) => e?.msg || JSON.stringify(e)).join('; ')
        } else if (detail) {
          msg = JSON.stringify(detail)
        } else {
          msg = `Ошибка при создании записи (HTTP ${response.status})`
        }
        setError(msg)
      }

    } catch (error) {
      console.error('Ошибка при создании записи:', error)
      setError('Ошибка при создании записи')
    } finally {
      setLoading(false)
    }
  }

  const { handleBackdropClick, handleMouseDown } = useModal(onClose)

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 isolate bg-black/70 lg:flex lg:items-center lg:justify-center lg:bg-black/60"
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div
        className="fixed inset-x-0 bottom-0 top-[calc(6rem+env(safe-area-inset-top,0px))] flex flex-col overflow-hidden bg-white lg:relative lg:inset-auto lg:mx-4 lg:h-auto lg:max-h-[88vh] lg:max-w-2xl lg:rounded-xl lg:shadow-xl lg:w-full"
        role="dialog"
        aria-modal="true"
        aria-labelledby="repeat-booking-title"
      >
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#E7E2DF] bg-white px-4 py-[14px] lg:px-5">
          <h2 id="repeat-booking-title" className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-snug text-[#2D2D2D] lg:text-lg">
            Повторить запись
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="relative z-30 shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F4F1EF] text-[#6B6B6B] hover:bg-[#EAE4E0] focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 lg:h-10 lg:w-10 lg:rounded-full lg:bg-white lg:text-neutral-900 lg:shadow-md lg:ring-1 lg:ring-neutral-300 lg:hover:bg-neutral-50 lg:hover:ring-neutral-400"
          >
            <XMarkIcon className="h-4 w-4 lg:h-5 lg:w-5" strokeWidth={2} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 lg:px-5">
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4CAF50] mx-auto mb-4"></div>
              <p className="text-gray-600 text-sm">Загрузка...</p>
            </div>
          </div>
        ) : submitSuccess ? (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 lg:px-5">
            <div
              className="bg-white rounded-xl shadow-sm border border-green-200 p-6 sm:p-8 text-center"
              data-testid="repeat-success-screen"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-1">Запись создана</h3>
              <p className="text-gray-700 text-sm font-medium mb-1">
                {createdBooking?.public_reference
                  ? `Номер записи: ${createdBooking.public_reference}`
                  : 'Запись создана — номер доступен в личном кабинете.'}
              </p>
              <p className="text-gray-600 text-sm mb-6">Мастер подтвердит запись. Вы можете посмотреть её в личном кабинете.</p>
              <div className="mt-2 flex flex-col items-center gap-3">
                <div
                  className="flex w-full max-w-[18rem] flex-col gap-2 border border-gray-200 rounded-lg bg-white overflow-hidden text-left"
                  data-testid="calendar-actions"
                >
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-100">
                    Календарь
                  </div>
                  {accountEmailForCal != null && accountEmailForCal ? (
                    <p className="px-3 py-1.5 text-xs text-gray-600 border-b border-gray-100" data-testid="calendar-email-hint">
                      Напоминание на e-mail: <span className="font-medium text-gray-800">{accountEmailForCal}</span>
                    </p>
                  ) : null}
                  {accountEmailForCal != null && !accountEmailForCal ? (
                    <p className="px-3 py-1.5 text-xs text-amber-800 border-b border-amber-100 bg-amber-50/80" data-testid="calendar-no-email-hint">
                      В профиле не указан e-mail — добавьте его в кабинете, чтобы получать напоминания.
                    </p>
                  ) : null}
                  <div className="p-2 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={downloadRepeatBookingIcs}
                      disabled={calendarDownloading}
                      className="inline-flex items-center justify-center gap-2 min-h-11 w-full rounded-lg text-sm font-medium text-gray-800 bg-white border-2 border-gray-200 px-3 py-2.5 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60"
                      data-testid="calendar-download-ics"
                    >
                      <CalendarIcon className="w-5 h-5 shrink-0" />
                      {calendarDownloading ? 'Загрузка…' : 'Скачать .ics'}
                    </button>
                    <button
                      type="button"
                      onClick={openGoogleCalendarFromRepeatSuccess}
                      disabled={googleCalLoading}
                      className="inline-flex items-center justify-center gap-2 min-h-11 w-full rounded-lg text-sm font-medium text-gray-800 bg-white border-2 border-gray-200 px-3 py-2.5 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60"
                      data-testid="calendar-google"
                    >
                      {googleCalLoading ? 'Открытие…' : 'Google Календарь'}
                    </button>
                    <button
                      type="button"
                      onClick={sendEmailReminderFromRepeatSuccess}
                      disabled={
                        accountEmailForCal == null ||
                        !accountEmailForCal ||
                        emailRemindStatus === 'loading' ||
                        emailRemindStatus === 'sent'
                      }
                      className="inline-flex items-center justify-center gap-2 min-h-11 w-full rounded-lg text-sm font-medium text-gray-800 bg-white border-2 border-gray-200 px-3 py-2.5 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60"
                      data-testid="calendar-email"
                    >
                      {emailRemindStatus === 'loading'
                        ? 'Отправка…'
                        : emailRemindStatus === 'sent'
                          ? 'Письмо отправлено'
                          : 'Напоминание на e-mail'}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors min-h-[44px] px-5 py-3 w-full max-w-[18rem] bg-[#4CAF50] text-white hover:bg-[#45a049]"
                  data-testid="repeat-success-close"
                >
                  Закрыть
                </button>
              </div>
              {calendarError ? (
                <p className="mt-4 text-sm text-rose-700" data-testid="calendar-error">
                  {calendarError}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 lg:px-5 space-y-5">
              {/* Информация о записи. Сущности «салон» в системе нет —
                  отображаем только мастера и услугу. */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Детали записи</h3>

                {uiMasterName && (
                  <div className="flex items-center mb-2">
                    <UserIcon className="w-4 h-4 text-[#4CAF50] mr-2 shrink-0" />
                    <span className="text-sm text-gray-700">{uiMasterName}</span>
                  </div>
                )}

                {serviceInfo && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <TagIcon className="h-4 w-4 text-[#4CAF50] shrink-0" />
                    <span>{serviceInfo.name} — {serviceInfo.duration} мин</span>
                  </div>
                )}
              </div>

              {/* Выбор даты — единый CalendarGrid из публичной страницы /m/:slug */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Дата записи
                  </label>
                  {selectedDate && (
                    <span className="text-xs text-gray-500 tabular-nums">
                      {new Date(selectedDate).toLocaleDateString('ru-RU', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                <CalendarGrid
                  availableDateSet={availableDateSet}
                  minDateStr={minDateStr}
                  maxDateStr={maxDateStr}
                  selectedDate={selectedDate || null}
                  onSelectDate={(dateStr) => setSelectedDate(dateStr)}
                  onMonthChange={availabilitySource === 'repeat' ? handleCalendarMonthChange : undefined}
                />
                {calendarLoading && (
                  <p className="text-xs text-gray-500 mt-2">
                    Загрузка доступности дат...
                  </p>
                )}
                {availabilityHint ? (
                  <p className="text-xs text-amber-800 mt-2 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2" role="status">
                    {availabilityHint}
                  </p>
                ) : null}
              </div>

              {/* Выбор времени */}
              {availableSlots.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Доступное время
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {availableSlots.map((slot, index) => {
                      // Извлекаем только время из start_time
                      let timeDisplay = ''
                      if (slot.start_time) {
                        const time = new Date(slot.start_time)
                        timeDisplay = time.toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false
                        })
                      } else {
                        timeDisplay = 'Время'
                      }

                      const isActive = selectedSlot?.start_time === slot.start_time
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`px-2 py-2.5 text-sm font-medium tabular-nums rounded-lg border transition-colors ${
                            isActive
                              ? 'bg-[#4CAF50] text-white border-[#4CAF50]'
                              : 'bg-white text-gray-900 border-gray-300 hover:border-[#4CAF50]'
                          }`}
                        >
                          {timeDisplay}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-5 text-center">
                  <p className="text-gray-500 text-sm">
                    На выбранную дату нет доступных слотов.<br />
                    Попробуйте выбрать другой день.
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* Кнопки */}
            <div className="border-t border-[#E7E2DF] bg-white px-4 py-3 lg:px-5 flex flex-col-reverse gap-2 lg:flex-row lg:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-gray-900 border border-gray-300 hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={loading || !selectedDate || !selectedSlot?.start_time || !selectedSlot?.end_time}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#4CAF50] text-white hover:bg-[#45A049] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Создание...' : 'Записаться'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
