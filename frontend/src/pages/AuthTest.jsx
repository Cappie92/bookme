import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function AuthTest() {
  const [token, setToken] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const storedToken = localStorage.getItem('access_token')
    setToken(storedToken)
  }, [])

  const testProfile = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/client/profile', {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      })
      
      console.log('Ответ API:', response.status, response.statusText)
      
      if (response.ok) {
        const data = await response.json()
        setProfile(data)
        console.log('Профиль загружен:', data)
      } else {
        setError(`Ошибка ${response.status}: ${response.statusText}`)
        console.error('Ошибка API:', response.status, response.statusText)
      }
    } catch (error) {
      setError(`Ошибка сети: ${error.message}`)
      console.error('Ошибка сети:', error)
    } finally {
      setLoading(false)
    }
  }

  const clearToken = () => {
    localStorage.removeItem('access_token')
    setToken(null)
    setProfile(null)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Тест аутентификации</h1>
        
        <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
          <h2 className="text-xl font-semibold mb-4">Текущий токен</h2>
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">Токен в localStorage:</p>
            <div className="bg-gray-100 p-3 rounded text-xs font-mono break-all">
              {token ? token : 'Токен не найден'}
            </div>
          </div>
          
          <div className="flex space-x-4">
            <button
              onClick={testProfile}
              disabled={loading || !token}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Тестируем...' : 'Тест профиля'}
            </button>
            
            <button
              onClick={clearToken}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Очистить токен
            </button>
            
            <button
              onClick={() => navigate('/client')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              В кабинет
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <strong>Ошибка:</strong> {error}
          </div>
        )}

        {profile && (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Профиль пользователя</h2>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(profile, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
} 