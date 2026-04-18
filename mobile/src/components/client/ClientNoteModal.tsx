/**
 * Модалка создания/редактирования заметки по записи (контекстная к мастеру/салону).
 * Учитывает флаг salons_enabled: при выключенных салонах показывается только заметка о мастере,
 * salon-notes API не вызывается. Backend: /api/client/master-notes, /api/client/salon-notes (без /profile/).
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Booking } from '@src/services/api/bookings';
import {
  getMasterNote,
  getSalonNote,
  createOrUpdateMasterNote,
  createOrUpdateSalonNote,
  deleteMasterNote,
  deleteSalonNote,
} from '@src/services/api/notes';

type NoteType = 'master_in_salon' | 'salon' | 'indie_master' | null;

function getNoteTypeAndTarget(booking: Booking | null): { noteType: NoteType; targetId: number | null } {
  if (!booking) return { noteType: null, targetId: null };
  const salonName = (booking.salon_name ?? '').trim();
  const masterName = (booking.master_name ?? '').trim();
  if (booking.salon_id && salonName && salonName !== '-') {
    if (booking.master_id && masterName && masterName !== '-') {
      return { noteType: 'master_in_salon', targetId: booking.master_id };
    }
    return { noteType: 'salon', targetId: booking.salon_id };
  }
  if (booking.indie_master_id && masterName && masterName !== '-') {
    return { noteType: 'indie_master', targetId: booking.indie_master_id };
  }
  return { noteType: null, targetId: null };
}

export interface ClientNoteModalProps {
  visible: boolean;
  onClose: () => void;
  booking: Booking | null;
  /** Флаг из backend (dashboard/stats): при false салон не показывается, salon-notes API не вызывается. */
  salonsEnabled?: boolean;
  onNoteSaved?: () => void;
}

