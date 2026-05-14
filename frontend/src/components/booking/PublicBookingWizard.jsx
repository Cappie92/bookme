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
import PublicBookingLoggedInConfirmModal from './PublicBookingLoggedInConfirmModal'
import { metrikaGoal } from '../../analytics/metrika'
import { M } from '../../analytics/metrikaEvents'
import { apiGet } from '../../utils/api'
import {
  bookingLikeFromSuccess,
  downloadClientBookingIcsFile,
  triggerIcsBlobDownload,
  icsDownloadFilename,
  fetchClientGoogleCalendarUrl,
  sendClientCalendarEmail,
} from '../../utils/clientBookingCalendarActions'
import { CalendarGrid } from './PublicBookingCalendarGrid'

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

/** en-US short weekday → Python isoweekday (Пн=1 … Вс=7), как в backend happy_hours. */
const WEEKDAY_SHORT_TO_ISO = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function getMasterLocalWeekdayAndMinutes(isoString, timeZone) {
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  let weekday
  let hour = 0
  let minute = 0
  for (const p of parts) {
    if (p.type === 'weekday') weekday = WEEKDAY_SHORT_TO_ISO[p.value]
    if (p.type === 'hour') hour = parseInt(p.value, 10) || 0
    if (p.type === 'minute') minute = parseInt(p.value, 10) || 0
  }
  if (weekday == null) return null
  return { weekday, minutes: hour * 60 + minute }
}

