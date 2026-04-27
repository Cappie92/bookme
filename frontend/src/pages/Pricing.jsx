import { Fragment, useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { ArrowRightIcon } from '@heroicons/react/24/solid'
import { Button } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { metrikaGoal } from '../analytics/metrika'
import { M } from '../analytics/metrikaEvents'
import { isSalonFeaturesEnabled } from '../config/features'
import { usePricingCatalog } from '../hooks/usePricingCatalog'
import { getPlanDisplayName } from '../utils/subscriptionPlanNames'
import { getPlanFeatures, getMasterTariffComparisonRows } from '../../../shared/subscriptionPlanFeatures.js'

const PAGE_BG = 'bg-[#F9F7F6]'
const CARD =
  'bg-white rounded-2xl border border-[#E7E2DF] shadow-sm'
const BTN_PRIMARY =
  '!bg-[#4CAF50] !text-white hover:!bg-[#43a047] focus:!ring-[#4CAF50] rounded-xl border-0'
const BTN_SECONDARY =
  '!bg-white !text-[#1C1917] border border-[#E7E2DF] hover:!bg-[#FAFAF9] rounded-xl'

function formatRub(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`
}

function formatMonthsRu(months) {
  if (months === 1) return '1 месяц'
  if (months === 3) return '3 месяца'
  if (months === 6) return '6 месяцев'
  if (months === 12) return '12 месяцев'
  return `${months} мес.`
}

/** Per-month price inside the package of length `durationMonths` (backend semantics). */
function pricePerMonthInPackage(plan, durationMonths) {
  if (!plan) return 0
  if (durationMonths === 1) return Number(plan.price_1month) || 0
  if (durationMonths === 3) return Number(plan.price_3months) || 0
  if (durationMonths === 6) return Number(plan.price_6months) || 0
  if (durationMonths === 12) return Number(plan.price_12months) || 0
  return 0
}

function freezeDaysForPackage(plan, durationMonths) {
  if (!plan) return 0
  if (durationMonths === 1) return Number(plan.freeze_days_1month) || 0
  if (durationMonths === 3) return Number(plan.freeze_days_3months) || 0
  if (durationMonths === 6) return Number(plan.freeze_days_6months) || 0
  if (durationMonths === 12) return Number(plan.freeze_days_12months) || 0
  return 0
}

/** Только для строки сравнения «12 мес» (freeze_yearly), значения в ячейках — из freeze_days_12months. */
function freezeDaysYearly12mForTable(plan) {
  if (!plan) return 0
  const n = Number(plan.freeze_days_12months)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Выгода годового пакета относительно помесячного тарифа в пакете 1 мес (только из полей API).
 * Возвращает null, если скидки нет или цены неполные.
 */
function yearlySavingsPercentFromApi(plan) {
  const monthly = Number(plan?.price_1month)
  const yearlyPm = Number(plan?.price_12months)
  if (!Number.isFinite(monthly) || !Number.isFinite(yearlyPm) || monthly <= 0 || yearlyPm >= monthly) {
    return null
  }
  return Math.round(100 * (1 - yearlyPm / monthly))
}

function maxYearlySavingsPercentAcrossPlans(plans) {
  let max = 0
  let any = false
  for (const p of plans) {
    const v = yearlySavingsPercentFromApi(p)
    if (v != null && v > 0) {
      any = true
      max = Math.max(max, v)
    }
  }
  return any ? max : null
}

function getComparisonRowLabelFromKey(rowKey, templatePlan) {
  if (rowKey === 'freeze_yearly') return 'Дней заморозки (12 мес)'
  return getMasterTariffComparisonRows(templatePlan, false).find((r) => r.key === rowKey)?.label
}

function getPricingComparisonRow(plan, rowKey) {
  if (rowKey === 'freeze_yearly') {
    return { key: 'freeze_yearly', available: freezeDaysYearly12mForTable(plan) > 0 }
  }
  return getMasterTariffComparisonRows(plan, false).find((r) => r.key === rowKey)
}

function getComparisonRowDetail(plan, rowKey) {
  if (!plan) return null
  if (rowKey === 'freeze_yearly') {
    const n = freezeDaysYearly12mForTable(plan)
    return n > 0 ? `${n} дней` : null
  }
  if (rowKey === 'unlimited_bookings') {
    const maxFuture = plan?.limits?.max_future_bookings
    if (maxFuture == null || maxFuture === 0) return null
    if (Number.isFinite(Number(maxFuture))) return `${maxFuture} активных`
    return null
  }
  if (rowKey === 'extended_stats') {
    const days = plan?.features?.stats_retention_days
    if (Number.isFinite(Number(days)) && Number(days) > 0) return `${days} дн.`
    return null
  }
  return null
}

function PlanCardsSkeleton({ count = 3 }) {
  return (
    <div className="grid gap-4 md:gap-6 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${CARD} p-6 animate-pulse`}>
          <div className="h-4 w-24 bg-neutral-200 rounded" />
          <div className="mt-4 h-10 w-40 bg-neutral-200 rounded-lg" />
          <div className="mt-3 h-3 w-full bg-neutral-100 rounded" />
          <div className="mt-6 space-y-2">
            <div className="h-3 w-full bg-neutral-100 rounded" />
            <div className="h-3 w-5/6 bg-neutral-100 rounded" />
            <div className="h-3 w-4/6 bg-neutral-100 rounded" />
          </div>
          <div className="mt-8 h-11 w-full bg-neutral-200 rounded-xl" />
        </div>
      ))}
    </div>
  )
}

