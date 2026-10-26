import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAdminAccess } from '../contexts/AdminAccessContext'
import { resolveAdminSection } from '../utils/adminAccess'
import {
  AdminAccessError,
  AdminAccessLoading,
  AdminForbidden,
  AdminNoSections,
  AdminNotStaff,
  AdminSessionExpired,
} from './AdminAccessStates'

/** The page mounts (and fetches) only after the server snapshot allows its section. */
export default function AdminSectionGate({ section, children }) {
  const access = useAdminAccess()
  const { openAuthModal } = useAuth()
  const location = useLocation()
  const decision = resolveAdminSection(access, section)

  switch (decision.type) {
    case 'allow':
      return children
    case 'loading':
      return <AdminAccessLoading />
    case 'redirect':
      return <Navigate to={decision.to} replace />
    case 'forbidden':
      return <AdminForbidden fallback={decision.fallback} />
    case 'empty':
      return <AdminNoSections />
    case 'unauthorized':
      return (
        <AdminSessionExpired
          onLogin={() => openAuthModal('client', 'login', {
            redirectMode: 'returnTo',
            returnToPath: `${location.pathname}${location.search}`,
          })}
        />
      )
    case 'not-staff':
      return <AdminNotStaff />
    default:
      return <AdminAccessError onRetry={access.refresh} />
  }
}
