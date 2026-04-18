import React, { useEffect, useMemo, useState, useCallback } from 'react'
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  UserPlusIcon,
  CalendarDaysIcon,
  ArrowUturnLeftIcon,
  HeartIcon,
  ClockIcon,
  TagIcon,
} from '@heroicons/react/24/outline'
import { apiGet, apiPost, apiPut } from '../../utils/api'
import {
  quickDiscountsByConditionType,
  isBinaryQuickConditionType,
  canonicalFirstVisitQuickRule,
} from '../../utils/loyaltyConditions'

const WEEKDAY_OPTIONS = [
  { v: 1, l: 'Понедельник' },
  { v: 2, l: 'Вторник' },
  { v: 3, l: 'Среда' },
  { v: 4, l: 'Четверг' },
  { v: 5, l: 'Пятница' },
  { v: 6, l: 'Суббота' },
  { v: 7, l: 'Воскресенье' },
]

function LoyaltyQuickTemplateIcon({ templateId, active }) {
  const cls = `h-5 w-5 shrink-0 ${active ? 'text-[#4CAF50]' : 'text-gray-500'}`
  switch (templateId) {
    case 'first_visit':
      return <UserPlusIcon className={cls} aria-hidden />
    case 'regular_visits':
      return <CalendarDaysIcon className={cls} aria-hidden />
    case 'returning_client':
      return <ArrowUturnLeftIcon className={cls} aria-hidden />
    case 'birthday':
      return <HeartIcon className={cls} aria-hidden />
    case 'happy_hours':
      return <ClockIcon className={cls} aria-hidden />
    case 'service_discount':
      return <TagIcon className={cls} aria-hidden />
    default:
      return <TagIcon className={cls} aria-hidden />
  }
}

function formatRuleSummary(discount, serviceNameById = null) {
  const ct = discount?.conditions?.condition_type
  const p = discount?.conditions?.parameters || {}
  const pct = discount?.discount_percent
  if (ct === 'first_visit') return `${pct}%`
  if (ct === 'regular_visits')
    return `${p.visits_count ?? '—'} виз. за ${p.period_days ?? '—'} дн. → ${pct}%`
  if (ct === 'returning_client') return `Нет визитов ≥ ${p.min_days_since_last_visit ?? '—'} дн. → ${pct}%`
  if (ct === 'birthday')
    return `−${p.days_before ?? 0}…+${p.days_after ?? 0} дн. от ДР → ${pct}%`
  if (ct === 'happy_hours') {
    const days = p.days || []
    const iv = (p.intervals && p.intervals[0]) || {}
    const d0 = days[0]
    const wd = WEEKDAY_OPTIONS.find((x) => x.v === d0)?.l || `день ${d0 ?? '—'}`
    return `${wd}, ${iv.start || '—'}–${iv.end || '—'} → ${pct}%`
  }
  if (ct === 'service_discount') {
    const sid = p.service_id
    const nm = serviceNameById && sid != null ? serviceNameById.get(Number(sid)) : null
    return nm ? `${nm} → ${pct}%` : `Услуга #${sid ?? '—'} → ${pct}%`
  }
  return `${pct}%`
}

