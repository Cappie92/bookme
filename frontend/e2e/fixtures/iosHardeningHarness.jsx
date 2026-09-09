import React, { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext'
import { usePricingCatalog } from '../../src/hooks/usePricingCatalog'

// Deliberately mounts the real consumer outside the route guard.
function Probe() {
  const auth = useAuth()
  const [enabled, setEnabled] = useState(true)
  const { plans } = usePricingCatalog('master', { enabled })
  return <div>
    <output data-testid="state">{auth.authStatus}</output>
    <output data-testid="plans">{plans.length}</output>
    <button onClick={() => {
      localStorage.setItem('access_token', 'test-ios-session')
      auth.login({ role: 'master', web_session_origin: 'ios_app' })
    }}>iOS login</button>
    <button onClick={() => setEnabled(false)}>Disable catalog</button>
  </div>
}

createRoot(document.getElementById('root')).render(
  <StrictMode><MemoryRouter><AuthProvider><Probe /></AuthProvider></MemoryRouter></StrictMode>
)