export function ClientNoteModal({ visible, onClose, booking, salonsEnabled = false, onNoteSaved }: ClientNoteModalProps) {
  const [masterNote, setMasterNote] = useState('');
  const [salonNote, setSalonNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [existingMaster, setExistingMaster] = useState(false);
  const [existingSalon, setExistingSalon] = useState(false);
  /** Android: RN Modal не ресайзится под IME — поднимаем sheet по высоте клавиатуры (см. keyboard listeners). */
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);

  const { noteType, targetId } = getNoteTypeAndTarget(booking);
  const useSalon = salonsEnabled && (noteType === 'master_in_salon' || noteType === 'salon');
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;
  const sheetMaxHeight = Math.min(windowHeight * 0.7, 560);

  useEffect(() => {
    if (visible && noteType && targetId && booking) {
      loadNotes();
    } else {
      setMasterNote('');
      setSalonNote('');
      setExistingMaster(false);
      setExistingSalon(false);
    }
  }, [visible, noteType, targetId, booking?.id, salonsEnabled]);

  useEffect(() => {
    if (!visible) {
      setAndroidKeyboardInset(0);
      return;
    }
    if (Platform.OS !== 'android') return;

    const onShow = Keyboard.addListener('keyboardDidShow', (e) => {
      const h = e.endCoordinates?.height ?? 0;
      setAndroidKeyboardInset(Math.max(0, Math.round(h)));
    });
    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardInset(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [visible]);

  const loadNotes = async () => {
    if (!booking || !noteType || !targetId) return;
    setLoading(true);
    try {
      if (noteType === 'master_in_salon') {
        try {
          const m = await getMasterNote(booking.master_id!);
          if (m?.note) {
            setMasterNote(m.note);
            setExistingMaster(true);
          }
        } catch {
          setMasterNote('');
          setExistingMaster(false);
        }
        if (useSalon) {
          try {
            const s = await getSalonNote(booking.salon_id!, booking.branch_id ?? undefined);
            if (s?.note) {
              setSalonNote(s.note);
              setExistingSalon(true);
            }
          } catch {
            setSalonNote('');
            setExistingSalon(false);
          }
        }
      } else if (noteType === 'salon' && useSalon) {
        try {
          const s = await getSalonNote(booking.salon_id!, booking.branch_id ?? undefined);
          if (s?.note) {
            setSalonNote(s.note);
            setExistingSalon(true);
          }
        } catch {
          setSalonNote('');
          setExistingSalon(false);
        }
      } else if (noteType === 'indie_master') {
        try {
          const m = await getMasterNote(booking.indie_master_id!);
          if (m?.note) {
            setMasterNote(m.note);
            setExistingMaster(true);
          }
        } catch {
          setMasterNote('');
          setExistingMaster(false);
        }
      }
    } catch (e) {
      console.error('ClientNoteModal loadNotes', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!noteType || !targetId || !booking) return;
    if (noteType === 'salon' && !useSalon) return;
    const hasMaster = masterNote.trim().length > 0;
    const hasSalon = salonNote.trim().length > 0;
    if (noteType === 'master_in_salon') {
      if (useSalon && !hasMaster && !hasSalon) {
        Alert.alert('Ошибка', 'Введите заметку о мастере или о салоне');
        return;
      }
      if (!useSalon && !hasMaster) {
        Alert.alert('Ошибка', 'Введите заметку о мастере');
        return;
      }
    }
    if (noteType === 'salon' && !hasSalon) {
      Alert.alert('Ошибка', 'Введите заметку о салоне');
      return;
    }
    if (noteType === 'indie_master' && !hasMaster) {
      Alert.alert('Ошибка', 'Введите заметку о мастере');
      return;
    }
    setSaving(true);
    try {
      if (noteType === 'master_in_salon') {
        if (hasMaster) {
          await createOrUpdateMasterNote({
            master_id: booking.master_id!,
            salon_id: booking.salon_id ?? undefined,
            note: masterNote.trim(),
          });
        }
        if (useSalon && hasSalon) {
          await createOrUpdateSalonNote({
            salon_id: booking.salon_id!,
            branch_id: booking.branch_id ?? undefined,
            note: salonNote.trim(),
          });
        }
      } else if (noteType === 'salon' && useSalon && hasSalon) {
        await createOrUpdateSalonNote({
          salon_id: booking.salon_id!,
          branch_id: booking.branch_id ?? undefined,
          note: salonNote.trim(),
        });
      } else if (noteType === 'indie_master' && hasMaster) {
        await createOrUpdateMasterNote({
          master_id: booking.indie_master_id!,
          note: masterNote.trim(),
        });
      }
      onNoteSaved?.();
      Alert.alert('Готово', 'Заметки сохранены');
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Не удалось сохранить заметки';
      Alert.alert('Ошибка', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!noteType || !targetId || !booking) return;
    const hasAny = existingMaster || (useSalon && existingSalon);
    if (!hasAny) return;
    Alert.alert(
      'Удалить заметки',
      'Вы уверены, что хотите удалить заметки к этой записи?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              if (noteType === 'master_in_salon') {
                if (existingMaster) await deleteMasterNote(booking.master_id!);
                if (useSalon && existingSalon) await deleteSalonNote(booking.salon_id!, booking.branch_id ?? undefined);
              } else if (noteType === 'salon' && useSalon && existingSalon) {
                await deleteSalonNote(booking.salon_id!, booking.branch_id ?? undefined);
              } else if (noteType === 'indie_master' && existingMaster) {
                await deleteMasterNote(booking.indie_master_id!);
              }
              onNoteSaved?.();
              Alert.alert('Готово', 'Заметки удалены');
              onClose();
            } catch (e: unknown) {
              const err = e as { response?: { data?: { detail?: string } }; message?: string };
              Alert.alert('Ошибка', err?.response?.data?.detail ?? err?.message ?? 'Не удалось удалить');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleClose = () => {
    setMasterNote('');
    setSalonNote('');
    onClose();
  };

  if (!visible) return null;

  const title =
    noteType === 'salon' && !useSalon
      ? 'Заметка'
      : noteType === 'salon'
        ? `Заметка о салоне "${booking?.salon_name ?? ''}"`
        : noteType === 'master_in_salon'
          ? useSalon
            ? `Заметки: ${booking?.master_name ?? ''} (${booking?.salon_name ?? ''})`
            : `Заметка о мастере ${booking?.master_name ?? ''}`
          : noteType === 'indie_master'
            ? `Заметка о мастере ${booking?.master_name ?? ''}`
            : 'Заметка';

  const showMasterField = noteType === 'master_in_salon' || noteType === 'indie_master';
  const showSalonField = useSalon;
  const showNoType = !noteType || (noteType === 'salon' && !useSalon);
  const canDelete = existingMaster || (useSalon && existingSalon);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
          style={[
            styles.keyboardView,
            Platform.OS === 'android' ? { marginBottom: androidKeyboardInset } : null,
          ]}
        >
          <Pressable
            style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: Math.max(insets.bottom, 12) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={2}>{title}</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color="#16a34a" />
                <Text style={styles.loadingText}>Загрузка заметок…</Text>
              </View>
            ) : (
              <>
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {showMasterField && (
                    <View style={styles.field}>
                      {showSalonField ? <Text style={styles.label}>Заметка о мастере</Text> : null}
                      <TextInput
                        style={styles.input}
                        value={masterNote}
                        onChangeText={setMasterNote}
                        placeholder="Опишите впечатления о мастере…"
                        placeholderTextColor="#9ca3af"
                        keyboardType="default"
                        autoCapitalize="sentences"
                        autoCorrect
                        spellCheck
                        autoComplete="off"
                        multiline
                        maxLength={400}
                      />
                      <Text style={styles.counter}>{masterNote.length}/400</Text>
                    </View>
                  )}
                  {showSalonField && (
                    <View style={styles.field}>
                      {showMasterField ? <Text style={styles.label}>Заметка о салоне</Text> : null}
                      <TextInput
                        style={styles.input}
                        value={salonNote}
                        onChangeText={setSalonNote}
                        placeholder="Опишите впечатления о салоне…"
                        placeholderTextColor="#9ca3af"
                        keyboardType="default"
                        autoCapitalize="sentences"
                        autoCorrect
                        spellCheck
                        autoComplete="off"
                        multiline
                        maxLength={400}
                      />
                      <Text style={styles.counter}>{salonNote.length}/400</Text>
                    </View>
                  )}
                  {showNoType && (
                    <Text style={styles.noType}>
                      {noteType === 'salon' && !useSalon
                        ? 'Заметки о салоне недоступны (функция отключена).'
                        : 'Не удалось определить тип записи для заметки.'}
                    </Text>
                  )}
                </ScrollView>
                <View style={styles.actions}>
                  {canDelete && (
                    <TouchableOpacity
                      style={[styles.btn, styles.deleteBtn]}
                      onPress={handleDelete}
                      disabled={deleting}
                    >
                      <Text style={styles.deleteBtnText}>{deleting ? 'Удаление…' : 'Удалить заметки'}</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.rightActions}>
                    <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={handleClose}>
                      <Text style={styles.cancelBtnText}>Отмена</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.saveBtn]}
                      onPress={handleSave}
                      disabled={saving}
                    >
                      <Text style={styles.saveBtnText}>{saving ? 'Сохранение…' : 'Сохранить'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  keyboardView: {
    width: '100%',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    width: '100%',
    minHeight: 340,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  closeBtn: { padding: 4 },
  loadingWrap: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: { marginTop: 12, fontSize: 15, color: '#6b7280' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 8, flexGrow: 1 },
  field: { paddingHorizontal: 16, paddingTop: 12 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    minHeight: 72,
    textAlignVertical: 'top',
  },
  counter: { fontSize: 12, color: '#9ca3af', marginTop: 4, textAlign: 'right' },
  noType: { fontSize: 14, color: '#6b7280', padding: 16 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  deleteBtn: { backgroundColor: '#fee2e2' },
  deleteBtnText: { color: '#dc2626', fontWeight: '500' },
  rightActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { backgroundColor: '#f3f4f6' },
  cancelBtnText: { color: '#374151', fontWeight: '500' },
  saveBtn: { backgroundColor: '#16a34a' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
});
