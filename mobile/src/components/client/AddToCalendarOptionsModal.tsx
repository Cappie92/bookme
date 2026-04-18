/**
 * Модалка выбора действия "Добавить в календарь" (замена Alert.alert).
 * Показывается при нажатии кнопки "Календарь" на карточке записи.
 */
import React from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Booking } from '@src/services/api/bookings'

export type CalendarOption = 'google' | 'ics' | 'email' | 'cancel'

interface AddToCalendarOptionsModalProps {
  visible: boolean
  booking: Booking | null
  onClose: () => void
  onChooseGoogle: (booking: Booking) => void
  onChooseIcs: (booking: Booking) => void
  onChooseEmail: (booking: Booking) => void
}

export function AddToCalendarOptionsModal({
  visible,
  booking,
  onClose,
  onChooseGoogle,
  onChooseIcs,
  onChooseEmail,
}: AddToCalendarOptionsModalProps) {
  if (!booking) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlayContainer}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.centered} pointerEvents="box-none">
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.title} numberOfLines={1}>Добавить в календарь</Text>
              <TouchableOpacity
                hitSlop={{ top: 14, right: 14, bottom: 14, left: 14 }}
                onPress={onClose}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.optionBtn}
              onPress={() => { onChooseGoogle(booking); onClose(); }}
            >
              <Text style={styles.optionBtnText}>Google Calendar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionBtn}
              onPress={() => { onChooseIcs(booking); onClose(); }}
            >
              <Text style={styles.optionBtnText}>Открыть / поделиться .ics</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionBtn}
              onPress={() => { onChooseEmail(booking); onClose(); }}
            >
              <Text style={styles.optionBtnText}>Отправить на email</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlayContainer: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e5e7eb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    marginBottom: 8,
  },
  optionBtnText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelBtnText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
})