function PeriodToggle({ value, onChange, discountBadgeLabel }) {
  const options = [
    { months: 1, label: '1 месяц' },
    { months: 3, label: '3 месяца' },
    { months: 6, label: '6 месяцев' },
    { months: 12, label: '12 месяцев' },
  ]
  return (
    <div
      className="inline-flex rounded-xl p-1 bg-[#F9F7F6] border border-[#E7E2DF] max-sm:w-full max-sm:max-w-full max-sm:gap-0.5"
      role="group"
      aria-label="Период оплаты"
    >
      {options.map((opt) => (
        <button
          key={opt.months}
          type="button"
          onClick={() => onChange(opt.months)}
          className={`relative max-sm:flex-1 max-sm:min-w-0 max-sm:px-1 max-sm:py-2.5 max-sm:text-[10px] max-sm:font-semibold max-sm:leading-tight max-sm:justify-center max-sm:text-center max-sm:whitespace-normal sm:px-4 sm:py-2 text-[13px] sm:text-sm font-semibold rounded-lg transition inline-flex items-center sm:gap-1.5 sm:whitespace-nowrap max-lg:min-h-[44px] ${
            value === opt.months ? 'bg-white text-[#1C1917] shadow-sm' : 'text-neutral-600'
          }`}
        >
          <span className="max-sm:block max-sm:px-0.5">{opt.label}</span>
          {opt.months === 12 && discountBadgeLabel ? (
            <span className="hidden sm:inline-flex shrink-0 text-[10px] uppercase tracking-wide font-bold text-[#3D8B42] bg-[#DFF5EC] border border-[#C8E8D8] rounded-full px-2 py-0.5">
              {discountBadgeLabel}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

export default function Pricing() {
  const { openAuthModal } = useAuth()
  const salonOn = isSalonFeaturesEnabled()
  const [audience, setAudience] = useState('master')
  const subscriptionType = audience === 'salon' ? 'salon' : 'master'
  const { plans, serviceFunctions, loading, error } = usePricingCatalog(subscriptionType)

  const [billingPeriodMonths, setBillingPeriodMonths] = useState(1)

  const onBillingPeriodChange = (months) => {
    setBillingPeriodMonths(months)
    metrikaGoal(M.PRICING_PERIOD_CHANGE, { months })
  }

  useEffect(() => {
    if (salonOn) return
    setAudience('master')
  }, [salonOn])

  const maxSavings = useMemo(() => maxYearlySavingsPercentAcrossPlans(plans), [plans])
  const discountBadgeLabel = maxSavings != null ? `до −${maxSavings}%` : null

  const hasAnyYearlyFreeze = useMemo(
    () => plans.some((p) => freezeDaysYearly12mForTable(p) > 0),
    [plans],
  )

  const comparisonRowDefs = useMemo(() => {
    if (!plans.length) return []
    const desiredOrder = [
      'unlimited_bookings',
      'custom_domain',
      'clients_list',
      'extended_stats',
      'client_restrictions',
      'loyalty',
      'finance',
    ]
    if (hasAnyYearlyFreeze) {
      desiredOrder.push('freeze_yearly')
    }
    const template = getMasterTariffComparisonRows(plans[0], false)
    const keys = new Set(template.map((r) => r.key))
    return desiredOrder.filter((k) => k === 'freeze_yearly' || keys.has(k))
  }, [plans, hasAnyYearlyFreeze])

  const handleRegister = () => {
    metrikaGoal(M.PRICING_CTA_REGISTER, { audience: subscriptionType })
    openAuthModal(audience === 'salon' ? 'salon' : 'master', 'register')
  }

  const visiblePlans = plans
  const hasPlans = visiblePlans.length > 0
  const showSecondarySections = !loading && !error && hasPlans

  const recommendedPlanId = useMemo(() => {
    // Безопасная эвристика без новых контрактов: рекомендуем «средний» из платных по display_order.
    const paid = visiblePlans.filter((p) => (Number(p?.price_1month) || 0) > 0)
    const candidates = (paid.length ? paid : visiblePlans).slice().sort((a, b) => {
      const da = Number(a?.display_order) || 0
      const db = Number(b?.display_order) || 0
      if (da !== db) return da - db
      return (Number(a?.id) || 0) - (Number(b?.id) || 0)
    })
    if (!candidates.length) return null
    return candidates[Math.floor(candidates.length / 2)].id
  }, [visiblePlans])

  const minMonthly = useMemo(() => {
    const values = visiblePlans.map((p) => Number(p?.price_1month)).filter((n) => Number.isFinite(n) && n > 0)
    if (!values.length) return null
    return Math.min(...values)
  }, [visiblePlans])

  const maxMonthly = useMemo(() => {
    const values = visiblePlans.map((p) => Number(p?.price_1month)).filter((n) => Number.isFinite(n) && n > 0)
    if (!values.length) return null
    return Math.max(...values)
  }, [visiblePlans])

  const renderPriceBlock = (plan) => {
    const duration = billingPeriodMonths
    const perMonth = pricePerMonthInPackage(plan, duration)
    const total = duration * perMonth
    const savings = duration === 12 ? yearlySavingsPercentFromApi(plan) : null
    const freeze = freezeDaysForPackage(plan, duration)

    return (
      <div>
        <div className="font-display text-4xl max-sm:text-[26px] md:text-5xl font-bold text-[#1C1917] tracking-tight leading-none">
          {formatRub(perMonth)}
        </div>
        <p className="mt-1 max-sm:mt-0.5 text-sm max-sm:text-[13px] max-sm:leading-snug text-neutral-500">
          за месяц в пакете на {formatMonthsRu(duration)}
        </p>
        <p className="mt-2 max-sm:mt-1 text-sm max-sm:text-[13px] max-sm:leading-snug text-neutral-600">
          К оплате: <span className="font-semibold text-[#1C1917]">{formatRub(total)}</span>
        </p>
        {savings != null ? (
          <p className="mt-1 max-sm:mt-0.5 text-xs max-sm:leading-snug font-medium text-[#3D8B42]">
            Выгода к помесячному пакету: {savings}%
          </p>
        ) : null}
        {freeze > 0 ? (
          <p className="mt-2 max-sm:mt-1 text-xs max-sm:leading-snug text-neutral-600">
            Дней заморозки в этом пакете: {freeze}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`${PAGE_BG} pt-[104px] overflow-x-hidden min-h-full`}>
      <Helmet>
        <title>Тарифы — DeDato</title>
        <meta name="description" content="Тарифы DeDato: сравните условия и стоимость и выберите лучший вариант." />
      </Helmet>

      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 pb-14 md:pb-20">
        {/* Hero */}
        <section
          className="rounded-2xl md:rounded-3xl py-8 md:py-12 px-5 sm:px-6 md:px-8 mb-10 md:mb-14 max-sm:pt-12 max-sm:pb-10"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 900px 420px at 110% -10%, rgba(76,175,80,0.07), transparent 55%), radial-gradient(ellipse 500px 300px at -5% 110%, rgba(76,175,80,0.04), transparent 55%)',
          }}
        >
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="max-w-2xl max-sm:text-center">
              <h1 className="text-[32px] sm:text-3xl md:text-5xl font-bold text-neutral-900 leading-[1.08] tracking-[-0.02em]">
                Выберите тариф, который подходит вашему{" "}
                <span className="text-[#45A049]">формату работы</span>
              </h1>
              <p className="mt-4 text-[15px] sm:text-base md:text-lg text-neutral-600 leading-relaxed">
                Сравните условия, возможности и стоимость — и подключите план, который вам комфортен.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 max-lg:w-full max-lg:items-center">
              {loading ? (
                <div className="h-11 w-64 rounded-xl bg-white/60 border border-[#E7E2DF] animate-pulse" />
              ) : (
                <div className="max-sm:w-full max-sm:max-w-full">
                  <PeriodToggle
                    value={billingPeriodMonths}
                    onChange={onBillingPeriodChange}
                    discountBadgeLabel={discountBadgeLabel}
                  />
                  {discountBadgeLabel ? (
                    <div className="sm:hidden mt-1.5 flex w-full justify-end pr-0.5">
                      <span className="inline-flex max-w-full min-w-0 items-center rounded-full bg-[#4CAF50] px-2.5 py-1 text-[10px] font-bold leading-none tracking-wide text-white tabular-nums">
                        <span className="truncate">{discountBadgeLabel}</span>
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {salonOn ? (
            <div className="mt-8 flex flex-wrap gap-2">
              <span className="text-sm text-neutral-600 self-center mr-2">Кому показать тарифы:</span>
              <button
                type="button"
                onClick={() => setAudience('master')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                  audience === 'master'
                    ? 'bg-white border-[#E7E2DF] text-[#1C1917] shadow-sm'
                    : 'bg-transparent border-transparent text-neutral-600 hover:text-[#1C1917]'
                }`}
              >
                Мастер
              </button>
              <button
                type="button"
                onClick={() => setAudience('salon')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                  audience === 'salon'
                    ? 'bg-white border-[#E7E2DF] text-[#1C1917] shadow-sm'
                    : 'bg-transparent border-transparent text-neutral-600 hover:text-[#1C1917]'
                }`}
              >
                Салон
              </button>
            </div>
          ) : null}
        </section>

        {error ? (
          <div className={`${CARD} mb-8 px-4 py-3 border-red-200 bg-red-50/60`} role="alert">
            <p className="text-sm font-semibold text-red-900">Не удалось загрузить тарифы</p>
          </div>
        ) : null}

        {/* Plan cards */}
        <section aria-labelledby="pricing-plans-heading" className="mb-12 md:mb-16">
          <h2 id="pricing-plans-heading" className="sr-only">
            Тарифные планы
          </h2>
          {loading ? (
            <PlanCardsSkeleton count={Math.min(Math.max(visiblePlans.length || 3, 2), 4)} />
          ) : error ? null : visiblePlans.length === 0 ? (
            <div className={`${CARD} p-10 text-center`}>
              <p className="text-lg font-semibold text-[#1C1917]">Тарифы временно недоступны</p>
              <p className="mt-2 text-sm text-neutral-600">Оставьте заявку или зарегистрируйтесь — мы поможем подобрать вариант.</p>
              <div className="mt-6 flex justify-center gap-3 flex-wrap">
                <Button type="button" size="lg" variant="primary" className={BTN_PRIMARY} onClick={handleRegister}>
                  Зарегистрироваться
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={`grid max-sm:gap-2.5 gap-4 md:gap-6 ${
                visiblePlans.length >= 4
                  ? 'md:grid-cols-2 xl:grid-cols-4'
                  : visiblePlans.length === 3
                    ? 'md:grid-cols-3'
                    : visiblePlans.length === 2
                      ? 'md:grid-cols-2'
                      : 'md:grid-cols-1 max-w-lg mx-auto'
              }`}
            >
              {visiblePlans.map((plan) => {
                const feats = getPlanFeatures(plan, serviceFunctions, false).filter((f) => f.available).slice(0, 6)
                const isRecommended = recommendedPlanId != null && plan.id === recommendedPlanId
                const monthly = Number(plan?.price_1month)
                const isBestValue = yearlySavingsPercentFromApi(plan) != null && billingPeriodMonths === 12
                const isStarter = minMonthly != null && Number.isFinite(monthly) && monthly === minMonthly
                const isMax = maxMonthly != null && Number.isFinite(monthly) && monthly === maxMonthly
                return (
                  <article
                    key={plan.id}
                    className={`${CARD} p-6 max-sm:p-3.5 flex flex-col shadow-md rounded-[20px] ${isRecommended ? 'ring-2 ring-[#4CAF50]/25 shadow-[0_18px_40px_rgba(16,24,40,0.10)]' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2 max-sm:gap-1.5">
                      <div className="min-w-0">
                        <h3 className="text-lg max-sm:text-[15px] font-bold text-[#1C1917] truncate leading-tight">
                          {getPlanDisplayName(plan)}
                        </h3>
                        <div className="mt-2 max-sm:mt-1 flex flex-wrap gap-2 max-sm:gap-1.5">
                          {isRecommended ? (
                            <span className="text-[11px] max-sm:text-[9px] font-bold uppercase tracking-wide text-[#2E7D32] bg-[#DFF5EC] border border-[#C8E8D8] rounded-full px-2 py-0.5">
                              Рекомендуем
                            </span>
                          ) : null}
                          {isBestValue ? (
                            <span className="text-[11px] max-sm:text-[9px] font-bold uppercase tracking-wide text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-full px-2 py-0.5">
                              Выгоднее на год
                            </span>
                          ) : null}
                          {!isRecommended && isStarter ? (
                            <span className="text-[11px] max-sm:text-[9px] font-bold uppercase tracking-wide text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-full px-2 py-0.5">
                              Старт
                            </span>
                          ) : null}
                          {!isRecommended && isMax ? (
                            <span className="text-[11px] max-sm:text-[9px] font-bold uppercase tracking-wide text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-full px-2 py-0.5">
                              Максимум
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 max-sm:mt-2.5">{renderPriceBlock(plan)}</div>
                    {feats.length ? (
                      <ul className="mt-6 max-sm:mt-3 space-y-2 max-sm:space-y-1 text-sm max-sm:text-[13px] max-sm:leading-snug text-neutral-700 flex-1">
                        {feats.map((f, idx) => (
                          <li key={idx} className="flex gap-2 max-sm:gap-1.5">
                            <span className="text-[#4CAF50] font-bold shrink-0">✓</span>
                            <span>{f.text}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-6 max-sm:mt-3 flex-1" />
                    )}
                    <div className="mt-8 max-sm:mt-4 flex flex-col gap-2">
                      <Button
                        type="button"
                        size="lg"
                        variant="primary"
                        className={`w-full max-lg:min-h-[44px] max-sm:!py-2.5 ${BTN_PRIMARY}`}
                        onClick={handleRegister}
                      >
                        Подключить
                        <ArrowRightIcon className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {/* What is included — matrix */}
        {showSecondarySections ? (
        <section className="mb-12 md:mb-16" aria-labelledby="compare-heading">
          <h2 id="compare-heading" className="text-2xl md:text-3xl font-bold text-[#1C1917] mb-2">
            Что входит
          </h2>
          <p className="text-sm text-neutral-600 mb-6 max-w-2xl">
            Ключевые возможности — сравните, что доступно в каждом тарифе.
          </p>
          {(
            <div className="space-y-3 lg:space-y-0">
              {/* Mobile: horizontal scroll table with sticky first column */}
              <div className="lg:hidden">
                <div className="overflow-x-auto -mx-5 px-5">
                  <div className="min-w-max rounded-2xl border border-[#E7E2DF] bg-white shadow-sm overflow-hidden">
                    {/* Header */}
                    <div
                      className="grid text-xs font-semibold text-neutral-600 border-b border-[#E7E2DF] bg-[#FAFAF9]"
                      style={{
                        gridTemplateColumns: `minmax(11rem, 11rem) repeat(${visiblePlans.length}, minmax(9rem, 9rem))`,
                      }}
                    >
                      <div className="sticky left-0 z-20 bg-[#FAFAF9] px-3 py-3">Возможность</div>
                      {visiblePlans.map((p) => (
                        <div key={p.id} className="px-3 py-3 text-center text-[#1C1917]">
                          {getPlanDisplayName(p)}
                        </div>
                      ))}
                    </div>

                    {/* Rows */}
                    {comparisonRowDefs.map((rowKey) => {
                      const label = getComparisonRowLabelFromKey(rowKey, visiblePlans[0])
                      const isFreeze = rowKey === 'freeze_yearly'
                      return (
                        <div
                          key={rowKey}
                          className="grid text-sm border-b border-[#F0EBE8] last:border-b-0"
                          style={{
                            gridTemplateColumns: `minmax(11rem, 11rem) repeat(${visiblePlans.length}, minmax(9rem, 9rem))`,
                          }}
                        >
                          <div className="sticky left-0 z-10 bg-white px-3 py-3 font-medium text-neutral-800">
                            {label}
                          </div>
                          {visiblePlans.map((plan) => {
                            const row = getPricingComparisonRow(plan, rowKey)
                            const detail = row?.available ? getComparisonRowDetail(plan, rowKey) : null
                            const ok = Boolean(row?.available)
                            return (
                              <div
                                key={`${rowKey}-${plan.id}`}
                                className="px-3 py-3 text-center bg-white flex items-center justify-center"
                              >
                                {isFreeze ? (
                                  <span className={ok && detail ? 'text-[#1C1917]' : 'text-neutral-300'}>
                                    {ok && detail ? detail : '—'}
                                  </span>
                                ) : (
                                  <span className={ok ? 'text-[#2E7D32] font-bold' : 'text-neutral-300'}>
                                    {ok ? '✓' : '—'}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Desktop: CSS grid, no horizontal scroll */}
              <div
                className="hidden lg:grid gap-x-2 gap-y-2 text-sm"
                style={{
                  gridTemplateColumns: `minmax(10rem, 14rem) repeat(${visiblePlans.length}, minmax(0, 1fr))`,
                }}
              >
                <div className="font-semibold text-neutral-500 py-2 px-2">Возможность</div>
                {visiblePlans.map((p) => (
                  <div key={p.id} className="font-semibold text-[#1C1917] text-center py-2 px-1 border-b border-[#E7E2DF]">
                    {getPlanDisplayName(p)}
                  </div>
                ))}
                {comparisonRowDefs.map((rowKey) => {
                  const label = getComparisonRowLabelFromKey(rowKey, visiblePlans[0])
                  return (
                    <Fragment key={rowKey}>
                      <div className="py-3 px-2 font-medium text-neutral-800 border-t border-[#F0EBE8] bg-[#FAFAF9]/80">
                        {label}
                      </div>
                      {visiblePlans.map((plan) => {
                        const row = getPricingComparisonRow(plan, rowKey)
                        const detail = row?.available ? getComparisonRowDetail(plan, rowKey) : null
                        const isFreeze = rowKey === 'freeze_yearly'
                        return (
                          <div
                            key={`${rowKey}-${plan.id}`}
                            className="py-3 px-1 text-center border-t border-[#F0EBE8] bg-white flex items-center justify-center"
                          >
                            <div className="flex flex-col items-center leading-tight max-w-[11rem]">
                              {isFreeze ? (
                                <span
                                  className={
                                    row?.available && detail
                                      ? 'text-sm text-[#1C1917] font-normal'
                                      : 'text-sm text-neutral-300'
                                  }
                                >
                                  {row?.available && detail ? detail : '—'}
                                </span>
                              ) : (
                                <>
                                  <span
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                                      row?.available ? 'bg-[#DFF5EC] text-[#2E7D32]' : 'bg-neutral-100 text-neutral-300'
                                    }`}
                                  >
                                    {row?.available ? '✓' : '—'}
                                  </span>
                                  {detail ? <span className="mt-1 text-[11px] text-neutral-500">{detail}</span> : null}
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </div>
            </div>
          )}
        </section>
        ) : null}

        {/* Final CTA */}
        {(!error) ? (
          <section
            className={`${CARD} shadow-md p-8 md:p-10 text-center max-sm:bg-neutral-900 max-sm:text-white max-sm:border-neutral-800`}
            style={{
              backgroundImage:
                'radial-gradient(ellipse 600px 280px at 100% 0%, rgba(76,175,80,0.06), transparent 50%)',
            }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-[#1C1917] max-sm:text-[26px] max-sm:text-white">
              Готовы начать?
            </h2>
            <p className="mt-3 text-neutral-600 max-sm:text-white/70 max-w-xl mx-auto">
              Подключите подходящий тариф и переходите к работе — регистрация занимает пару минут.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center max-sm:items-stretch">
              <Button type="button" size="lg" variant="primary" className={`max-sm:w-full max-sm:min-h-[44px] ${BTN_PRIMARY}`} onClick={handleRegister}>
                Зарегистрироваться
                <ArrowRightIcon className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
