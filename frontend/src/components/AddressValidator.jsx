import React, { useState } from 'react'

const AddressValidator = ({ 
  address, 
  city = '', 
  onValidationResult,
  apiKey = null // API ключ для Yandex Geocoder
}) => {
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState(null)

  const validateAddress = async () => {
    if (!address || address.length < 5) {
      setValidationResult({ valid: false, message: 'Адрес слишком короткий' })
      onValidationResult && onValidationResult({ valid: false, message: 'Адрес слишком короткий' })
      return
    }

    setValidating(true)
    try {
      // Формируем полный адрес с городом
      const fullAddress = city ? `${city}, ${address}` : address
      
      if (apiKey) {
        // Используем реальный Yandex Geocoder API
        const response = await fetch(
          `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&format=json&geocode=${encodeURIComponent(fullAddress)}&lang=ru_RU`
        )
        
        if (response.ok) {
          const data = await response.json()
          const featureMember = data.response.GeoObjectCollection.featureMember
          
          if (featureMember.length > 0) {
            const coordinates = featureMember[0].GeoObject.Point.pos.split(' ')
            const lat = parseFloat(coordinates[1])
            const lon = parseFloat(coordinates[0])
            
            setValidationResult({ 
              valid: true, 
              message: 'Адрес найден на карте',
              coordinates: { lat, lon }
            })
            onValidationResult && onValidationResult({ 
              valid: true, 
              message: 'Адрес найден на карте',
              coordinates: { lat, lon }
            })
          } else {
            setValidationResult({ valid: false, message: 'Адрес не найден на карте' })
            onValidationResult && onValidationResult({ valid: false, message: 'Адрес не найден на карте' })
          }
        } else {
          console.error('Ошибка при валидации адреса:', response.status)
          setValidationResult({ valid: false, message: 'Ошибка при проверке адреса' })
          onValidationResult && onValidationResult({ valid: false, message: 'Ошибка при проверке адреса' })
        }
      } else {
        // Демо-режим без API ключа
        await new Promise(resolve => setTimeout(resolve, 1000)) // Имитация задержки
        
        // Простая проверка на наличие ключевых слов
        const addressLower = fullAddress.toLowerCase()
        const hasStreet = addressLower.includes('улица') || addressLower.includes('ул.') || 
                         addressLower.includes('проспект') || addressLower.includes('пр.') ||
                         addressLower.includes('переулок') || addressLower.includes('пер.')
        const hasNumber = /\d/.test(address)
        
        if (hasStreet && hasNumber) {
          setValidationResult({ 
            valid: true, 
            message: 'Адрес выглядит корректно (демо-проверка)',
            coordinates: { lat: 55.7558, lon: 37.6176 } // Координаты Москвы для демо
          })
          onValidationResult && onValidationResult({ 
            valid: true, 
            message: 'Адрес выглядит корректно (демо-проверка)',
            coordinates: { lat: 55.7558, lon: 37.6176 }
          })
        } else {
          setValidationResult({ valid: false, message: 'Проверьте правильность адреса (демо-проверка)' })
          onValidationResult && onValidationResult({ valid: false, message: 'Проверьте правильность адреса (демо-проверка)' })
        }
      }
    } catch (error) {
      console.error('Ошибка при валидации адреса:', error)
      setValidationResult({ valid: false, message: 'Ошибка при проверке адреса' })
      onValidationResult && onValidationResult({ valid: false, message: 'Ошибка при проверке адреса' })
    } finally {
      setValidating(false)
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={validateAddress}
        disabled={validating || !address}
        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {validating ? 'Проверяем...' : 'Проверить адрес'}
      </button>
      
      {validationResult && (
        <div className={`mt-2 text-sm ${validationResult.valid ? 'text-green-600' : 'text-red-600'}`}>
          {validationResult.message}
        </div>
      )}
      
      {!apiKey && (
        <div className="text-xs text-orange-600 mt-1">
          ⚠️ Демо-режим валидации. Для точной проверки настройте API ключ.
        </div>
      )}
    </div>
  )
}

export default AddressValidator 