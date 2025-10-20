import { useState, useEffect } from "react"
import { 
  MagnifyingGlassIcon,
  PlusIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  UserIcon,
  ShieldCheckIcon
} from "@heroicons/react/24/outline"
import ModeratorModal from "../modals/ModeratorModal"
import { API_BASE_URL } from '../utils/config'

export default function AdminModerators() {
  const [moderators, setModerators] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [editingModerator, setEditingModerator] = useState(null)

  useEffect(() => {
    fetchModerators()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const checkAndRefreshToken = async () => {
    const token = localStorage.getItem('access_token')
    console.log('Проверяем токен:', token ? 'найден' : 'не найден')
    
    if (!token) {
      alert('Токен авторизации не найден. Пожалуйста, войдите в систему заново.')
      window.location.href = '/'
      return null
    }
    
    // Проверяем, не истек ли токен
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const exp = payload.exp * 1000 // конвертируем в миллисекунды
      const now = Date.now()
      console.log('Токен истекает:', new Date(exp), 'Текущее время:', new Date(now))
      
      if (now >= exp) {
        alert('Токен авторизации истек. Пожалуйста, войдите в систему заново.')
        window.location.href = '/'
        return null
      }
    } catch (error) {
      console.error('Ошибка при проверке токена:', error)
      alert('Токен авторизации недействителен. Пожалуйста, войдите в систему заново.')
      window.location.href = '/'
      return null
    }
    
    return token
  }

  const fetchModerators = async () => {
    try {
      setLoading(true)
      const token = await checkAndRefreshToken()
      if (!token) return
      
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      
      const url = `${API_BASE_URL}/api/admin/moderators?${params.toString()}`
      console.log('Отправляем запрос на:', url)
      console.log('Токен:', token ? `${token.substring(0, 20)}...` : 'null')
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      console.log('Получен ответ:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('Данные модераторов:', data)
        setModerators(data)
      } else if (response.status === 401) {
        console.error('Ошибка 401 - неавторизован')
        alert('Ошибка авторизации. Пожалуйста, войдите в систему заново.')
        window.location.href = '/'
        return
      } else {
        const errorData = await response.json()
        console.error('Ошибка ответа:', errorData)
      }
    } catch (error) {
      console.error('Ошибка при загрузке модераторов:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateModerator = () => {
    setEditingModerator(null)
    setShowModal(true)
  }

  const handleEditModerator = (moderator) => {
    setEditingModerator(moderator)
    setShowModal(true)
  }

  const handleDeleteModerator = async (moderatorId) => {
    if (!confirm('Вы уверены, что хотите удалить этого модератора?')) {
      return
    }

    try {
      const token = await checkAndRefreshToken()
      if (!token) return
      
      const response = await fetch(`${API_BASE_URL}/api/admin/moderators/${moderatorId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        fetchModerators()
        alert('Модератор успешно удален')
      } else if (response.status === 401) {
        alert('Ошибка авторизации. Пожалуйста, войдите в систему заново.')
        window.location.href = '/'
        return
      } else {
        const error = await response.json()
        alert('Ошибка: ' + (error.detail || 'Не удалось удалить модератора'))
      }
    } catch (error) {
      console.error('Ошибка при удалении модератора:', error)
      alert('Ошибка сети или сервера')
    }
  }

  const handleModalClose = () => {
    setShowModal(false)
    setEditingModerator(null)
  }

  const handleModalSave = () => {
    setShowModal(false)
    setEditingModerator(null)
    fetchModerators()
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

  const getPermissionCount = (permissions) => {
    if (!permissions) return 0
    return Object.values(permissions).filter(value => value === true).length
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Управление модераторами</h1>
        <p className="text-gray-600 mt-2">Создание и управление модераторами системы</p>
      </div>

      {/* Поиск и кнопка создания */}
      <div className="flex justify-between items-center">
        <div className="relative w-96">
          <input
            type="text"
            placeholder="Поиск по имени/email/телефону..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
        </div>
        
        <button
          onClick={handleCreateModerator}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Создать модератора
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ShieldCheckIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всего модераторов</p>
              <p className="text-2xl font-bold text-gray-900">{moderators.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <UserIcon className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Активных</p>
              <p className="text-2xl font-bold text-gray-900">
                {moderators.filter(m => m.is_active).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <ShieldCheckIcon className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">С правами</p>
              <p className="text-2xl font-bold text-gray-900">
                {moderators.filter(m => m.permissions && getPermissionCount(m.permissions) > 0).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Список модераторов */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Список модераторов</h2>
        </div>
        
        {loading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Загрузка модераторов...</p>
          </div>
        ) : moderators.length === 0 ? (
          <div className="p-6 text-center">
            <ShieldCheckIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Модераторы не найдены</p>
            <button
              onClick={handleCreateModerator}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Создать первого модератора
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Модератор
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Контакты
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Права
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата создания
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {moderators.map((moderator) => (
                  <tr key={moderator.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <ShieldCheckIcon className="w-6 h-6 text-blue-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {moderator.full_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {moderator.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{moderator.email}</div>
                      <div className="text-sm text-gray-500">{moderator.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {getPermissionCount(moderator.permissions)} прав
                      </div>
                      <div className="text-sm text-gray-500">
                        {moderator.permissions ? 'Настроены' : 'Не настроены'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        moderator.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {moderator.is_active ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(moderator.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEditModerator(moderator)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <PencilIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteModerator(moderator.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модальное окно */}
      {showModal && (
        <ModeratorModal
          moderator={editingModerator}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}
    </div>
  )
} 