import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBadge } from '../StatusBadge';
import { formatDateDDMM, formatTimeHHMM } from '@src/utils/format';
import { canCancelBooking } from '@src/utils/bookingOutcome';

const BRAND_GREEN = '#4CAF50';

interface BookingLike {
  id: number;
  start_time: string;
  end_time: string;
  status: string;
  cancellation_reason?: string | null;
  service_name?: string | null;
  client_name?: string | null;
  client_master_alias?: string | null;
  client_account_name?: string | null;
  client_phone?: string | null;
  service_duration?: number | null;
  duration?: number | null;
  payment_amount?: number | null;
  /** Цена услуги из каталога (GET /bookings/detailed) */
  service_price?: number | null;
  has_client_note?: boolean;
  client_note?: string | null;
}

interface BookingCardCompactProps {
  booking: BookingLike;
  statusLabel: string;
  statusColor: string;
  onPressCancel?: () => void;
  onPressConfirm?: () => void;
  onNotePress?: (booking: BookingLike) => void;
  onCancellationReasonPress?: (booking: BookingLike) => void;
  showConfirm?: boolean;
  showClientPhone?: boolean;
  showCancellationReasonIcon?: boolean;
  isBusy?: boolean;
}

export function BookingCardCompact({
  booking,
  statusLabel,
  statusColor,
  onPressCancel,
  onPressConfirm,
  onNotePress,
  onCancellationReasonPress,
  showConfirm = false,
  showClientPhone = true,
  showCancellationReasonIcon = false,
  isBusy = false,
}: BookingCardCompactProps) {
  const clientDisplay = (() => {
    const alias = (booking.client_master_alias ?? '').trim();
    if (alias) return { text: alias, isAlias: true, account: '', phone: '' };
    let account = (booking.client_account_name ?? booking.client_name ?? '').trim();
    const phone = (booking.client_phone ?? '').trim();
    if (account?.toLowerCase() === 'клиент') account = '';
    const display = account || phone || '—';
    return { text: display, isAlias: false, account, phone };
  })();

  /** Одна строка: клиент · телефон (если оба есть), без лишней высоты карточки */
  const clientCompactLine =
    clientDisplay.isAlias || !showClientPhone
      ? clientDisplay.text
      : clientDisplay.account && clientDisplay.phone
        ? `${clientDisplay.account} · ${clientDisplay.phone}`
        : clientDisplay.text;

  const metaLine = `${formatDateDDMM(booking.start_time)} • ${formatTimeHHMM(booking.start_time)}–${formatTimeHHMM(booking.end_time)}`;

  const priceLine =
    booking.service_price != null && !Number.isNaN(Number(booking.service_price))
      ? `${Math.round(Number(booking.service_price)).toLocaleString('ru-RU')} ₽`
      : null;

  const canCancel = canCancelBooking(booking);

  const hasActions = (canCancel && onPressCancel) || (showConfirm && onPressConfirm);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={styles.serviceName} numberOfLines={1}>
            {booking.service_name || 'Услуга'}
          </Text>
          {showClientPhone && clientDisplay.text && (
            <View style={styles.clientBlock}>
              <View style={styles.clientLineWrap}>
                <Text
                  style={[
                    styles.clientLine,
                    clientDisplay.isAlias && { color: BRAND_GREEN, fontWeight: '600' },
                  ]}
                  numberOfLines={1}
                >
                  {clientCompactLine}
                </Text>
                {booking.has_client_note && onNotePress && (
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => onNotePress(booking)}
                    style={styles.noteIconWrap}
                  >
                    <Ionicons name="information-circle" size={16} color={BRAND_GREEN} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          <View style={styles.metaPriceRow}>
            <Text style={styles.metaLine} numberOfLines={1}>
              {metaLine}
            </Text>
            {priceLine ? (
              <Text style={styles.priceInMetaRow} numberOfLines={1}>
                {priceLine}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.right}>
          <View style={styles.statusRow}>
            <StatusBadge label={statusLabel} color={statusColor} style={styles.chip} textStyle={styles.chipText} />
            {showCancellationReasonIcon && onCancellationReasonPress && (
              <TouchableOpacity
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => onCancellationReasonPress(booking)}
                style={styles.reasonIconWrap}
                accessibilityLabel="Причина отмены"
              >
                <Ionicons name="information-circle" size={18} color="#dc2626" />
              </TouchableOpacity>
            )}
          </View>
          {hasActions && (
            <View style={styles.actionRow}>
              {showConfirm && onPressConfirm && (
                <TouchableOpacity
                  style={[styles.confirmBtn, isBusy && styles.btnDisabled]}
                  onPress={onPressConfirm}
                  disabled={isBusy}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Подтвердить"
                >
                  {isBusy ? (
                    <Text style={styles.confirmBtnText}>...</Text>
                  ) : (
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              )}
              {canCancel && onPressCancel && (
                <TouchableOpacity
                  style={[styles.cancelBtn, isBusy && styles.btnDisabled]}
                  onPress={onPressCancel}
                  disabled={isBusy}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Отменить"
                >
                  <Ionicons name="close" size={18} color="#F44336" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  left: {
    flex: 1,
    minWidth: 0,
  },
  right: {
    minWidth: 80,
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  reasonIconWrap: {
    padding: 2,
  },
  chipText: {
    fontSize: 11,
  },
  clientBlock: {
    marginTop: 1,
  },
  clientLineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  clientLine: {
    fontSize: 12,
    color: '#666',
    flex: 1,
    minWidth: 0,
  },
  noteIconWrap: {
    padding: 2,
  },
  /** Нижняя строка карточки: дата/время слева, цена справа */
  metaPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
    minWidth: 0,
  },
  metaLine: {
    fontSize: 11,
    color: '#999',
    flex: 1,
    minWidth: 0,
  },
  priceInMetaRow: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4CAF50',
    flexShrink: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  confirmBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  cancelBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 12,
    color: '#F44336',
    fontWeight: '500',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
