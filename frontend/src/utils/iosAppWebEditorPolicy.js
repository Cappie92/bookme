export const IOS_APP_WEB_EDITOR_TABS = Object.freeze([
  'dashboard',
  'schedule',
  'services',
  'settings',
])

const IOS_APP_WEB_EDITOR_TAB_SET = new Set(IOS_APP_WEB_EDITOR_TABS)

/**
 * Trusted iOS handoff browser policy. This editor shell is deliberately
 * separate from both native iOS capabilities and ordinary web navigation.
 */
export function resolveMasterTabForWebSession(tab, isIosAppWebSession) {
  const requested = tab || 'dashboard'
  return isIosAppWebSession && !IOS_APP_WEB_EDITOR_TAB_SET.has(requested)
    ? 'dashboard'
    : requested
}

export function filterMasterNavRowsForWebSession(rows, isIosAppWebSession) {
  if (!isIosAppWebSession) return rows
  return rows.filter((row) => IOS_APP_WEB_EDITOR_TAB_SET.has(row.tab))
}
