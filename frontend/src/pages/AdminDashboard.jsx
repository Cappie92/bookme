import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { 
  UsersIcon, 
  DocumentTextIcon, 
  CalendarIcon,
  ChartBarIcon 
} from "@heroicons/react/24/outline"
import { API_BASE_URL } from '../utils/config';
import { useAdminAccess } from '../contexts/AdminAccessContext'

const QUICK_ACTIONS = [
  { action: 'users.view', to: '/admin/users', label: 'Управление пользователями', icon: UsersIcon },
  { action: 'blog.create', requires: ['blog.view'], to: '/admin/blog', label: 'Создать пост', icon: DocumentTextIcon },
  { action: 'stats.view', to: '/admin/stats', label: 'Просмотр статистики', icon: ChartBarIcon },
]

export default function AdminDashboard() {
  const { can, refresh: refreshAccess } = useAdminAccess()
  const [loadError, setLoadError] = useState(null)
  const [stats, setStats] = useState({
    total_users: 0,
    total_salons: 0,
    total_masters: 0,
    total_bookings: 0,
    new_users_today: 0,
    new_users_this_week: 0,
    new_users_this_month: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('access_token')
        
        // Загружаем реальную статистику
        const statsResponse = await fetch(`${API_BASE_URL}/api/admin/stats`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        
        if (statsResponse.ok) {
          const statsData = await statsResponse.json()
          setStats(statsData)
        } else {
          setLoadError(statsResponse.status === 403
            ? 'Нет доступа к статистике.'
            : `Не удалось загрузить статистику (${statsResponse.status}).`)
          if (statsResponse.status === 403) refreshAccess()
        }
      } catch (error) {
        console.error('Ошибка при загрузке данных:', error)
        setLoadError('Не удалось загрузить статистику.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const quickActions = QUICK_ACTIONS.filter((item) => [item.action, ...(item.requires || [])].every(can))

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-3xl font-bold text-gray-900">Панель администратора</h1>
          <p className="text-gray-600 mt-2">Добро пожаловать в панель управления DeDato</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 animate-pulse">
              <div className="flex items-center">
                <div className="p-2 bg-gray-200 rounded-lg w-12 h-12"></div>
                <div className="ml-4">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Панель администратора</h1>
        <p className="text-gray-600 mt-2">Добро пожаловать в панель управления DeDato</p>
      </div>

      {loadError ? (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200" role="alert" data-testid="admin-dashboard-error">
          <p className="text-sm text-gray-700">{loadError}</p>
        </div>
      ) : (
      <>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <UsersIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всего пользователей</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_users.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CalendarIcon className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Записей сегодня</p>
              <p className="text-2xl font-bold text-gray-900">{stats.bookings_today}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <ChartBarIcon className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Записей за неделю</p>
              <p className="text-2xl font-bold text-gray-900" data-testid="admin-stat-bookings-week">{stats.bookings_this_week ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <DocumentTextIcon className="w-6 h-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Активных салонов</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_salons}</p>
            </div>
          </div>
        </div>
      </div>

      
      {/* Дополнительная статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Новые пользователи</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Сегодня</span>
              <span className="text-sm font-medium text-gray-900">{stats.new_users_today}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">За неделю</span>
              <span className="text-sm font-medium text-gray-900">{stats.new_users_this_week}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">За месяц</span>
              <span className="text-sm font-medium text-gray-900">{stats.new_users_this_month}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Мастера</h3>
          <div className="text-3xl font-bold text-gray-900">{stats.total_masters}</div>
          <p className="text-sm text-gray-600 mt-2">Всего зарегистрировано</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Записи</h3>
          <div className="text-3xl font-bold text-gray-900">{stats.total_bookings}</div>
          <p className="text-sm text-gray-600 mt-2">Всего записей в системе</p>
        </div>
      </div>
      </>
      )}

      {/* Быстрые действия */}
      {quickActions.length > 0 && (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200" data-testid="admin-quick-actions">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Быстрые действия</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.action}
                to={item.to}
                data-testid={`admin-quick-${item.action}`}
                className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Icon className="w-5 h-5 mr-2 text-gray-600" />
                <span className="text-gray-700">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
      )}

    </div>
  )
} 