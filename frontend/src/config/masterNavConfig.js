/**
 * Единый источник правды для пунктов навигации мастера (desktop sidebar + mobile menu).
 * Порядок, tab keys, testId, gating (accessKey ↔ props MasterDashboard) и locked service_function id
 * задаются только здесь. Иконки — Heroicons через MasterNavTabIcon по полю `tab`.
 */

/** Пункты каталога между «Дашборд» и «Настройки» в sidebar; полное меню на mobile (без дашборда/настроек — в bottom bar). */
export const MASTER_NAV_CATALOG = [
  {
    tab: 'schedule',
    label: 'Расписание',
    navTestId: 'nav-schedule',
    badgeKey: 'scheduleConflicts',
  },
  {
    tab: 'services',
    label: 'Услуги',
  },
  {
    tab: 'stats',
    label: 'Статистика',
    navTestId: 'nav-stats',
    accessKey: 'hasExtendedStats',
    lockedServiceFunctionId: 2,
  },
  {
    tab: 'salon-work',
    label: 'Работа в салоне',
    requireSalonFeatures: true,
    badgeKey: 'pendingInvitations',
  },
  {
    tab: 'accounting',
    label: 'Финансы',
    navTestId: 'nav-finance',
    /** E2E / контракт: не `locked-accounting` */
    lockedNavTestId: 'locked-finance',
    accessKey: 'hasFinanceAccess',
    lockedServiceFunctionId: 4,
  },
  {
    tab: 'loyalty',
    label: 'Лояльность',
    accessKey: 'hasLoyaltyAccess',
    lockedServiceFunctionId: 3,
  },
  {
    tab: 'clients',
    label: 'Клиенты',
    accessKey: 'hasClientsAccess',
    lockedServiceFunctionId: 7,
  },
  {
    tab: 'restrictions',
    label: 'Правила',
    accessKey: 'hasClientRestrictions',
    lockedServiceFunctionId: 5,
  },
  {
    tab: 'tariff',
    label: 'Мой тариф',
    navTestId: 'nav-tariff',
  },
]

/** Верх sidebar (не входит в mobile full-screen menu — там bottom bar). */
export const MASTER_NAV_SIDEBAR_LEAD = {
  tab: 'dashboard',
  label: 'Дашборд',
  navTestId: 'nav-dashboard',
}

/** Низ sidebar (на mobile — bottom bar). */
export const MASTER_NAV_SIDEBAR_TAIL = {
  tab: 'settings',
  label: 'Настройки',
  navTestId: 'nav-settings',
}

/** Табы из каталога — для active state нижней кнопки «Меню» (активен раздел из меню, но sheet закрыт). */
export const MASTER_CATALOG_TAB_KEYS = new Set(MASTER_NAV_CATALOG.map((e) => e.tab))

/**
 * @param {object} accessFlags — hasExtendedStats, hasFinanceAccess, hasLoyaltyAccess, hasClientRestrictions, hasClientsAccess
 * @param {boolean} salonFeaturesEnabled — isSalonFeaturesEnabled()
 * @param {object} badges — scheduleConflicts, pendingInvitations (числа)
 */
export function getMasterNavCatalogRows(accessFlags, salonFeaturesEnabled, badges = {}) {
  return MASTER_NAV_CATALOG.filter((entry) => !entry.requireSalonFeatures || salonFeaturesEnabled).map((entry) => {
    let unlocked = true
    let lockedServiceFunctionId = null
    if (entry.accessKey) {
      unlocked = !!accessFlags[entry.accessKey]
      lockedServiceFunctionId = entry.lockedServiceFunctionId
    }
    const badge =
      entry.badgeKey != null && badges[entry.badgeKey] != null && badges[entry.badgeKey] > 0
        ? badges[entry.badgeKey]
        : null
    return {
      tab: entry.tab,
      label: entry.label,
      navTestId: entry.navTestId,
      lockedNavTestId: entry.lockedNavTestId,
      unlocked,
      lockedServiceFunctionId,
      badge,
    }
  })
}

/**
 * Отступ снизу у main под фиксированный MasterMobileBottomNav.
 * Контракт: высота ряда кнопок min 52px + внутренний pb с env(safe-area-inset-bottom) в самом баре;
 * контент не должен прятаться под бар + запас на home indicator.
 */
export const MASTER_MOBILE_MAIN_BOTTOM_PADDING_CLASS =
  'pb-[calc(5rem+env(safe-area-inset-bottom,0px))]'
