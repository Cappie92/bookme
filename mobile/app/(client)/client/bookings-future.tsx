/**
 * FutureBookingsScreen - полный список будущих записей
 */

import React, { useEffect, useState } from 'react'
import { View, ScrollView, Text, StyleSheet, RefreshControl, Alert, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { useFavoritesStore } from '@src/stores/favoritesStore'
import {
  getFutureBookings,
  Booking,
  cancelBooking,
  getCalendarGoogleLink,
  fetchCalendarIcs,
  sendCalendarEmail,
} from '@src/services/api/bookings'
import { getBookingTypeAndId, getFavoriteKeyFromBooking } from '@src/utils/clientDashboard'
import { writeIcsToCacheAndGetUri, getShareErrorAlert } from '@src/utils/calendarIcsPath'

// Components
import { ScreenContainer } from '@src/components/ScreenContainer'
import { BookingRowFuture } from '@src/components/client/BookingRowFuture'
import { AddToCalendarOptionsModal } from '@src/components/client/AddToCalendarOptionsModal'
import { AddToCalendarEmailModal } from '@src/components/client/AddToCalendarEmailModal'
import * as Sharing from 'expo-sharing'
import { useAuth } from '@src/auth/AuthContext'

export default function FutureBookingsScreen() {
  const router = useRouter()
  const { user } = useAuth()
  
  const [bookings, setBookings] = useState<Booking[]>([])
  const [calendarOptionsVisible, setCalendarOptionsVisible] = useState(false)
  const [calendarOptionsBooking, setCalendarOptionsBooking] = useState<Booking | null>(null)
  const [calendarEmailModalVisible, setCalendarEmailModalVisible] = useState(false)
  const [calendarEmailBooking, setCalendarEmailBooking] = useState<Booking | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  
  const { toggleFavoriteByKey, hydrateFavorites } = useFavoritesStore()
  
  const loadData = async () => {
    try {
      setIsLoading(true)
      const [data] = await Promise.all([
        getFutureBookings('client'),
        hydrateFavorites().catch(() => {})
      ])
      setBookings(data ?? [])
    } catch (error) {
      if (__DEV__) console.error('[FutureBookings] Ошибка загрузки:', error)
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
  
  const handleEditBooking = (bookingId: number) => {
    router.push({ pathname: `/bookings/${bookingId}`, params: { openEdit: 'time' } })
  }
  
  const handleCancelBooking = (bookingId: number) => {
    Alert.alert(
      'Отмена записи',
      'Вы уверены, что хотите отменить запись?',
      [
        { text: 'Нет', style: 'cancel' },
        {
          text: 'Да, отменить',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelBooking(bookingId)
              Alert.alert('Готово', 'Бронирование отменено')
              await loadData()
            } catch (err: unknown) {
              const e = err as { response?: { data?: { detail?: string } }; message?: string }
              const msg = e?.response?.data?.detail ?? e?.message ?? 'Не удалось отменить запись'
              Alert.alert('Ошибка', msg)
            }
          },
        },
      ]
    )
  }

  const handleAddToCalendar = (booking: Booking) => {
    setCalendarOptionsBooking(booking)
    setCalendarOptionsVisible(true)
  }

  const handleCalendarGoogle = async (booking: Booking) => {
    try {
      const { url } = await getCalendarGoogleLink(booking)
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url)
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось открыть Google Calendar')
    }
  }

  const handleCalendarIcs = async (booking: Booking) => {
    if (__DEV__) console.warn('[ICS] handleCalendarIcs start', { bookingId: booking.id })
    try {
      const ics = await fetchCalendarIcs(booking)
      const path = writeIcsToCacheAndGetUri(booking, ics)
      if (__DEV__) console.warn('[ICS] writeIcsToCacheAndGetUri done', { path, icsLength: ics.length })
      const canShare = await Sharing.isAvailableAsync()
      if (__DEV__) console.warn('[ICS] Sharing.isAvailableAsync', canShare)
      if (canShare) {
        if (__DEV__) console.warn('[ICS] before shareAsync', { path })
        try {
          const shareResult = await Sharing.shareAsync(path, { mimeType: 'text/calendar', dialogTitle: 'Открыть или поделиться .ics' })
          if (__DEV__) console.warn('[ICS] shareAsync resolved', { result: shareResult })
        } catch (shareErr: unknown) {
          const se = shareErr as { message?: string; code?: string; stack?: string }
          if (__DEV__) {
            console.warn('[ICS] shareAsync rejected', {
              message: se?.message,
              code: se?.code,
              stack: se?.stack,
              fullError: JSON.stringify(shareErr, Object.getOwnPropertyNames(Object(shareErr))),
            })
          }
          const { title, message } = getShareErrorAlert(shareErr, path)
          Alert.alert(title, message, [{ text: 'OK' }])
        }
      } else {
        Alert.alert('Файл сохранён', 'Файл .ics сохранён в кэше приложения.', [{ text: 'OK' }])
      }
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string; stack?: string; response?: { status?: number; data?: unknown } }
      if (__DEV__) {
        console.warn('[ICS] handleCalendarIcs error', { message: err?.message, code: err?.code, stack: err?.stack, status: err?.response?.status })
      }
      Alert.alert('Ошибка', 'Не удалось скачать .ics')
    }
  }

  const handleCalendarEmail = (booking: Booking) => {
    setCalendarEmailBooking(booking)
    setCalendarEmailModalVisible(true)
  }

  const handleCalendarSendEmail = async (email: string, alarmMinutes: number) => {
    if (!calendarEmailBooking) return
    await sendCalendarEmail(calendarEmailBooking, { email, alarm_minutes: alarmMinutes })
    setCalendarEmailModalVisible(false)
    setCalendarEmailBooking(null)
    Alert.alert('Готово', 'Письмо отправлено')
  }
  
  return (
    <ScreenContainer>
      <AddToCalendarOptionsModal
        visible={calendarOptionsVisible}
        booking={calendarOptionsBooking}
        onClose={() => {
          setCalendarOptionsVisible(false)
          setCalendarOptionsBooking(null)
        }}
        onChooseGoogle={handleCalendarGoogle}
        onChooseIcs={handleCalendarIcs}
        onChooseEmail={handleCalendarEmail}
      />
      <AddToCalendarEmailModal
        visible={calendarEmailModalVisible}
        booking={calendarEmailBooking}
        defaultEmail={user?.email ?? ''}
        onClose={() => {
          setCalendarEmailModalVisible(false)
          setCalendarEmailBooking(null)
        }}
        onSend={handleCalendarSendEmail}
      />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />
        }
      >
        <View style={styles.content}>
          <Text style={styles.title}>Будущие записи</Text>
          {bookings.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Нет будущих записей</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {bookings.map(booking => {
                const favKey = getFavoriteKeyFromBooking(booking)
                const typeAndId = getBookingTypeAndId(booking)
                const addContext = typeAndId ? { type: typeAndId.type, itemId: typeAndId.itemId, name: booking.master_name || 'Мастер' } : null
                return (
                  <BookingRowFuture
                    key={booking.id}
                    booking={booking}
                    favKey={favKey}
                    addContext={addContext}
                    onToggleFavorite={() => { if (favKey) handleToggleFavorite(favKey, addContext ?? undefined) }}
                    onEdit={handleEditBooking}
                    onCancel={handleCancelBooking}
                    onAddToCalendar={handleAddToCalendar}
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
