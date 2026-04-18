import React, { createContext, useContext, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'

const FavoritesContext = createContext()

export function FavoritesProvider({ children }) {
  // Храним состояние избранного: {type: {itemId: {isFavorite: bool, favoriteId: number}}}
  const [favoritesMap, setFavoritesMap] = useState(new Map())
  // Счетчик изменений для триггера обновлений в компонентах
  const [changeCounter, setChangeCounter] = useState(0)

  const { isAuthenticated } = useAuth()

  // Получить ключ для Map
  const getKey = (type, itemId) => `${type}:${itemId}`

  // Проверить статус избранного (с кэшированием)
  const checkFavorite = useCallback(async (type, itemId) => {
    if (!isAuthenticated || !itemId) {
      return false
    }

    const key = getKey(type, itemId)
    
    // Проверяем кэш
    const cached = favoritesMap.get(key)
    if (cached !== undefined) {
      return cached.isFavorite
    }

    // Если нет в кэше, делаем запрос к API
    try {
      const token = localStorage.getItem('access_token')
      if (!token) {
        return false
      }

      const response = await fetch(`/api/client/favorites/check/${type}/${itemId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        const isFavorite = data.is_favorite || false
        
        // Сохраняем в кэш
        setFavoritesMap(prev => {
          const newMap = new Map(prev)
          newMap.set(key, {
            isFavorite,
            favoriteId: data.favorite_id || null
          })
          return newMap
        })
        setChangeCounter(prev => prev + 1)
        
        return isFavorite
      }
    } catch (error) {
      console.debug('Ошибка при проверке статуса избранного:', error)
    }

    return false
  }, [isAuthenticated, favoritesMap])

  // Установить статус избранного (синхронно обновляет кэш)
  const setFavorite = useCallback((type, itemId, isFavorite, favoriteId = null) => {
    if (!itemId) return

    const key = getKey(type, itemId)
    
    setFavoritesMap(prev => {
      const newMap = new Map(prev)
      if (isFavorite) {
        newMap.set(key, {
          isFavorite: true,
          favoriteId
        })
      } else {
        newMap.delete(key)
      }
      return newMap
    })
    setChangeCounter(prev => prev + 1)
  }, [])

  // Обновить статус избранного (делает запрос к API и обновляет кэш)
  const refreshFavorite = useCallback(async (type, itemId) => {
    if (!isAuthenticated || !itemId) {
      return
    }

    try {
      const token = localStorage.getItem('access_token')
      if (!token) {
        return
      }

      const response = await fetch(`/api/client/favorites/check/${type}/${itemId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        const isFavorite = data.is_favorite || false
        const key = getKey(type, itemId)
        
        setFavoritesMap(prev => {
          const newMap = new Map(prev)
          if (isFavorite) {
            newMap.set(key, {
              isFavorite: true,
              favoriteId: data.favorite_id || null
            })
          } else {
            newMap.delete(key)
          }
          return newMap
        })
        setChangeCounter(prev => prev + 1)
      }
    } catch (error) {
      console.debug('Ошибка при обновлении статуса избранного:', error)
    }
  }, [isAuthenticated])

  // Очистить кэш (например, при выходе)
  const clearFavorites = useCallback(() => {
    setFavoritesMap(new Map())
  }, [])

  const value = {
    checkFavorite,
    setFavorite,
    refreshFavorite,
    clearFavorites,
    favoritesMap,
    changeCounter
  }

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const context = useContext(FavoritesContext)
  if (!context) {
    // Если контекст не найден, возвращаем заглушку (для обратной совместимости)
    return {
      checkFavorite: async () => false,
      setFavorite: () => {},
      refreshFavorite: async () => {},
      clearFavorites: () => {},
      favoritesMap: new Map(),
      changeCounter: 0
    }
  }
  return context
}

