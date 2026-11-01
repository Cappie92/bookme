import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiClient } from '@src/services/api/client';
import { Booking } from '@src/services/api/master';
import {
  BLOCK_CAP_NOTE,
  BLOCK_CATEGORIES,
  CalendarBlock,
  MANUAL_CAP_NOTE,
  blockPayload,
  canonicalServiceOptions,
  categoryLabel,
  createCalendarBlock,
  createManualBooking,
  deleteCalendarBlock,
  deleteManualBooking,
  elapsedMinutes,
  eventVersion,
  explainCalendarError,
  findOverlap,
  keyForPayload,
  manualBounds,
  openIdempotency,
  serviceOptionKey,
  serviceSelectionForSave,
  manualPayload,
  newIdempotencyKey,
  readError,
  rememberVersion,
  updateCalendarBlock,
  updateManualBooking,
  wallClock,
} from '@src/services/calendarB3';

type Mode = 'manual' | 'block';

interface Props {
  visible: boolean;
  mode: Mode;
  date: string;
  event?: Booking | CalendarBlock | null;
  timeZone?: string | null;
  bookings: Booking[];
  blocks: CalendarBlock[];
  onClose: () => void;
  onSaved: () => void;
  onReload?: () => Promise<{ bookings?: Booking[]; blocks?: CalendarBlock[] } | void>;
}

