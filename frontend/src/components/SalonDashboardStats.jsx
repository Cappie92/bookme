import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SalonDashboardStats() {
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

      // Заглушка для статистики салона (эндпоинт не реализован)
      const data = {
        subscription_info: {
          expires_at: 'Не указано',
          days_remaining: 0
        },
        branches_loading: [],
        current_month_bookings: 0,
        bookings_dynamics: 0,
        current_month_income: 0,
        income_dynamics: 0,
        top_masters: [],
        bottom_masters: [],
        monthly_balance: []
      };
      
      setStats(data);
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
      <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-blue-500">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Статус подписки</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Подписка активна до</p>
            <p className="text-xl font-semibold text-gray-900">{stats.subscription_info.expires_at}</p>
            <p className="text-sm text-gray-500">Осталось дней: {stats.subscription_info.days_remaining}</p>
          </div>
          <button
            onClick={() => navigate('/salon/tariff')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Оплатить подписку
          </button>
        </div>
      </div>

      {/* Загрузка филиалов */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Загрузка филиалов на ближайшие 3 дня</h3>
        <div className="space-y-4">
          {stats.branches_loading.map((branch) => (
            <div key={branch.branch_id} className="border rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">{branch.branch_name}</h4>
              <div className="grid grid-cols-3 gap-4">
                {branch.daily_loading.map((day) => (
                  <div key={day.date} className="text-center">
                    <p className="text-sm text-gray-600 mb-1">
                      {new Date(day.date).toLocaleDateString('ru-RU', { 
                        day: 'numeric', 
                        month: 'short' 
                      })}
                    </p>
                    <div className="relative">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            day.loading_percentage > 80 ? 'bg-red-500' : 
                            day.loading_percentage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${day.loading_percentage}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {day.bookings_count} / {Math.round(16 * day.loading_percentage / 100)} слотов
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Динамика бронирований */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-blue-500">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Бронирования за месяц</h3>
          <p className="text-2xl font-bold text-gray-900">{stats.current_month_bookings}</p>
          <div className="flex items-center mt-2">
            <span className={`text-sm ${stats.bookings_dynamics >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.bookings_dynamics >= 0 ? '↗' : '↘'} {Math.abs(stats.bookings_dynamics)}%
            </span>
            <span className="text-xs text-gray-500 ml-2">vs прошлый месяц</span>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-green-500">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Доход за месяц</h3>
          <p className="text-2xl font-bold text-gray-900">{stats.current_month_income} ₽</p>
          <div className="flex items-center mt-2">
            <span className={`text-sm ${stats.income_dynamics >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.income_dynamics >= 0 ? '↗' : '↘'} {Math.abs(stats.income_dynamics)}%
            </span>
            <span className="text-xs text-gray-500 ml-2">vs прошлый месяц</span>
          </div>
        </div>
      </div>

      {/* Статистика мастеров */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Статистика мастеров</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Лидеры по записям</h4>
            <div className="space-y-2">
              {stats.top_masters.map((master, index) => (
                <div key={master.master_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center">
                    <span className="text-lg font-bold text-blue-600 mr-2">#{index + 1}</span>
                    <span className="font-medium text-gray-900">{master.master_name}</span>
                  </div>
                  <span className="text-sm text-gray-600">{master.bookings_count} записей</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-3">Аутсайдеры по записям</h4>
            <div className="space-y-2">
              {stats.bottom_masters.map((master, index) => (
                <div key={master.master_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center">
                    <span className="text-lg font-bold text-red-600 mr-2">#{stats.bottom_masters.length - index}</span>
                    <span className="font-medium text-gray-900">{master.master_name}</span>
                  </div>
                  <span className="text-sm text-gray-600">{master.bookings_count} записей</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Динамика баланса */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Динамика баланса за 6 месяцев</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {stats.monthly_balance.map((month) => (
            <div key={month.month} className="text-center">
              <p className="text-sm text-gray-600 mb-2">{month.month}</p>
              <div className="space-y-1">
                <p className="text-xs text-green-600">+{month.income} ₽</p>
                <p className="text-xs text-red-600">-{month.expenses} ₽</p>
                <p className={`text-sm font-semibold ${
                  month.balance >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {month.balance >= 0 ? '+' : ''}{month.balance} ₽
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
