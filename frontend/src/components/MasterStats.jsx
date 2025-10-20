import React, { useState, useEffect } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Кастомный компонент Tooltip
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

export default function MasterStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [timeOffset, setTimeOffset] = useState(0);

  useEffect(() => {
    loadMasterStats();
  }, [selectedPeriod, timeOffset]);

  const loadMasterStats = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('Необходима авторизация');
        setLoading(false);
        return;
      }

      // Загружаем статистику мастера
      const url = `/api/master/dashboard/stats?period=${selectedPeriod}&offset=${timeOffset}`;
      console.log('🔍 Вызываем эндпоинт:', url);
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('🔍 Статус ответа:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('📊 Данные статистики мастера:', data);
        console.log('📊 Текущая неделя - записи:', data.current_week_bookings);
        console.log('📊 Текущая неделя - доход:', data.current_week_income);
        console.log('📊 Прошлая неделя - записи:', data.previous_week_bookings);
        console.log('📊 Будущие записи:', data.future_week_bookings);
        
        // Добавляем расчет изменений в процентах для графиков
        if (data.weeks_data && data.weeks_data.length > 0) {
          data.weeks_data = data.weeks_data.map((period, index) => {
            const prevIndex = index - 1;
            const prevPeriod = prevIndex >= 0 ? data.weeks_data[prevIndex] : null;
            
            let bookings_change = 0;
            let income_change = 0;
            
            if (prevPeriod && prevPeriod.bookings > 0) {
              bookings_change = ((period.bookings - prevPeriod.bookings) / prevPeriod.bookings) * 100;
            }
            if (prevPeriod && prevPeriod.income > 0) {
              income_change = ((period.income - prevPeriod.income) / prevPeriod.income) * 100;
            }
            
            return {
              ...period,
              bookings_change: Math.round(bookings_change),
              income_change: Math.round(income_change)
            };
          });
        }
        
        setStats(data);
      } else {
        // Если эндпоинт не реализован, используем заглушку
        const data = {
          current_month_bookings: 0,
          bookings_dynamics: 0,
          current_month_income: 0,
          income_dynamics: 0,
          top_services: [],
          monthly_balance: []
        };
        setStats(data);
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
          onClick={loadMasterStats}
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

      {/* Динамика бронирований */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-blue-500">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Бронирования за неделю</h3>
          <p className="text-2xl font-bold text-gray-900">{stats.current_week_bookings || 0}</p>
          <div className="flex items-center mt-2">
            {(() => {
              const current = stats.current_week_bookings || 0;
              const previous = stats.previous_week_bookings || 0;
              const dynamics = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
              const sign = dynamics >= 0 ? '+' : '';
              return (
                <>
                  <span className={`text-sm ${dynamics >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {dynamics >= 0 ? '↗' : '↘'} {sign}{dynamics}%
                  </span>
                  <span className="text-xs text-gray-500 ml-2">vs прошлая неделя ({previous})</span>
                </>
              );
            })()}
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-green-500">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Доход за неделю</h3>
          <p className="text-2xl font-bold text-gray-900">{Math.round(stats.current_week_income || 0)} ₽</p>
          <div className="flex items-center mt-2">
            {(() => {
              const current = stats.current_week_income || 0;
              const previous = stats.previous_week_income || 0;
              const dynamics = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
              const sign = dynamics >= 0 ? '+' : '';
              return (
                <>
                  <span className={`text-sm ${dynamics >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {dynamics >= 0 ? '↗' : '↘'} {sign}{dynamics}%
                  </span>
                  <span className="text-xs text-gray-500 ml-2">vs прошлая неделя ({Math.round(previous)} ₽)</span>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Фильтры и навигация */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Выпадающее меню периодов */}
          <div className="flex items-center gap-4">
            <label htmlFor="period-select" className="text-sm font-medium text-gray-700">
              Период:
            </label>
            <select
              id="period-select"
              value={selectedPeriod}
              onChange={(e) => {
                setSelectedPeriod(e.target.value);
                setTimeOffset(0); // Сбрасываем offset при смене периода
              }}
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="day">День</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
              <option value="quarter">Квартал</option>
              <option value="year">Год</option>
            </select>
          </div>

          {/* Кнопки навигации */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTimeOffset(timeOffset - 1)}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              ← Назад
            </button>
            <span className="px-3 py-2 text-sm text-gray-600">
              Смещение: {timeOffset}
            </span>
            <button
              onClick={() => setTimeOffset(timeOffset + 1)}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              Вперед →
            </button>
            <button
              onClick={() => setTimeOffset(0)}
              className="px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Сегодня
            </button>
          </div>
        </div>
      </div>

      {/* Гистограммы */}
      {stats.weeks_data && stats.weeks_data.length > 0 && (
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
      )}

      {/* Статистика услуг */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Популярные услуги по записям</h3>
          {stats.top_period_range && (
            <span className="text-sm text-gray-500">Период: {stats.top_period_range}</span>
          )}
        </div>
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Топ услуги по доходам</h3>
          {stats.top_period_range && (
            <span className="text-sm text-gray-500">Период: {stats.top_period_range}</span>
          )}
        </div>
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
