import React, { useState } from 'react'

const SimpleAddressFromYandexMaps = ({ 
  value, 
  onChange, 
  placeholder = "Вставьте ссылку на Яндекс.Карты",
  className = ""
}) => {
  const [inputValue, setInputValue] = useState(value || '')
  const [extractedAddress, setExtractedAddress] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const extractAddressFromYandexLink = async (url) => {
    setIsLoading(true)
    setError('')
    setExtractedAddress('')

    try {
      // Проверяем, что это ссылка на Яндекс.Карты
      if (!url.includes('yandex.ru/maps') && !url.includes('maps.yandex.ru')) {
        setError('Пожалуйста, вставьте ссылку на Яндекс.Карты')
        setIsLoading(false)
        return
      }

      const urlObj = new URL(url)
      const path = urlObj.pathname
      
      // Пытаемся извлечь адрес из различных форматов ссылок
      let address = null

      // Формат 1: /maps/213/moscow/?ll=37.617635%2C55.755814&z=16&text=улица%20Тверская%2C%201
      const textParam = urlObj.searchParams.get('text')
      if (textParam) {
        address = decodeURIComponent(textParam)
      }

      // Формат 2: /maps/213/moscow/?ll=37.617635%2C55.755814&z=16
      // В этом случае используем обратное геокодирование
      if (!address) {
        const llParam = urlObj.searchParams.get('ll')
        if (llParam) {
          try {
            const [lon, lat] = llParam.split(',').map(Number)
            
            // Используем обратное геокодирование для получения адреса
            const response = await fetch(
              `https://geocode-maps.yandex.ru/1.x/?format=json&geocode=${lon},${lat}&lang=ru_RU`
            )
            
            if (response.ok) {
              const data = await response.json()
              const featureMember = data.response.GeoObjectCollection.featureMember
              
              if (featureMember.length > 0) {
                address = featureMember[0].GeoObject.metaDataProperty.GeocoderMetaData.text
              }
            }
          } catch (error) {
            console.error('Ошибка при обратном геокодировании:', error)
          }
        }
      }

      // Формат 3: /maps/213/moscow/улица%20Тверская%2C%201
      if (!address) {
        const pathParts = path.split('/')
        if (pathParts.length >= 4) {
          // Пытаемся найти адрес в path
          const possibleAddress = pathParts.slice(3).join('/')
          if (possibleAddress && 
              possibleAddress !== 'moscow' && 
              possibleAddress !== 'spb' && 
              possibleAddress !== 'spb' &&
              !possibleAddress.match(/^\d+$/) &&
              !possibleAddress.startsWith('-/')) {
            address = decodeURIComponent(possibleAddress)
          }
        }
      }

      // Формат 4: /maps/-/CHXXEC87 (короткие ссылки)
      if (!address) {
        const shortLinkMatch = path.match(/\/maps\/-\/([^\/\?]+)/)
        if (shortLinkMatch) {
          setError('Короткие ссылки Яндекс.Карт не поддерживаются. Пожалуйста, используйте полную ссылку с адресом.')
          setIsLoading(false)
          return
        }
      }

      if (address) {
        // Очищаем адрес от лишних символов
        address = address
          .replace(/\+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        
        setExtractedAddress(address)
        onChange(address)
      } else {
        setError('Не удалось извлечь адрес из ссылки. Убедитесь, что ссылка содержит адрес или координаты.')
      }
    } catch (error) {
      console.error('Ошибка при обработке ссылки:', error)
      setError('Ошибка при обработке ссылки')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const newValue = e.target.value
    setInputValue(newValue)
    
    // Если пользователь вставил ссылку, автоматически извлекаем адрес
    if (newValue.includes('yandex.ru/maps') || newValue.includes('maps.yandex.ru')) {
      extractAddressFromYandexLink(newValue)
    }
  }

  const handleManualExtract = () => {
    if (inputValue) {
      extractAddressFromYandexLink(inputValue)
    }
  }

  const handleClear = () => {
    setInputValue('')
    setExtractedAddress('')
    setError('')
    onChange('')
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className="block text-sm font-medium mb-1">
          Ссылка на Яндекс.Карты
        </label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder={placeholder}
            className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 text-gray-500 hover:text-gray-700"
              title="Очистить"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center space-x-2 text-blue-600">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span>Извлекаем адрес...</span>
        </div>
      )}

      {error && (
        <div className="text-red-600 text-sm">
          {error}
        </div>
      )}

      {extractedAddress && (
        <div className="bg-green-50 border border-green-200 rounded p-3">
          <div className="text-sm font-medium text-green-800 mb-1">
            Извлеченный адрес:
          </div>
          <div className="text-green-700">
            {extractedAddress}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 space-y-1">
        <p><strong>Как получить ссылку:</strong></p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Откройте <a href="https://yandex.ru/maps" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Яндекс.Карты</a></li>
          <li>Найдите нужный адрес</li>
          <li>Нажмите "Поделиться" → "Скопировать ссылку"</li>
          <li>Вставьте ссылку в поле выше</li>
        </ol>
        <p className="mt-2 text-orange-600">
          <strong>Примечание:</strong> Поддерживаются ссылки с адресом в параметрах или координатами. Короткие ссылки не поддерживаются.
        </p>
      </div>

      {inputValue && !extractedAddress && !isLoading && (
        <button
          type="button"
          onClick={handleManualExtract}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Извлечь адрес из ссылки
        </button>
      )}
    </div>
  )
}

export default SimpleAddressFromYandexMaps 