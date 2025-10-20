import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import BookingConfirmations from './BookingConfirmations';

export default function MasterDashboardStats({ onNavigateToStats, onConfirmSuccess }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadDashboardStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDashboardStats = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('Необходима авторизация');
        setLoading(false);
        return;
      }

      // Всегда используем период 'week' и offset 0 для дашборда
      const response = await fetch(`/api/master/dashboard/stats?period=week&offset=0`, {
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
        
        // Добавляем расчет изменений на фронтенде, если их нет в ответе
        if (data.weeks_data && data.weeks_data.length > 0) {
          const enhancedWeeksData = data.weeks_data.map((item, index) => {
            let bookings_change = 0;
            let income_change = 0;
            
            if (index > 0) {
              const prevItem = data.weeks_data[index - 1];
              if (prevItem.bookings > 0) {
                bookings_change = Math.round(((item.bookings - prevItem.bookings) / prevItem.bookings) * 100);
              }
              if (prevItem.income > 0) {
                income_change = Math.round(((item.income - prevItem.income) / prevItem.income) * 100);
              }
            }
            
            return {
              ...item,
              bookings_change,
              income_change
            };
          });
          
          data.weeks_data = enhancedWeeksData;
        }
        
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

  // Кастомный тултип для графиков
  const CustomTooltip = ({ active, payload, label, chartType }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <div className="mb-2">
            <p className="font-semibold text-gray-900">
              {label}
            </p>
          </div>
          
          {chartType === 'bookings' ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-blue-600">Записи:</span>
                <span className="font-semibold">{data.bookings} шт</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-500">Изменение:</span>
                <span className={`font-semibold ${data.bookings_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.bookings_change > 0 ? '+' : ''}{data.bookings_change}%
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-green-600">Доход:</span>
                <span className="font-semibold">{data.income.toLocaleString()} ₽</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-green-500">Изменение:</span>
                <span className={`font-semibold ${data.income_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.income_change > 0 ? '+' : ''}{data.income_change}%
                </span>
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

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

      {/* Подтверждение завершенных услуг */}
      <BookingConfirmations onConfirmSuccess={onConfirmSuccess} />

      {/* Гистограммы */}
      {stats.weeks_data && stats.weeks_data.length > 0 && (
        <div className="space-y-6">
          {/* Заголовок секции с кнопкой */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Статистика за неделю</h2>
            <button
              onClick={onNavigateToStats}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              📊 Статистика
            </button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* График бронирований (слева) */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Бронирования за период</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={stats.weeks_data} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="period_label" 
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Период', position: 'insideBottom', offset: -10, fontSize: 11 }}
                />
                <YAxis 
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Количество', angle: -90, position: 'insideLeft', fontSize: 11 }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Изменение %', angle: 90, position: 'insideRight', fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip chartType="bookings" />} />
                <Bar yAxisId="left" dataKey="bookings" radius={[8, 8, 0, 0]}>
                  {stats.weeks_data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={
                        entry.is_current ? '#4CAF50' :
                        entry.is_past ? '#9E9E9E' :
                        '#64B5F6'
                      }
                    />
                  ))}
                </Bar>
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="bookings_change" 
                  stroke="#1976D2" 
                  strokeWidth={2}
                  dot={{ fill: '#1976D2', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex justify-center space-x-6 mt-4 text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded mr-2"></div>
                <span>Текущий период</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-gray-400 rounded mr-2"></div>
                <span>Прошлые периоды</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-400 rounded mr-2"></div>
                <span>Будущие периоды</span>
              </div>
            </div>
          </div>

          {/* График доходов (справа) */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Доход за период</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={stats.weeks_data} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="period_label" 
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Период', position: 'insideBottom', offset: -10, fontSize: 11 }}
                />
                <YAxis 
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Рубли', angle: -90, position: 'insideLeft', fontSize: 11 }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Изменение %', angle: 90, position: 'insideRight', fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip chartType="income" />} />
                <Bar yAxisId="left" dataKey="income" radius={[8, 8, 0, 0]}>
                  {stats.weeks_data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={
                        entry.is_current ? '#4CAF50' :
                        entry.is_past ? '#9E9E9E' :
                        '#64B5F6'
                      }
                    />
                  ))}
                </Bar>
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="income_change" 
                  stroke="#2E7D32" 
                  strokeWidth={2}
                  dot={{ fill: '#2E7D32', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex justify-center space-x-6 mt-4 text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded mr-2"></div>
                <span>Текущий период</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-gray-400 rounded mr-2"></div>
                <span>Прошлые периоды</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-400 rounded mr-2"></div>
                <span>Будущие периоды</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Статистика услуг */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Популярные услуги по записям {stats.top_period_range ? `(Период: ${stats.top_period_range})` : ''}
        </h3>
        <div className="space-y-2">
          {stats.top_services_by_bookings && stats.top_services_by_bookings.length > 0 ? (
            stats.top_services_by_bookings.map((service, index) => (
              <div key={service.service_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center">
                  <span className="text-lg font-bold text-blue-600 mr-2">#{index + 1}</span>
                  <span className="font-medium text-gray-900">{service.service_name}</span>
                </div>
                <span className="text-sm text-gray-600">{service.booking_count} записей</span>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-center py-4">Нет данных об услугах</p>
          )}
        </div>
      </div>

      {/* Статистика услуг по доходам */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Топ услуги по доходам {stats.top_period_range ? `(Период: ${stats.top_period_range})` : ''}
        </h3>
        <div className="space-y-2">
          {stats.top_services_by_earnings && stats.top_services_by_earnings.length > 0 ? (
            stats.top_services_by_earnings.map((service, index) => (
              <div key={service.service_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center">
                  <span className="text-lg font-bold text-green-600 mr-2">#{index + 1}</span>
                  <span className="font-medium text-gray-900">{service.service_name}</span>
                </div>
                <span className="text-sm text-gray-600">{Math.round(service.total_earnings)} ₽</span>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-center py-4">Нет данных об услугах</p>
          )}
        </div>
      </div>
    </div>
  );
}
