/**
 * Модалка для отправки ICS на email
 */
import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Booking } from '@src/services/api/bookings'

interface AddToCalendarEmailModalProps {
  visible: boolean
  booking: Booking | null
  defaultEmail?: string
  onClose: () => void
  onSend: (email: string, alarmMinutes: number) => Promise<void>
}

const ALARM_OPTIONS = [5, 10, 15, 30, 60, 120]

export function AddToCalendarEmailModal({
  visible,
  booking,
  defaultEmail = '',
  onClose,
  onSend,
}: AddToCalendarEmailModalProps) {
  const [email, setEmail] = useState(defaultEmail)
  const [alarmMinutes, setAlarmMinutes] = useState(60)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (visible) {
      setEmail(defaultEmail)
      setAlarmMinutes(60)
      setError('')
    }
  }, [visible, defaultEmail])

  const handleSend = async () => {
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Введите email')
      return
    }
    setSending(true)
    setError('')
    try {
      await onSend(trimmed, alarmMinutes)
      onClose()
    } catch (e) {
      setError('Не удалось отправить')
    } finally {
      setSending(false)
    }
  }

  if (!booking) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlayContainer}>
        {/* Отдельный слой backdrop: ловит тапы вне карточки */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
        />
        {/* Контент поверх: только карточка по центру, не перекрывает весь экран */}
        <View style={styles.centered} pointerEvents="box-none">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.cardWrap}
            pointerEvents="box-none"
          >
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.title} numberOfLines={1}>Отправить на email</Text>
                <TouchableOpacity
                  hitSlop={{ top: 14, right: 14, bottom: 14, left: 14 }}
                  onPress={onClose}
                  disabled={sending}
                  style={styles.closeBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={22} color="#666" />
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>
                {booking.service_name} — {booking.master_name}
              </Text>

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="example@mail.ru"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!sending}
              />

              <Text style={styles.label}>Напомнить за (мин)</Text>
              <View style={styles.alarmRow}>
                {ALARM_OPTIONS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.alarmBtn, alarmMinutes === m && styles.alarmBtnActive]}
                    onPress={() => setAlarmMinutes(m)}
                    disabled={sending}
                  >
                    <Text style={[styles.alarmText, alarmMinutes === m && styles.alarmTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={sending}>
                  <Text style={styles.cancelText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.sendText}>Отправить</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
  },
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
  cardWrap: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    minHeight: 36,
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
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  alarmRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  alarmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  alarmBtnActive: {
    backgroundColor: '#16a34a',
  },
  alarmText: {
    fontSize: 14,
    color: '#374151',
  },
  alarmTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    fontSize: 13,
    color: '#dc2626',
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  sendBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#16a34a',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.7,
  },
  sendText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
})
