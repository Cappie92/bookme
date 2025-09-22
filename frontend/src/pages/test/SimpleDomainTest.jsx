import React, { useState } from 'react'

export default function SimpleDomainTest() {
  const [subdomain, setSubdomain] = useState('sitename')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const testAPI = async () => {
    setLoading(true)
    setResult(null)

    try {
      console.log('Тестируем API для поддомена:', subdomain)
      const url = `/api/domain/${subdomain}/info`
      console.log('URL запроса:', url)
      
      const response = await fetch(url)
      console.log('Статус ответа:', response.status)
      
      if (response.ok) {
        const data = await response.json()
        console.log('Полученные данные:', data)
        setResult({ success: true, data })
      } else {
        console.error('Ошибка HTTP:', response.status, response.statusText)
        setResult({ success: false, error: `HTTP ${response.status}: ${response.statusText}` })
      }
    } catch (error) {
      console.error('Ошибка сети:', error)
      setResult({ success: false, error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
            <div className="min-h-screen bg-[#F9F7F6] py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
          Простой тест API поддоменов
        </h1>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Поддомен для тестирования
            </label>
            <input
              type="text"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="sitename"
            />
          </div>

          <button
            onClick={testAPI}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Тестирование...' : 'Тестировать API'}
          </button>

          {result && (
            <div className="mt-6">
              {result.success ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h3 className="font-medium text-green-900 mb-2">✅ Успешно!</h3>
                  <pre className="text-sm text-green-800 overflow-auto">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h3 className="font-medium text-red-900 mb-2">❌ Ошибка</h3>
                  <p className="text-red-800">{result.error}</p>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">Информация для отладки:</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p>• Текущий URL: <code className="bg-blue-100 px-1 rounded">{window.location.href}</code></p>
              <p>• API URL: <code className="bg-blue-100 px-1 rounded">/api/domain/{subdomain}/info</code></p>
              <p>• Полный URL: <code className="bg-blue-100 px-1 rounded">{window.location.origin}/api/domain/{subdomain}/info</code></p>
              <p>• Проверьте консоль браузера для дополнительной информации</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 