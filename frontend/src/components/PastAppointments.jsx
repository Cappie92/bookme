import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../utils/api';

export default function PastAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusDraft, setStatusDraft] = useState({});
  const [cancellationReason, setCancellationReason] = useState({});
  
  // Фильтры
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    loadAppointments();
  }, [currentPage, startDate, endDate, statusFilter]);

  const loadAppointments = async () => {
    try {
      setLoading(true);
      setError('');
      
      let url = `/api/master/past-appointments?page=${currentPage}&limit=20`;
      
      if (startDate) {
        url += `&start_date=${startDate}`;
      }
      if (endDate) {
        url += `&end_date=${endDate}`;
      }
      if (statusFilter) {
        url += `&status=${statusFilter}`;
      }
      
      const data = await apiGet(url);
      setAppointments(data.appointments || []);
      setTotalPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Ошибка при загрузке прошедших записей:', error);
      setError('Ошибка при загрузке данных');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = () => {
    setCurrentPage(1); // Сбрасываем на первую страницу при изменении фильтров
    loadAppointments();
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setStatusFilter('');
    setCurrentPage(1);
  };

  const handleApplyStatus = async (appointmentId, fallbackStatus) => {
    const chosen = (statusDraft[appointmentId] || fallbackStatus || '').toLowerCase();
    if (!['created','awaiting_confirmation','completed','cancelled','client_requested_early','client_requested_late'].includes(chosen)) {
      alert('Выберите корректный статус');
      return;
    }
    
    try {
      let url = `/api/master/accounting/update-booking-status/${appointmentId}?new_status=${chosen}`;
      
      // Если статус "cancelled", добавляем причину отмены
      if (chosen === 'cancelled') {
        const reason = cancellationReason[appointmentId];
        if (!reason) {
          alert('Выберите причину отмены');
          return;
        }
        url += `&cancellation_reason=${reason}`;
      }
      
      await apiPost(url);
      await loadAppointments();
      
      // Очищаем состояние после успешного обновления
      setStatusDraft(prev => ({ ...prev, [appointmentId]: undefined }));
      setCancellationReason(prev => ({ ...prev, [appointmentId]: undefined }));
    } catch (e) {
      console.error('Ошибка при обновлении статуса записи:', e);
      if (e.response?.status === 403) {
        alert('Нельзя изменять статус записи, отмененной клиентом');
      } else {
        alert('Ошибка при обновлении статуса');
      }
    }
  };

  const getStatusBadgeColor = (status, statusColor) => {
    const colorMap = {
      'green': 'bg-green-100 text-green-800',
      'red': 'bg-red-100 text-red-800',
      'orange': 'bg-orange-100 text-orange-800',
      'blue': 'bg-blue-100 text-blue-800',
      'purple': 'bg-purple-100 text-purple-800',
      'pink': 'bg-pink-100 text-pink-800',
      'gray': 'bg-gray-100 text-gray-800'
    };
    return colorMap[statusColor] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status) => {
    const statusMap = {
      'created': 'Создана',
      'awaiting_confirmation': 'На подтверждение',
      'completed': 'Завершено',
      'cancelled': 'Отменено мастером',
      'cancelled_by_client_early': 'Отменено клиентом заранее',
      'cancelled_by_client_late': 'Отменено клиентом менее чем за 12 часов',
      'confirmed': 'Подтверждено'  // для обратной совместимости
    };
    return statusMap[status] || status;
  };

  if (loading && appointments.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center text-gray-500">Загрузка прошедших записей...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Фильтры */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Фильтры</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Дата с
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Дата по
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Статус
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Все статусы</option>
              <option value="created">Создана</option>
              <option value="awaiting_confirmation">На подтверждение</option>
              <option value="completed">Завершено</option>
              <option value="cancelled">Отменено мастером</option>
              <option value="cancelled_by_client_early">Отменено клиентом заранее</option>
              <option value="cancelled_by_client_late">Отменено клиентом менее чем за 12 часов</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleFilterChange}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Применить
            </button>
            <button
              onClick={clearFilters}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Очистить
            </button>
          </div>
        </div>
      </div>

      {/* Результаты */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">
              Прошедшие записи
              {total > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  (всего: {total})
                </span>
              )}
            </h3>
          </div>
        </div>

        {error && (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
              <button
                onClick={loadAppointments}
                className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Попробовать снова
              </button>
            </div>
          </div>
        )}

        {appointments.length === 0 && !loading && !error ? (
          <div className="p-6 text-center text-gray-500">
            Прошедшие записи не найдены
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Дата
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Время
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Клиент
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Услуга
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Статус
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Сумма
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Изменить статус
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {appointments.map((appointment) => (
                    <tr key={appointment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(appointment.date).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {appointment.time}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {appointment.client_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {appointment.service_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeColor(appointment.status, appointment.status_color)}`}>
                          {getStatusText(appointment.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                        {appointment.payment_amount > 0 ? `${appointment.payment_amount} ₽` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        {appointment.status === 'cancelled_by_client_early' || appointment.status === 'cancelled_by_client_late' ? (
                          <div className="text-gray-500 text-sm">
                            Нельзя изменить
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 justify-end">
                              <select
                                value={statusDraft[appointment.id] ?? appointment.status}
                                onChange={(e) => {
                                  const newStatus = e.target.value;
                                  setStatusDraft(prev => ({ ...prev, [appointment.id]: newStatus }));
                                  // Очищаем причину отмены при смене статуса
                                  if (newStatus !== 'cancelled') {
                                    setCancellationReason(prev => ({ ...prev, [appointment.id]: undefined }));
                                  }
                                }}
                                className="px-2 py-1 border border-gray-300 rounded"
                              >
                                <option value="created">Создана</option>
                                <option value="awaiting_confirmation">На подтверждение</option>
                                <option value="completed">Завершено</option>
                                <option value="cancelled">Отменено мастером</option>
                                <option value="client_requested_early">Отменено клиентом заранее</option>
                                <option value="client_requested_late">Отменено клиентом менее чем за 12 часов</option>
                              </select>
                              <button
                                onClick={() => handleApplyStatus(appointment.id, appointment.status)}
                                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                Сохранить
                              </button>
                            </div>
                          {statusDraft[appointment.id] === 'cancelled' && (
                            <div className="flex items-center gap-2 justify-end">
                              <select
                                value={cancellationReason[appointment.id] || ''}
                                onChange={(e) => setCancellationReason(prev => ({ ...prev, [appointment.id]: e.target.value }))}
                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                              >
                                <option value="">Выберите причину отмены</option>
                                <option value="client_requested_early">Клиент попросил отменить заранее</option>
                                <option value="client_requested_late">Поздняя отмена клиентом</option>
                                <option value="client_no_show">Клиент не пришел на запись</option>
                                <option value="mutual_agreement">Обоюдное согласие</option>
                                <option value="master_unavailable">Мастер не может оказать услугу</option>
                              </select>
                            </div>
                          )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Пагинация */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Страница {currentPage} из {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Назад
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Вперед →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

