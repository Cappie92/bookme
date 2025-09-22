import React, { useState, useEffect, useRef } from 'react'

const AddressAutocomplete = ({ 
  value, 
  onChange, 
  city = '', // Город для автоматической подстановки
  placeholder = "Введите адрес", 
  className = "",
  apiKey = null // API ключ для Яндекс.Карт
}) => {
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [inputValue, setInputValue] = useState(value || '')
  const inputRef = useRef(null)
  const suggestionsRef = useRef(null)

  useEffect(() => {
    setInputValue(value || '')
  }, [value])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inputRef.current && !inputRef.current.contains(event.target) &&
          suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const fetchSuggestions = async (query) => {
    if (!query || query.length < 3) {
      setSuggestions([])
      return
    }

    setLoading(true)
    try {
      // Формируем запрос с учетом города
      const searchQuery = city ? `${city}, ${query}` : query
      
      if (apiKey) {
        // Используем реальный API с ключом
        const response = await fetch(
          `https://suggest-maps.yandex.ru/v1/suggest?apikey=${apiKey}&text=${encodeURIComponent(searchQuery)}&lang=ru_RU&type=address&results=5`
        )
        
        if (response.ok) {
          const data = await response.json()
          setSuggestions(data.results || [])
        } else {
          console.error('Ошибка при получении подсказок:', response.status)
          setSuggestions([])
        }
      } else {
        // Демо-режим без API ключа
        const response = await fetch(
          `https://suggest-maps.yandex.ru/v1/suggest?text=${encodeURIComponent(searchQuery)}&lang=ru_RU&type=address&results=5`
        )
        
        if (response.ok) {
          const data = await response.json()
          setSuggestions(data.results || [])
        } else {
          console.error('Ошибка при получении подсказок:', response.status)
          setSuggestions([])
        }
      }
    } catch (error) {
      console.error('Ошибка сети при получении подсказок:', error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue)
    
    if (newValue.length >= 3) {
      fetchSuggestions(newValue)
      setShowSuggestions(true)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  const handleSuggestionClick = (suggestion) => {
    // Извлекаем только адрес без города, если город уже подставлен
    let addressValue = suggestion.value
    if (city && addressValue.startsWith(city + ', ')) {
      addressValue = addressValue.substring(city.length + 2)
    }
    
    setInputValue(addressValue)
    onChange(addressValue)
    setShowSuggestions(false)
    setSuggestions([])
  }

  const handleInputFocus = () => {
    if (inputValue.length >= 3 && suggestions.length > 0) {
      setShowSuggestions(true)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        placeholder={placeholder}
        className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      
      {loading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
            >
              <div className="font-medium">{suggestion.value}</div>
              {suggestion.description && (
                <div className="text-gray-500 text-xs">{suggestion.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {!apiKey && (
        <div className="text-xs text-orange-600 mt-1">
          ⚠️ Демо-режим. Для полной функциональности настройте API ключ.
        </div>
      )}
    </div>
  )
}

export default AddressAutocomplete 