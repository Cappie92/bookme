import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { apiGet } from '../utils/api'
import Header from "../components/Header"

function ClientSidebar({ managedBranches = [] }) {
  const navigate = useNavigate()
  const location = useLocation()
  
  // Функция для определения активного состояния кнопки
  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }
  
  // Функция для получения стилей кнопки
  const getButtonStyles = (path) => {
    if (isActive(path)) {
      return "w-full text-left px-4 py-3 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049] transition-colors font-medium flex items-center gap-3 shadow-sm"
    }
    return "w-full text-left px-3 py-2.5 text-gray-700 hover:bg-gray-50 hover:text-[#4CAF50] transition-colors font-medium flex items-center gap-3 rounded-md group"
  }
  
  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen fixed left-0 top-0 shadow-sm">
      <nav className="flex flex-col p-4 space-y-1 pt-[140px]">
        {/* Логотип и заголовок */}
        <div className="mb-6 px-2">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#4CAF50] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">d.</span>
            </div>
            <span className="text-xl font-semibold text-gray-900">DeDato</span>
          </div>
        </div>

        {/* Основное действие - выделено зеленым как в референсе */}
        <div className="mb-6">
          <button 
            onClick={() => navigate('/client/dashboard')}
            className={getButtonStyles('/client/dashboard')}
          >
            <span className="text-lg">👤</span>
            Мой профиль
          </button>
        </div>



        {/* Кнопка заметок */}
        <div className="space-y-1">
          <button 
            onClick={() => navigate('/client/master-notes')}
            className={getButtonStyles('/client/master-notes')}
          >
            <span className={`text-lg ${isActive('/client/master-notes') ? '' : 'group-hover:text-[#4CAF50] transition-colors'}`}>📝</span>
            Мои заметки
          </button>
        </div>

        {/* Управление филиалами (если пользователь является управляющим) */}
        {managedBranches.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mb-2">Управление</h3>
            <div className="space-y-1">
              {managedBranches.map(branch => (
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
        




        {/* Настройки - перемещены в конец */}
        <div className="space-y-1 mt-8">
          <button 
            onClick={() => navigate('/client/profile')}
            className={getButtonStyles('/client/profile')}
          >
            <span className={`text-lg ${isActive('/client/profile') ? '' : 'group-hover:text-[#4CAF50] transition-colors'}`}>⚙️</span>
            Настройки
          </button>
        </div>
      </nav>
    </aside>
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
      // Загружаем филиалы, которыми управляет пользователь
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
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex justify-center items-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50]"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <ClientSidebar managedBranches={managedBranches} />
      <div className="ml-64 pt-16">
        {children}
      </div>
    </div>
  )
}
