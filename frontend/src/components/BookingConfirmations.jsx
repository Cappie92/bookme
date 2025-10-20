import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../utils/api';

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
      setPendingBookings(data.pending_confirmations || []);
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
      console.error('Ошибка при подтверждении услуги:', error);
      alert('Ошибка при подтверждении услуги');
    }
  };

  const handleCancel = async (bookingId) => {
    // Показываем модальное окно для выбора причины отмены
    const reason = prompt(
      'Выберите причину отмены:\n' +
      '1 - Клиент попросил отменить\n' +
      '2 - Клиент не пришел на запись\n' +
      '3 - Обоюдное согласие\n' +
      '4 - Мастер не может оказать услугу\n\n' +
      'Введите номер (1-4):'
    );
    
    if (!reason || !['1', '2', '3', '4'].includes(reason)) {
      return;
    }
    
    const reasonMap = {
      '1': 'client_requested',
      '2': 'client_no_show', 
      '3': 'mutual_agreement',
      '4': 'master_unavailable'
    };
    
    if (!confirm('Вы уверены, что хотите отклонить эту услугу?')) {
      return;
    }
    
    try {
      await apiPost(`/api/master/accounting/cancel-booking/${bookingId}?cancellation_reason=${reasonMap[reason]}`);
      // Обновляем список после отклонения
      loadPendingConfirmations();
      // Вызываем колбэк для обновления счетчика
      if (onConfirmSuccess) {
        onConfirmSuccess();
      }
    } catch (error) {
      console.error('Ошибка при отклонении услуги:', error);
      alert('Ошибка при отклонении услуги');
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
      console.error('Ошибка при массовом подтверждении:', error);
      alert('Ошибка при массовом подтверждении');
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
      console.error('Ошибка при массовой отмене:', error);
      alert('Ошибка при массовой отмене');
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          Услуги на подтверждение (статус: На подтверждение)
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
              Отклонить все
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {pendingBookings.map((booking) => (
          <div key={booking.booking_id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div className="flex-1">
              <div className="font-medium">{booking.service_name}</div>
              <div className="text-sm text-gray-600">
                Клиент: {booking.client_name}
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
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                Подтвердить
              </button>
              <button
                onClick={() => handleCancel(booking.booking_id)}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Отклонить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

