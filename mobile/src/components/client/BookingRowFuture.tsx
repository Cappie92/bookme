/**
 * BookingRowFuture - карточка будущей записи
 * Row 1: ♥ + мастер, статус (chip)
 * Row 2: service_name | price
 * Row 3: дата/время | chevron
 * Expanded: + панель действий (Правка, Отмена)
 */

import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Booking } from '@src/services/api/bookings'
import { formatDateTimeRange, getBookingPrice, formatPriceDisplay } from '@src/utils/clientDashboard'
import { useFavoritesStore, logFav } from '@src/stores/favoritesStore'
import { FavoriteButtonControlled } from './FavoriteButtonControlled'

const HEART_SIZE = 16
const HEART_CONTAINER = 24

interface BookingRowFutureProps {
  booking: Booking
  favKey: string | null
  addContext: { type: 'master'; itemId: number; name: string } | null
  onToggleFavorite: () => void | Promise<void>
  onEdit?: (bookingId: number) => void
  onCancel?: (bookingId: number) => void
  onAddToCalendar?: (booking: Booking) => void
  onPressBooking?: (bookingId: number) => void
  onPressMaster?: (slug: string | null) => void
}

export function BookingRowFuture({
  booking,
  favKey,
  addContext,
  onToggleFavorite,
  onEdit,
  onCancel,
  onAddToCalendar,
  onPressBooking,
  onPressMaster
}: BookingRowFutureProps) {
  const [expanded, setExpanded] = useState(false)
  const isFavorite = useFavoritesStore(state => favKey ? state.favoriteKeys.has(favKey) : false)

  useEffect(() => {
    logFav('[FAV][row]', { screen: 'future', bookingId: booking.id, master_id: booking.master_id ?? null, favKey, isFavorite })
  }, [booking.id, booking.master_id, favKey, isFavorite])

  const canEdit = booking.status === 'confirmed' || booking.status === 'created'
  const canCancel = booking.status !== 'cancelled' &&
                    booking.status !== 'cancelled_by_client_early' &&
                    booking.status !== 'cancelled_by_client_late'

  const dateTime = formatDateTimeRange(booking.start_time, booking.end_time)
  const price = getBookingPrice(booking)
  const priceStr = formatPriceDisplay(price)
  const hasCalendar = onAddToCalendar && !!booking.master_timezone?.trim?.()
  if (__DEV__ && onAddToCalendar && !booking.master_timezone?.trim?.()) {
    console.warn('[BookingRowFuture] Календарь скрыт: master_timezone отсутствует у записи', booking.id)
  }
  const hasActions = (canEdit && onEdit) || (canCancel && onCancel) || hasCalendar

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
            {dateTime}
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
            {canEdit && onEdit && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onEdit(booking.id)}
                activeOpacity={0.6}
              >
                <Ionicons name="pencil" size={16} color="#16a34a" />
                <Text style={styles.actionBtnText} numberOfLines={1}>Правка</Text>
              </TouchableOpacity>
            )}
            {hasCalendar && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onAddToCalendar(booking)}
                activeOpacity={0.6}
              >
                <Ionicons name="calendar-outline" size={16} color="#16a34a" />
                <Text style={styles.actionBtnText} numberOfLines={1}>Календарь</Text>
              </TouchableOpacity>
            )}
            {canCancel && onCancel && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => onCancel(booking.id)}
                activeOpacity={0.6}
              >
                <Ionicons name="close" size={16} color="#dc2626" />
                <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]} numberOfLines={1}>Отмена</Text>
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
    created: 'Создана',
    confirmed: 'Подтверждена',
    awaiting_confirmation: 'Ожидает',
    completed: 'Завершена',
    cancelled: 'Отменена',
    cancelled_by_client_early: 'Отменена',
    cancelled_by_client_late: 'Отменена',
    awaiting_payment: 'Ожидает оплаты',
    payment_expired: 'Оплата истекла',
  }
  return labels[status] || status
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'confirmed':
      return styles.statusConfirmed
    case 'awaiting_confirmation':
      return styles.statusAwaiting
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusConfirmed: {
    backgroundColor: '#d1fae5',
  },
  statusAwaiting: {
    backgroundColor: '#fef3c7',
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
  actionBtnTextDanger: {
    color: '#dc2626',
  },
})
