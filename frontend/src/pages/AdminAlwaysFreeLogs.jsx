import { useState, useEffect } from "react"
import { 
  MagnifyingGlassIcon,
  FunnelIcon,
  ClockIcon,
  UserIcon,
  ExclamationTriangleIcon
} from "@heroicons/react/24/outline"
import { API_BASE_URL } from '../utils/config'

export default function AdminAlwaysFreeLogs() {
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    userId: '',
    adminUserId: ''
  })

  useEffect(() => {
    fetchLogs()
    fetchStats()
  }, [filters])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('access_token')
      
      const params = new URLSearchParams()
      if (filters.userId) params.append('user_id', filters.userId)
      if (filters.adminUserId) params.append('admin_user_id', filters.adminUserId)
      
      const response = await fetch(`${API_BASE_URL}/api/admin/always-free-logs?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setLogs(data)
      }
    } catch (error) {
      console.error('Ошибка при загрузке логов:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('access_token')
      
      const response = await fetch(`${API_BASE_URL}/api/admin/always-free-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Ошибка при загрузке статистики:', error)
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusChangeIcon = (oldStatus, newStatus) => {
    if (oldStatus === false && newStatus === true) {
      return <ExclamationTriangleIcon className="w-5 h-5 text-green-600" />
    } else if (oldStatus === true && newStatus === false) {
      return <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
    }
    return <ClockIcon className="w-5 h-5 text-gray-600" />
  }

  const getStatusChangeText = (oldStatus, newStatus) => {
    if (oldStatus === false && newStatus === true) {
      return 'Предоставлено право "всегда бесплатно"'
    } else if (oldStatus === true && newStatus === false) {
      return 'Отозвано право "всегда бесплатно"'
    }
    return 'Изменение статуса'
  }

  const getStatusChangeColor = (oldStatus, newStatus) => {
    if (oldStatus === false && newStatus === true) {
      return 'text-green-600'
    } else if (oldStatus === true && newStatus === false) {
      return 'text-red-600'
    }
    return 'text-gray-600'
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Логи "всегда бесплатно"</h1>
        <p className="text-gray-600">История изменений статуса пользователей</p>
      </div>

      {/* Статистика */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <UserIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Всегда бесплатно</p>
                <p className="text-2xl font-bold text-gray-900">{stats.always_free_count}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <UserIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Всего пользователей</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_users}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <UserIcon className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Процент</p>
                <p className="text-2xl font-bold text-gray-900">{stats.always_free_percentage}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <ClockIcon className="w-6 h-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Изменений за 30 дней</p>
                <p className="text-2xl font-bold text-gray-900">{stats.recent_changes_count}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Фильтры */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center mb-4">
          <FunnelIcon className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Фильтры</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID пользователя
            </label>
            <input
              type="number"
              placeholder="ID пользователя"
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID администратора
            </label>
            <input
              type="number"
              placeholder="ID администратора"
              value={filters.adminUserId}
              onChange={(e) => handleFilterChange('adminUserId', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Таблица логов */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">История изменений</h2>
        </div>
        
        {loading ? (
          <div className="p-6">
            <div className="animate-pulse space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Пользователь
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Администратор
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Изменение
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Причина
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{log.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {log.user_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        ID: {log.user_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {log.admin_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        ID: {log.admin_user_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusChangeIcon(log.old_status, log.new_status)}
                        <div className="ml-2">
                          <div className={`text-sm font-medium ${getStatusChangeColor(log.old_status, log.new_status)}`}>
                            {getStatusChangeText(log.old_status, log.new_status)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {log.old_status ? 'Да' : 'Нет'} → {log.new_status ? 'Да' : 'Нет'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.reason || 'Не указана'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(log.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div className="text-center py-12">
            <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Логи не найдены</h3>
            <p className="mt-1 text-sm text-gray-500">
              Попробуйте изменить фильтры или поисковый запрос.
            </p>
          </div>
        )}
      </div>

      {/* Последние изменения */}
      {stats && stats.recent_changes && stats.recent_changes.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Последние изменения</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {stats.recent_changes.map((change) => (
                <div key={change.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    {getStatusChangeIcon(change.old_status, change.new_status)}
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">
                        {change.user_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        Администратор: {change.admin_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${getStatusChangeColor(change.old_status, change.new_status)}`}>
                      {getStatusChangeText(change.old_status, change.new_status)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(change.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
