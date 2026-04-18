import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { getMasterCampaignChannelSummary, CampaignChannelRow } from '@src/services/contactPreferences';
import { getMasterSettings } from '@src/services/api/master';
import { env } from '@src/config/env';
import { formatMoney } from '@src/utils/money';
import {
  CONTACT_CHANNEL_LABELS,
  SMS_SEGMENT_CHAR_LIMIT,
  countSmsSegments,
  computeCampaignChannelTotal,
  buildMasterPublicBookingUrl,
  appendPublicLinkToMessage,
} from 'shared/contactChannels';
import { IS_MAILING_FEATURE_LOCKED } from 'shared/mailingFeatureLocked';

const ORDER: Array<'push' | 'email' | 'sms'> = ['push', 'email', 'sms'];

export function MasterClientCampaignTab() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CampaignChannelRow[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<'push' | 'email' | 'sms' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [masterDomain, setMasterDomain] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const summary = await getMasterCampaignChannelSummary();
        const by = new Map(summary.channels.map((r) => [r.channel, r]));
        const ordered = ORDER.map((k) => by.get(k)).filter(Boolean) as CampaignChannelRow[];
        if (!cancelled) {
          setRows(ordered);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || e?.message || 'Не удалось загрузить каналы');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getMasterSettings();
        const d = s?.master?.domain;
        if (!cancelled) setMasterDomain(d != null && String(d).trim() !== '' ? String(d).trim() : null);
      } catch {
        if (!cancelled) setMasterDomain(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(() => rows.find((r) => r.channel === selectedChannel) || null, [rows, selectedChannel]);
  const publicBookingUrl = useMemo(
    () => buildMasterPublicBookingUrl(env.WEB_URL, masterDomain),
    [masterDomain],
  );

  const total = useMemo(() => {
    if (!selected) return 0;
    return computeCampaignChannelTotal(selected.channel, selected.count, selected.contact_price, message);
  }, [selected, message]);

  const smsSegments =
    selected?.channel === 'sms' && message.length > 0 ? countSmsSegments(message) : null;
  const smsCharCount = selected?.channel === 'sms' ? message.length : 0;
  const smsCharLimit =
    smsSegments != null ? smsSegments * SMS_SEGMENT_CHAR_LIMIT : 0;

  const rowDisplayTotal = (row: CampaignChannelRow) => {
    if (row.channel === 'sms' && selectedChannel === 'sms') {
      return computeCampaignChannelTotal(row.channel, row.count, row.contact_price, message);
    }
    return row.total_price;
  };

  const onInsertLink = useCallback(() => {
    const { text } = appendPublicLinkToMessage(message, publicBookingUrl);
    setMessage(text);
  }, [message, publicBookingUrl]);

  const submit = () => {
    if (!selected || !message.trim()) return;
    Alert.alert('Готово', `MVP: подготовлена рассылка через ${CONTACT_CHANNEL_LABELS[selected.channel]}`);
  };

  return (
    <View style={styles.lockRoot}>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      scrollEnabled={!IS_MAILING_FEATURE_LOCKED}
      pointerEvents={IS_MAILING_FEATURE_LOCKED ? 'none' : 'auto'}
    >
      <Card style={styles.infoCard}>
        <Text style={styles.title}>Рассылки</Text>
        <Text style={styles.subtitle}>Приоритет каналов: Push → E-mail → SMS</Text>
      </Card>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#4CAF50" />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <>
          <Card style={styles.tableCard}>
            {rows.map((row) => {
              const disabled = row.count === 0;
              const checked = selectedChannel === row.channel;
              return (
                <TouchableOpacity
                  key={row.channel}
                  disabled={disabled}
                  onPress={() => setSelectedChannel(checked ? null : row.channel)}
                  style={[styles.row, checked && styles.rowChecked, disabled && styles.rowDisabled]}
                >
                  <View style={styles.checkbox}>
                    {checked ? <Ionicons name="checkmark" size={16} color="#4CAF50" /> : null}
                  </View>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{CONTACT_CHANNEL_LABELS[row.channel]}</Text>
                    <Text style={styles.rowMeta}>
                      {row.count} клиентов • {formatMoney(row.contact_price)} / контакт
                    </Text>
                  </View>
                  <Text style={styles.rowTotal}>{formatMoney(rowDisplayTotal(row))}</Text>
                </TouchableOpacity>
              );
            })}
          </Card>

          <Card style={styles.messageCard}>
            <View style={styles.messageHeaderRow}>
              <Text style={styles.fieldLabelFlex} numberOfLines={1}>
                Текст рассылки
              </Text>
              <TouchableOpacity
                style={[styles.linkBtnCompact, !publicBookingUrl && styles.linkBtnDisabled]}
                onPress={onInsertLink}
                disabled={!publicBookingUrl}
                accessibilityRole="button"
                accessibilityLabel="Вставить ссылку на страницу записи"
                accessibilityState={{ disabled: !publicBookingUrl }}
                hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
              >
                <Text style={styles.linkBtnTextCompact}>Вставить ссылку</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.messageInputShell}>
              <TextInput
                style={styles.inputInner}
                value={message}
                onChangeText={setMessage}
                multiline
                placeholder="Введите текст рассылки..."
                placeholderTextColor="#999"
              />
            </View>
            {smsSegments != null && (
              <Text style={styles.smsMeta}>
                Сегментов SMS: <Text style={styles.smsMetaBold}>{smsSegments}</Text>
                <Text style={styles.smsMetaFraction}> ({smsCharCount}/{smsCharLimit})</Text>
              </Text>
            )}
            <View style={styles.footer}>
              <Text style={styles.totalText}>Итого: {formatMoney(total)}</Text>
              <PrimaryButton
                title="Отправить рассылку"
                onPress={submit}
                disabled={!selected || !message.trim()}
              />
            </View>
          </Card>
        </>
      )}
    </ScrollView>

    {IS_MAILING_FEATURE_LOCKED && (
      <View style={styles.comingSoonOverlay} pointerEvents="auto" accessibilityViewIsModal>
        <View style={styles.comingSoonCard} accessibilityRole="text">
          <Text style={styles.comingSoonTitle}>Рассылки скоро появятся</Text>
          <Text style={styles.comingSoonBody}>
            Мы готовим этот раздел. Здесь можно будет запускать рассылки по клиентской базе — следите за
            обновлениями.
          </Text>
        </View>
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  lockRoot: { flex: 1, position: 'relative' },
  comingSoonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  comingSoonCard: {
    maxWidth: 360,
    alignItems: 'center',
  },
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  comingSoonBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#555',
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  container: { padding: 16, gap: 12, flexGrow: 1 },
  infoCard: {},
  title: { fontSize: 18, fontWeight: '700', color: '#222' },
  subtitle: { marginTop: 4, color: '#666', fontSize: 13 },
  center: { alignItems: 'center', paddingVertical: 16 },
  error: { color: '#c00' },
  tableCard: { padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowChecked: { backgroundColor: '#f0faf0' },
  rowDisabled: { opacity: 0.5 },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  rowMeta: { marginTop: 2, fontSize: 12, color: '#666' },
  rowTotal: { fontSize: 14, color: '#111', fontWeight: '600' },
  messageCard: { gap: 8 },
  messageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 32,
  },
  fieldLabelFlex: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginRight: 4,
  },
  messageInputShell: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  linkBtnCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  linkBtnDisabled: { opacity: 0.45 },
  linkBtnTextCompact: { fontSize: 12, fontWeight: '500', color: '#555' },
  smsMeta: { fontSize: 13, color: '#666' },
  smsMetaBold: { fontWeight: '700', color: '#333' },
  smsMetaFraction: { fontWeight: '400', color: '#888' },
  inputInner: {
    minHeight: 90,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#333',
    borderWidth: 0,
  },
  footer: { gap: 8 },
  totalText: { fontSize: 14, color: '#333', fontWeight: '600' },
});