export function CalendarB3Sheet({ visible, mode, date, event, timeZone, bookings, blocks, onClose, onSaved, onReload }: Props) {
  const editing = Boolean(event && 'id' in event);
  const start = wallClock(event && 'start_time' in event ? event.start_time : null);
  const end = wallClock(event && 'end_time' in event ? event.end_time : null);
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('personal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(date);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [endDate, setEndDate] = useState(date);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [startOffset, setStartOffset] = useState('');
  const [endOffset, setEndOffset] = useState('');
  const [services, setServices] = useState<Array<{ key: string; service_id: number | null; master_service_id: number | null; name: string; duration: number }>>([]);
  const [catalogState, setCatalogState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [servicesNote, setServicesNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [idempotency] = useState(() => ({ key: newIdempotencyKey(), lastPayload: null as string | null }));

  useEffect(() => {
    if (!visible) return;
    const booking = event as Booking | null;
    const block = event as CalendarBlock | null;
    setClientName(booking?.guest_name || booking?.client_name || '');
    setPhone(booking?.client_phone || '');
    setServiceId(booking?.service_id ? `service:${booking.service_id}` : (booking?.master_service_id ? `master:${booking.master_service_id}` : ''));
    setNotes(booking?.notes || '');
    setCategory(block?.category || 'personal');
    setTitle(block?.title || '');
    setDescription(block?.description || '');
    setStartDate(start?.date || date);
    setStartTime(start?.time || '10:00');
    setEndTime(end?.time || '11:00');
    setEndDate(end?.date || start?.date || date);
    setDraftVersion(null);
    setStartOffset('');
    setEndOffset('');
    setError('');
    openIdempotency(idempotency);
  }, [visible, event, date, start?.time, start?.date, end?.time, end?.date, idempotency]);

  useEffect(() => {
    if (!visible || mode !== 'manual') {
      setServices([]);
      setServicesNote('');
      return undefined;
    }
    let cancelled = false;
    setCatalogState('loading');
    setServicesNote(editing ? 'Услуги загружаются. Текущая услуга сохранится, пока не выбрано «Без услуги».' : 'Услуги загружаются.');
    apiClient.get<Array<{ service_id?: number | null; master_service_id?: number | null; name: string; duration: number }>>('/api/master/calendar-services')
      .then((response) => {
        if (!cancelled) {
          const options = canonicalServiceOptions(response.data || []);
          setServices(options.map((item) => ({
            key: serviceOptionKey(item),
            service_id: item.service_id,
            master_service_id: item.master_service_id,
            name: item.name || '',
            duration: item.duration || 0,
          })));
          setCatalogState('ready');
          setServicesNote(options.length ? '' : 'Услуги не найдены. Запись можно сохранить без услуги.');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServices([]);
          setCatalogState('error');
          setServicesNote(editing
            ? 'Не удалось загрузить услуги. Текущая услуга сохранится, пока не выбрано «Без услуги».'
            : 'Не удалось загрузить услуги. Запись можно сохранить без услуги.');
        }
      });
    return () => { cancelled = true; };
  }, [visible, mode, editing]);

  const serviceSelection = mode === 'manual'
    ? serviceSelectionForSave({ serviceKey: serviceId, options: services, editing, catalogState })
    : null;
  const version = draftVersion || (editing ? eventVersion(mode === 'manual' ? 'booking' : 'block', event as { id: number; version?: number | null }) : null);
  const zone = timeZone || (event && 'time_zone' in event ? (event as { time_zone?: string | null }).time_zone : null);
  const durationMinutes = serviceSelection?.duration || null;
  const originalEvent = editing ? event as { start_time?: string; end_time?: string; start_utc_us?: number | null; end_utc_us?: number | null; time_zone?: string | null } : null;

  const buildInterval = () => manualBounds({
    startDate, startTime, endDate, endTime, timeZone: zone, original: originalEvent, startOffset, endOffset, durationMinutes,
  });
  const previewInterval = buildInterval();
  const shownEndTime = durationMinutes && 'end_time' in previewInterval && previewInterval.end_time ? wallClock(previewInterval.end_time)?.time || endTime : endTime;
  const shownEndDate = durationMinutes && 'end_time' in previewInterval && previewInterval.end_time ? wallClock(previewInterval.end_time)?.date || endDate : endDate;

  const persist = (payload: { id?: number; version?: number } | null | undefined) => {
    if (payload?.id && payload.version) rememberVersion(mode === 'manual' ? 'booking' : 'block', payload.id, payload.version);
  };

  const submit = async () => {
    setError('');
    const interval = buildInterval();
    if (!interval || !('start_time' in interval) || !interval.start_time || ('error' in interval && interval.error)) {
      setError(('error' in interval && interval.error) || 'Укажите дату и время конца позже начала. Сдвиг часов не выполняется.');
      return;
    }
    const minutes = elapsedMinutes(interval.start_time, interval.end_time);
    const maxMinutes = mode === 'manual' ? 12 * 60 : 62 * 24 * 60;
    if (minutes == null || minutes < 10 || minutes > maxMinutes) {
      setError(mode === 'manual' ? 'Ручная запись длится от 10 минут до 12 часов.' : 'Блок длится от 10 минут до 62 дней.');
      return;
    }
    const built = mode === 'manual'
      ? manualPayload({ clientName, phone, serviceId: serviceSelection?.serviceId, masterServiceId: serviceSelection?.masterServiceId, serviceMode: serviceSelection?.mode, notes, start: interval.start_time, end: interval.end_time, version })
      : blockPayload({ category, title, description, start: interval.start_time, end: interval.end_time, version });
    if (built.error || !built.body) {
      setError(built.error || 'Проверьте форму');
      return;
    }
    if (editing && !version) {
      setError('В списке календаря нет version этой записи. Повторите действие сразу после создания.');
      return;
    }
    const overlap = findOverlap(interval, bookings, blocks, editing && event ? { kind: mode === 'manual' ? 'booking' : 'block', id: (event as { id: number }).id } : undefined);
    setSaving(true);
    try {
      let saved: { id?: number; version?: number };
      if (mode === 'manual') {
        if (!('client_name' in built.body)) {
          setError('Проверьте форму');
          return;
        }
        saved = editing
          ? await updateManualBooking((event as Booking).id, built.body)
          : await createManualBooking(built.body, keyForPayload(idempotency, built.body));
      } else {
        saved = editing
          ? await updateCalendarBlock((event as CalendarBlock).id, built.body)
          : await createCalendarBlock(built.body, keyForPayload(idempotency, built.body));
      }
      persist(saved);
      onSaved();
      onClose();
    } catch (err) {
      const parsed = readError(err);
      if (parsed.code === 'CALENDAR_VERSION_CONFLICT' && editing && event) {
        const fresh = await onReload?.();
        const rows = mode === 'manual' ? fresh?.bookings : fresh?.blocks;
        const current = (rows || []).find((row) => row.id === (event as { id: number }).id);
        if (current?.version) setDraftVersion(current.version);
        setError(current?.version
          ? `Запись уже изменена. Черновик сохранён, серверная version ${current.version}. Повторите действие.`
          : 'Запись уже изменена. Обновите календарь и повторите действие.');
      } else {
        setError(explainCalendarError(parsed, overlap));
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!version || !event) {
      setError('Удаление ждёт version события.');
      return;
    }
    setSaving(true);
    try {
      const saved = mode === 'manual'
        ? await deleteManualBooking((event as Booking).id, version)
        : await deleteCalendarBlock((event as CalendarBlock).id, version);
      persist(saved);
      onSaved();
      onClose();
    } catch (err) {
      const parsed = readError(err);
      if (parsed.code === 'CALENDAR_VERSION_CONFLICT' && event) {
        const fresh = await onReload?.();
        const rows = mode === 'manual' ? fresh?.bookings : fresh?.blocks;
        const current = (rows || []).find((row) => row.id === (event as { id: number }).id);
        if (current?.version) setDraftVersion(current.version);
        setError(current?.version
          ? `Запись уже изменена. Черновик сохранён, серверная version ${current.version}. Повторите действие.`
          : 'Запись уже изменена. Обновите календарь и повторите действие.');
      } else {
        setError(explainCalendarError(parsed));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <ScrollView style={{ maxHeight: '88%', backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#333' }}>{mode === 'manual' ? 'Запись вручную' : 'Занять время'}</Text>
          <Text style={{ marginTop: 4, color: '#666', fontSize: 12 }}>{startDate} · время мастера, без пересчёта часового пояса</Text>
          <Text style={{ marginTop: 4, color: '#666', fontSize: 12 }}>{mode === 'manual' ? MANUAL_CAP_NOTE : BLOCK_CAP_NOTE}</Text>
          {error ? <Text style={{ marginTop: 8, color: '#C62828' }}>{error}</Text> : null}
          {mode === 'manual' ? (
            <>
              <TextInput value={clientName} onChangeText={setClientName} placeholder="Имя клиента" style={field} />
              <TextInput value={phone} onChangeText={setPhone} placeholder="Телефон, необязательно" style={field} />
              <Text style={{ marginTop: 8, color: '#666', fontSize: 12 }}>Услуга, необязательно</Text>
              <TouchableOpacity onPress={() => {
                if (durationMinutes && 'end_time' in previewInterval && previewInterval.end_time) {
                  const wall = wallClock(previewInterval.end_time);
                  if (wall) {
                    setEndDate(wall.date);
                    setEndTime(wall.time);
                  }
                }
                setServiceId('');
              }}><Text style={{ color: serviceId ? '#333' : '#4CAF50' }}>Без услуги</Text></TouchableOpacity>
              {serviceId && !services.some((item) => item.key === serviceId) ? (
                <Text style={{ color: '#333' }}>{(event as Booking | undefined)?.service_name || 'Текущая услуга'}</Text>
              ) : null}
              {services.map((item) => (
                <TouchableOpacity key={item.key} onPress={() => setServiceId(item.key)}>
                  <Text style={{ color: item.key === serviceId ? '#4CAF50' : '#333' }}>{item.name} · {item.duration} мин</Text>
                </TouchableOpacity>
              ))}
              {servicesNote ? <Text style={{ color: '#666', fontSize: 12 }}>{servicesNote}</Text> : null}
              <TextInput value={notes} onChangeText={setNotes} placeholder="Заметка, необязательно" style={field} />
            </>
          ) : (
            <>
              {BLOCK_CATEGORIES.map((item) => (
                <TouchableOpacity key={item.value} onPress={() => setCategory(item.value)}>
                  <Text style={{ color: category === item.value ? '#4CAF50' : '#333', marginTop: 6 }}>{item.label}</Text>
                </TouchableOpacity>
              ))}
              <TextInput value={title} onChangeText={setTitle} placeholder="Заголовок, необязательно" style={field} />
              <TextInput value={description} onChangeText={setDescription} placeholder="Описание, необязательно" style={field} />
            </>
          )}
          <TextInput value={startDate} onChangeText={setStartDate} placeholder="Дата начала ГГГГ-ММ-ДД" style={field} />
          <TextInput value={startTime} onChangeText={setStartTime} placeholder="Начало ЧЧ:ММ" style={field} />
          <TextInput value={shownEndDate} onChangeText={setEndDate} placeholder="Дата конца ГГГГ-ММ-ДД" editable={!durationMinutes} style={field} />
          <TextInput value={shownEndTime} onChangeText={setEndTime} placeholder="Конец ЧЧ:ММ" editable={!durationMinutes} style={field} />
          {(() => {
            const preview = previewInterval;
            if (!preview || !('ambiguous' in preview) || !preview.ambiguous) return null;
            return (
              <>
                {(preview.startChoices || []).length > 1 ? preview.startChoices.map((offset) => (
                  <TouchableOpacity key={`start-${offset}`} onPress={() => setStartOffset(offset)}>
                    <Text style={{ color: startOffset === offset ? '#4CAF50' : '#333' }}>Начало {startTime} {offset}</Text>
                  </TouchableOpacity>
                )) : null}
                {(preview.endChoices || []).length > 1 ? preview.endChoices.map((offset) => (
                  <TouchableOpacity key={`end-${offset}`} onPress={() => setEndOffset(offset)}>
                    <Text style={{ color: endOffset === offset ? '#4CAF50' : '#333' }}>Конец {endTime} {offset}</Text>
                  </TouchableOpacity>
                )) : null}
              </>
            );
          })()}
          {editing ? <Text style={{ color: '#666', fontSize: 12 }}>{mode === 'block' ? (title || categoryLabel(category)) : clientName}{version ? ` · version ${version}` : ' · version не получена'}</Text> : null}
          <TouchableOpacity onPress={submit} disabled={saving} style={{ marginTop: 12, backgroundColor: '#4CAF50', borderRadius: 8, padding: 12, alignItems: 'center' }}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Сохранить</Text>}
          </TouchableOpacity>
          {editing ? (
            <TouchableOpacity onPress={remove} disabled={saving} style={{ marginTop: 8, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#C62828' }}>{mode === 'manual' ? 'Отменить запись' : 'Удалить блок'}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={onClose} style={{ marginTop: 4, marginBottom: 24, padding: 12, alignItems: 'center' }}>
            <Text>Закрыть</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const field = { marginTop: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#333' };
