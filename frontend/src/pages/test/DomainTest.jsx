import React from 'react'
import { Link } from 'react-router-dom'
import DomainChecker from '../../components/DomainChecker'

export default function DomainTest() {
  return (
    <div className="min-h-screen bg-[#F9F7F6] py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Тестирование системы поддоменов
          </h1>
          <p className="text-lg text-gray-600">
            Проверьте доступность поддоменов и протестируйте их работу
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Проверка поддомена */}
          <div>
            <DomainChecker />
          </div>

          {/* Примеры поддоменов */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Примеры поддоменов
            </h2>

            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">Для салонов:</h3>
                <div className="space-y-2 text-sm">
                  <p><strong>beauty-salon</strong> → <code className="bg-blue-100 px-1 rounded">beauty-salon.siteaddress.ru</code></p>
                  <p><strong>nails-studio</strong> → <code className="bg-blue-100 px-1 rounded">nails-studio.siteaddress.ru</code></p>
                  <p><strong>hair-salon</strong> → <code className="bg-blue-100 px-1 rounded">hair-salon.siteaddress.ru</code></p>
                </div>
              </div>

              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-medium text-green-900 mb-2">Для мастеров:</h3>
                <div className="space-y-2 text-sm">
                  <p><strong>anna-master</strong> → <code className="bg-green-100 px-1 rounded">anna-master.siteaddress.ru</code></p>
                  <p><strong>maria-beauty</strong> → <code className="bg-green-100 px-1 rounded">maria-beauty.siteaddress.ru</code></p>
                  <p><strong>elena-nails</strong> → <code className="bg-green-100 px-1 rounded">elena-nails.siteaddress.ru</code></p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-medium text-yellow-900 mb-2">Для локальной разработки:</h3>
              <p className="text-sm text-yellow-800">
                Используйте формат: <code className="bg-yellow-100 px-1 rounded">localhost:5173/domain/subdomain</code>
              </p>
            </div>
          </div>
        </div>

        {/* Тестовые ссылки */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Тестовые поддомены
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Салон (ID: 1)</h3>
              <div className="space-y-2">
                <Link
                  to="/domain/test-salon"
                  className="block p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <div className="font-medium text-blue-900">test-salon</div>
                  <div className="text-sm text-blue-600">Тестовый салон</div>
                </Link>
              </div>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 mb-3">Мастер (ID: 1)</h3>
              <div className="space-y-2">
                <Link
                  to="/domain/test-master"
                  className="block p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <div className="font-medium text-green-900">test-master</div>
                  <div className="text-sm text-green-600">Тестовый мастер</div>
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Несуществующий поддомен:</h3>
            <Link
              to="/domain/nonexistent"
              className="text-red-600 hover:text-red-700 underline"
            >
              /domain/nonexistent
            </Link>
            <p className="text-sm text-gray-600 mt-1">
              Должен показать страницу "Поддомен не найден"
            </p>
          </div>
        </div>

        {/* Информация о системе */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Как работает система поддоменов
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Для продакшена:</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• <code className="bg-gray-100 px-1 rounded">salon.siteaddress.ru</code></li>
                <li>• <code className="bg-gray-100 px-1 rounded">master.siteaddress.ru</code></li>
                <li>• Поддомены 3-го уровня</li>
                <li>• Требует настройки DNS</li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 mb-3">Для разработки:</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• <code className="bg-gray-100 px-1 rounded">localhost:5173/domain/salon</code></li>
                <li>• <code className="bg-gray-100 px-1 rounded">localhost:5173/domain/master</code></li>
                <li>• Эмуляция поддоменов через пути</li>
                <li>• Работает локально без DNS</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">API Endpoints:</h3>
            <div className="space-y-1 text-sm text-blue-800">
              <p>• <code className="bg-blue-100 px-1 rounded">GET /api/domain/{'{subdomain}'}/info</code> - информация о владельце</p>
              <p>• <code className="bg-blue-100 px-1 rounded">GET /api/domain/{'{subdomain}'}/services</code> - услуги владельца</p>
              <p>• <code className="bg-blue-100 px-1 rounded">GET /api/domain/{'{subdomain}'}/masters</code> - мастера салона</p>
              <p>• <code className="bg-blue-100 px-1 rounded">GET /api/domain/check/{'{subdomain}'}</code> - проверка доступности</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 