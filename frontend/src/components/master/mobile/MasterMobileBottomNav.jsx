import React from 'react'
import { ChartBarIcon, Bars3Icon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { MASTER_CATALOG_TAB_KEYS } from '../../../config/masterNavConfig'

/**
 * Нижняя навигация мастера (<lg): Дашборд · Меню · Настройки.
 * «Меню» активно, если открыт sheet или текущий таб — один из пунктов masterNavConfig (не дашборд/настройки).
 */
export default function MasterMobileBottomNav({
  activeTab,
  menuOpen,
  onDashboard,
  onMenuToggle,
  onSettings,
}) {
  const menuHubActive = menuOpen || MASTER_CATALOG_TAB_KEYS.has(activeTab)

  const dashboardActive = activeTab === 'dashboard' && !menuOpen
  const settingsActive = activeTab === 'settings' && !menuOpen

  const itemClass = (isActive) =>
    `flex flex-1 flex-col items-center justify-center gap-1 min-h-[52px] min-w-0 px-1 pt-2 pb-2 text-xs font-medium leading-tight tracking-tight transition-colors border-b-[2px] ${
      isActive
        ? 'border-[#2e7d32] text-[#2e7d32]'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  const iconStroke = (on) => (on ? 1.875 : 1.5)

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-sm shadow-[0_-1px_0_rgba(15,23,42,0.04),0_-4px_14px_rgba(15,23,42,0.05)] lg:hidden"
      aria-label="Нижняя навигация мастера"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        <button type="button" className={itemClass(dashboardActive)} onClick={onDashboard}>
          <ChartBarIcon className="h-5 w-5 shrink-0" strokeWidth={iconStroke(dashboardActive)} />
          <span>Дашборд</span>
        </button>
        <button type="button" className={itemClass(menuHubActive)} onClick={onMenuToggle}>
          <Bars3Icon className="h-5 w-5 shrink-0" strokeWidth={iconStroke(menuHubActive)} />
          <span>Меню</span>
        </button>
        <button type="button" className={itemClass(settingsActive)} onClick={onSettings}>
          <Cog6ToothIcon className="h-5 w-5 shrink-0" strokeWidth={iconStroke(settingsActive)} />
          <span>Настройки</span>
        </button>
      </div>
    </nav>
  )
}
