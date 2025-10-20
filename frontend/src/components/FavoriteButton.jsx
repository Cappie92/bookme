import { useState, useEffect } from 'react'
import { HeartIcon } from '@heroicons/react/24/outline'
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid'
import { useAuth } from '../contexts/AuthContext'

export default function FavoriteButton({ 
  type, 
  itemId, 
  itemName, 
  itemDescription = null, 
  itemImage = null,
  className = "",
  size = "md"
}) {
  const [isFavorite, setIsFavorite] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [favoriteId, setFavoriteId] = useState(null)
  const { isAuthenticated, openAuthModal } = useAuth()

  // Размеры иконки
  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5", 
    lg: "h-6 w-6",
    xl: "h-8 w-8"
  }

  // Проверяем статус избранного при загрузке
  useEffect(() => {
    if (isAuthenticated && itemId) {
      checkFavoriteStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, itemId])

  const checkFavoriteStatus = async () => {
    try {
      const response = await fetch(`/client/favorites/check/${type}/${itemId}`)
      if (response.ok) {
        const data = await response.json()
        setIsFavorite(data.is_favorite)
        setFavoriteId(data.favorite_id)
      }
    } catch (error) {
      console.error('Ошибка при проверке статуса избранного:', error)
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

    setIsLoading(true)
    
    try {
      if (isFavorite) {
        // Удаляем из избранного
        const response = await fetch(`/client/favorites/${type}/${itemId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        })
        
        if (response.ok) {
          setIsFavorite(false)
          setFavoriteId(null)
        }
      } else {
        // Добавляем в избранное
        const response = await fetch('/client/favorites', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify({
            favorite_type: type,
            favorite_name: itemName,
            favorite_description: itemDescription,
            favorite_image: itemImage,
            ...(type === 'salon' && { salon_id: itemId }),
            ...(type === 'master' && { master_id: itemId }),
            ...(type === 'indie_master' && { indie_master_id: itemId }),
            ...(type === 'service' && { service_id: itemId })
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          setIsFavorite(true)
          setFavoriteId(data.favorite.id)
        }
      }
    } catch (error) {
      console.error('Ошибка при изменении избранного:', error)
    } finally {
      setIsLoading(false)
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
            const response = await fetch('/client/favorites', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
              },
              body: JSON.stringify({
                favorite_type: favorite.type,
                favorite_name: favorite.itemName,
                favorite_description: favorite.itemDescription,
                favorite_image: favorite.itemImage,
                ...(favorite.type === 'salon' && { salon_id: favorite.itemId }),
                ...(favorite.type === 'master' && { master_id: favorite.itemId }),
                ...(favorite.type === 'indie_master' && { indie_master_id: favorite.itemId }),
                ...(favorite.type === 'service' && { service_id: favorite.itemId })
              })
            })
            
            if (response.ok) {
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
  }, [isAuthenticated])

  return (
    <button
      onClick={handleToggleFavorite}
      disabled={isLoading}
      className={`transition-all duration-200 hover:scale-110 ${
        isFavorite 
          ? 'text-red-500 hover:text-red-600' 
          : 'text-gray-400 hover:text-red-500'
      } ${className}`}
      title={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
    >
      {isLoading ? (
        <div className={`${iconSizes[size]} animate-spin rounded-full border-2 border-current border-t-transparent`} />
      ) : isFavorite ? (
        <HeartIconSolid className={iconSizes[size]} />
      ) : (
        <HeartIcon className={iconSizes[size]} />
      )}
    </button>
  )
}