function hhmmToMinutes(hhmm) {
  const parts = String(hhmm).split(':')
  if (parts.length < 2) return null
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/** Единый числовой id для сопоставления услуги из профиля с loyalty_visual.service_discounts[].master_service_id. */
function normalizeMasterServiceId(raw) {
  if (raw === null || raw === undefined) return null
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Карта master_service_id → запись скидки (ключи только number — без string/number рассинхрона). */
function buildServiceDiscountMap(loyaltyVisual) {
  const m = new Map()
  for (const x of loyaltyVisual?.service_discounts || []) {
    const raw = x.master_service_id ?? x.masterServiceId
    const id = normalizeMasterServiceId(raw)
    if (id != null) m.set(id, x)
  }
  return m
}

function serviceDiscountBadgeForService(svc, discountMap) {
  if (!svc || !discountMap?.size) return null
  for (const key of [svc.id, svc.service_id, svc.master_service_id]) {
    const id = normalizeMasterServiceId(key)
    if (id == null) continue
    const hit = discountMap.get(id)
    if (hit) return hit
  }
  return null
}

/** Совпадение с правилами happy_hours: start включительно, end исключительно (как evaluate_discount_candidates). */
function happyHoursSlotLabel(slotStartIso, timeZone, rules) {
  const loc = getMasterLocalWeekdayAndMinutes(slotStartIso, timeZone)
  if (!loc || !rules?.length) return null
  let best = 0
  for (const r of rules) {
    if (r.weekday !== loc.weekday) continue
    const s = hhmmToMinutes(r.start_time)
    const e = hhmmToMinutes(r.end_time)
    if (s == null || e == null) continue
    if (loc.minutes >= s && loc.minutes < e) {
      const p = Number(r.discount_percent) || 0
      if (p > best) best = p
    }
  }
  if (best <= 0) return null
  if (Math.abs(best - Math.round(best)) < 1e-6) return `\u2212${Math.round(best)}%`
  return `\u2212${best}%`
}

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

function writeLastBookingSuccess(payload) {
  const {
    slug,
    id,
    public_reference,
    service_id,
    start_time,
    end_time,
    service_name,
    base_price,
    discount_percent,
    discount_amount,
    final_price,
    rule_name,
    condition_type,
  } = payload
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
        service_name: service_name ?? null,
        base_price: base_price ?? null,
        discount_percent: discount_percent ?? null,
        discount_amount: discount_amount ?? 0,
        final_price: final_price ?? null,
        rule_name: rule_name ?? null,
        condition_type: condition_type ?? null,
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

const LOYALTY_HINT_TITLE_BY_TYPE = {
  birthday: 'День рождения',
  first_visit: 'Первый визит',
  returning_client: 'Скидка за возвращение',
  regular_visits: 'Постоянный клиент',
  service_discount: 'Скидка на услугу',
  personal: 'Персональная скидка',
  happy_hours: 'Счастливые часы',
}

function formatSuccessBookingDateRu(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function unwrapPublicBookingCreatePayload(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const d = raw.data
  if (d != null && typeof d === 'object' && !Array.isArray(d)) return d
  return raw
}

function toFiniteNumberOrNull(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Ответ POST /bookings: единый вид полей (snake_case + camelCase из прокси/старых клиентов). */
function normalizePublicBookingCreateResponse(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const src = unwrapPublicBookingCreatePayload(raw)
  const sn = src.service_name ?? src.serviceName
  const st = src.start_time ?? src.startTime
  const et = src.end_time ?? src.endTime
  const fp = src.final_price ?? src.finalPrice
  const bp = src.base_price ?? src.basePrice
  const dpct = src.discount_percent ?? src.discountPercent
  const damt = src.discount_amount ?? src.discountAmount
  const rn = src.rule_name ?? src.ruleName
  const ct = src.condition_type ?? src.conditionType
  const finalPrice = toFiniteNumberOrNull(fp)
  const basePrice = toFiniteNumberOrNull(bp)
  const discPct = dpct == null || dpct === '' ? null : toFiniteNumberOrNull(dpct)
  const discAmtRaw = damt == null || damt === '' ? 0 : toFiniteNumberOrNull(damt)
  const discAmt = discAmtRaw == null ? 0 : discAmtRaw
  return {
    ...src,
    service_name: sn != null ? String(sn) : null,
    start_time: st ?? null,
    end_time: et ?? null,
    final_price: finalPrice,
    base_price: basePrice,
    discount_percent: discPct,
    discount_amount: discAmt,
    rule_name: rn != null ? String(rn) : null,
    condition_type: ct != null ? String(ct) : null,
  }
}

/** Дополняет ответ POST только если в нём не хватает полей для сводки (источник истины — POST; UI — запасной слой). */
function fillPublicBookingCreateSummaryGaps(normalized, clientCtx) {
  const n = normalizePublicBookingCreateResponse(normalized)
  if (!clientCtx || !n || typeof n !== 'object') return n
  const out = { ...n }
  if (!String(out.service_name ?? '').trim() && clientCtx.serviceName) {
    out.service_name = String(clientCtx.serviceName)
  }
  if ((!out.start_time || !String(out.start_time).trim()) && clientCtx.startTime) {
    out.start_time = clientCtx.startTime
  }
  if (!out.end_time && clientCtx.endTime) {
    out.end_time = clientCtx.endTime
  }
  const pv = clientCtx.preview
  if (pv && typeof pv === 'object') {
    if (out.final_price == null || !Number.isFinite(Number(out.final_price))) {
      const fp = toFiniteNumberOrNull(pv.final_price ?? pv.finalPrice)
      if (fp != null) out.final_price = fp
    }
    if (out.base_price == null || !Number.isFinite(Number(out.base_price))) {
      const bp = toFiniteNumberOrNull(pv.base_price ?? pv.basePrice)
      if (bp != null) out.base_price = bp
    }
    if (out.discount_percent == null || !Number.isFinite(Number(out.discount_percent))) {
      const dp = toFiniteNumberOrNull(pv.discount_percent ?? pv.discountPercent)
      if (dp != null) out.discount_percent = dp
    }
    if (!(Number(out.discount_amount) > 0) && Number(pv.discount_amount ?? pv.discountAmount) > 0) {
      const da = toFiniteNumberOrNull(pv.discount_amount ?? pv.discountAmount)
      if (da != null) out.discount_amount = da
    }
    if (!String(out.rule_name ?? '').trim() && (pv.rule_name ?? pv.ruleName)) {
      out.rule_name = String(pv.rule_name ?? pv.ruleName)
    }
    if (!String(out.condition_type ?? '').trim() && (pv.condition_type ?? pv.conditionType)) {
      out.condition_type = String(pv.condition_type ?? pv.conditionType)
    }
  }
  return normalizePublicBookingCreateResponse(out)
}

function hasPublicBookingSuccessSummary(s) {
  if (!s || typeof s !== 'object') return false
  const n = normalizePublicBookingCreateResponse(s)
  const nameOk = String(n.service_name ?? '').trim().length > 0
  const timeOk = n.start_time != null && String(n.start_time).trim() !== ''
  const priceOk = n.final_price != null && Number.isFinite(Number(n.final_price))
  return nameOk && timeOk && priceOk
}

function devLogPublicBookingCreateSuccess(label, rawBody, normalized) {
  if (!import.meta.env.DEV) return
  const sum = normalizePublicBookingCreateResponse(normalized)
  console.debug(`[public-booking] create success (${label})`, {
    raw: rawBody,
    normalized: sum,
    hasPublicBookingSuccessSummary: hasPublicBookingSuccessSummary(sum),
  })
}

function successDiscountRuleLabel(s) {
  const n = normalizePublicBookingCreateResponse(s)
  const r = String(n.rule_name ?? '').trim()
  if (r) return r
  const ct = String(n.condition_type ?? '').trim()
  if (ct && LOYALTY_HINT_TITLE_BY_TYPE[ct]) return LOYALTY_HINT_TITLE_BY_TYPE[ct]
  return ct || ''
}

/** Для sessionStorage после POST: слот + нормализованные поля цены из ответа API. */
function bookingSuccessPayloadForStorage(slug, rawResult, slotMeta) {
  const n = normalizePublicBookingCreateResponse(rawResult)
  return {
    slug,
    id: n.id,
    public_reference: n.public_reference,
    service_id: slotMeta.service_id,
    start_time: slotMeta.start_time ?? n.start_time,
    end_time: slotMeta.end_time ?? n.end_time,
    service_name: n.service_name,
    base_price: n.base_price,
    discount_percent: n.discount_percent,
    discount_amount: n.discount_amount,
    final_price: n.final_price,
    rule_name: n.rule_name,
    condition_type: n.condition_type,
  }
}

function buildLoyaltyHintCopy(hint) {
  if (!hint?.active) return null
  const pct = hint.discount_percent != null ? Math.round(Number(hint.discount_percent)) : null
  const pctPart = pct != null && pct > 0 ? ` — ${pct}%` : ''
  const baseTitle =
    LOYALTY_HINT_TITLE_BY_TYPE[hint.condition_type] || 'Доступна скидка'
  const title =
    hint.condition_type === 'birthday'
      ? `${baseTitle} активна${pctPart}`
      : `${baseTitle}${pctPart}`
  const sub =
    hint.condition_type === 'birthday'
      ? 'Размер будет учтён при выборе услуги и времени визита.'
      : 'Итоговая сумма — после выбора услуги и времени.'
  return { title, sub }
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
  /** Один исходящий POST create на /bookings: блокирует гонку auto-submit × ручной «Записаться» (второй POST → 400). */
  const publicBookingCreateInFlightRef = useRef(false)
  /** Актуальный profile: читать в post-login effect из ref, чтобы не включать `profile` в deps (там новый объект с каждого fetch → abort in-flight). */
  const profileForAutoRef = useRef(profile)
  profileForAutoRef.current = profile
  const [selectedService, setSelectedService] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [pricePreview, setPricePreview] = useState(null)
  const [pricePreviewLoading, setPricePreviewLoading] = useState(false)
  const [pricePreviewError, setPricePreviewError] = useState(null)
  const pricePreviewRef = useRef(null)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const [showLoggedInConfirmModal, setShowLoggedInConfirmModal] = useState(false)
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
  /** E-mail учётки для подписи «на …» (null = ещё грузим). */
  const [accountEmailForCal, setAccountEmailForCal] = useState(null)
  const [googleCalLoading, setGoogleCalLoading] = useState(false)
  const [emailRemindStatus, setEmailRemindStatus] = useState('idle')
  const [emailRemindRecipient, setEmailRemindRecipient] = useState(null)

  useEffect(() => {
    if (!success) {
      setAccountEmailForCal(null)
      setEmailRemindStatus('idle')
      setEmailRemindRecipient(null)
      return
    }
    let cancelled = false
    setAccountEmailForCal(null)
    setEmailRemindStatus('idle')
    setEmailRemindRecipient(null)
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
  }, [success])

  const downloadPublicBookingIcs = useCallback(async () => {
    if (!success) return
    setCalendarError(null)
    setCalendarDownloading(true)
    try {
      const like = bookingLikeFromSuccess(success)
      const blob = await downloadClientBookingIcsFile(like, 60)
      triggerIcsBlobDownload(blob, icsDownloadFilename(like))
    } catch (e) {
      setCalendarError(e?.message || 'Не удалось скачать файл календаря')
    } finally {
      setCalendarDownloading(false)
    }
  }, [success])

  const openGoogleCalendarFromSuccess = useCallback(async () => {
    if (!success) return
    setCalendarError(null)
    setGoogleCalLoading(true)
    try {
      const url = await fetchClientGoogleCalendarUrl(bookingLikeFromSuccess(success), 60)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      const d = e?.response?.data?.detail
      setCalendarError(typeof d === 'string' ? d : e?.message || 'Не удалось открыть Google Календарь')
    } finally {
      setGoogleCalLoading(false)
    }
  }, [success])

  const sendEmailReminderFromSuccess = useCallback(async () => {
    if (!success || !accountEmailForCal) return
    setCalendarError(null)
    setEmailRemindStatus('loading')
    try {
      const data = await sendClientCalendarEmail(bookingLikeFromSuccess(success), 60)
      const to = data?.recipient_email || accountEmailForCal
      setEmailRemindRecipient(to)
      setEmailRemindStatus('sent')
    } catch (e) {
      setEmailRemindStatus('idle')
      setCalendarError('Не удалось отправить письмо. Попробуйте ещё раз')
    }
  }, [success, accountEmailForCal])

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

  /** Dropdown: по умолчанию все категории свернуты; при поиске — раскрыть все группы с результатами. */
  useEffect(() => {
    if (!showServiceDropdown) return
    if (serviceSearch.trim()) {
      setExpandedCategories(new Set(groups.map((g) => g.name)))
    } else {
      setExpandedCategories(new Set())
    }
  }, [showServiceDropdown, serviceSearch, groups])

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

  const masterTz = profile?.master_timezone || 'Europe/Moscow'
  const hhVisualRules = profile?.loyalty_visual?.happy_hours || []

  const serviceDiscountByMasterServiceId = useMemo(
    () => buildServiceDiscountMap(profile?.loyalty_visual),
    [profile?.loyalty_visual],
  )

  const selectedServiceSdBadge = useMemo(
    () => serviceDiscountBadgeForService(selectedService, serviceDiscountByMasterServiceId),
    [selectedService, serviceDiscountByMasterServiceId],
  )

  const selectedSlotHhLabel = useMemo(
    () => (selectedSlot ? happyHoursSlotLabel(selectedSlot.start_time, masterTz, hhVisualRules) : null),
    [selectedSlot, masterTz, hhVisualRules],
  )

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
    if (!slug || !selectedService || !selectedSlot) {
      setPricePreview(null)
      setPricePreviewError(null)
      setPricePreviewLoading(false)
      return
    }
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
    let cancelled = false
    const st = encodeURIComponent(selectedSlot.start_time)
    const url = `/api/public/masters/${encodeURIComponent(slug)}/booking-price-preview?service_id=${selectedService.id}&start_time=${st}`
    setPricePreviewLoading(true)
    setPricePreviewError(null)
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    fetch(url, { headers })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.detail || err?.message || res.statusText)
        }
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setPricePreview(data)
      })
      .catch(() => {
        if (!cancelled) {
          setPricePreview(null)
          setPricePreviewError('Не удалось загрузить расчёт скидки')
        }
      })
      .finally(() => {
        if (!cancelled) setPricePreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug, selectedService, selectedSlot, currentUser?.id])

  useEffect(() => {
    pricePreviewRef.current = pricePreview
  }, [pricePreview])

  useEffect(() => {
    if (!import.meta.env.DEV || !success) return
    const sum = normalizePublicBookingCreateResponse(success)
    console.debug('[public-booking] success state', {
      rawSuccess: success,
      normalized: sum,
      hasPublicBookingSuccessSummary: hasPublicBookingSuccessSummary(sum),
    })
  }, [success])

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
    setShowLoggedInConfirmModal(false)
  }, [selectedService?.id, selectedDate, selectedSlot?.start_time, selectedSlot?.end_time])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // После логина: либо быстрый авто-POST (свежее намерение), либо только восстановление формы + явный «Записаться».
  // deps: без `profile` (только profile.master_id) — смена ссылки на profile с сервера не рвёт in-flight create.
  useEffect(() => {
    const p = profileForAutoRef.current
    if (!slug || !p || !currentUser || success) return
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
      const last = readLastBookingSuccess(slug)
      const idMatch =
        last &&
        draft.created_booking_id != null &&
        Number(last.id) === Number(draft.created_booking_id)
      const refMatch =
        last &&
        String(draft.created_public_reference || '').trim() !== '' &&
        String(last.public_reference || '').trim() === String(draft.created_public_reference || '').trim()
      const mergedFromStorage = idMatch || refMatch ? last : {}
      setSuccess(
        normalizePublicBookingCreateResponse({
          id: draft.created_booking_id,
          public_reference: draft.created_public_reference || '',
          ...mergedFromStorage,
        })
      )
      setSelectedService(null)
      setSelectedDate(null)
      setSelectedSlot(null)
      return
    }
    const svc = p.services?.find((s) => s.id === draft.service_id)
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
      publicBookingCreateInFlightRef.current = true
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
        const normalizedResult = fillPublicBookingCreateSummaryGaps(
          normalizePublicBookingCreateResponse(result),
          {
            serviceName: svc?.name,
            startTime: payload.start_time,
            endTime: payload.end_time,
            preview: pricePreviewRef.current,
          }
        )
        devLogPublicBookingCreateSuccess('post_login_auto_submit', result, normalizedResult)
        writeLastBookingSuccess(
          bookingSuccessPayloadForStorage(slug, normalizedResult, {
            service_id: payload.service_id,
            start_time: payload.start_time,
            end_time: payload.end_time,
          })
        )
        {
          // Успех на сервере не должен теряться из‑за гонки isActive: снимаем «submitted» с draft,
          // если в storage всё ещё тот же create_after_auth payload.
          const d = getDraft()
          if (
            d &&
            d.slug === slug &&
            d.intent === 'create_after_auth' &&
            d.service_id === payload.service_id &&
            d.start_time === payload.start_time &&
            d.end_time === payload.end_time
          ) {
            clearDraft()
          }
        }
        if (mountedRef.current) {
          setPostLoginRestoreNotice(false)
          setSuccess(normalizedResult)
          setSelectedService(null)
          setSelectedDate(null)
          setSelectedSlot(null)
          onBookingSuccess?.(normalizedResult)
          // Если effect уже rerun'нулся, finally не снимет submitting — снимаем вручную.
          if (!isActive()) setSubmitting(false)
        }
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
          const restored = normalizePublicBookingCreateResponse({
            id: last.id,
            public_reference: last.public_reference || '',
            service_name: last.service_name,
            start_time: last.start_time,
            end_time: last.end_time,
            base_price: last.base_price,
            discount_percent: last.discount_percent,
            discount_amount: last.discount_amount,
            final_price: last.final_price,
            rule_name: last.rule_name,
            condition_type: last.condition_type,
          })
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
        publicBookingCreateInFlightRef.current = false
        if (isActive()) setSubmitting(false)
      }
    })()

    return () => {
      ac.abort()
    }
  }, [slug, currentUser, success, profile?.master_id ?? 0]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const restored = normalizePublicBookingCreateResponse({
      id: r.id,
      public_reference: r.public_reference || '',
      service_name: r.service_name,
      start_time: r.start_time,
      end_time: r.end_time,
      base_price: r.base_price,
      discount_percent: r.discount_percent,
      discount_amount: r.discount_amount,
      final_price: r.final_price,
      rule_name: r.rule_name,
      condition_type: r.condition_type,
    })
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
  const loyaltyHintCopy = useMemo(() => buildLoyaltyHintCopy(eligibility?.loyalty_hint), [eligibility?.loyalty_hint])

  const performPublicBookingCreate = useCallback(async () => {
    if (!canSubmit || bookingBlocked) return
    if (!currentUser) return
    if (success) return
    if (publicBookingCreateInFlightRef.current) return
    const dBlock = getDraft()
    if (
      dBlock &&
      dBlock.slug === slug &&
      dBlock.intent === 'create_after_auth' &&
      dBlock.status === 'submitted'
    ) {
      return
    }
    setSubmitError(null)
    publicBookingCreateInFlightRef.current = true
    setSubmitting(true)
    metrikaGoal(M.PUBLIC_BOOKING_FORM_SUBMIT, { slug, context: 'public_wizard' })
    const url = `/api/public/masters/${encodeURIComponent(slug)}/bookings`
    const payload = {
      service_id: selectedService.id,
      start_time: selectedSlot.start_time,
      end_time: selectedSlot.end_time,
    }
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
          console.debug('[public-booking] POST booking error', { status: res.status, body: errData })
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
      const normalizedResult = fillPublicBookingCreateSummaryGaps(
        normalizePublicBookingCreateResponse(result),
        {
          serviceName: selectedService?.name,
          startTime: selectedSlot?.start_time,
          endTime: selectedSlot?.end_time,
          preview: pricePreviewRef.current,
        }
      )
      devLogPublicBookingCreateSuccess('wizard_submit', result, normalizedResult)
      writeLastBookingSuccess(
        bookingSuccessPayloadForStorage(slug, normalizedResult, {
          service_id: selectedService.id,
          start_time: selectedSlot.start_time,
          end_time: selectedSlot.end_time,
        })
      )
      clearDraft()
      setPostLoginRestoreNotice(false)
      setSuccess(normalizedResult)
      setSelectedService(null)
      setSelectedDate(null)
      setSelectedSlot(null)
      onBookingSuccess?.(normalizedResult)
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
        const restored = normalizePublicBookingCreateResponse({
          id: last.id,
          public_reference: last.public_reference || '',
          service_name: last.service_name,
          start_time: last.start_time,
          end_time: last.end_time,
          base_price: last.base_price,
          discount_percent: last.discount_percent,
          discount_amount: last.discount_amount,
          final_price: last.final_price,
          rule_name: last.rule_name,
          condition_type: last.condition_type,
        })
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
      publicBookingCreateInFlightRef.current = false
      setSubmitting(false)
    }
  }, [
    slug,
    canSubmit,
    bookingBlocked,
    currentUser,
    success,
    selectedService,
    selectedSlot,
    onBookingSuccess,
    onBookingError,
  ])

  const handleGuestBookingIntent = useCallback(() => {
    if (!canSubmit || bookingBlocked) return
    setSubmitError(null)
    const attemptId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
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
  }, [slug, canSubmit, bookingBlocked, selectedService, selectedSlot])

  const toggleCategory = (name) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (success) {
    const sum = normalizePublicBookingCreateResponse(success)
    const discountRuleLabel = successDiscountRuleLabel(sum)
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
      'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors min-h-[44px] px-5 py-3 w-full max-w-md'
    return (
      <div
        className="bg-white rounded-2xl shadow-sm border border-emerald-200/50 p-6 sm:p-8 flex flex-col items-center text-center"
        data-testid="success-screen"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-[#4CAF50] mb-4">
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
        <p className="text-gray-600 text-sm mb-5 max-w-md">
          Мастер подтвердит запись. Вы можете посмотреть её в личном кабинете.
        </p>
        {hasPublicBookingSuccessSummary(sum) ? (
          <div
            className="w-full max-w-md mb-5 rounded-xl border border-[#BDE6CC] bg-[#EAF9EE] px-[18px] py-3.5 text-left text-[15px] leading-relaxed text-[#2F6F44]"
            data-testid="public-booking-success-summary"
          >
            <div className="mb-1.5">
              <strong className="font-semibold">Услуга:</strong> {sum.service_name}
            </div>
            <div className="mb-1.5">
              <strong className="font-semibold">Дата:</strong> {formatSuccessBookingDateRu(sum.start_time)}
            </div>
            <div className="mb-1.5">
              <strong className="font-semibold">Время:</strong>{' '}
              {sum.end_time
                ? `${formatTimeShort(sum.start_time)}–${formatTimeShort(sum.end_time)}`
                : formatTimeShort(sum.start_time)}
            </div>
            {Number(sum.discount_amount) > 0 ? (
              <div className="mb-1.5">
                <strong className="font-semibold">Скидка:</strong> {'\u2212'}
                {Number(sum.discount_amount).toLocaleString('ru-RU')} ₽
                {sum.discount_percent != null ? (
                  <>
                    {' / \u2212'}
                    {Number(sum.discount_percent)}%
                  </>
                ) : null}
                {discountRuleLabel ? ` — ${discountRuleLabel}` : ''}
              </div>
            ) : null}
            <div className="font-semibold">
              К оплате: {Number(sum.final_price).toLocaleString('ru-RU')} ₽
            </div>
          </div>
        ) : null}
        <div
          className="w-full max-w-md flex flex-col border border-gray-200 rounded-lg bg-white overflow-hidden text-left"
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
                onClick={downloadPublicBookingIcs}
                disabled={calendarDownloading}
                className="inline-flex items-center justify-center gap-2 min-h-11 w-full rounded-lg text-sm font-medium text-gray-800 bg-white border-2 border-gray-200 px-3 py-2.5 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60"
                data-testid="calendar-download-ics"
              >
                <CalendarIcon className="w-5 h-5 shrink-0" />
                {calendarDownloading ? 'Загрузка…' : 'Скачать .ics'}
              </button>
              <button
                type="button"
                onClick={openGoogleCalendarFromSuccess}
                disabled={googleCalLoading}
                className="inline-flex items-center justify-center gap-2 min-h-11 w-full rounded-lg text-sm font-medium text-gray-800 bg-white border-2 border-gray-200 px-3 py-2.5 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60"
                data-testid="calendar-google"
              >
                {googleCalLoading ? 'Открытие…' : 'Google Календарь'}
              </button>
              <button
                type="button"
                onClick={sendEmailReminderFromSuccess}
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
                  ? 'Отправляем...'
                  : emailRemindStatus === 'sent'
                    ? `Письмо отправлено на ${emailRemindRecipient || accountEmailForCal || ''}`
                    : 'Напоминание на e-mail'}
              </button>
            </div>
          </div>
        <button
          type="button"
          onClick={() => navigate(goToMyBookingsHref)}
          className={`${btnBase} mt-5 bg-[#4CAF50] text-white hover:bg-[#45a049] shrink-0`}
          data-testid="go-to-my-bookings"
        >
          Перейти в личный кабинет
        </button>
        {calendarError ? (
          <p className="mt-4 text-sm text-rose-700 max-w-md" data-testid="calendar-error">
            {calendarError}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="w-full max-w-none space-y-[18px] pb-2">
      {currentUser && loyaltyHintCopy && (
        <div
          className="rounded-[14px] border border-[#BFE9D1] bg-[#DFF5EC] px-[18px] py-4 mb-1"
          data-testid="public-loyalty-hint-banner"
        >
          <p className="text-base font-semibold text-[#2F7C43] leading-snug">{loyaltyHintCopy.title}</p>
          <p className="mt-1 text-[13px] text-[#4E7C60] leading-relaxed">{loyaltyHintCopy.sub}</p>
        </div>
      )}
      {postLoginRestoreNotice && (
        <div
          className="bg-sky-50/90 border border-sky-200/80 rounded-xl p-3.5 text-sky-900 text-sm flex gap-2 justify-between items-start"
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
        <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl p-3 text-amber-900 text-sm">
          Запись недоступна
        </div>
      )}
      {requiresAdvancePayment && (
        <div className="bg-sky-50/90 border border-sky-200/70 rounded-xl p-3 text-sky-900 text-sm">
          Требуется предоплата для подтверждения записи
        </div>
      )}

      {/* Step 1: Услуга — .step + .select-shell */}
      <div className="mb-0">
        <label className="block text-[15px] font-medium text-[#4B4F59] mb-2.5">1. Услуга</label>
        <div className="relative">
          {services.length === 0 ? (
            <div className="w-full min-h-[60px] px-[18px] flex items-center justify-center bg-[#FAFAFB] border border-[#E8E2DD] rounded-[14px] text-center text-base text-[#6A6E76]">
              У мастера пока нет услуг
            </div>
          ) : (
          <>
          <button
            type="button"
            onClick={() => setShowServiceDropdown(!showServiceDropdown)}
            className="w-full min-h-[60px] flex items-center justify-between gap-3 px-[18px] bg-white border border-[#E8E2DD] rounded-[14px] text-left shadow-[0_1px_2px_rgba(45,45,45,0.03)] hover:border-[#D8D2CD] focus:outline-none focus:ring-2 focus:ring-[#4CAF50]/25 focus:border-[#4CAF50]"
            data-testid="service-picker-button"
          >
            <span className="flex items-center gap-2.5 flex-wrap min-w-0">
              {selectedService ? (
                <>
                  <span className="min-w-0 text-base font-normal text-[#30323A] leading-snug">
                    {selectedService.name} — {selectedService.price} ₽, {selectedService.duration} мин
                  </span>
                  {selectedServiceSdBadge?.label ? (
                    <span
                      className="shrink-0 inline-flex items-center justify-center min-w-[38px] h-7 px-2 rounded-lg bg-[#E8F8EE] text-[13px] font-bold text-[#2F7C43] border border-[#B8E7C9] tabular-nums"
                      title="Скидка на услугу"
                    >
                      {selectedServiceSdBadge.label}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-base text-[#A1A4AD]">Выберите услугу</span>
              )}
            </span>
            {showServiceDropdown ? (
              <ChevronUpIcon className="w-5 h-5 text-[#B6B9C2] shrink-0" />
            ) : (
              <ChevronDownIcon className="w-5 h-5 text-[#B6B9C2] shrink-0" />
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
                  z-[45] md:z-20 bg-white border border-[#E8E2DD] flex flex-col min-h-0 overflow-hidden
                  max-md:fixed max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:rounded-t-2xl max-md:border-b-0 max-md:shadow-2xl
                  max-md:h-[calc(100svh-10px)] max-md:max-h-[calc(100svh-10px)] max-md:pb-[env(safe-area-inset-bottom,0px)]
                  md:absolute md:top-full md:left-0 md:right-0 md:mt-2 md:h-auto md:rounded-2xl md:max-h-[min(70vh,520px)]
                "
                style={{ boxShadow: '0 18px 40px -22px rgba(35,35,35,.35)' }}
                role="dialog"
                aria-modal="true"
                aria-label="Выбор услуги"
              >
                <div className="shrink-0 border-b border-[#E8E2DD] max-md:pt-[max(env(safe-area-inset-top),0.5rem)] bg-white">
                  <div className="flex md:hidden justify-center pt-1 pb-2" aria-hidden="true">
                    <span className="h-1 w-11 rounded-full bg-neutral-300" />
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3.5 px-4 md:px-4">
                    <h3 className="m-0 text-[15px] font-semibold text-[#222222]">Услуга</h3>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full text-[#7F838D] hover:bg-neutral-100 active:bg-neutral-200 text-2xl leading-none font-light"
                        aria-label="Закрыть без выбора"
                        onClick={() => setShowServiceDropdown(false)}
                      >
                        <XMarkIcon className="w-6 h-6" />
                      </button>
                      <button
                        type="button"
                        className="min-h-[40px] px-4 rounded-xl bg-[#4CAF50] text-white text-sm font-semibold hover:bg-[#45A049] active:opacity-95"
                        onClick={() => setShowServiceDropdown(false)}
                      >
                        Готово
                      </button>
                    </div>
                  </div>
                </div>
                <div className="py-3 px-4 border-b border-[#E8E2DD] shrink-0 bg-white">
                  <input
                    type="text"
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    placeholder="Поиск по названию…"
                    className="w-full h-[42px] rounded-xl border border-[#E8E2DD] px-3.5 text-sm text-[#444444] placeholder:text-[#8C8E96] outline-none focus:border-[#4CAF50] focus:ring-1 focus:ring-[#4CAF50]/30"
                  />
                </div>
                <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 bg-white" role="listbox">
                  {groups.map((g) => (
                    <div key={g.name} className="border-t border-[#E8E2DD] first:border-t-0">
                      <div className="px-3 pt-3 pb-2">
                        <button
                          type="button"
                          onClick={() => toggleCategory(g.name)}
                          className="w-full h-[30px] rounded-md border border-[#BFE9D1] border-l-[3px] border-l-[#4CAF50] bg-[#F3FBF5] flex items-center justify-between px-3 text-[13px] font-bold hover:bg-[#E8F8EE] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50]/35"
                          aria-expanded={expandedCategories.has(g.name)}
                        >
                          <span className="flex items-center gap-1.5 min-w-0 uppercase tracking-wide">
                            <span className="truncate text-[#222222]">{g.name}</span>
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[#D4F1DE] text-[11px] font-bold text-[#2F7C43] px-1.5 shrink-0">
                              {g.services.length}
                            </span>
                          </span>
                          {expandedCategories.has(g.name) ? (
                            <ChevronUpIcon className="w-4 h-4 shrink-0 text-[#5A8F6A]" />
                          ) : (
                            <ChevronDownIcon className="w-4 h-4 shrink-0 text-[#5A8F6A]" />
                          )}
                        </button>
                      </div>
                      {expandedCategories.has(g.name) && (
                        <div className="pb-2">
                          {g.services.map((s) => {
                            const sdBadge = serviceDiscountBadgeForService(s, serviceDiscountByMasterServiceId)
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => handleSelectService(s)}
                                className={`w-full text-left py-2 px-4 pb-3 flex items-start justify-between gap-3 transition-colors ${
                                  selectedService?.id === s.id ? 'bg-[#F6FFFA]' : 'hover:bg-[#FBFBFC]'
                                }`}
                                data-testid={`service-option-${s.id}`}
                              >
                                <div className="min-w-0">
                                  <div className="text-[15px] font-medium text-[#2D313A] leading-snug">{s.name}</div>
                                  <div className="text-[13px] text-[#8B9098] mt-0.5 tabular-nums">
                                    {s.price} ₽ · {s.duration} мин
                                  </div>
                                </div>
                                {sdBadge?.label ? (
                                  <span
                                    className="shrink-0 inline-flex items-center justify-center min-w-[38px] h-7 px-2 rounded-lg bg-[#E8F8EE] text-[13px] font-bold text-[#2F7C43] border border-[#B8E7C9] tabular-nums self-center"
                                    title="Скидка на услугу"
                                  >
                                    {sdBadge.label}
                                  </span>
                                ) : null}
                              </button>
                            )
                          })}
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

      {/* Step 2: Дата — .date-shell / ghost-shell */}
      <div>
        <label className="block text-[15px] font-medium text-[#4B4F59] mb-2.5">2. Дата</label>
        {!canSelectDate ? (
          <div className="min-h-[60px] flex items-center justify-center px-[18px] bg-[#FAFAFB] border border-[#E8E2DD] rounded-[14px] text-base text-[#6A6E76] text-center shadow-[0_1px_2px_rgba(45,45,45,0.03)]">
            Сначала выберите услугу
          </div>
        ) : slotsLoading ? (
          <div className="py-10 text-center text-[#66686F] text-base">Загрузка дат...</div>
        ) : slotsError ? (
          <div className="py-4 text-center text-red-600 text-sm">{slotsError}</div>
        ) : dateOptions.length === 0 ? (
          <div className="py-10 text-center text-[#66686F] text-base" data-testid="date-empty-state">
            Нет свободных дат на ближайшие 14 дней. Попробуйте выбрать другую услугу или загляните позже.
          </div>
        ) : (
          <>
            {selectedDate && !calendarExpanded && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-h-[60px] rounded-[14px] border border-[#E8E2DD] bg-white pl-[18px] pr-3.5 py-2 shadow-[0_1px_2px_rgba(45,45,45,0.03)] mb-2.5">
                <p className="text-[15px] text-[#858994] flex items-center gap-2 min-h-[44px] sm:min-h-0">
                  <span>Выбрано: </span>
                  <span className="font-semibold text-[#373A41]">
                    {dateOptions.find((d) => d.dateStr === selectedDate)?.displayLabel || selectedDate}
                  </span>
                </p>
                <button
                  type="button"
                  className="text-[15px] font-semibold text-[#4CAF50] py-2 px-1 rounded-lg hover:bg-[#F0FFF4] min-h-[44px] sm:min-h-0 text-left sm:text-right shrink-0"
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

      {/* Step 3: Время — .slots / .slot */}
      {selectedDate && (
        <div>
          <label className="block text-[15px] font-medium text-[#4B4F59] mb-2.5">3. Время</label>
          {slotsLoading ? (
            <p className="text-[#66686F] text-base">Загрузка слотов...</p>
          ) : slotsForDate.length === 0 ? (
            <p className="text-[#66686F] text-base">На выбранную дату нет свободного времени. Выберите другую дату.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
              {slotsForDate.map((slot, i) => {
                const isSelected =
                  selectedSlot?.start_time === slot.start_time &&
                  selectedSlot?.end_time === slot.end_time
                const slotStartId = (slot.start_time || '').replace(/[:.]/g, '-')
                const hhLabel = happyHoursSlotLabel(slot.start_time, masterTz, hhVisualRules)
                return (
                  <button
                    key={`${slot.start_time}-${i}`}
                    type="button"
                    onClick={() => handleSelectSlot(slot)}
                    className={`h-[52px] min-h-[52px] w-full inline-flex flex-col items-center justify-center rounded-xl text-sm font-medium tabular-nums leading-tight text-center border shadow-[0_1px_2px_rgba(45,45,45,0.03)] transition-shadow ${
                      isSelected
                        ? 'bg-[#4CAF50] border-[#4CAF50] text-white shadow-[0_8px_18px_-10px_rgba(76,175,80,0.6)]'
                        : 'bg-white border-[#E8E2DD] text-[#3B3F47] hover:border-[#D0CAC4]'
                    }`}
                    data-testid={slotStartId ? `slot-${slotStartId}` : undefined}
                    title={hhLabel ? `Счастливые часы ${hhLabel}` : undefined}
                  >
                    <span className={`time ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                      {formatTimeShort(slot.start_time)}–{formatTimeShort(slot.end_time)}
                    </span>
                    {hhLabel ? (
                      <span
                        className={`badge text-xs font-medium mt-0.5 leading-none ${
                          isSelected ? 'text-[#E9FFEF]' : 'text-[#45A049]'
                        }`}
                      >
                        {hhLabel}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Сводка — .summary */}
      {selectedService && selectedDate && selectedSlot && (
        <div
          className="mt-5 rounded-[14px] border border-[#BDE6CC] bg-[#EAF9EE] px-[18px] py-4 text-[#2F6F44]"
          data-testid="public-booking-summary"
        >
          <div className="text-[15px] leading-relaxed mb-1.5 last:mb-0">
            <strong className="font-semibold">Услуга:</strong> {selectedService.name}
          </div>
          <div className="text-[15px] leading-relaxed mb-1.5 last:mb-0">
            <strong className="font-semibold">Дата:</strong>{' '}
            {dateOptions.find((d) => d.dateStr === selectedDate)?.displayLabel || selectedDate}
          </div>
          <div className="text-[15px] leading-relaxed mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              <strong className="font-semibold">Время:</strong>{' '}
              {formatTimeShort(selectedSlot.start_time)}–{formatTimeShort(selectedSlot.end_time)}
            </span>
            {selectedSlotHhLabel ? (
              <span
                className="inline-flex items-center h-[26px] px-2.5 rounded-lg bg-[#F3FFF6] border border-[#CAEAD4] text-xs font-bold text-[#2F7C43] tabular-nums"
                title="Счастливые часы"
              >
                Счастливые часы {selectedSlotHhLabel}
              </span>
            ) : null}
          </div>
          {pricePreviewLoading && (
            <div className="text-sm text-[#4E7C60] pt-2 mt-2 border-t border-[#CDE8D7]">Считаем скидку…</div>
          )}
          {pricePreviewError && (
            <div className="text-sm text-amber-900 pt-2 mt-2 border-t border-[#CDE8D7]">{pricePreviewError}</div>
          )}
          {pricePreview && !pricePreviewLoading && (
            <>
              <div className="h-px bg-[#CDE8D7] my-2.5" aria-hidden="true" />
              <div className="text-[15px] leading-relaxed mb-1.5 text-[#2F6F44] space-y-1.5">
                {Number(pricePreview.discount_amount) > 0 ? (
                  <div>
                    Скидка: {'\u2212'}
                    {Number(pricePreview.discount_amount).toLocaleString('ru-RU')} ₽
                    {pricePreview.discount_percent != null ? (
                      <>
                        {' / \u2212'}
                        {Number(pricePreview.discount_percent)}%
                      </>
                    ) : null}
                    {pricePreview.rule_name ? ` (${pricePreview.rule_name})` : ''}
                  </div>
                ) : null}
                <div className="font-semibold">
                  К оплате:{' '}
                  {Number(
                    Number(pricePreview.discount_amount) > 0
                      ? pricePreview.final_price
                      : pricePreview.base_price
                  ).toLocaleString('ru-RU')}{' '}
                  ₽
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* CTA */}
      {submitError && (
        <div className="bg-red-50/90 border border-red-200/80 rounded-xl p-3.5 text-red-900 text-sm">
          {submitError}
        </div>
      )}

      {canSubmit && (
        <div className="mt-4">
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
            if (!currentUser) {
              handleGuestBookingIntent()
              return
            }
            setShowLoggedInConfirmModal(true)
          }}
          disabled={submitting || bookingBlocked}
          className={`w-full min-h-[52px] rounded-xl text-lg font-bold text-white transition-colors ${
            submitting || bookingBlocked
              ? 'bg-neutral-300 cursor-not-allowed shadow-none'
              : 'bg-[#4CAF50] hover:bg-[#45A049] shadow-[0_1px_0_#2F7C43,0_6px_16px_-8px_rgba(76,175,80,0.45)]'
          }`}
          data-testid="cta-book"
        >
          {submitting ? 'Создание записи...' : bookingBlocked ? 'Запись недоступна' : 'Записаться'}
          </button>
        </div>
      )}

      <PublicBookingLoggedInConfirmModal
        open={showLoggedInConfirmModal}
        onClose={() => !submitting && setShowLoggedInConfirmModal(false)}
        onConfirm={() => {
          setShowLoggedInConfirmModal(false)
          void performPublicBookingCreate()
        }}
        onChangeTime={() => {
          setShowLoggedInConfirmModal(false)
          setSelectedSlot(null)
        }}
        profile={profile}
        summary={authPromptSummary}
        pricePreview={pricePreviewLoading ? null : pricePreview}
        selectedSlotHhLabel={selectedSlotHhLabel}
        submitting={submitting}
      />

      <PublicBookingAuthPrompt
        open={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
        profile={profile}
        summary={authPromptSummary}
        pricePreview={pricePreviewLoading ? null : pricePreview}
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
