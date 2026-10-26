import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isStaffRole } from '../utils/adminAccess'

/**
 * /master is the master cabinet, never an admin fallback. An ordinary staff
 * session without its own master profile belongs in /admin. A staff account
 * that does own a master profile keeps that workspace, and any probe failure
 * keeps the previous behaviour. iOS app and demo sessions are untouched.
 */
export function masterWorkspaceDecision({ user, isIosAppWebSession, probe }) {
  if (!user || isIosAppWebSession || user.is_demo_session === true || !isStaffRole(user.role)) {
    return 'master'
  }
  if (probe === 'pending') return 'pending'
  return probe === 'no-profile' ? 'admin' : 'master'
}

async function probeOwnMasterProfile(signal) {
  const token = window.localStorage.getItem('access_token')
  try {
    const response = await fetch('/api/master/settings', {
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      signal,
    })
    if (response.status === 404) return 'no-profile'
    return response.ok ? 'has-profile' : 'unknown'
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return 'unknown'
  }
}

export default function MasterWorkspaceRoute({ children, fallback = null }) {
  const { user, isIosAppWebSession, loading } = useAuth()
  const needsProbe = masterWorkspaceDecision({ user, isIosAppWebSession, probe: 'pending' }) === 'pending'
  const [probe, setProbe] = useState({ userId: null, result: 'pending' })

  useEffect(() => {
    if (!needsProbe) return undefined
    const controller = new AbortController()
    const userId = user.id
    probeOwnMasterProfile(controller.signal)
      .then((result) => setProbe({ userId, result }))
      .catch(() => {})
    return () => controller.abort()
  }, [needsProbe, user?.id])

  // The role is unknown while the session resolves; the cabinet must not mount before it is.
  if (loading) return fallback
  const result = probe.userId === user?.id ? probe.result : 'pending'
  const decision = masterWorkspaceDecision({ user, isIosAppWebSession, probe: result })
  if (decision === 'pending') return fallback
  if (decision === 'admin') return <Navigate to="/admin" replace />
  return children
}
