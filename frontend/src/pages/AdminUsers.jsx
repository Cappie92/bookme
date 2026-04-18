import { useState, useEffect } from "react"
import { 
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  UserIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from "@heroicons/react/24/outline"
import { API_BASE_URL } from '../utils/config'
import { useModal } from '../hooks/useModal'

const PAGE_SIZE = 30

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    role: '',
    search: '',
    userId: '',
    alwaysFree: ''
  })
  
  // Состояние для модальных окон
  const [selectedUser, setSelectedUser] = useState(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  
  // Состояние для планов подписки
  const [subscriptionPlans, setSubscriptionPlans] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [isAlwaysFreeChecked, setIsAlwaysFreeChecked] = useState(false)
  const [currentPlanId, setCurrentPlanId] = useState(null)

  useEffect(() => {
    fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('access_token')
      
      const params = new URLSearchParams()
      params.append('limit', String(PAGE_SIZE))
      params.append('skip', String((page - 1) * PAGE_SIZE))
      // Backend UserRole: client, master, salon, indie, admin, moderator (строчные значения enum)
      if (filters.role) params.append('role', filters.role)
      if (filters.search) params.append('search', filters.search)
      if (filters.userId) params.append('user_id', filters.userId)
      if (filters.alwaysFree) params.append('always_free', filters.alwaysFree)
      
      const response = await fetch(`${API_BASE_URL}/api/admin/users?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        const items = Array.isArray(data?.items) ? data.items : []
        const total = typeof data?.total === 'number' ? data.total : 0
        const skip = (page - 1) * PAGE_SIZE
        setTotalCount(total)
        setUsers(items)
        // После сужения фильтров: запрошенная страница вне диапазона — сброс на 1
        if (items.length === 0 && total > 0 && skip > 0) {
          setPage(1)
        }
      } else {
        // При 422/401 не оставляем предыдущий список — иначе кажется, что фильтр «сломан»
        let detail = response.statusText
        try {
          const errBody = await response.json()
          if (errBody?.detail) detail = typeof errBody.detail === 'string' ? errBody.detail : JSON.stringify(errBody.detail)
        } catch { /* ignore */ }
        console.error('Ошибка загрузки пользователей:', response.status, detail)
        setUsers([])
        setTotalCount(0)
      }
    } catch (error) {
      console.error('Ошибка при загрузке пользователей:', error)
      setUsers([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (key, value) => {
    setPage(1)
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  // Обработчики для кнопок действий
  const handleViewUser = (user) => {
    setSelectedUser(user)
    setShowViewModal(true)
  }

  const handleEditUser = async (user) => {
    setSelectedUser(user)
    setIsAlwaysFreeChecked(user.is_always_free || false)
    setCurrentPlanId(null) // Сбрасываем текущий план
    setShowEditModal(true)
    // Загружаем планы подписки при открытии модального окна
    await fetchSubscriptionPlans()
  }
  
  const fetchSubscriptionPlans = async () => {
    try {
      setLoadingPlans(true)
      const token = localStorage.getItem('access_token')
      // Используем админский endpoint, так как мы в админке
      const response = await fetch(`${API_BASE_URL}/api/admin/subscription-plans?subscription_type=master&is_active=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setSubscriptionPlans(data)
      }
    } catch (error) {
      console.error('Ошибка при загрузке планов подписки:', error)
    } finally {
      setLoadingPlans(false)
    }
  }

  const handleDeleteUser = (user) => {
    setSelectedUser(user)
    setShowDeleteModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedUser) return
    
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const wasLastOnPage = users.length <= 1
        const currentPage = page
        setTotalCount(t => Math.max(0, t - 1))
        setUsers(users.filter(u => u.id !== selectedUser.id))
        if (wasLastOnPage && currentPage > 1) {
          setPage(currentPage - 1)
        }
        setShowDeleteModal(false)
        setSelectedUser(null)
      } else {
        console.error('Ошибка при удалении пользователя')
      }
    } catch (error) {
      console.error('Ошибка при удалении пользователя:', error)
    }
  }

  const handleSaveUser = async (formData) => {
    if (!selectedUser) return
    
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })
      
      if (response.ok) {
        const updatedUser = await response.json()
        // Обновляем пользователя в списке
        setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u))
        setShowEditModal(false)
        setSelectedUser(null)
      } else {
        console.error('Ошибка при обновлении пользователя')
      }
    } catch (error) {
      console.error('Ошибка при обновлении пользователя:', error)
    }
  }

  /** Канон API: значения UserRole в нижнем регистре (client, master, …) */
  const normalizeRoleKey = (role) => {
    if (role == null || role === '') return ''
    return String(role).toLowerCase()
  }

  const getRoleLabel = (role) => {
    const roleLabels = {
      client: 'Клиент',
      master: 'Мастер',
      salon: 'Салон',
      admin: 'Администратор',
      moderator: 'Модератор',
      indie: 'Независимый мастер'
    }
    const k = normalizeRoleKey(role)
    return roleLabels[k] || role || '—'
  }

  const getRoleColor = (role) => {
    const roleColors = {
      client: 'bg-green-100 text-green-800',
      master: 'bg-green-100 text-green-800',
      salon: 'bg-purple-100 text-purple-800',
      admin: 'bg-red-100 text-red-800',
      moderator: 'bg-yellow-100 text-yellow-800',
      indie: 'bg-orange-100 text-orange-800'
    }
    const k = normalizeRoleKey(role)
    return roleColors[k] || 'bg-gray-100 text-gray-800'
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  /** Подпись активного плана с API (master/indie/salon); иначе «—» */
  const formatSubscriptionPlanLabel = (user) => {
    const v = user?.subscription_plan_label
    if (v != null && String(v).trim() !== '') return String(v).trim()
    return '—'
  }

  /** Общий блок пагинации списка (шапка таблицы и подвал) — один state/handlers */
  const renderUserListPagination = (placement) => {
    if (loading || totalCount <= 0) return null
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    const from = (page - 1) * PAGE_SIZE + 1
    const to = Math.min(page * PAGE_SIZE, totalCount)
    const isFooter = placement === 'footer'
    const wrapperClass = isFooter
      ? 'px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'
      : 'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4 min-w-0 w-full lg:w-auto lg:max-w-2xl lg:ml-auto'
    return (
      <div className={wrapperClass}>
        <p className="text-sm text-gray-600">
          Показано <span className="font-medium text-gray-900">{from}–{to}</span> из{' '}
          <span className="font-medium text-gray-900">{totalCount}</span>
          {' · '}страница <span className="font-medium text-gray-900">{page}</span> из{' '}
          <span className="font-medium text-gray-900">{totalPages}</span>
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeftIcon className="w-4 h-4 mr-1" />
            Назад
          </button>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Вперёд
            <ChevronRightIcon className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Управление пользователями</h1>
        <p className="text-gray-600 mt-2">Просмотр и управление всеми пользователями системы</p>
      </div>

      {/* Фильтры */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center mb-4">
          <FunnelIcon className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Фильтры</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Роль пользователя
            </label>
            <select
              value={filters.role}
              onChange={(e) => handleFilterChange('role', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
            >
              <option value="">Все роли</option>
              <option value="client">Клиент</option>
              <option value="master">Мастер</option>
              <option value="salon">Салон</option>
              <option value="admin">Администратор</option>
              <option value="moderator">Модератор</option>
              <option value="indie">Независимый мастер</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Поиск по имени/email/телефону
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Поиск..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
              />
              <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID пользователя
            </label>
            <input
              type="number"
              placeholder="ID пользователя"
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Статус "всегда бесплатно"
            </label>
            <select
              value={filters.alwaysFree}
              onChange={(e) => handleFilterChange('alwaysFree', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
            >
              <option value="">Все пользователи</option>
              <option value="true">Всегда бесплатно</option>
              <option value="false">Обычные пользователи</option>
            </select>
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <UserIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всего (по фильтрам)</p>
              <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <UserIcon className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Активных (на странице)</p>
              <p className="text-2xl font-bold text-gray-900">
                {users.filter(u => u.is_active).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <UserIcon className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Верифицированных (на странице)</p>
              <p className="text-2xl font-bold text-gray-900">
                {users.filter(u => u.is_verified).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <UserIcon className="w-6 h-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Новых сегодня (на странице)</p>
              <p className="text-2xl font-bold text-gray-900">
                {users.filter(u => {
                  const today = new Date().toDateString()
                  return new Date(u.created_at).toDateString() === today
                }).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <UserIcon className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всегда бесплатно (на странице)</p>
              <p className="text-2xl font-bold text-gray-900">
                {users.filter(u => u.is_always_free).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Таблица пользователей */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <h2 className="text-lg font-semibold text-gray-900 shrink-0">Список пользователей</h2>
            {renderUserListPagination('header')}
          </div>
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
                  <div className="h-4 bg-gray-200 rounded w-28"></div>
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
                    Имя
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Телефон
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Роль
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    План подписки
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата регистрации
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Всегда бесплатно
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{user.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.full_name || 'Не указано'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {user.email || 'Не указано'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {user.phone || 'Не указано'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 max-w-[10rem] truncate" title={formatSubscriptionPlanLabel(user)}>
                      {formatSubscriptionPlanLabel(user)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {user.is_active ? 'Активен' : 'Неактивен'}
                        </span>
                        {user.is_verified && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            Верифицирован
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.is_always_free ? (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                          Да
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                          Нет
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleViewUser(user)}
                          className="text-[#4CAF50] hover:text-[#388e3c]" 
                          title="Просмотр"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleEditUser(user)}
                          className="text-green-600 hover:text-green-900" 
                          title="Редактировать"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user)}
                          className="text-red-600 hover:text-red-900" 
                          title="Удалить"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && users.length === 0 && (
          <div className="text-center py-12">
            <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Пользователи не найдены</h3>
            <p className="mt-1 text-sm text-gray-500">
              Попробуйте изменить фильтры или поисковый запрос.
            </p>
          </div>
        )}

        {renderUserListPagination('footer')}
      </div>

      {/* Модальное окно просмотра пользователя */}
      {showViewModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Просмотр пользователя</h2>
              <button 
                onClick={() => setShowViewModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">ID</label>
                <p className="text-sm text-gray-900">{selectedUser.id}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Имя</label>
                <p className="text-sm text-gray-900">{selectedUser.full_name || 'Не указано'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <p className="text-sm text-gray-900">{selectedUser.email || 'Не указано'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Телефон</label>
                <p className="text-sm text-gray-900">{selectedUser.phone || 'Не указано'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Роль</label>
                <p className="text-sm text-gray-900">{getRoleLabel(selectedUser.role)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Текущий план подписки</label>
                <p className="text-sm text-gray-900">{formatSubscriptionPlanLabel(selectedUser)}</p>
                <p className="text-xs text-gray-500">Активная подписка на момент загрузки списка</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Статус</label>
                <div className="flex space-x-2">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    selectedUser.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedUser.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                  {selectedUser.is_verified && (
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      Верифицирован
                    </span>
                  )}
                  {selectedUser.is_always_free && (
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                      Всегда бесплатно
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Дата регистрации</label>
                <p className="text-sm text-gray-900">{formatDate(selectedUser.created_at)}</p>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowViewModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно редактирования пользователя */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Редактирование пользователя</h2>
              <button 
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.target)
              const data = {
                full_name: formData.get('full_name'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                role: formData.get('role'),
                is_active: formData.get('is_active') === 'on',
                is_verified: formData.get('is_verified') === 'on',
                is_always_free: formData.get('is_always_free') === 'on',
                always_free_plan_id: formData.get('always_free_plan_id') ? parseInt(formData.get('always_free_plan_id')) : null
              }
              handleSaveUser(data)
            }}>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">ID</label>
                  <p className="text-sm text-gray-900">{selectedUser.id}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Имя</label>
                  <input
                    name="full_name"
                    type="text"
                    defaultValue={selectedUser.full_name || ''}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    name="email"
                    type="email"
                    defaultValue={selectedUser.email || ''}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Телефон</label>
                  <input
                    name="phone"
                    type="text"
                    defaultValue={selectedUser.phone || ''}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Роль</label>
                  <select
                    name="role"
                    defaultValue={selectedUser.role}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="client">Клиент</option>
                    <option value="master">Мастер</option>
                    <option value="salon">Салон</option>
                    <option value="admin">Администратор</option>
                    <option value="moderator">Модератор</option>
                    <option value="indie">Независимый мастер</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Текущий план подписки</label>
                  <p className="text-sm text-gray-700">{formatSubscriptionPlanLabel(selectedUser)}</p>
                  <p className="text-xs text-gray-500">После сохранения подпись в таблице обновится из ответа сервера</p>
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      name="is_active"
                      type="checkbox"
                      defaultChecked={selectedUser.is_active}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Активен</span>
                  </label>
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      name="is_verified"
                      type="checkbox"
                      defaultChecked={selectedUser.is_verified}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Верифицирован</span>
                  </label>
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      name="is_always_free"
                      type="checkbox"
                      defaultChecked={selectedUser.is_always_free}
                      onChange={(e) => setIsAlwaysFreeChecked(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Всегда бесплатно</span>
                  </label>
                </div>
                {isAlwaysFreeChecked && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      План подписки для "Всегда бесплатно"
                    </label>
                    {loadingPlans ? (
                      <p className="text-sm text-gray-500">Загрузка планов...</p>
                    ) : (
                      <select
                        name="always_free_plan_id"
                        defaultValue={currentPlanId || ''}
                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                      >
                        <option value="">По умолчанию (Premium)</option>
                        {subscriptionPlans.map(plan => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} ({plan.price_1month || 0}₽/мес)
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Выберите план подписки, который будет назначен пользователю. Если не выбран, будет использован Premium по умолчанию.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#43a047]"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно подтверждения удаления */}
      {showDeleteModal && selectedUser && (() => {
        const { handleBackdropClick, handleMouseDown } = useModal(() => setShowDeleteModal(false));
        return (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleBackdropClick}
          onMouseDown={handleMouseDown}
        >
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-red-600">Удаление пользователя</h2>
              <button 
                onClick={() => setShowDeleteModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-700">
                Вы действительно хотите удалить пользователя <strong>{selectedUser.full_name || selectedUser.phone}</strong>?
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Это действие нельзя отменить. Все данные пользователя будут удалены безвозвратно.
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Отмена
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  )
} 