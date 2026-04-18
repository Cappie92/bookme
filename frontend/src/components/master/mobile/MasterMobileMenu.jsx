import React, { useEffect, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiGet } from '../../../utils/api'
import { isSalonFeaturesEnabled } from '../../../config/features'
import { getMasterNavCatalogRows } from '../../../config/masterNavConfig'
import { masterZClass } from '../../../config/masterOverlayZIndex'
import { useMasterOverlayScrollLock } from '../../../hooks/useMasterOverlayScrollLock'
import MasterNavTabIcon from '../MasterNavTabIcon'
import MasterMobileLockedNavRow from './MasterMobileLockedNavRow'

function MenuNavButton({ label, tab, activeTab, onSelect, badge, dataTestId }) {
  const active = activeTab === tab
  /** Согласовано с MasterMobileBottomNav: h-5, stroke 1.5 / 1.875 */
  const iconStroke = active ? 1.875 : 1.5
  return (
    <button
      type="button"
      data-testid={dataTestId}
      onClick={() => onSelect(tab)}
      className={`flex w-full items-center justify-between gap-2 border-b border-gray-100/90 px-3 py-2.5 text-left text-sm leading-snug transition-colors last:border-b-0 min-h-[44px] ${
        active
          ? 'bg-[#2e7d32]/[0.07] font-medium text-[#2e7d32]'
          : 'font-normal text-gray-600 hover:bg-gray-50/90'
      } `}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <MasterNavTabIcon
          tab={tab}
          className="h-5 w-5 shrink-0 text-current"
          strokeWidth={iconStroke}
        />
        <span className="truncate">{label}</span>
      </span>
      {badge != null && badge > 0 ? (
        <span className="shrink-0 rounded-full bg-red-500/95 px-1.5 py-px text-[10px] font-medium tabular-nums text-white">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

/**
 * Полноэкранное меню разделов мастера (<lg). Список строк = getMasterNavCatalogRows (как desktop sidebar).
 */
export default function MasterMobileMenu({
  isOpen,
  onClose,
  activeTab,
  handleTabChange,
  hasFinanceAccess,
  hasExtendedStats,
  hasLoyaltyAccess,
  hasClientRestrictions,
  hasClientsAccess,
  subscriptionPlans,
  scheduleConflicts,
  refreshKey,
}) {
  const [pendingInvitations, setPendingInvitations] = useState(0)

  useEffect(() => {
    if (!isOpen) return
    const token = localStorage.getItem('access_token')
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await apiGet('/api/master/invitations')
        if (!cancelled) setPendingInvitations(Array.isArray(data) ? data.length : 0)
      } catch {
        if (!cancelled) setPendingInvitations(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, refreshKey])

  useMasterOverlayScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const go = (tab) => {
    handleTabChange(tab)
    onClose()
  }

  const accessFlags = {
    hasExtendedStats,
    hasFinanceAccess,
    hasLoyaltyAccess,
    hasClientRestrictions,
    hasClientsAccess,
  }
  const catalogRows = getMasterNavCatalogRows(accessFlags, isSalonFeaturesEnabled(), {
    scheduleConflicts,
    pendingInvitations,
  })

  return (
    <div
      className={`fixed inset-0 ${masterZClass('fullscreenMenu')} flex flex-col bg-white lg:hidden`}
      role="dialog"
      aria-modal="true"
      aria-label="Меню кабинета мастера"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2.5 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 className="text-base font-medium tracking-tight text-gray-900">Разделы</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
          aria-label="Закрыть меню"
        >
          <XMarkIcon className="h-6 w-6" strokeWidth={1.5} />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {catalogRows.map((row) =>
          row.unlocked ? (
            <MenuNavButton
              key={row.tab}
              label={row.label}
              tab={row.tab}
              activeTab={activeTab}
              onSelect={go}
              badge={row.badge}
              dataTestId={row.navTestId}
            />
          ) : (
            <MasterMobileLockedNavRow
              key={row.tab}
              label={row.label}
              serviceFunctionId={row.lockedServiceFunctionId}
              tab={row.tab}
              handleTabChange={handleTabChange}
              subscriptionPlans={subscriptionPlans}
              dataTestId={`mobile-locked-${row.tab}`}
              onCloseMenu={onClose}
            />
          )
        )}
      </nav>
    </div>
  )
}
