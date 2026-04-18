/**
 * BookingRowPast - карточка прошедшей записи
 * Row 1: ♥ + мастер, статус (chip)
 * Row 2: service_name | price
 * Row 3: дата | chevron
 * Expanded: + панель действий (Повторить, Заметка, Не нравится)
 */

import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Booking } from '@src/services/api/bookings'
import { formatDateShort, getBookingPrice, formatPriceDisplay } from '@src/utils/clientDashboard'
import { useFavoritesStore, logFav } from '@src/stores/favoritesStore'
import { FavoriteButtonControlled } from './FavoriteButtonControlled'

const HEART_SIZE = 16
const HEART_CONTAINER = 24

interface BookingRowPastProps {
  booking: Booking
  favKey: string | null
  addContext: { type: 'master'; itemId: number; name: string } | null
  onToggleFavorite: () => void | Promise<void>
  onRepeat?: (bookingId: number) => void
  /** Контекстная заметка к записи (передаётся весь booking для модалки) */
  onNotes?: (booking: Booking) => void
  onDislike?: (bookingId: number) => void
  onPressBooking?: (bookingId: number) => void
  onPressMaster?: (slug: string | null) => void
}

export function BookingRowPast({
  booking,
  favKey,
  addContext,
  onToggleFavorite,
  onRepeat,
  onNotes,
  onDislike,
  onPressBooking,
  onPressMaster
}: BookingRowPastProps) {
  const [expanded, setExpanded] = useState(false)
  const isFavorite = useFavoritesStore(state => favKey ? state.favoriteKeys.has(favKey) : false)

  useEffect(() => {
    logFav('[FAV][row]', { screen: 'past', bookingId: booking.id, master_id: booking.master_id ?? null, favKey, isFavorite })
  }, [booking.id, booking.master_id, favKey, isFavorite])

  const dateShort = formatDateShort(booking.start_time)
  const price = getBookingPrice(booking)
  const priceStr = formatPriceDisplay(price)
  const hasActions = !!onRepeat || !!onNotes || !!onDislike

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.mainContent}
        onPress={() => onPressBooking?.(booking.id)}
        activeOpacity={0.7}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {favKey && (
              <FavoriteButtonControlled
                isFavorite={isFavorite}
                onToggle={onToggleFavorite}
                size={HEART_SIZE}
                containerSize={HEART_CONTAINER}
              />
            )}
            {onPressMaster ? (
              <TouchableOpacity
                onPress={() => onPressMaster(booking.master_domain?.trim?.() || null)}
                activeOpacity={0.7}
                style={styles.masterNameTouch}
              >
                <Text style={styles.masterName} numberOfLines={1} ellipsizeMode="tail">
                  {booking.master_name || 'Мастер'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.masterName} numberOfLines={1} ellipsizeMode="tail">
                {booking.master_name || 'Мастер'}
              </Text>
            )}
          </View>
          <View style={[styles.statusBadge, getStatusStyle(booking.status)]}>
            <Text style={styles.statusText} numberOfLines={1}>
              {getStatusLabel(booking.status)}
            </Text>
          </View>
        </View>
        <View style={styles.servicePriceRow}>
          <Text style={styles.serviceText} numberOfLines={1} ellipsizeMode="tail">
            {booking.service_name || '-'}
          </Text>
          {priceStr ? (
            <Text style={styles.priceText}>{priceStr}</Text>
          ) : null}
        </View>
        <View style={styles.dateTimeRow}>
          <Text style={styles.dateText} numberOfLines={1}>
            {dateShort}
          </Text>
          {hasActions && (
            <TouchableOpacity
              onPress={() => setExpanded(!expanded)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.chevronBtn}
            >
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#6b7280"
              />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      {expanded && hasActions && (
        <View style={styles.actionsPanel}>
          <View style={styles.actionsRow}>
            {onRepeat && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onRepeat(booking.id)}
                activeOpacity={0.6}
              >
                <Ionicons name="refresh" size={16} color="#16a34a" />
                <Text style={styles.actionBtnText} numberOfLines={1}>Повторить</Text>
              </TouchableOpacity>
            )}
            {onNotes && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onNotes(booking)}
                activeOpacity={0.6}
              >
                <Ionicons name="create-outline" size={16} color="#6b7280" />
                <Text style={styles.actionBtnTextGray} numberOfLines={1}>Заметка</Text>
              </TouchableOpacity>
            )}
            {onDislike && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onDislike(booking.id)}
                activeOpacity={0.6}
              >
                <Ionicons name="thumbs-down" size={16} color="#9ca3af" />
                <Text style={styles.actionBtnTextGray} numberOfLines={1}>Не нравится</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  )
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: 'Завершена',
    cancelled: 'Отменена',
    cancelled_by_client_early: 'Отменена',
    cancelled_by_client_late: 'Отменена',
    created: 'Создана',
    confirmed: 'Подтверждена',
    awaiting_confirmation: 'Ожидает',
    awaiting_payment: 'Ожидает оплаты',
    payment_expired: 'Оплата истекла',
  }
  return labels[status] || status
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'completed':
      return styles.statusCompleted
    case 'cancelled':
    case 'cancelled_by_client_early':
    case 'cancelled_by_client_late':
      return styles.statusCancelled
    default:
      return styles.statusDefault
  }
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  mainContent: {},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 0,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 8,
    marginRight: 8,
  },
  masterNameTouch: {
    flex: 1,
    minWidth: 0,
  },
  masterName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#16a34a',
  },
  statusBadge: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusCompleted: {
    backgroundColor: '#d1fae5',
  },
  statusCancelled: {
    backgroundColor: '#fee2e2',
  },
  statusDefault: {
    backgroundColor: '#f3f4f6',
  },
  servicePriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6,
    gap: 8,
    minHeight: 0,
  },
  serviceText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    marginRight: 8,
    fontSize: 13,
    color: '#6b7280',
  },
  priceText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
    flexShrink: 0,
  },
  dateTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
    minHeight: 0,
  },
  dateText: {
    fontSize: 13,
    color: '#6b7280',
  },
  chevronBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsPanel: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#16a34a',
  },
  actionBtnTextGray: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
})
