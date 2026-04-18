/**
 * ClientDashboard - главный экран клиента
 * 4 секции: Будущие записи, Прошедшие записи, Избранные, Мои баллы
 */

import React, { useEffect, useState } from 'react'
import { View, ScrollView, Text, StyleSheet, RefreshControl, Alert, TouchableOpacity, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@src/auth/AuthContext'
import { useFavoritesStore } from '@src/stores/favoritesStore'
import {
  getFutureBookings,
  getPastBookings,
  Booking,
  cancelBooking,
  getCalendarGoogleLink,
  fetchCalendarIcs,
  sendCalendarEmail,
} from '@src/services/api/bookings'
import { getClientLoyaltyPoints, getClientDashboardStats, ClientLoyaltyMaster } from '@src/services/api/clientDashboard'
import { getBookingTypeAndId, getFavoriteKeyFromBooking, getFavoriteKeyFromFavorite } from '@src/utils/clientDashboard'
import { writeIcsToCacheAndGetUri, getShareErrorAlert } from '@src/utils/calendarIcsPath'

// Components
import { ScreenContainer } from '@src/components/ScreenContainer'
import { SectionCard } from '@src/components/client/SectionCard'
import { BookingRowFuture } from '@src/components/client/BookingRowFuture'
import { AddToCalendarOptionsModal } from '@src/components/client/AddToCalendarOptionsModal'
import { AddToCalendarEmailModal } from '@src/components/client/AddToCalendarEmailModal'
import * as Sharing from 'expo-sharing'
import { BookingRowPast } from '@src/components/client/BookingRowPast'
import { FavoriteCard } from '@src/components/client/FavoriteCard'
import { ClientNoteModal } from '@src/components/client/ClientNoteModal'

export default function ClientDashboardScreen() {
  const router = useRouter()
  const { user } = useAuth()
  
  // State
  const [futureBookings, setFutureBookings] = useState<Booking[]>([])
  const [pastBookings, setPastBookings] = useState<Booking[]>([])
  const [loyaltyData, setLoyaltyData] = useState<{ masters: ClientLoyaltyMaster[], total_balance: number }>({
    masters: [],
    total_balance: 0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [calendarOptionsVisible, setCalendarOptionsVisible] = useState(false)
  const [calendarOptionsBooking, setCalendarOptionsBooking] = useState<Booking | null>(null)
  const [calendarEmailModalVisible, setCalendarEmailModalVisible] = useState(false)
  const [calendarEmailBooking, setCalendarEmailBooking] = useState<Booking | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [noteModalBooking, setNoteModalBooking] = useState<Booking | null>(null)
  const [salonsEnabled, setSalonsEnabled] = useState(false)
  
  // Favorites store
  const { favorites, hydrateFavorites, toggleFavoriteByKey, isFavoriteKey } = useFavoritesStore()
  
  // Load data
  const loadData = async () => {
    try {
      setIsLoading(true)

      // Загрузка основных данных + флаг салоны (для notes flow)
      const [futureData, pastData, loyaltyResponse, statsResponse] = await Promise.all([
        getFutureBookings('client'),
        getPastBookings('client'),
        getClientLoyaltyPoints(),
        getClientDashboardStats().catch(() => ({ salons_enabled: false }))
      ])

      setFutureBookings((futureData ?? []).slice(0, 3))
      setPastBookings((pastData ?? []).slice(0, 3))
      setLoyaltyData({
        masters: loyaltyResponse?.masters ?? [],
        total_balance: loyaltyResponse?.total_balance ?? 0
      })
      setSalonsEnabled(statsResponse?.salons_enabled === true)

      // Избранные загружаем отдельно — ошибка не должна блокировать остальные секции
      try {
        await hydrateFavorites()
      } catch (_favErr) {
        // Ошибка избранных не блокирует остальные секции
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось загрузить данные')
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
  
  const handleRepeatBooking = (bookingId: number) => {
    // TODO: повторить запись
    Alert.alert('Повторить', `Booking ID: ${bookingId}`)
  }
  
  const handleNotesBooking = (booking: Booking) => {
    setNoteModalBooking(booking)
  }

  const handleDislikeBooking = (_bookingId: number) => {
    Alert.alert('Не понравилось', 'Отобразится при следующем бронировании')
  }
  
  const handlePressMaster = (slug: string | null | undefined) => {
    const s = slug?.trim?.()
    if (s) {
      router.push(`/m/${encodeURIComponent(s)}`)
    } else {
      Alert.alert('Мастер', 'У мастера не настроена публичная страница')
    }
  }
  
  const handleViewAllFuture = () => {
    router.push('/client/bookings-future')
  }
  
  const handleViewAllPast = () => {
    router.push('/client/bookings-past')
  }
  
  const handleViewAllLoyalty = () => {
    router.push('/client/loyalty-points')
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
  
  const handleViewLoyaltyHistory = () => {
    const first = (loyaltyData?.masters ?? [])[0]
    if (first) {
      router.push({ pathname: '/client/loyalty-history', params: { masterId: String(first.master_id), masterName: first.master_name } })
    } else {
      router.push('/client/loyalty-history')
    }
  }
  
  return (
    <ScreenContainer backgroundColor="#ffffff" compactTop>
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
          {/* 1. Будущие записи */}
          <SectionCard
            title="Будущие записи"
            footerButton={{ label: 'Посмотреть все', onPress: handleViewAllFuture }}
          >
            {futureBookings.length === 0 ? (
              <Text style={styles.emptyText}>Нет будущих записей</Text>
            ) : (
              futureBookings.map(booking => {
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
              })
            )}
          </SectionCard>
          
          {/* 2. Прошедшие записи */}
          <SectionCard
            title="Прошедшие записи"
            footerButton={{ label: 'Посмотреть все', onPress: handleViewAllPast }}
          >
            {pastBookings.length === 0 ? (
              <Text style={styles.emptyText}>Нет прошедших записей</Text>
            ) : (
              pastBookings.map(booking => {
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
              })
            )}
          </SectionCard>
          
          {/* 3. Избранные */}
          <SectionCard title="Избранные">
            {(favorites ?? []).length === 0 ? (
              <Text style={styles.emptyText}>Нет избранных мастеров</Text>
            ) : (
              <View style={styles.favoritesGrid}>
                {(favorites ?? []).slice(0, 6).map((fav: { master_id?: number; master_name?: string; favorite_name?: string; master_domain?: string | null; master?: { domain?: string | null } }) => {
                  const favKey = getFavoriteKeyFromFavorite(fav)
                  if (favKey == null) return null
                  const slug = fav.master_domain ?? fav.master?.domain ?? null
                  return (
                    <View key={favKey} style={styles.favoriteCardWrap}>
                      <FavoriteCard
                        masterName={fav.master_name || fav.favorite_name || 'Мастер'}
                        isFavorite={isFavoriteKey(favKey)}
                        onToggleFavorite={() => handleToggleFavorite(favKey)}
                        onPress={() => handlePressMaster(slug)}
                      />
                    </View>
                  )
                })}
              </View>
            )}
          </SectionCard>
          
          {/* 4. Мои баллы */}
          <SectionCard
            title="Мои баллы"
            secondaryButton={{ label: 'История', onPress: handleViewLoyaltyHistory }}
            footerButton={{ label: 'Посмотреть все', onPress: handleViewAllLoyalty }}
          >
            {(loyaltyData?.masters ?? []).length === 0 ? (
              <Text style={styles.emptyText}>Пока нет начисленных баллов</Text>
            ) : (
              <View>
                {(loyaltyData?.masters ?? []).slice(0, 3).map(master => (
                  <View key={master.master_id} style={styles.loyaltyRow}>
                    <TouchableOpacity
                      onPress={() => router.push('/client/loyalty-points')}
                      activeOpacity={0.7}
                      style={styles.loyaltyMasterTouch}
                    >
                      <Text style={styles.loyaltyMasterName} numberOfLines={1}>
                        {master.master_name}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.loyaltyBalance}>{master.balance} б.</Text>
                  </View>
                ))}
              </View>
            )}
          </SectionCard>
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 16,
  },
  favoritesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
  },
  favoriteCardWrap: {
    width: '48%',
    minWidth: 140,
  },
  loyaltyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  loyaltyMasterTouch: {
    flex: 1,
    marginRight: 8,
  },
  loyaltyMasterName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#16a34a',
  },
  loyaltyBalance: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
})
