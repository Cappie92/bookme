import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function MasterDashboardStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('Необходима авторизация');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/master/dashboard/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        setError('Ошибка загрузки статистики');
      }
    } catch (err) {
      setError('Ошибка сети');
      console.error('Ошибка загрузки статистики:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
        <button
          onClick={loadDashboardStats}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Статус подписки */}
      {stats.is_indie_master && stats.subscription_info && (
        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-blue-500">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Статус подписки</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Подписка активна до</p>
              <p className="text-xl font-semibold text-gray-900">{stats.subscription_info.expires_at}</p>
              <p className="text-sm text-gray-500">Осталось дней: {stats.subscription_info.days_remaining}</p>
            </div>
            <button
              onClick={() => navigate('/master/tariff')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Оплатить подписку
            </button>
          </div>
        </div>
      )}

      {/* Ближайшая работа */}
      {stats.next_working_info && (
        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-green-500">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Ближайшая работа</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Дата</p>
              <p className="text-lg font-semibold text-gray-900">{stats.next_working_info.next_booking_date}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Время</p>
              <p className="text-lg font-semibold text-gray-900">{stats.next_working_info.next_booking_time}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Место работы</p>
              <p className="text-lg font-semibold text-gray-900">{stats.next_working_info.work_location}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Клиент</p>
              <p className="text-lg font-semibold text-gray-900">{stats.next_working_info.client_name}</p>
            </div>
          </div>
        </div>
      )}

      {/* Заработок */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-green-500">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Заработок за неделю</h3>
          <p className="text-2xl font-bold text-gray-900">{stats.current_week_income} ₽</p>
          <div className="flex items-center mt-2">
            <span className={`text-sm ${stats.income_dynamics >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.income_dynamics >= 0 ? '↗' : '↘'} {Math.abs(stats.income_dynamics)}%
            </span>
            <span className="text-xs text-gray-500 ml-2">vs прошлая неделя</span>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-blue-500">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Записи за неделю</h3>
          <p className="text-2xl font-bold text-gray-900">{stats.current_week_bookings}</p>
          <div className="flex items-center mt-2">
            <span className="text-sm text-gray-600">
              Прошлая: {stats.previous_week_bookings}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-purple-500">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Будущие записи</h3>
          <p className="text-2xl font-bold text-gray-900">{stats.future_week_bookings}</p>
          <div className="flex items-center mt-2">
            <span className="text-sm text-gray-600">
              На следующую неделю
            </span>
          </div>
        </div>
      </div>

      {/* Топ услуг по записям */}
      {stats.top_services_by_bookings.length > 0 && (
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Топ услуг по количеству записей</h3>
          <div className="space-y-3">
            {stats.top_services_by_bookings.map((service, index) => (
              <div key={service.service_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="text-lg font-bold text-blue-600 mr-3">#{index + 1}</span>
                  <span className="font-medium text-gray-900">{service.service_name}</span>
                </div>
                <span className="text-sm text-gray-600">{service.booking_count} записей</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Топ услуг по заработку */}
      {stats.top_services_by_earnings.length > 0 && (
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Топ услуг по заработку</h3>
          <div className="space-y-3">
            {stats.top_services_by_earnings.map((service, index) => (
              <div key={service.service_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="text-lg font-bold text-green-600 mr-3">#{index + 1}</span>
                  <span className="font-medium text-gray-900">{service.service_name}</span>
                </div>
                <span className="text-sm text-gray-600 font-semibold">{service.total_earnings} ₽</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