function padTime(t) {
  if (!t || typeof t !== 'string') return '09:00'
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return '09:00'
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/**
 * Модалка создания / редактирования одного quick-правила (поля зависят от типа).
 */
function QuickRuleFormModal({
  open,
  mode,
  template,
  discount,
  masterServices,
  createDisabled,
  onClose,
  onSubmit,
  setError,
}) {
  const ct = template?.conditions?.condition_type
  const defaults = template?.conditions?.parameters || {}

  const [pct, setPct] = useState(String(template?.default_discount ?? 10))
  const [visitsCount, setVisitsCount] = useState(String(defaults.visits_count ?? 3))
  const [periodDays, setPeriodDays] = useState(String(defaults.period_days ?? 60))
  const [minDaysAway, setMinDaysAway] = useState(String(defaults.min_days_since_last_visit ?? 30))
  const [daysBefore, setDaysBefore] = useState(String(defaults.days_before ?? 7))
  const [daysAfter, setDaysAfter] = useState(String(defaults.days_after ?? 7))
  const [weekday, setWeekday] = useState(String((defaults.days && defaults.days[0]) || 1))
  const [tStart, setTStart] = useState(((defaults.intervals && defaults.intervals[0]?.start) || '09:00').slice(0, 5))
  const [tEnd, setTEnd] = useState(((defaults.intervals && defaults.intervals[0]?.end) || '12:00').slice(0, 5))
  const [serviceId, setServiceId] = useState('')

  useEffect(() => {
    if (!open || !template) return
    if (mode === 'edit' && discount) {
      const p = discount.conditions?.parameters || {}
      setPct(String(discount.discount_percent ?? template.default_discount))
      if (ct === 'regular_visits') {
        setVisitsCount(String(p.visits_count ?? 3))
        setPeriodDays(String(p.period_days ?? 60))
      }
      if (ct === 'returning_client') setMinDaysAway(String(p.min_days_since_last_visit ?? 30))
      if (ct === 'birthday') {
        setDaysBefore(String(p.days_before ?? 7))
        setDaysAfter(String(p.days_after ?? 7))
      }
      if (ct === 'happy_hours') {
        const days = p.days || [1]
        setWeekday(String(days[0] || 1))
        const iv = (p.intervals && p.intervals[0]) || {}
        setTStart((iv.start || '09:00').slice(0, 5))
        setTEnd((iv.end || '12:00').slice(0, 5))
      }
      if (ct === 'service_discount') setServiceId(p.service_id != null ? String(p.service_id) : '')
    } else {
      setPct(String(template.default_discount ?? 10))
      setVisitsCount(String(defaults.visits_count ?? 3))
      setPeriodDays(String(defaults.period_days ?? 60))
      setMinDaysAway(String(defaults.min_days_since_last_visit ?? 30))
      setDaysBefore(String(defaults.days_before ?? 7))
      setDaysAfter(String(defaults.days_after ?? 7))
      setWeekday(String((defaults.days && defaults.days[0]) || 1))
      setTStart(((defaults.intervals && defaults.intervals[0]?.start) || '09:00').slice(0, 5))
      setTEnd(((defaults.intervals && defaults.intervals[0]?.end) || '12:00').slice(0, 5))
      setServiceId('')
    }
  }, [open, mode, template?.id, discount?.id, ct])

  if (!open || !template) return null

  const discountNum = () => {
    const n = parseFloat(String(pct).replace(',', '.'))
    if (Number.isNaN(n) || n < 0 || n > 100) return null
    return n
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const dPct = discountNum()
    if (dPct == null) {
      setError('Укажите корректный процент скидки (0–100).')
      return
    }
    let parameters = {}
    if (ct === 'first_visit') parameters = {}
    if (ct === 'regular_visits') {
      const vc = parseInt(visitsCount, 10)
      const pd = parseInt(periodDays, 10)
      if (Number.isNaN(vc) || vc < 1 || Number.isNaN(pd) || pd < 1) {
        setError('Укажите число визитов и период (дни), не меньше 1.')
        return
      }
      parameters = { visits_count: vc, period_days: pd }
    }
    if (ct === 'returning_client') {
      const md = parseInt(minDaysAway, 10)
      if (Number.isNaN(md) || md < 0) {
        setError('Укажите неотрицательное число дней без визитов.')
        return
      }
      parameters = { min_days_since_last_visit: md, max_days_since_last_visit: null }
    }
    if (ct === 'birthday') {
      const b = parseInt(daysBefore, 10)
      const a = parseInt(daysAfter, 10)
      if (Number.isNaN(b) || b < 0 || Number.isNaN(a) || a < 0) {
        setError('Дни до и после дня рождения должны быть неотрицательными числами.')
        return
      }
      parameters = { days_before: b, days_after: a }
    }
    if (ct === 'happy_hours') {
      const d = parseInt(weekday, 10)
      if (Number.isNaN(d) || d < 1 || d > 7) {
        setError('Выберите день недели.')
        return
      }
      const s = padTime(tStart)
      const en = padTime(tEnd)
      if (s >= en) {
        setError('Время начала должно быть меньше времени окончания.')
        return
      }
      parameters = { days: [d], intervals: [{ start: s, end: en }] }
    }
    if (ct === 'service_discount') {
      const sid = parseInt(serviceId, 10)
      if (Number.isNaN(sid) || sid < 1) {
        setError('Выберите услугу из списка.')
        return
      }
      parameters = { service_id: sid }
    }

    const conditions = { condition_type: ct, parameters }

    try {
      if (mode === 'create') {
        await onSubmit({
          type: 'create',
          body: {
            discount_type: 'quick',
            name: template.name,
            description: template.description,
            discount_percent: dPct,
            max_discount_amount: null,
            conditions,
            is_active: true,
            priority: 1,
          },
        })
      } else {
        await onSubmit({
          type: 'update',
          id: discount.id,
          body: {
            discount_percent: dPct,
            conditions,
          },
        })
      }
      onClose()
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Ошибка сохранения'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-900">
          {mode === 'create' ? 'Создать правило: ' : 'Изменить правило: '}
          {template.name}
        </h3>
        <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
          {ct === 'first_visit' && (
            <p className="text-xs text-gray-600">Скидка применяется к клиенту при первой записи к вам.</p>
          )}
          {ct === 'regular_visits' && (
            <>
              <label className="block text-xs font-medium text-gray-700">
                Сколько визитов
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={visitsCount}
                  onChange={(e) => setVisitsCount(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-gray-700">
                За период, дней
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={periodDays}
                  onChange={(e) => setPeriodDays(e.target.value)}
                />
              </label>
            </>
          )}
          {ct === 'returning_client' && (
            <label className="block text-xs font-medium text-gray-700">
              Нет визитов не меньше, дней
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={minDaysAway}
                onChange={(e) => setMinDaysAway(e.target.value)}
              />
            </label>
          )}
          {ct === 'birthday' && (
            <>
              <label className="block text-xs font-medium text-gray-700">
                Дней до дня рождения
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={daysBefore}
                  onChange={(e) => setDaysBefore(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-gray-700">
                Дней после дня рождения
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={daysAfter}
                  onChange={(e) => setDaysAfter(e.target.value)}
                />
              </label>
            </>
          )}
          {ct === 'happy_hours' && (
            <>
              <label className="block text-xs font-medium text-gray-700">
                День недели
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={weekday}
                  onChange={(e) => setWeekday(e.target.value)}
                >
                  {WEEKDAY_OPTIONS.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.l}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-gray-700">
                  С
                  <input
                    type="time"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                    value={tStart}
                    onChange={(e) => setTStart(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-medium text-gray-700">
                  До
                  <input
                    type="time"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                    value={tEnd}
                    onChange={(e) => setTEnd(e.target.value)}
                  />
                </label>
              </div>
            </>
          )}
          {ct === 'service_discount' && (
            <>
              {masterServices.length === 0 ? (
                <p className="text-sm text-amber-800">
                  У вас пока нет услуг в профиле. Добавьте услуги в разделе услуг мастера, затем создайте правило.
                </p>
              ) : (
                <label className="block text-xs font-medium text-gray-700">
                  Услуга
                  <select
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                  >
                    <option value="">— выберите —</option>
                    {masterServices.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <label className="block text-xs font-medium text-gray-700">
            Скидка, %
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={createDisabled || (ct === 'service_discount' && masterServices.length === 0)}
              className="min-h-10 flex-1 rounded-lg bg-[#4CAF50] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {mode === 'create' ? 'Создать' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function QuickDiscountsHub({
  templates,
  discounts,
  createDisabled,
  loadData,
  setError,
  isAuthenticated,
  authLoading,
}) {
  const [masterServices, setMasterServices] = useState([])
  const [modal, setModal] = useState(null)
  const [busyBulk, setBusyBulk] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated || authLoading) {
      setMasterServices([])
      return
    }
    apiGet('/api/master/services')
      .then((data) => setMasterServices(Array.isArray(data) ? data : []))
      .catch(() => setMasterServices([]))
  }, [isAuthenticated, authLoading])

  const handleModalSubmit = useCallback(
    async (action) => {
      const token = localStorage.getItem('access_token')
      if (!token || !isAuthenticated || authLoading) {
        setError('Необходима авторизация')
        return
      }
      if (action.type === 'create') {
        await apiPost('/api/loyalty/quick-discounts', action.body)
      } else {
        await apiPut(`/api/loyalty/quick-discounts/${action.id}`, action.body)
      }
      await loadData()
    },
    [authLoading, isAuthenticated, loadData, setError]
  )

  const deactivateRule = async (discount) => {
    const ct = discount?.conditions?.condition_type
    const isBin = isBinaryQuickConditionType(ct)
    const msg = isBin
      ? 'Отключить правило? Строка останется в истории применений; снова включить или изменить параметры можно в этой карточке.'
      : 'Деактивировать правило? Оно перестанет применяться к новым записям.'
    if (!window.confirm(msg)) return
    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated || authLoading) {
      setError('Необходима авторизация')
      return
    }
    try {
      await apiPut(`/api/loyalty/quick-discounts/${discount.id}`, { is_active: false })
      await loadData()
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Ошибка при отключении правила')
    }
  }

  const bulkDeactivate = async (conditionType) => {
    if (!window.confirm('Отключить все активные правила этого типа?')) return
    setBusyBulk(true)
    try {
      await apiPost('/api/loyalty/quick-discounts/bulk-deactivate', { condition_type: conditionType })
      await loadData()
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Ошибка массового отключения')
    } finally {
      setBusyBulk(false)
    }
  }

  const activateBinary = async (discount) => {
    const token = localStorage.getItem('access_token')
    if (!token || !isAuthenticated || authLoading) return
    try {
      await apiPut(`/api/loyalty/quick-discounts/${discount.id}`, { is_active: true })
      await loadData()
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Ошибка включения правила')
    }
  }

  const serviceNameById = useMemo(() => {
    const m = new Map()
    ;(masterServices || []).forEach((s) => {
      if (s && s.id != null) m.set(Number(s.id), s.name)
    })
    return m
  }, [masterServices])

  const cards = useMemo(() => {
    if (!Array.isArray(templates)) return []
    return templates.map((template) => {
      const ct = template?.conditions?.condition_type
      const rules = quickDiscountsByConditionType(discounts, ct).sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0))
      const isBin = isBinaryQuickConditionType(ct)
      const isFirstVisit = ct === 'first_visit'
      const canonFv = isFirstVisit ? canonicalFirstVisitQuickRule(discounts) : null
      const displayRules = isFirstVisit ? (canonFv ? [canonFv] : []) : rules
      const activeCount = isFirstVisit
        ? (displayRules[0]?.is_active ? 1 : 0)
        : rules.filter((r) => r.is_active).length
      const canCreate = isFirstVisit
        ? quickDiscountsByConditionType(discounts, 'first_visit').length === 0
        : !isBin || rules.length === 0
      return { template, ct, rules, displayRules, isBin, activeCount, canCreate, isFirstVisit }
    })
  }, [templates, discounts])

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 sm:text-xl">Правила скидок</h2>
        <p className="text-sm text-gray-600">
          Создавайте и управляйте правилами по типам. Для каждого типа — своя форма параметров.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          При совпадении нескольких правил к записи применяется максимальный процент скидки.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-3.5">
        {cards.map(({ template, ct, rules, displayRules, isBin, activeCount, canCreate, isFirstVisit }) => {
          const anyActive = activeCount > 0
          const showBulk = !isBin && anyActive

          return (
            <div
              key={template.id}
              className={`flex flex-col rounded-xl border bg-white p-3 shadow-sm transition-colors sm:p-4 ${
                anyActive ? 'border-[#4CAF50]/45 ring-1 ring-[#4CAF50]/20' : 'border-gray-200/90 hover:border-gray-300'
              }`}
            >
              <div className="flex gap-2.5">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    anyActive ? 'bg-[#4CAF50]/10' : 'bg-gray-100'
                  }`}
                >
                  <LoyaltyQuickTemplateIcon templateId={template.id} active={anyActive} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold leading-snug text-gray-900">{template.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-snug text-gray-600">{template.description}</p>
                </div>
              </div>

              <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                {displayRules.length > 0 && (
                  <ul className={`space-y-1.5 ${isFirstVisit ? 'list-none' : ''}`}>
                    {displayRules.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-2 py-1.5 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-gray-800">{formatRuleSummary(r, serviceNameById)}</span>
                          {!r.is_active && (
                            <span className="ml-1.5 text-[10px] font-medium text-amber-700">неактивно</span>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {!r.is_active && isBin ? (
                            <button
                              type="button"
                              disabled={createDisabled}
                              onClick={() => activateBinary(r)}
                              className="rounded-md bg-[#4CAF50] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              Включить
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={createDisabled}
                            onClick={() => setModal({ mode: 'edit', template, discount: r })}
                            className="rounded-md border border-gray-200 bg-white p-1 text-gray-600 disabled:opacity-50"
                            aria-label="Изменить"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={createDisabled}
                            onClick={() => deactivateRule(r)}
                            className="rounded-md border border-gray-200 bg-white p-1 text-red-600 disabled:opacity-50"
                            aria-label="Отключить правило"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {canCreate && (
                    <button
                      type="button"
                      disabled={createDisabled}
                      onClick={() => setModal({ mode: 'create', template, discount: null })}
                      className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-[#4CAF50] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Создать правило
                    </button>
                  )}
                  {showBulk && (
                    <button
                      type="button"
                      disabled={createDisabled || busyBulk}
                      onClick={() => bulkDeactivate(ct)}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                    >
                      Удалить все правила
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {modal ? (
        <QuickRuleFormModal
          open
          mode={modal.mode}
          template={modal.template}
          discount={modal.discount}
          masterServices={masterServices}
          createDisabled={createDisabled}
          onClose={() => setModal(null)}
          onSubmit={handleModalSubmit}
          setError={setError}
        />
      ) : null}
    </div>
  )
}
