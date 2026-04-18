import React from 'react'
import {
  BanknotesIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  GiftIcon,
  NoSymbolIcon,
  PresentationChartLineIcon,
  ScissorsIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'

const TAB_ICONS = {
  dashboard: ChartBarIcon,
  schedule: CalendarDaysIcon,
  services: ScissorsIcon,
  stats: PresentationChartLineIcon,
  'salon-work': BuildingOffice2Icon,
  accounting: BanknotesIcon,
  loyalty: GiftIcon,
  clients: UserGroupIcon,
  restrictions: NoSymbolIcon,
  tariff: CreditCardIcon,
  settings: Cog6ToothIcon,
}

const Fallback = ChartBarIcon

/**
 * Единая SVG-иконка пункта навигации мастера (Heroicons outline), без emoji.
 */
export default function MasterNavTabIcon({ tab, className = 'h-5 w-5 shrink-0', strokeWidth = 2 }) {
  const Icon = TAB_ICONS[tab] || Fallback
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />
}
