import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { apiGet } from '../utils/api'
import Header from '../components/Header'

function ClientSidebar({ managedBranches = [] }) {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  const getButtonStyles = (path) => {
    if (isActive(path)) {
      return 'w-full text-left px-4 py-3 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049] transition-colors font-medium flex items-center gap-3 shadow-sm'
    }
    return 'w-full text-left px-3 py-2.5 text-gray-700 hover:bg-gray-50 hover:text-[#4CAF50] transition-colors font-medium flex items-center gap-3 rounded-md group'
  }

  return (
    <aside className="hidden lg:block w-64 bg-white border-r border-gray-200 min-h-screen fixed left-0 top-24 shadow-sm z-40">
      <nav className="flex flex-col p-4 space-y-1 pt-4">
        <div className="mb-6 px-2">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#4CAF50] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">d.</span>
            </div>
            <span className="text-xl font-semibold text-gray-900">DeDato</span>
          </div>
        </div>

        <div className="mb-6">
          <button
            onClick={() => navigate('/client/dashboard')}
            className={getButtonStyles('/client/dashboard')}
            data-testid="client-nav-dashboard"
          >
            <span className="text-lg">👤</span>
            Мой профиль
          </button>
        </div>

        <div className="space-y-1">
          <button
            onClick={() => navigate('/client/master-notes')}
            className={getButtonStyles('/client/master-notes')}
          >
            <span
              className={`text-lg ${isActive('/client/master-notes') ? '' : 'group-hover:text-[#4CAF50] transition-colors'}`}
            >
              📝
            </span>
            Мои заметки
          </button>
        </div>

        {managedBranches.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mb-2">
              Управление
            </h3>
            <div className="space-y-1">
              {managedBranches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => navigate(`/branch/manage/${branch.id}`)}
                  className="w-full text-left px-3 py-2.5 text-gray-700 hover:bg-gray-50 hover:text-[#4CAF50] transition-colors font-medium flex items-center gap-3 rounded-md group text-sm"
                >
                  <span className="text-lg group-hover:text-[#4CAF50] transition-colors">🏢</span>
                  {branch.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1 mt-8">
          <button
            onClick={() => navigate('/client/profile')}
            className={getButtonStyles('/client/profile')}
          >
            <span
              className={`text-lg ${isActive('/client/profile') ? '' : 'group-hover:text-[#4CAF50] transition-colors'}`}
            >
              ⚙️
            </span>
            Настройки
          </button>
        </div>
      </nav>
    </aside>
  )
}

function ClientMobileNav({ managedBranches = [] }) {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  const tab = (path, label) => (
    <button
      type="button"
      onClick={() => navigate(path)}
      className={`shrink-0 px-3 py-2 text-[13px] font-semibold border-b-2 transition-colors min-h-[40px] ${
        isActive(path)
          ? 'border-[#4CAF50] text-[#2e7d32]'
          : 'border-transparent text-gray-600 hover:text-gray-900'
      }`}
    >
      {label}
    </button>
  )

  return (
    <nav
      className="lg:hidden fixed top-24 left-0 right-0 z-30 border-b border-gray-200 bg-white/98 backdrop-blur-sm shadow-[0_1px_0_rgba(0,0,0,0.04)]"
      aria-label="Разделы кабинета клиента"
    >
      <div
        className="flex items-stretch overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pl-1 pr-2"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {tab('/client/dashboard', 'Профиль')}
        {tab('/client/master-notes', 'Заметки')}
        {managedBranches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            onClick={() => navigate(`/branch/manage/${branch.id}`)}
            className="shrink-0 px-3 py-2 text-[13px] font-medium text-gray-700 border-b-2 border-transparent min-h-[40px]"
          >
            {branch.name.length > 12 ? `${branch.name.slice(0, 11)}…` : branch.name}
          </button>
        ))}
        {tab('/client/profile', 'Настройки')}
      </div>
    </nav>
  )
}

export default function ClientLayout({ children }) {
  const [managedBranches, setManagedBranches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadManagedBranches()
  }, [])

  const loadManagedBranches = async () => {
    try {
      const branches = await apiGet('/api/salon/my-managed-branches')
      setManagedBranches(branches || [])
    } catch (error) {
      console.error('Ошибка загрузки управляемых филиалов:', error)
      setManagedBranches([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50" data-testid="client-page">
        <Header />
        <div className="flex justify-center items-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50]" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] lg:bg-gray-50" data-testid="client-page">
      <Header />
      <ClientMobileNav managedBranches={managedBranches} />
      <ClientSidebar managedBranches={managedBranches} />
      {/* header h-24 (6rem) + mobile tab bar ~2.75rem ≈ 8.75rem; safe area сверху учитывает Header */}
      <main className="ml-0 w-full lg:w-[calc(100%-16rem)] min-w-0 overflow-x-hidden px-3 sm:px-4 lg:px-6 pt-[8.75rem] lg:pt-24 pb-12 lg:pb-10 lg:ml-64 min-h-screen">
        {children}
      </main>
    </div>
  )
}
