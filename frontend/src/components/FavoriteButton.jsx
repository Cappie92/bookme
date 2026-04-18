import { useState, useEffect, useRef } from 'react'
import { HeartIcon } from '@heroicons/react/24/outline'
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid'
import { useAuth } from '../contexts/AuthContext'
import { useFavorites } from '../contexts/FavoritesContext'

export default function FavoriteButton({ 
  type, 
  itemId, 
  itemName, 
  itemDescription = null, 
  itemImage = null,
  className = "",
  size = "md",
  onFavoriteChange = null, // Callback для уведомления родительского компонента об изменении
  isFavorite: controlledIsFavorite = null // Controlled режим: если передан, используем его вместо контекста
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [isPendingDeletion, setIsPendingDeletion] = useState(false)
  const deletionTimeoutRef = useRef(null)
  const { isAuthenticated, openAuthModal } = useAuth()
  const { checkFavorite, setFavorite, refreshFavorite, favoritesMap } = useFavorites()

  // Получаем статус избранного из контекста (если не controlled)
  const getKey = (type, itemId) => `${type}:${itemId}`
  const cached = favoritesMap.get(getKey(type, itemId))
  const contextIsFavorite = cached?.isFavorite || false
  const favoriteId = cached?.favoriteId || null
  
  // Используем controlled значение, если передано, иначе из контекста
  const isFavorite = controlledIsFavorite !== null ? controlledIsFavorite : contextIsFavorite

  // Размеры иконки
  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5", 
    lg: "h-6 w-6",
    xl: "h-8 w-8"
  }

  // Проверяем статус избранного при загрузке и при изменении контекста
  useEffect(() => {
    if (isAuthenticated && itemId) {
      checkFavorite(type, itemId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, itemId, type])

  // Очищаем таймер при размонтировании
  useEffect(() => {
    return () => {
      if (deletionTimeoutRef.current) {
        clearTimeout(deletionTimeoutRef.current)
      }
    }
  }, [])

  // Отменить удаление
  const cancelDeletion = () => {
    if (deletionTimeoutRef.current) {
      clearTimeout(deletionTimeoutRef.current)
      deletionTimeoutRef.current = null
      setIsPendingDeletion(false)
    }
  }

  // Выполнить удаление из избранного
  const performDeletion = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/client/favorites/${type}/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        // Обновляем контекст
        setFavorite(type, itemId, false)
        // Обновляем статус во всех компонентах через refresh
        refreshFavorite(type, itemId)
        // Уведомляем родительский компонент об удалении
        if (onFavoriteChange) {
          onFavoriteChange(type, itemId, false)
        }
      }
    } catch (error) {
      console.error('Ошибка при удалении из избранного:', error)
      // В случае ошибки возвращаем статус
      refreshFavorite(type, itemId)
    } finally {
      setIsLoading(false)
      setIsPendingDeletion(false)
    }
  }

  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      // Сохраняем выбор для неавторизованных пользователей
      const pendingFavorites = JSON.parse(localStorage.getItem('pendingFavorites') || '[]')
      const newFavorite = {
        type,
        itemId,
        itemName,
        itemDescription,
        itemImage,
        timestamp: Date.now()
      }
      
      // Проверяем, нет ли уже такого элемента
      const exists = pendingFavorites.some(fav => 
        fav.type === type && fav.itemId === itemId
      )
      
      if (!exists) {
        pendingFavorites.push(newFavorite)
        localStorage.setItem('pendingFavorites', JSON.stringify(pendingFavorites))
      }
      
      // Открываем модальное окно авторизации
      openAuthModal('client')
      return
    }

    // Если идет процесс удаления, отменяем его
    if (isPendingDeletion) {
      cancelDeletion()
      return
    }

    // Если элемент в избранном, запускаем отложенное удаление
    if (isFavorite) {
      setIsPendingDeletion(true)
      // Запускаем таймер на 3 секунды
      deletionTimeoutRef.current = setTimeout(() => {
        performDeletion()
      }, 3000)
    } else {
      // Добавляем в избранное сразу
      setIsLoading(true)
      try {
        const response = await fetch('/api/client/favorites', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify({
            favorite_type: type,
            favorite_name: itemName,
            ...(type === 'salon' && { salon_id: itemId }),
            ...(type === 'master' && { master_id: itemId }),
            ...(type === 'indie_master' && { indie_master_id: itemId }),
            ...(type === 'service' && { service_id: itemId })
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          const newFavoriteId = data.favorite.id || data.favorite.client_favorite_id
          // Обновляем контекст
          setFavorite(type, itemId, true, newFavoriteId)
          // Уведомляем родительский компонент о добавлении
          if (onFavoriteChange) {
            onFavoriteChange(type, itemId, true)
          }
        }
      } catch (error) {
        console.error('Ошибка при добавлении в избранное:', error)
      } finally {
        setIsLoading(false)
      }
    }
  }

  // Обработка успешной авторизации - добавляем отложенные избранные
  useEffect(() => {
    if (isAuthenticated) {
      const pendingFavorites = JSON.parse(localStorage.getItem('pendingFavorites') || '[]')
      if (pendingFavorites.length > 0) {
        // Добавляем все отложенные избранные
        pendingFavorites.forEach(async (favorite) => {
          try {
            const response = await fetch('/api/client/favorites', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
              },
              body: JSON.stringify({
                favorite_type: favorite.type,
                favorite_name: favorite.itemName,
                ...(favorite.type === 'salon' && { salon_id: favorite.itemId }),
                ...(favorite.type === 'master' && { master_id: favorite.itemId }),
                ...(favorite.type === 'indie_master' && { indie_master_id: favorite.itemId }),
                ...(favorite.type === 'service' && { service_id: favorite.itemId })
              })
            })
            
            if (response.ok) {
              const data = await response.json()
              const newFavoriteId = data.favorite.id || data.favorite.client_favorite_id
              setFavorite(favorite.type, favorite.itemId, true, newFavoriteId)
              // Удаляем из отложенных после успешного добавления
              const updatedPending = pendingFavorites.filter(fav => 
                !(fav.type === favorite.type && fav.itemId === favorite.itemId)
              )
              localStorage.setItem('pendingFavorites', JSON.stringify(updatedPending))
            }
          } catch (error) {
            console.error('Ошибка при добавлении отложенного избранного:', error)
          }
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  // Определяем визуальное состояние
  const getButtonState = () => {
    if (isLoading) {
      return 'loading'
    }
    if (isFavorite && isPendingDeletion) {
      return 'pending-deletion'
    }
    if (isFavorite) {
      return 'favorite'
    }
    return 'not-favorite'
  }

  const buttonState = getButtonState()

  return (
    <button
      onClick={handleToggleFavorite}
      disabled={isLoading}
      className={`transition-all duration-200 hover:scale-110 ${
        buttonState === 'favorite'
          ? 'text-red-500 hover:text-red-600' 
          : buttonState === 'pending-deletion'
          ? 'text-red-300 hover:text-red-400 opacity-60'
          : 'text-gray-400 hover:text-red-500'
      } ${className}`}
      title={
        buttonState === 'favorite' 
          ? 'Убрать из избранного (нажмите еще раз для отмены)' 
          : buttonState === 'pending-deletion'
          ? 'Нажмите для отмены удаления'
          : 'Добавить в избранное'
      }
    >
      {buttonState === 'loading' ? (
        <div className={`${iconSizes[size]} animate-spin rounded-full border-2 border-current border-t-transparent`} />
      ) : buttonState === 'favorite' || buttonState === 'pending-deletion' ? (
        <HeartIconSolid className={`${iconSizes[size]} ${buttonState === 'pending-deletion' ? 'animate-pulse' : ''}`} />
      ) : (
        <HeartIcon className={iconSizes[size]} />
      )}
    </button>
  )
}
