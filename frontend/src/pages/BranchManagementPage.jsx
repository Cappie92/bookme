import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import Tabs from '../components/ui/Tabs'
import Header from '../components/Header'

export default function BranchManagementPage() {
  const { branchId } = useParams()
  const navigate = useNavigate()
  const [branch, setBranch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('basic')

  const tabs = [
    { id: 'basic', label: 'Основная информация' },
    { id: 'schedule', label: 'Расписание работы' },
    { id: 'website', label: 'Управление сайтом' }
  ]

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token')
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }

  const loadBranchData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/salon/my-managed-branches`, {
        headers: getAuthHeaders()
      })
      
      if (response.ok) {
        const branches = await response.json()
        const currentBranch = branches.find(b => b.id === parseInt(branchId))
        
        if (currentBranch) {
          setBranch(currentBranch)
        } else {
          setError('Филиал не найден или у вас нет прав на управление им')
        }
      } else if (response.status === 401) {
        navigate('/')
        return
      } else {
        setError('Ошибка загрузки данных филиала')
      }
    } catch (error) {
      console.error('Ошибка загрузки филиала:', error)
      setError('Ошибка загрузки данных филиала')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBranchData()
  }, [branchId])

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex justify-center items-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50] mx-auto"></div>
            <p className="mt-4 text-gray-600">Загрузка...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex justify-center items-center h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Ошибка</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => navigate('/client/dashboard')}
              className="bg-[#4CAF50] text-white px-6 py-2 rounded-lg hover:bg-[#45A049]"
            >
              Вернуться в личный кабинет
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!branch) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex justify-center items-center h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Не найдено</h1>
            <p className="text-gray-600 mb-6">Филиал не найден</p>
            <button
              onClick={() => navigate('/client/dashboard')}
              className="bg-[#4CAF50] text-white px-6 py-2 rounded-lg hover:bg-[#45A049]"
            >
              Вернуться в личный кабинет
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Компонент для вкладки основной информации
  const BasicInfoTab = () => (
    <div className="space-y-6">
      {/* Основная информация о филиале */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Информация о филиале</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
            <p className="text-gray-900 font-medium">{branch.name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label>
            <p className="text-gray-900">{branch.address || 'Не указан'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
            <p className="text-gray-900">{branch.phone || 'Не указан'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <p className="text-gray-900">{branch.email || 'Не указан'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Количество мест</label>
            <p className="text-gray-900">{branch.places_count || 0}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
            <span className={`inline-block px-2 py-1 rounded text-xs ${
              branch.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {branch.is_active ? 'Активен' : 'Неактивен'}
            </span>
          </div>
        </div>
        {branch.description && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
            <p className="text-gray-900">{branch.description}</p>
          </div>
        )}
      </div>

      {/* Быстрые действия */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Быстрые действия</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => navigate(`/places/dashboard?branch=${branch.id}`)}
            className="p-4 border border-[#4CAF50] rounded-lg hover:bg-[#DFF5EC] transition-colors text-left"
          >
            <div className="text-[#4CAF50] text-2xl mb-2">🏢</div>
            <h3 className="font-medium text-gray-900 mb-1">Управление местами</h3>
            <p className="text-sm text-gray-600">Настройка рабочих мест и их вместимости</p>
          </button>
          
          <button
            onClick={() => navigate(`/masters/dashboard?branch=${branch.id}`)}
            className="p-4 border border-[#4CAF50] rounded-lg hover:bg-[#DFF5EC] transition-colors text-left"
          >
            <div className="text-[#4CAF50] text-2xl mb-2">👨‍💼</div>
            <h3 className="font-medium text-gray-900 mb-1">Управление мастерами</h3>
            <p className="text-sm text-gray-600">Добавление и настройка мастеров филиала</p>
          </button>
          
          <button
            onClick={() => navigate(`/schedule/dashboard?branch=${branch.id}`)}
            className="p-4 border border-[#4CAF50] rounded-lg hover:bg-[#DFF5EC] transition-colors text-left"
          >
            <div className="text-[#4CAF50] text-2xl mb-2">📅</div>
            <h3 className="font-medium text-gray-900 mb-1">Расписание работы</h3>
            <p className="text-sm text-gray-600">Настройка рабочих часов и расписания</p>
          </button>
        </div>
      </div>

      {/* Статистика */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Статистика филиала</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-[#DFF5EC] rounded-lg">
            <div className="text-2xl font-bold text-[#4CAF50]">{branch.places_count || 0}</div>
            <div className="text-sm text-[#2E7D32]">Рабочих мест</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">0</div>
            <div className="text-sm text-blue-700">Мастеров</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">0</div>
            <div className="text-sm text-green-700">Записей сегодня</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">0</div>
            <div className="text-sm text-purple-700">Доход за месяц</div>
          </div>
        </div>
      </div>
    </div>
  )

  // Компонент для вкладки расписания работы
  const ScheduleTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Расписание работы филиала</h2>
        <p className="text-gray-600 mb-4">
          Настройте рабочие часы для каждого дня недели
        </p>
        
        {/* Здесь будет компонент для настройки расписания */}
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <div className="text-gray-400 text-4xl mb-2">📅</div>
          <p className="text-gray-500">Компонент настройки расписания будет добавлен позже</p>
        </div>
      </div>
    </div>
  )

  // Компонент для вкладки управления сайтом
  const WebsiteTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Управление сайтом филиала</h2>
        <p className="text-gray-600 mb-4">
          Настройте внешний вид и контент страницы филиала
        </p>
        
        {/* URL slug */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Название в URL
          </label>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">sitename.dedato.ru/</span>
            <span className="text-lg font-medium text-gray-900">
              {branch.url_slug || 'не указано'}
            </span>
          </div>
        </div>

        {/* Цвет фона */}
        {branch.background_color && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Цвет фона страницы
            </label>
            <div className="flex items-center space-x-3">
              <div 
                className="w-12 h-12 border rounded"
                style={{ backgroundColor: branch.background_color }}
              ></div>
              <span className="text-gray-900">{branch.background_color}</span>
            </div>
          </div>
        )}

        {/* Логотип */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Логотип филиала
          </label>
          {branch.use_salon_logo ? (
            <p className="text-gray-600">Используется логотип организации</p>
          ) : branch.logo_path ? (
            <p className="text-gray-600">Загружен собственный логотип</p>
          ) : (
            <p className="text-gray-500">Логотип не настроен</p>
          )}
        </div>

        {/* Яндекс карта */}
        {branch.yandex_map_embed && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Интерактивная карта
            </label>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Карта настроена и отображается на странице</p>
            </div>
          </div>
        )}

        {/* Кнопка редактирования */}
        <div className="pt-4">
          <button
            onClick={() => navigate(`/branch/edit/${branch.id}`)}
            className="bg-[#4CAF50] text-white px-6 py-2 rounded-lg hover:bg-[#45A049]"
          >
            Редактировать настройки сайта
          </button>
        </div>
      </div>
    </div>
  )

  // Функция для рендеринга активной вкладки
  const renderActiveTab = () => {
    switch (activeTab) {
      case 'basic':
        return <BasicInfoTab />
      case 'schedule':
        return <ScheduleTab />
      case 'website':
        return <WebsiteTab />
      default:
        return <BasicInfoTab />
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="pt-[140px] p-8">
        <div className="max-w-6xl mx-auto">
          {/* Заголовок */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Управление филиалом</h1>
              <p className="text-gray-600 mt-2">
                {branch.name} • {branch.address || 'Адрес не указан'}
              </p>
            </div>
            <button
              onClick={() => navigate('/client/dashboard')}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Вернуться в личный кабинет
            </button>
          </div>

          {/* Вкладки */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="p-6">
              <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
          </div>

          {/* Содержимое активной вкладки */}
          {renderActiveTab()}
        </div>
      </div>
    </div>
  )
}
