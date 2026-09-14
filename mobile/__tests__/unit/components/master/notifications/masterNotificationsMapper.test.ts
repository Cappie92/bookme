import {
  classifyNotificationFetchError,
  mapBackendNotificationToViewModel,
  mapBackendNotificationType,
  mergeNotificationPages,
  parseNotificationId,
} from '@src/components/master/notifications/masterNotificationsMapper';
import { AxiosError } from 'axios';
import type { BackendNotification } from '@src/services/api/notifications';

function backend(partial: Partial<BackendNotification> = {}): BackendNotification {
  return {
    id: 11,
    type: 'booking_created',
    title: 'Новая запись',
    body: 'Клиент записался',
    created_at: '2026-06-02T10:00:00.000Z',
    read_at: null,
    data: null,
    ...partial,
  };
}

describe('masterNotificationsMapper', () => {
  it('maps backend booking types to existing visual types', () => {
    expect(mapBackendNotificationType('booking_created')).toBe('created');
    expect(mapBackendNotificationType('booking_cancelled')).toBe('cancelled');
    expect(mapBackendNotificationType('booking_rescheduled')).toBe('updated');
    expect(mapBackendNotificationType('something_else')).toBe('updated');
  });

  it('maps unread from read_at and keeps title/body', () => {
    const view = mapBackendNotificationToViewModel(backend());
    expect(view.id).toBe('11');
    expect(view.type).toBe('created');
    expect(view.title).toBe('Новая запись');
    expect(view.body).toBe('Клиент записался');
    expect(view.isUnread).toBe(true);
    expect(view.createdAt).toBe('2026-06-02T10:00:00.000Z');
  });

  it('treats read_at as read', () => {
    const view = mapBackendNotificationToViewModel(backend({ read_at: '2026-06-02T11:00:00.000Z' }));
    expect(view.isUnread).toBe(false);
  });

  it('allowlists safe data fields and ignores phone/PII keys', () => {
    const view = mapBackendNotificationToViewModel(
      backend({
        data: {
          client_name: 'Анна',
          service_name: 'Стрижка',
          phone: '+79990001122',
          client_phone: '+79990001122',
          notes: 'secret',
          token: 'nope',
          date_label: '3 июня',
          time_label: '14:00',
        },
      })
    );
    expect(view.clientName).toBe('Анна');
    expect(view.serviceName).toBe('Стрижка');
    expect(view.dateLabel).toBe('3 июня');
    expect(view.timeLabel).toBe('14:00');
    expect(JSON.stringify(view)).not.toContain('+7999');
    expect(JSON.stringify(view)).not.toContain('secret');
    expect(JSON.stringify(view)).not.toContain('nope');
  });

  it('unknown type still produces a renderable card model', () => {
    const view = mapBackendNotificationToViewModel(backend({ type: 'future_event', title: 'Служебное', body: 'Текст' }));
    expect(view.type).toBe('updated');
    expect(view.title).toBe('Служебное');
    expect(view.body).toBe('Текст');
  });

  it('dedups pages by id', () => {
    const a = mapBackendNotificationToViewModel(backend({ id: 1 }));
    const b = mapBackendNotificationToViewModel(backend({ id: 2 }));
    const merged = mergeNotificationPages([a], [a, b]);
    expect(merged.map((x) => x.id)).toEqual(['1', '2']);
  });

  it('classifies backend absence vs network vs failed', () => {
    const unavailable = new AxiosError('not found');
    unavailable.response = { status: 404, data: {}, headers: {}, config: {} as any, statusText: 'NF' };
    expect(classifyNotificationFetchError(unavailable)).toBe('unavailable');

    const disabled = new AxiosError('off');
    disabled.response = { status: 503, data: {}, headers: {}, config: {} as any, statusText: 'UN' };
    expect(classifyNotificationFetchError(disabled)).toBe('unavailable');

    const network = new AxiosError('Network Error');
    expect(classifyNotificationFetchError(network)).toBe('network');
    expect(classifyNotificationFetchError(new Error('timeout'))).toBe('network');
    expect(classifyNotificationFetchError(new Error('boom'))).toBe('failed');
  });

  it('parses numeric notification ids', () => {
    expect(parseNotificationId('12')).toBe(12);
    expect(parseNotificationId('x')).toBeNull();
  });
});
