const IOS_HANDOFF_DESTINATIONS = new Set([
  '/master?tab=schedule',
  '/master?tab=services',
  '/master?tab=settings&section=public-page',
])

export function safeHandoffRedirect(data) {
  if (data?.web_session_origin === 'ios_app') {
    return IOS_HANDOFF_DESTINATIONS.has(data?.redirect_to) ? data.redirect_to : '/master'
  }
  return typeof data?.redirect_to === 'string' && data.redirect_to.startsWith('/')
    ? data.redirect_to
    : '/master'
}
