import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { AUTH_STATUS, isSafePublicPath } from '../utils/authSession'

export function IsolatedSessionError() {
  return <div className="min-h-screen flex items-center justify-center p-5 bg-[#FAFAF9]" data-testid="isolated-session-error">
    <div className="max-w-md text-center space-y-4">
      <h1 className="text-xl font-bold">Не удалось открыть сессию</h1>
      <p>Закройте эту вкладку и повторите открытие страницы из приложения.</p>
    </div>
  </div>
}

/** No old ordinary cabinet or login modal may mount during a failed handoff. */
export default function AuthSafetyBoundary({ children }) {
  const { pathname } = useLocation()
  const { handoffPending, authStatus, isIosRestrictedContext, isIosAppWebSession, loading } = useAuth()
  if (pathname === '/auth/mobile-handoff' || isSafePublicPath(pathname)) return children
  // An ordinary OAuth callback is an auth-resolution screen, not a cabinet.
  if (pathname === '/auth/oauth/callback' && !isIosRestrictedContext) return children
  // An expired readonly demo can be re-entered anonymously; never relax an
  // ios_app/pending handoff boundary or enter before auth context is resolved.
  if (pathname === '/demo/master' && !loading && !isIosRestrictedContext && !handoffPending) return children
  if (handoffPending || authStatus === AUTH_STATUS.ERROR) return <IsolatedSessionError />
  if (loading) return <div role="status">Проверяем сессию…</div>
  if (isIosRestrictedContext && !isIosAppWebSession) return <IsolatedSessionError />
  if (isIosRestrictedContext && !['/master', '/pricing', '/master/tariff', '/master/subscription/plans', '/payment/success', '/payment/failed'].includes(pathname)) {
    return <Navigate to="/master" replace />
  }
  return children
}
