import React, { useState } from 'react'
import { ChevronDownIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { getCheapestPlanForFeature } from '../../../utils/getCheapestPlanForFeature'
import MasterNavTabIcon from '../MasterNavTabIcon'

/**
 * Mobile: locked раздел в меню — без popover left-full.
 * Раскрытие по тапу; те же CTA, что у LockedNavItem (демо / тарифы).
 */
export default function MasterMobileLockedNavRow({
  label,
  serviceFunctionId,
  tab,
  handleTabChange,
  subscriptionPlans,
  dataTestId,
  onCloseMenu,
}) {
  const [expanded, setExpanded] = useState(false)
  const planName = getCheapestPlanForFeature(subscriptionPlans || [], serviceFunctionId)
  const planText = planName ? `Раздел доступен с тарифа ${planName}` : 'Раздел доступен с тарифа Standard'

  return (
    <div className="border-b border-gray-100 last:border-b-0" data-testid={dataTestId || undefined}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full min-h-[44px] items-center justify-between gap-2 px-3 py-2.5 text-left text-sm leading-snug text-gray-500"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <LockClosedIcon className="h-5 w-5 shrink-0 text-gray-400" strokeWidth={1.5} aria-hidden />
          <MasterNavTabIcon tab={tab} className="h-5 w-5 shrink-0 text-gray-500" strokeWidth={1.5} />
          <span className="truncate font-normal">{label}</span>
        </span>
        <ChevronDownIcon
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-gray-100 bg-gray-50/80 px-3 py-2.5">
          <p className="text-sm font-medium text-gray-900">Тестовый доступ</p>
          <p className="text-xs leading-relaxed text-gray-600">{planText}</p>
          <button
            type="button"
            data-testid="mobile-locked-open-demo"
            onClick={() => {
              handleTabChange?.(tab)
              onCloseMenu?.()
              setExpanded(false)
            }}
            className="w-full rounded-lg bg-green-50 px-3 py-2.5 text-left text-sm font-medium text-green-800 hover:bg-green-100"
          >
            Открыть демо
          </button>
          <button
            type="button"
            data-testid="mobile-locked-go-tariffs"
            onClick={() => {
              handleTabChange?.('tariff')
              onCloseMenu?.()
              setExpanded(false)
            }}
            className="w-full rounded-lg bg-blue-50 px-3 py-2.5 text-left text-sm font-medium text-blue-800 hover:bg-blue-100"
          >
            Перейти к тарифам
          </button>
        </div>
      )}
    </div>
  )
}
