import React, { useEffect, useRef } from 'react'

/**
 * Компонент для отображения карты Yandex Maps используя JavaScript API 2.1
 * При отсутствии VITE_YANDEX_MAPS_API_KEY показывается заглушка со ссылкой на Яндекс.Карты
 * @param {string} address - Адрес для отображения на карте
 * @param {string} name - Название места (для маркера)
 * @param {number} height - Высота карты в пикселях (по умолчанию 384px)
 */
const YandexMap = ({ address, name, height = 384 }) => {
  const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const geocoderRef = useRef(null)

  useEffect(() => {
    if (!apiKey) return // Stub-режим — не загружаем API
    // Проверяем, загружена ли уже библиотека Yandex Maps
    if (!window.ymaps) {
      const script = document.createElement('script')
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`
      script.crossOrigin = 'anonymous'
      script.async = true
      script.onload = () => {
        if (window.ymaps) {
          window.ymaps.ready(initializeMap)
        }
      }
      script.onerror = () => {
        console.error('Ошибка загрузки Yandex Maps API')
        if (mapContainerRef.current) {
          mapContainerRef.current.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Ошибка загрузки карты</div>'
        }
      }
      document.head.appendChild(script)
    } else {
      window.ymaps.ready(initializeMap)
    }

    function initializeMap() {
      if (!mapContainerRef.current || !address) {
        return
      }

      // Инициализируем карту
      const map = new window.ymaps.Map(mapContainerRef.current, {
        center: [55.751574, 37.573856], // Москва по умолчанию
        zoom: 10,
        controls: ['zoomControl', 'fullscreenControl']
      })

      mapInstanceRef.current = map

      // Создаем геокодер для поиска адреса
      const geocoder = window.ymaps.geocode(address, {
        results: 1
      })

      geocoderRef.current = geocoder

      geocoder.then((res) => {
        const firstGeoObject = res.geoObjects.get(0)
        
        if (firstGeoObject) {
          // Получаем координаты
          const coordinates = firstGeoObject.geometry.getCoordinates()
          
          // Устанавливаем центр карты на найденные координаты
          map.setCenter(coordinates)
          map.setZoom(15)

          // Создаем маркер
          const placemark = new window.ymaps.Placemark(
            coordinates,
            {
              balloonContentHeader: name || address,
              balloonContentBody: address,
              balloonContentFooter: 'Нажмите для получения маршрута'
            },
            {
              preset: 'islands#blueDotIcon'
            }
          )

          // Добавляем маркер на карту
          map.geoObjects.add(placemark)

          // Открываем балун при клике
          placemark.events.add('click', () => {
            placemark.balloon.open()
          })
        } else {
          // Если адрес не найден, показываем сообщение
          console.warn('Адрес не найден на карте:', address)
          map.balloon.open(map.getCenter(), {
            contentHeader: 'Адрес не найден',
            contentBody: `Не удалось найти адрес: ${address}`,
            contentFooter: 'Проверьте правильность адреса'
          })
        }
      }).catch((error) => {
        console.error('Ошибка геокодирования:', error)
        map.balloon.open(map.getCenter(), {
          contentHeader: 'Ошибка',
          contentBody: 'Не удалось загрузить карту. Попробуйте обновить страницу.'
        })
      })
    }

    // Очистка при размонтировании
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy()
        mapInstanceRef.current = null
      }
    }
  }, [address, name, apiKey])

  // Заглушка при отсутствии API-ключа
  if (!apiKey && address) {
    const mapsUrl = `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`
    return (
      <div className="bg-white border-t">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Как нас найти</h3>
          <div
            className="w-full rounded-lg overflow-hidden bg-gray-100 flex flex-col items-center justify-center border border-gray-200"
            style={{ height: `${height}px` }}
          >
            <p className="text-gray-600 mb-3">{address}</p>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4CAF50] hover:underline font-medium"
            >
              Открыть в Яндекс.Картах →
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (!address) {
    return (
      <div className="bg-white border-t">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            Карта
          </h3>
          <div className="w-full rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center" style={{ height: `${height}px` }}>
            <p className="text-gray-500">Адрес не указан</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border-t">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          Как нас найти
        </h3>
        <div 
          ref={mapContainerRef}
          className="w-full rounded-lg overflow-hidden"
          style={{ height: `${height}px` }}
        />
      </div>
    </div>
  )
}

export default YandexMap

