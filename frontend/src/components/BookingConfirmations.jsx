import { useState, useEffect } from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { apiGet, apiPost } from '../utils/api';
import { CANCELLATION_REASONS } from '../utils/bookingOutcome';

export default function BookingConfirmations({ onConfirmSuccess }) {
  const [pendingBookings, setPendingBookings] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPendingConfirmations();
  }, []);

  const loadPendingConfirmations = async () => {
    try {
      setLoading(true);
      const data = await apiGet('/api/master/accounting/pending-confirmations');
      const list = data.pending_confirmations || [];
      setPendingBookings(list);
      if (import.meta.env?.DEV && list.length > 0) {
        console.debug('[BookingConfirmations] pending-confirmations:', list.map(b => ({
          id: b.booking_id,
          start_time: b.start_time,
          status: b.status || 'awaiting_confirmation',
        })));
      }
    } catch (error) {
      console.error('Ошибка при загрузке неподтвержденных услуг:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (bookingId) => {
    try {
      await apiPost(`/api/master/accounting/confirm-booking/${bookingId}`);
      // Обновляем список после подтверждения
      loadPendingConfirmations();
      // Вызываем колбэк для обновления счетчика
      if (onConfirmSuccess) {
        onConfirmSuccess();
      }
    } catch (error) {
      const detail = error?.response?.data?.detail;
      const url = `/api/master/accounting/confirm-booking/${bookingId}`;
      console.error('[API] Ошибка при подтверждении:', url, error?.response?.status, detail, error);
      alert(detail || 'Ошибка при подтверждении услуги');
    }
  };

  const [cancelBookingId, setCancelBookingId] = useState(null);

  const handleCancelClick = (bookingId) => {
    setCancelBookingId(bookingId);
  };

  const handleCancelWithReason = async (bookingId, reason) => {
    setCancelBookingId(null);
    if (!reason) return;
    if (!confirm('Вы уверены, что хотите отменить эту услугу?')) return;
    try {
      await apiPost(`/api/master/accounting/cancel-booking/${bookingId}?cancellation_reason=${reason}`);
      loadPendingConfirmations();
      if (onConfirmSuccess) onConfirmSuccess();
    } catch (error) {
      const detail = error?.response?.data?.detail;
      const url = `/api/master/accounting/cancel-booking/${bookingId}`;
      console.error('[API] Ошибка при отклонении:', url, error?.response?.status, detail, error);
      alert(detail || 'Ошибка при отмене услуги');
    }
  };

  const handleConfirmAll = async () => {
    if (!confirm('Вы уверены, что хотите подтвердить все услуги?')) {
      return;
    }
    
    try {
      const response = await apiPost('/api/master/accounting/confirm-all');
      alert(response.message);
      loadPendingConfirmations();
      if (onConfirmSuccess) {
        onConfirmSuccess();
      }
    } catch (error) {
      const detail = error?.response?.data?.detail;
      console.error('[API] Ошибка при массовом подтверждении:', '/api/master/accounting/confirm-all', error?.response?.status, detail, error);
      alert(detail || 'Ошибка при массовом подтверждении');
    }
  };

  const handleCancelAll = async () => {
    if (!confirm('Вы уверены, что хотите отменить все услуги?')) {
      return;
    }
    
    try {
      const response = await apiPost('/api/master/accounting/cancel-all');
      alert(response.message);
      loadPendingConfirmations();
      if (onConfirmSuccess) {
        onConfirmSuccess();
      }
    } catch (error) {
      const detail = error?.response?.data?.detail;
      console.error('[API] Ошибка при массовой отмене:', '/api/master/accounting/cancel-all', error?.response?.status, detail, error);
      alert(detail || 'Ошибка при массовой отмене');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center text-gray-500">Загрузка...</div>
      </div>
    );
  }

  if (pendingBookings.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6" data-testid="postvisit-section">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          Услуги на подтверждении (статус: На подтверждении)
          <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
            {pendingBookings.length}
          </span>
        </h3>
        
        {pendingBookings.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handleConfirmAll}
              className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
            >
              Подтвердить все
            </button>
            <button
              onClick={handleCancelAll}
              className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
            >
              Отменить все
            </button>
          </div>
        )}
      </div>

      {/* Модалка выбора причины отмены */}
      {cancelBookingId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Причина отмены</h3>
            <div className="space-y-2">
              {Object.entries(CANCELLATION_REASONS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleCancelWithReason(cancelBookingId, key)}
                  className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCancelBookingId(null)}
              className="mt-4 w-full px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {pendingBookings.map((booking, index) => (
          <div key={booking.booking_id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div className="flex-1">
              <div className="font-medium">{booking.service_name}</div>
              <div className="text-sm text-gray-600">
                Клиент: {(booking.client_display_name || booking.client_name) || '—'}
                {booking.client_phone && <span className="text-gray-500 ml-1">({booking.client_phone})</span>}
              </div>
              <div className="text-sm text-gray-500">
                {new Date(booking.date).toLocaleDateString('ru-RU')} в {booking.start_time}
              </div>
              <div className="text-sm font-semibold text-green-600">
                {booking.payment_amount} ₽
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleConfirm(booking.booking_id)}
                data-testid={index === 0 ? 'postvisit-confirm-first' : undefined}
                className="w-9 h-9 flex items-center justify-center bg-green-600 text-white rounded-lg hover:bg-green-700"
                aria-label="Подтвердить"
              >
                <CheckIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleCancelClick(booking.booking_id)}
                className="w-9 h-9 flex items-center justify-center border border-red-600 text-red-600 rounded-lg hover:bg-red-50"
                aria-label="Отменить"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

