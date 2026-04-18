/**
 * PastBookingsScreen - полный список прошедших записей
 */

import React, { useEffect, useState } from 'react'
import { View, ScrollView, Text, StyleSheet, RefreshControl, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useFavoritesStore } from '@src/stores/favoritesStore'
import { getPastBookings, Booking } from '@src/services/api/bookings'
import { getClientDashboardStats } from '@src/services/api/clientDashboard'
import { getBookingTypeAndId, getFavoriteKeyFromBooking } from '@src/utils/clientDashboard'

// Components
import { ScreenContainer } from '@src/components/ScreenContainer'
import { BookingRowPast } from '@src/components/client/BookingRowPast'
import { ClientNoteModal } from '@src/components/client/ClientNoteModal'

export default function PastBookingsScreen() {
  const router = useRouter()
  
  const [bookings, setBookings] = useState<Booking[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [noteModalBooking, setNoteModalBooking] = useState<Booking | null>(null)
  const [salonsEnabled, setSalonsEnabled] = useState(false)
  
  const { toggleFavoriteByKey, hydrateFavorites } = useFavoritesStore()
  
  const loadData = async () => {
    try {
      setIsLoading(true)
      const [data, , stats] = await Promise.all([
        getPastBookings('client'),
        hydrateFavorites().catch(() => {}),
        getClientDashboardStats().catch(() => ({ salons_enabled: false }))
      ])
      setBookings(data ?? [])
      setSalonsEnabled(stats?.salons_enabled === true)
    } catch (error) {
      if (__DEV__) console.error('[PastBookings] Ошибка загрузки:', error)
      Alert.alert('Ошибка', 'Не удалось загрузить записи')
    } finally {
      setIsLoading(false)
    }
  }
  
  const onRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }
  
  useEffect(() => {
    loadData()
  }, [])
  
  const handleToggleFavorite = async (favKey: string, addContext?: { type: 'master'; itemId: number; name: string }) => {
    try {
      await toggleFavoriteByKey(favKey, addContext)
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось обновить избранное')
    }
  }
  
  const handlePressBooking = (bookingId: number) => {
    router.push(`/bookings/${bookingId}`)
  }

  const handlePressMaster = (slug: string | null | undefined) => {
    const s = slug?.trim?.()
    if (s) {
      router.push(`/m/${encodeURIComponent(s)}`)
    } else {
      Alert.alert('Мастер', 'У мастера не настроена публичная страница')
    }
  }
  
  const handleRepeatBooking = (bookingId: number) => {
    Alert.alert('Повторить', `Booking ID: ${bookingId}`)
  }

  const handleNotesBooking = (booking: Booking) => {
    setNoteModalBooking(booking)
  }

  const handleDislikeBooking = (bookingId: number) => {
    Alert.alert('Не понравилось', 'Отобразится при следующем бронировании')
  }
  
  return (
    <ScreenContainer>
      <ClientNoteModal
        visible={noteModalBooking !== null}
        booking={noteModalBooking}
        salonsEnabled={salonsEnabled}
        onClose={() => setNoteModalBooking(null)}
        onNoteSaved={() => loadData()}
      />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />
        }
      >
        <View style={styles.content}>
          <Text style={styles.title}>Прошедшие записи</Text>
          
          {bookings.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Нет прошедших записей</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {bookings.map(booking => {
                const favKey = getFavoriteKeyFromBooking(booking)
                const typeAndId = getBookingTypeAndId(booking)
                const addContext = typeAndId ? { type: typeAndId.type, itemId: typeAndId.itemId, name: booking.master_name || 'Мастер' } : null
                return (
                  <BookingRowPast
                    key={booking.id}
                    booking={booking}
                    favKey={favKey}
                    addContext={addContext}
                    onToggleFavorite={() => { if (favKey) handleToggleFavorite(favKey, addContext ?? undefined) }}
                    onRepeat={handleRepeatBooking}
                    onNotes={handleNotesBooking}
                    onDislike={handleDislikeBooking}
                    onPressBooking={handlePressBooking}
                    onPressMaster={handlePressMaster}
                  />
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    padding: 8,
  },
  emptyContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
})
