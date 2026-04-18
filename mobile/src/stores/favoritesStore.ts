/**
 * Zustand store для избранных мастеров.
 * Master-only: favKey всегда "master:N", hydrate только /favorites/masters.
 */

import { env } from '@src/config/env'

export function logFav(...args: unknown[]): void {
  if (__DEV__ && env.DEBUG_FEATURES) {
    console.log(...args)
  }
}

import { create } from 'zustand'
import { addToFavorites, removeFromFavorites } from '@src/services/api/favorites'
import { getFavoriteKeyFromFavorite, type FavoriteType } from '@src/utils/clientDashboard'
import { apiClient } from '@src/services/api/client'

interface AddContext {
  type: FavoriteType
  itemId: number
  name: string
}

interface FavoritesState {
  favoriteKeys: Set<string>
  favorites: any[]
  isLoading: boolean
  hydrateFavorites: () => Promise<void>
  isFavoriteKey: (key: string) => boolean
  toggleFavoriteByKey: (key: string, addContext?: AddContext) => Promise<boolean>
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favoriteKeys: new Set<string>(),
  favorites: [],
  isLoading: false,

  hydrateFavorites: async () => {
    try {
      set({ isLoading: true })
      const allFavorites: any[] = []

      try {
        const response = await apiClient.get('/api/client/favorites/masters')
        const masters = Array.isArray(response.data) ? response.data : []
        allFavorites.push(...masters.map((fav: any) => ({ ...fav, type: 'master', favorite_type: 'master' })))
      } catch {
        // продолжаем с пустым списком
      }

      const keys = new Set<string>()
      allFavorites.forEach(fav => {
        const key = getFavoriteKeyFromFavorite(fav)
        if (key) keys.add(key)
      })

      logFav('[FAV][hydrate] mastersCount:', allFavorites.length, 'keys:', [...keys].sort().slice(0, 10))

      set({ favorites: allFavorites, favoriteKeys: keys, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  isFavoriteKey: (key: string) => get().favoriteKeys.has(key),

  toggleFavoriteByKey: async (key: string, addContext?: AddContext): Promise<boolean> => {
    const currentState = get()
    const wasFavorite = currentState.favoriteKeys.has(key)

    logFav('[FAV][toggle] before:', { key, addContext: addContext ? { type: addContext.type, itemId: addContext.itemId } : null, wasFavorite })

    const willBeFavorite = !wasFavorite

    if (willBeFavorite) {
      if (!addContext) {
        if (__DEV__ && env.DEBUG_FEATURES) console.warn('[FAV] toggleFavoriteByKey: addContext required for add, skipping')
        return wasFavorite
      }
      const newKeys = new Set(currentState.favoriteKeys)
      newKeys.add(key)
      set({ favoriteKeys: newKeys })

      try {
        await addToFavorites('master', addContext.itemId, addContext.name)
        await get().hydrateFavorites()
        logFav('[FAV][toggle] after ADD:', key)
        return true
      } catch (error) {
        set({ favoriteKeys: currentState.favoriteKeys })
        throw error
      }
    }

    // REMOVE: key всегда master:N, matched.master_id
    const matched = currentState.favorites.find(fav => getFavoriteKeyFromFavorite(fav) === key)
    const newKeys = new Set(currentState.favoriteKeys)
    newKeys.delete(key)
    set({ favoriteKeys: newKeys })

    const favItemId = matched ? Number(matched.master_id) : null

    try {
      if (favItemId != null) {
        try {
          await removeFromFavorites('master', favItemId)
        } catch (err: any) {
          if (err?.response?.status === 404) {
            await get().hydrateFavorites()
            return false
          }
          throw err
        }
      }
      await get().hydrateFavorites()
      logFav('[FAV][toggle] after REMOVE:', key)
      return false
    } catch (error) {
      set({ favoriteKeys: currentState.favoriteKeys })
      throw error
    }
  }
}))
