import React, { useState } from 'react'
import AddressAutocomplete from './AddressAutocomplete'
import SimpleAddressFromYandexMaps from './SimpleAddressFromYandexMaps'

const AddressInputDemo = () => {
  const [selectedMethod, setSelectedMethod] = useState('simple') // 'simple' или 'api'
  const [address, setAddress] = useState('')

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Демонстрация ввода адреса</h1>
        <p className="text-gray-600 mb-6">
          Выберите метод ввода адреса и протестируйте оба варианта
        </p>
      </div>

      {/* Переключатель методов */}
      <div className="flex space-x-4 justify-center">
        <button
          onClick={() => setSelectedMethod('simple')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            selectedMethod === 'simple'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Через ссылку Яндекс.Карт
        </button>
        <button
          onClick={() => setSelectedMethod('api')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            selectedMethod === 'api'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Через API (автодополнение)
        </button>
      </div>

      {/* Описание методов */}
      <div className="bg-gray-50 p-4 rounded-lg">
        {selectedMethod === 'simple' ? (
          <div>
            <h3 className="font-semibold text-green-700 mb-2">✅ Метод через ссылку Яндекс.Карт</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Не требует API ключей</li>
              <li>• Простота для пользователя</li>
              <li>• Точность указания адреса</li>
              <li>• Бесплатно и без лимитов</li>
            </ul>
          </div>
        ) : (
          <div>
            <h3 className="font-semibold text-blue-700 mb-2">🔧 Метод через API</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Требует API ключи и настройку</li>
              <li>• Автодополнение адресов</li>
              <li>• Быстрый поиск</li>
              <li>• Лимиты использования</li>
            </ul>
          </div>
        )}
      </div>

      {/* Форма ввода адреса */}
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-medium mb-4">Ввод адреса</h3>
        
        {selectedMethod === 'simple' ? (
          <SimpleAddressFromYandexMaps
            value={address}
            onChange={setAddress}
            placeholder="Вставьте ссылку на Яндекс.Карты"
          />
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Город
              </label>
              <input
                type="text"
                placeholder="Москва"
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Адрес
              </label>
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                city="Москва"
                placeholder="Начните вводить адрес"
                className="w-full"
                apiKey={import.meta.env.VITE_YANDEX_MAPS_API_KEY}
              />
            </div>
          </div>
        )}
      </div>

      {/* Результат */}
      {address && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-medium text-green-800 mb-2">Результат:</h3>
          <p className="text-green-700">{address}</p>
        </div>
      )}

      {/* Сравнение методов */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-800 mb-2">Рекомендации по выбору метода:</h3>
        <div className="text-sm text-blue-700 space-y-2">
          <p><strong>Для разового указания адреса (салоны, мастера):</strong></p>
          <p>✅ Используйте метод "Через ссылку Яндекс.Карт"</p>
          <p className="mt-2"><strong>Для массового поиска адресов:</strong></p>
          <p>✅ Используйте метод "Через API (автодополнение)"</p>
        </div>
      </div>

      {/* Ссылки на тесты */}
      <div className="text-center space-y-2">
        <p className="text-sm text-gray-600">Дополнительные тесты:</p>
        <div className="flex justify-center space-x-4">
          <a
            href="/test_address_extraction.html"
            target="_blank"
            className="text-blue-600 hover:underline text-sm"
          >
            Тест извлечения адреса
          </a>
          <a
            href="/test_yandex_api.html"
            target="_blank"
            className="text-blue-600 hover:underline text-sm"
          >
            Тест API Яндекс.Карт
          </a>
        </div>
      </div>
    </div>
  )
}

export default AddressInputDemo 