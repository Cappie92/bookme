// No refresh is issued for the short-lived, server-readonly demo session.
export function storeDemoSession(data, storage, tabStorage) {
  if (!data?.access_token || data.token_type !== 'bearer' || data.expires_in !== 900) {
    throw new Error('Invalid demo session')
  }
  storage.setItem('access_token', data.access_token)
  storage.removeItem('refresh_token')
  storage.setItem('user_role', 'master')
  storage.setItem('demo_mode', '1')
  tabStorage.removeItem('dedato_web_session_origin')
}
