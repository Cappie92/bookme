import React, { useState } from 'react'

export default function DomainChecker() {
  const [subdomain, setSubdomain] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const checkDomain = async () => {
    if (!subdomain.trim()) {
      setResult({ error: 'Введите название поддомена' })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch(`/api/domain/check/${subdomain.trim()}`)
      const data = await response.json()

      if (response.ok) {
        setResult(data)
      } else {
        setResult({ error: data.detail || 'Ошибка проверки поддомена' })
      }
    } catch (error) {
      setResult({ error: 'Ошибка сети при проверке поддомена' })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    checkDomain()
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
        Проверка поддомена
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Название поддомена
          </label>
          <div className="flex">
            <input
              type="text"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="mydomain"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            />
            <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-500">
              .siteaddress.ru
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !subdomain.trim()}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Проверка...' : 'Проверить доступность'}
        </button>
      </form>

      {result && (
        <div className="mt-6">
          {result.error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{result.error}</p>
            </div>
          ) : result.available ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-600 font-medium">✅ Поддомен доступен!</p>
              <p className="text-green-600 text-sm mt-1">
                Вы можете использовать поддомен: <strong>{subdomain}.siteaddress.ru</strong>
              </p>
            </div>
          ) : (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-600 font-medium">⚠️ Поддомен занят</p>
              <p className="text-yellow-600 text-sm mt-1">
                Этот поддомен уже используется {result.owner_type === 'salon' ? 'салоном' : 'мастером'}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 text-sm text-gray-500">
        <h3 className="font-medium mb-2">Как это работает:</h3>
        <ul className="space-y-1">
          <li>• Введите желаемое название поддомена</li>
          <li>• Система проверит его доступность</li>
          <li>• Если доступен, вы получите URL вида: <code className="bg-gray-100 px-1 rounded">subdomain.siteaddress.ru</code></li>
          <li>• На этом URL будет размещена форма записи</li>
        </ul>
      </div>
    </div>
  )
} 