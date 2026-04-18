import React, { useState, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  formatStatsBucketRange,
  formatStatsAxisLabel,
  normalizeLegacyPeriodLabel,
} from 'shared/statsPeriodLabels';
import {
  MASTER_STATS_CHANGE_LINE_DOT,
  MASTER_STATS_CHANGE_LINE_STROKE,
  MASTER_STATS_STACK_CONFIRMED_CURRENT,
  MASTER_STATS_STACK_PENDING_CURRENT,
} from '../utils/masterStatsChartTheme';

/** Отступы вокруг plot area: меньше боковых margin → шире область столбцов при тех же px контейнера. */
const EXTENDED_CHART_MARGIN = { top: 14, right: 16, bottom: 16, left: 10 };
/**
 * Фиксированная ширина осей Y: при width="auto" Recharts считает место под тики по метрикам шрифта;
 * на Android подписи часто занимают больше места, резерв расширяется и столбцы визуально «сжимаются» сильнее, чем на iOS.
 */
const YW_BL = 36;
const YW_BR = 34;
const YW_IL = 52;
const YW_IR = 34;

function stackSegmentFills(entry) {
  if (entry.is_past) {
    return { confirmed: '#757575', pending: '#BDBDBD' };
  }
  if (entry.is_current) {
    return { confirmed: MASTER_STATS_STACK_CONFIRMED_CURRENT, pending: MASTER_STATS_STACK_PENDING_CURRENT };
  }
  return { confirmed: '#42A5F5', pending: '#90CAF9' };
}

// Кастомный компонент Tooltip
const CustomTooltip = ({ active, payload, label, chartType }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const periodTitle =
      formatStatsBucketRange(data.period_start, data.period_end) || normalizeLegacyPeriodLabel(label);

    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
        <p className="mb-2 text-sm font-semibold text-gray-900">{periodTitle}</p>
        
        {chartType === 'bookings' ? (
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Подтверждённые</span>
              <span className="font-semibold text-gray-900">{Number(data.bookings_confirmed ?? 0)} шт</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Ожидающие</span>
              <span className="font-semibold text-gray-900">{Number(data.bookings_pending ?? 0)} шт</span>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-1">
              <span className="text-gray-800">Всего</span>
              <span className="font-semibold text-gray-900">{Number(data.bookings_total ?? data.bookings ?? 0)} шт</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-blue-500">Изменение</span>
              <span className={`font-semibold ${data.bookings_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.bookings_change > 0 ? '+' : ''}{data.bookings_change}%
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Подтверждённый</span>
              <span className="font-semibold text-gray-900">
                {Math.round(Number(data.income_confirmed_rub ?? data.income ?? 0)).toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Ожидающий</span>
              <span className="font-semibold text-gray-900">
                {Math.round(Number(data.income_pending_rub ?? 0)).toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-1">
              <span className="text-gray-800">Всего</span>
              <span className="font-semibold text-gray-900">
                {Math.round(Number(data.income_total_rub ?? data.income ?? 0)).toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-green-500">Изменение</span>
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

export default function MasterStats({ hasExtendedStats = false, onOpenSubscriptionModal }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [timeOffset, setTimeOffset] = useState(0);
  const [dayAnchorDate, setDayAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [extendedStats, setExtendedStats] = useState(null);
  const [showExtended, setShowExtended] = useState(false);

  useEffect(() => {
    loadMasterStats();
    if (showExtended && hasExtendedStats) {
      loadExtendedStats();
    }
  }, [selectedPeriod, timeOffset, dayAnchorDate, showExtended, hasExtendedStats]);

  const loadMasterStats = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('Необходима авторизация');
        setLoading(false);
        return;
      }

      // Загружаем статистику мастера
      let url = `/api/master/dashboard/stats?period=${selectedPeriod}&offset=${timeOffset}`;
      if (selectedPeriod === 'day') {
        url += `&anchor_date=${dayAnchorDate}&window_before=9&window_after=9`;
      }
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        console.log('[MasterStats] запрос:', url);
      }
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        console.log('[MasterStats] статус ответа:', response.status);
      }

      if (response.ok) {
        const data = await response.json();
        console.log('[MasterStats] данные статистики мастера:', data);
        console.log('[MasterStats] текущая неделя — записи:', data.current_week_bookings);
        console.log('[MasterStats] текущая неделя — доход:', data.current_week_income);
        console.log('[MasterStats] прошлая неделя — записи:', data.previous_week_bookings);
        console.log('[MasterStats] будущие записи:', data.future_week_bookings);
        
        // Добавляем расчет изменений в процентах для графиков
        if (data.weeks_data && data.weeks_data.length > 0) {
          data.weeks_data = data.weeks_data.map((period, index) => {
            const prevIndex = index - 1;
            const prevPeriod = prevIndex >= 0 ? data.weeks_data[prevIndex] : null;
            
            let bookings_change = 0;
            let income_change = 0;
            
            const prevB = prevPeriod ? Number(prevPeriod.bookings_total ?? prevPeriod.bookings ?? 0) : 0;
            const curB = Number(period.bookings_total ?? period.bookings ?? 0);
            if (prevPeriod && prevB > 0) {
              bookings_change = ((curB - prevB) / prevB) * 100;
            }
            const prevI = prevPeriod ? Number(prevPeriod.income_total_rub ?? prevPeriod.income ?? 0) : 0;
            const curI = Number(period.income_total_rub ?? period.income ?? 0);
            if (prevPeriod && prevI > 0) {
              income_change = ((curI - prevI) / prevI) * 100;
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

  const loadExtendedStats = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      let extUrl = `/api/master/stats/extended?period=${selectedPeriod}&compare_period=true&offset=${timeOffset}`;
      if (selectedPeriod === 'day') {
        extUrl += `&anchor_date=${dayAnchorDate}&window_before=9&window_after=9`;
      }
      const url = extUrl;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setExtendedStats(data);
      } else if (response.status === 403) {
        setError('Расширенная статистика доступна только в подписке Pro');
      }
    } catch (err) {
      console.error('Ошибка при загрузке расширенной статистики:', err);
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
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="break-words text-red-800">{error}</p>
        <button
          type="button"
          onClick={loadMasterStats}
          className="mt-3 min-h-11 w-full rounded-lg bg-red-600 px-4 py-3 text-white hover:bg-red-700 sm:w-auto sm:py-2"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  // Разделяем 2 состояния:
  // A) "Нет данных" — реально нечего отрисовать (weeks_data пустой).
  // B) "Нулевая активность" — ряд есть, но всё по нулям (валидный сценарий: новый мастер, нет бронирований).
  const hasNoData = !stats.weeks_data || stats.weeks_data.length === 0;
  const hasZeroActivity =
    !hasNoData &&
    stats.weeks_data.every((p) => {
      const bt = Number(p.bookings_total ?? p.bookings ?? 0);
      const it = Number(p.income_total_rub ?? p.income ?? 0);
      return bt === 0 && it === 0;
    });

  /** Только тогда внутри карточки нужен горизонтальный скролл (широкий day-chart). Иначе overflow-x-auto ловит touch и мешает вертикальному scroll страницы на Android WebView/Chrome. */
  const chartNeedsHorizontalScroll =
    selectedPeriod === 'day' && stats.weeks_data && stats.weeks_data.length > 10;
  const chartTouchAction = chartNeedsHorizontalScroll ? 'pan-x pan-y' : 'pan-y';

  return (
    <div
      data-testid="master-stats-web"
      className="relative w-full min-w-0 max-w-full max-lg:space-y-2 lg:space-y-5"
    >
      {/* Период — компактная композиция: 2 ряда (гранулярность+select | навигация в одну линию на mobile) */}
      <div className="space-y-2 rounded-xl border border-gray-100 bg-white p-2.5 max-lg:space-y-2 lg:space-y-4 lg:p-4">
        <div className="text-sm font-semibold text-gray-900 lg:text-base">Период</div>
        {!hasExtendedStats && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-amber-100 bg-amber-50/90 p-2 sm:flex-row sm:items-center sm:justify-between lg:p-3">
            <div className="text-xs leading-snug text-amber-900 sm:text-sm">
              Расширенные периоды и графики — в подписке Pro.
            </div>
            <button
              type="button"
              onClick={() => {
                if (onOpenSubscriptionModal) {
                  onOpenSubscriptionModal();
                } else {
                  window.location.href = '/master?tab=tariff';
                }
              }}
              className="inline-flex min-h-10 w-full shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-white px-3 text-sm font-medium text-[#4CAF50] hover:bg-amber-100/50 sm:w-auto sm:justify-start sm:border-0 sm:bg-transparent sm:px-0 sm:hover:bg-transparent"
            >
              Управление подпиской
            </button>
          </div>
        )}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
          <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 lg:gap-4">
            <label htmlFor="period-select" className="shrink-0 text-xs font-medium text-gray-600 lg:text-sm">
              Гранулярность
            </label>
            <select
              id="period-select"
              value={selectedPeriod}
              onChange={(e) => {
                setSelectedPeriod(e.target.value);
                setTimeOffset(0);
                if (e.target.value === 'day') {
                  setDayAnchorDate(new Date().toISOString().slice(0, 10));
                }
              }}
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#4CAF50] focus:outline-none focus:ring-2 focus:ring-[#4CAF50]/30 sm:w-auto lg:min-h-10"
              disabled={!hasExtendedStats}
            >
              <option value="day">День</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
              <option value="quarter">Квартал</option>
              <option value="year">Год</option>
            </select>
          </div>
          {/* Один ряд: Назад · Сегодня (центр) · Вперёд; смещение/якорь только в state */}
          <div className="w-full min-w-0 max-w-full lg:w-auto lg:shrink-0">
            <div className="flex w-full min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (selectedPeriod === 'day') {
                    const d = new Date(dayAnchorDate);
                    d.setDate(d.getDate() - 1);
                    setDayAnchorDate(d.toISOString().slice(0, 10));
                  } else {
                    setTimeOffset(timeOffset - 1);
                  }
                }}
                className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10 sm:flex-none sm:px-2.5"
                disabled={!hasExtendedStats}
              >
                <ChevronLeftIcon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                <span className="truncate">Назад</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedPeriod === 'day') {
                    setDayAnchorDate(new Date().toISOString().slice(0, 10));
                  } else {
                    setTimeOffset(0);
                  }
                }}
                className="min-h-11 min-w-0 flex-[1.15] rounded-lg border border-transparent bg-[#4CAF50] px-2 text-sm font-semibold text-white hover:bg-[#43A047] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10 sm:px-4"
                disabled={!hasExtendedStats}
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedPeriod === 'day') {
                    const d = new Date(dayAnchorDate);
                    d.setDate(d.getDate() + 1);
                    setDayAnchorDate(d.toISOString().slice(0, 10));
                  } else {
                    setTimeOffset(timeOffset + 1);
                  }
                }}
                className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10 sm:flex-none sm:px-2.5"
                disabled={!hasExtendedStats}
              >
                <span className="truncate">Вперёд</span>
                <ChevronRightIcon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Переключатель базовой/расширенной статистики */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:gap-3">
        <div className="flex h-11 w-full rounded-lg bg-gray-100/95 p-1 lg:inline-flex lg:h-auto lg:w-auto">
          <button
            type="button"
            onClick={() => setShowExtended(false)}
            className={`flex min-h-10 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors lg:min-h-10 lg:px-4 lg:flex-none ${
              !showExtended ? 'bg-white text-[#4CAF50] shadow-sm' : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            Базовая
          </button>
          <button
            type="button"
            onClick={() => {
              if (!hasExtendedStats) return;
              setShowExtended(true);
            }}
            disabled={!hasExtendedStats}
            className={`flex min-h-10 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors lg:min-h-10 lg:px-4 lg:flex-none ${
              showExtended ? 'bg-white text-[#4CAF50] shadow-sm' : 'text-gray-700 hover:text-gray-900'
            } ${!hasExtendedStats ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            Расширенная
          </button>
        </div>

        {!hasExtendedStats && (
          <div className="w-full rounded border border-gray-100 bg-gray-50/80 px-2 py-1 text-xs text-gray-600 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-right lg:text-sm">
            <span className="break-words">Доступно в Pro. </span>
            <button
              type="button"
              onClick={() => {
                if (onOpenSubscriptionModal) {
                  onOpenSubscriptionModal();
                } else {
                  window.location.href = '/master?tab=tariff';
                }
              }}
              className="inline-flex min-h-9 items-center font-medium text-[#4CAF50] hover:underline lg:min-h-10"
            >
              Управление подпиской
            </button>
          </div>
        )}
      </div>

      {/* Базовая: показатели + топы — всегда видны; расширенная добавляется ниже */}
      <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 lg:mb-3 lg:text-sm lg:normal-case lg:tracking-normal lg:text-gray-900">
              Показатели
            </div>
            {hasNoData ? (
              <div className="rounded-xl border border-gray-100 bg-white p-5 text-center lg:p-8">
                <div className="text-sm text-gray-700 lg:text-base">Нет данных за период</div>
                <div className="mt-0.5 text-xs text-gray-500 lg:text-sm">Попробуйте выбрать другой период</div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 md:gap-3 lg:gap-4">
                  <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-2.5 lg:p-4 xl:p-5">
                    <h3 className="text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs lg:mb-1 lg:normal-case lg:tracking-normal lg:text-sm">Бронирования</h3>
                    <p className="mt-0.5 text-xl font-semibold leading-tight tabular-nums text-gray-900 sm:text-2xl lg:mt-1 lg:text-3xl">{stats.current_week_bookings || 0}</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0 lg:mt-3">
                      {(() => {
                        const current = stats.current_week_bookings || 0;
                        const previous = stats.previous_week_bookings || 0;
                        const dynamics = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
                        const sign = dynamics >= 0 ? '+' : '';
                        return (
                          <>
                            <span className={`text-sm font-semibold tabular-nums ${dynamics >= 0 ? 'text-green-700' : 'text-gray-600'}`}>
                              {sign}{dynamics}%
                            </span>
                            <span className="text-xs leading-snug text-gray-500">к прошл. ({previous})</span>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-2.5 lg:p-4 xl:p-5">
                    <h3 className="text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs lg:mb-1 lg:normal-case lg:tracking-normal lg:text-sm">Доход</h3>
                    <p className="mt-0.5 text-xl font-semibold leading-tight tabular-nums text-gray-900 sm:text-2xl lg:mt-1 lg:text-3xl">{Math.round(stats.current_week_income || 0)} ₽</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0 lg:mt-3">
                      {(() => {
                        const current = stats.current_week_income || 0;
                        const previous = stats.previous_week_income || 0;
                        const dynamics = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
                        const sign = dynamics >= 0 ? '+' : '';
                        return (
                          <>
                            <span className={`text-sm font-semibold tabular-nums ${dynamics >= 0 ? 'text-green-700' : 'text-gray-600'}`}>
                              {sign}{dynamics}%
                            </span>
                            <span className="text-xs leading-snug text-gray-500">к прошл. ({Math.round(previous)} ₽)</span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {hasZeroActivity && (
                  <div className="mt-2 text-xs leading-snug text-gray-600 lg:mt-3 lg:text-sm">
                    За выбранный период пока нет бронирований. Попробуйте изменить период или добавьте записи.
                  </div>
                )}
              </>
            )}
          </div>

      {/* Статистика услуг */}
      <div className="rounded-xl border border-gray-100 bg-white p-3 lg:p-4 xl:p-5">
        <div className="mb-2 border-b border-gray-100 pb-2 lg:mb-3 lg:border-0 lg:pb-0">
          <h3 className="text-sm font-semibold text-gray-900 lg:text-base">Топ по записям</h3>
          {stats.top_period_range && (
            <div className="mt-0.5 text-xs leading-snug text-gray-500 lg:mt-1">{stats.top_period_range}</div>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {stats.top_services_by_bookings && stats.top_services_by_bookings.length > 0 ? (
            stats.top_services_by_bookings.map((service, index) => (
              <div
                key={service.service_id}
                className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0 lg:items-center lg:py-2.5"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2 lg:items-baseline lg:gap-3">
                  <span className="w-5 shrink-0 pt-0.5 text-center text-xs font-semibold tabular-nums text-gray-400 lg:w-6">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-gray-900">{service.service_name}</span>
                </div>
                <span className="shrink-0 pt-0.5 text-right text-sm tabular-nums text-gray-600">
                  {service.booking_count} зап.
                </span>
              </div>
            ))
          ) : (
            <div className="py-6 text-center lg:py-8">
              <div className="text-sm text-gray-700 lg:text-base">{hasNoData ? 'Нет данных за период' : 'Пока нет данных для топа'}</div>
              <div className="mt-0.5 text-xs text-gray-500 lg:text-sm">{hasNoData ? 'Попробуйте выбрать другой период' : ''}</div>
            </div>
          )}
        </div>
      </div>

      {/* Статистика услуг по доходам */}
      <div className="rounded-xl border border-gray-100 bg-white p-3 lg:p-4 xl:p-5">
        <div className="mb-2 border-b border-gray-100 pb-2 lg:mb-3 lg:border-0 lg:pb-0">
          <h3 className="text-sm font-semibold text-gray-900 lg:text-base">Топ по доходу</h3>
          {stats.top_period_range && (
            <div className="mt-0.5 text-xs leading-snug text-gray-500 lg:mt-1">{stats.top_period_range}</div>
          )}
        </div>
        <div className="divide-y divide-gray-100">
          {stats.top_services_by_earnings && stats.top_services_by_earnings.length > 0 ? (
            stats.top_services_by_earnings.map((service, index) => (
              <div
                key={service.service_id}
                className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0 lg:items-center lg:py-2.5"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2 lg:items-baseline lg:gap-3">
                  <span className="w-5 shrink-0 pt-0.5 text-center text-xs font-semibold tabular-nums text-gray-400 lg:w-6">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-gray-900">{service.service_name}</span>
                </div>
                <span className="shrink-0 pt-0.5 text-right text-sm font-medium tabular-nums text-gray-700">
                  {Math.round(service.total_earnings)} ₽
                </span>
              </div>
            ))
          ) : (
            <div className="py-6 text-center lg:py-8">
              <div className="text-sm text-gray-700 lg:text-base">{hasNoData ? 'Нет данных за период' : 'Пока нет данных для топа'}</div>
              <div className="mt-0.5 text-xs text-gray-500 lg:text-sm">{hasNoData ? 'Попробуйте выбрать другой период' : ''}</div>
            </div>
          )}
        </div>
      </div>

      {/* Расширенная: графики + сводки (дополнение к базовой) */}
      {showExtended && hasExtendedStats && (
        <div className="space-y-3 lg:space-y-5">
          <div className="text-sm font-semibold text-gray-900 lg:text-base">Расширенная статистика</div>

          {stats.weeks_data && stats.weeks_data.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-6">
            {/* График бронирований — тот же паттерн, что на дашборде: stacked bar + линия % */}
            <div
              className={`min-w-0 max-w-full rounded-xl border border-gray-100 bg-white p-3 shadow-sm lg:border-gray-100/80 lg:p-4 xl:p-5 lg:shadow-none${
                chartNeedsHorizontalScroll ? ' overflow-x-auto overscroll-x-contain' : ''
              }`}
              style={chartNeedsHorizontalScroll ? { minWidth: Math.max(400, stats.weeks_data.length * 56) } : undefined}
            >
              <h3 className="mb-2 text-sm font-semibold text-gray-900 lg:mb-3 lg:text-base">Бронирования</h3>
              <div
                className={`relative z-0 h-[220px] w-full lg:h-[280px] ${chartNeedsHorizontalScroll ? 'touch-pan-x touch-pan-y' : 'touch-pan-y'}`}
              >
              <ResponsiveContainer
                width={chartNeedsHorizontalScroll ? Math.max(400, stats.weeks_data.length * 56) : '100%'}
                height="100%"
              >
                <ComposedChart
                  data={stats.weeks_data}
                  margin={EXTENDED_CHART_MARGIN}
                  style={{ touchAction: chartTouchAction }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="period_label"
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Период', position: 'insideBottom', offset: -10, fontSize: 11 }}
                    tickFormatter={(value, index) =>
                      formatStatsAxisLabel(
                        stats.weeks_data[index]?.period_start,
                        stats.weeks_data[index]?.period_end,
                        value
                      )
                    }
                  />
                  <YAxis
                    yAxisId="left"
                    width={YW_BL}
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Количество', angle: -90, position: 'insideLeft', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    width={YW_BR}
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Изменение %', angle: 90, position: 'insideRight', fontSize: 11 }}
                  />
                  <Tooltip
                    content={<CustomTooltip chartType="bookings" />}
                    allowEscapeViewBox={{ x: false, y: true }}
                    reverseDirection={{ x: false, y: true }}
                    wrapperStyle={{ zIndex: 50 }}
                  />
                  <Bar
                    yAxisId="left"
                    stackId="bookings"
                    dataKey="bookings_confirmed"
                    radius={[0, 0, 0, 0]}
                    onClick={
                      selectedPeriod === 'day'
                        ? (data) => {
                            const ps = data?.period_start;
                            if (ps && ps !== dayAnchorDate) setDayAnchorDate(ps);
                          }
                        : undefined
                    }
                    style={selectedPeriod === 'day' ? { cursor: 'pointer' } : undefined}
                  >
                    {stats.weeks_data.map((entry, index) => (
                      <Cell key={`bc-${index}`} fill={stackSegmentFills(entry).confirmed} />
                    ))}
                  </Bar>
                  <Bar
                    yAxisId="left"
                    stackId="bookings"
                    dataKey="bookings_pending"
                    radius={[8, 8, 0, 0]}
                    onClick={
                      selectedPeriod === 'day'
                        ? (data) => {
                            const ps = data?.period_start;
                            if (ps && ps !== dayAnchorDate) setDayAnchorDate(ps);
                          }
                        : undefined
                    }
                    style={selectedPeriod === 'day' ? { cursor: 'pointer' } : undefined}
                  >
                    {stats.weeks_data.map((entry, index) => (
                      <Cell key={`bp-${index}`} fill={stackSegmentFills(entry).pending} />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="bookings_change"
                    stroke={MASTER_STATS_CHANGE_LINE_STROKE}
                    strokeWidth={2}
                    dot={{ fill: MASTER_STATS_CHANGE_LINE_DOT, r: 3 }}
                    isAnimationActive={false}
                    activeDot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-x-2 gap-y-1.5 px-0.5 text-xs leading-snug text-gray-700 lg:mt-3 lg:gap-x-4 lg:text-sm">
                <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                  <div className="h-2.5 w-2.5 shrink-0 rounded bg-green-500 lg:h-3 lg:w-3" />
                  <span className="whitespace-nowrap"><span className="lg:hidden">Сейчас</span><span className="hidden lg:inline">Текущий период</span></span>
                </div>
                <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                  <div className="h-2.5 w-2.5 shrink-0 rounded bg-gray-400 lg:h-3 lg:w-3" />
                  <span className="whitespace-nowrap"><span className="lg:hidden">Прошлые</span><span className="hidden lg:inline">Прошлые периоды</span></span>
                </div>
                <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                  <div className="h-2.5 w-2.5 shrink-0 rounded bg-blue-400 lg:h-3 lg:w-3" />
                  <span className="whitespace-nowrap"><span className="lg:hidden">Будущие</span><span className="hidden lg:inline">Будущие периоды</span></span>
                </div>
                <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                  <div className="h-0.5 w-4 shrink-0 rounded-full lg:w-5" style={{ backgroundColor: MASTER_STATS_CHANGE_LINE_STROKE }} />
                  <span className="whitespace-nowrap">Изменение %</span>
                </div>
              </div>
            </div>

            <div
              className={`min-w-0 max-w-full rounded-xl border border-gray-100 bg-white p-3 shadow-sm lg:border-gray-100/80 lg:p-4 xl:p-5 lg:shadow-none${
                chartNeedsHorizontalScroll ? ' overflow-x-auto overscroll-x-contain' : ''
              }`}
              style={chartNeedsHorizontalScroll ? { minWidth: Math.max(400, stats.weeks_data.length * 56) } : undefined}
            >
              <h3 className="mb-2 text-sm font-semibold text-gray-900 lg:mb-3 lg:text-base">Доход</h3>
              <div
                className={`relative z-0 h-[220px] w-full lg:h-[280px] ${chartNeedsHorizontalScroll ? 'touch-pan-x touch-pan-y' : 'touch-pan-y'}`}
              >
              <ResponsiveContainer
                width={chartNeedsHorizontalScroll ? Math.max(400, stats.weeks_data.length * 56) : '100%'}
                height="100%"
              >
                <ComposedChart
                  data={stats.weeks_data}
                  margin={EXTENDED_CHART_MARGIN}
                  style={{ touchAction: chartTouchAction }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="period_label"
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Период', position: 'insideBottom', offset: -10, fontSize: 11 }}
                    tickFormatter={(value, index) =>
                      formatStatsAxisLabel(
                        stats.weeks_data[index]?.period_start,
                        stats.weeks_data[index]?.period_end,
                        value
                      )
                    }
                  />
                  <YAxis
                    yAxisId="left"
                    width={YW_IL}
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Рубли', angle: -90, position: 'insideLeft', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    width={YW_IR}
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Изменение %', angle: 90, position: 'insideRight', fontSize: 11 }}
                  />
                  <Tooltip
                    content={<CustomTooltip chartType="income" />}
                    allowEscapeViewBox={{ x: false, y: true }}
                    reverseDirection={{ x: false, y: true }}
                    wrapperStyle={{ zIndex: 50 }}
                  />
                  <Bar
                    yAxisId="left"
                    stackId="income"
                    dataKey="income_confirmed_rub"
                    radius={[0, 0, 0, 0]}
                    onClick={
                      selectedPeriod === 'day'
                        ? (data) => {
                            const ps = data?.period_start;
                            if (ps && ps !== dayAnchorDate) setDayAnchorDate(ps);
                          }
                        : undefined
                    }
                    style={selectedPeriod === 'day' ? { cursor: 'pointer' } : undefined}
                  >
                    {stats.weeks_data.map((entry, index) => (
                      <Cell key={`ic-${index}`} fill={stackSegmentFills(entry).confirmed} />
                    ))}
                  </Bar>
                  <Bar
                    yAxisId="left"
                    stackId="income"
                    dataKey="income_pending_rub"
                    radius={[8, 8, 0, 0]}
                    onClick={
                      selectedPeriod === 'day'
                        ? (data) => {
                            const ps = data?.period_start;
                            if (ps && ps !== dayAnchorDate) setDayAnchorDate(ps);
                          }
                        : undefined
                    }
                    style={selectedPeriod === 'day' ? { cursor: 'pointer' } : undefined}
                  >
                    {stats.weeks_data.map((entry, index) => (
                      <Cell key={`ip-${index}`} fill={stackSegmentFills(entry).pending} />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="income_change"
                    stroke={MASTER_STATS_CHANGE_LINE_STROKE}
                    strokeWidth={2}
                    dot={{ fill: MASTER_STATS_CHANGE_LINE_DOT, r: 3 }}
                    isAnimationActive={false}
                    activeDot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-x-2 gap-y-1.5 px-0.5 text-xs leading-snug text-gray-700 lg:mt-3 lg:gap-x-4 lg:text-sm">
                <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                  <div className="h-2.5 w-2.5 shrink-0 rounded bg-green-500 lg:h-3 lg:w-3" />
                  <span className="whitespace-nowrap"><span className="lg:hidden">Сейчас</span><span className="hidden lg:inline">Текущий период</span></span>
                </div>
                <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                  <div className="h-2.5 w-2.5 shrink-0 rounded bg-gray-400 lg:h-3 lg:w-3" />
                  <span className="whitespace-nowrap"><span className="lg:hidden">Прошлые</span><span className="hidden lg:inline">Прошлые периоды</span></span>
                </div>
                <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                  <div className="h-2.5 w-2.5 shrink-0 rounded bg-blue-400 lg:h-3 lg:w-3" />
                  <span className="whitespace-nowrap"><span className="lg:hidden">Будущие</span><span className="hidden lg:inline">Будущие периоды</span></span>
                </div>
                <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                  <div className="h-0.5 w-4 shrink-0 rounded-full lg:w-5" style={{ backgroundColor: MASTER_STATS_CHANGE_LINE_STROKE }} />
                  <span className="whitespace-nowrap">Изменение %</span>
                </div>
              </div>
            </div>
          </div>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-white p-6 text-center lg:p-8">
              <div className="text-sm text-gray-700 lg:text-base">Нет данных для графиков</div>
              <div className="mt-1 text-xs text-gray-500 lg:text-sm">Попробуйте выбрать другой период</div>
            </div>
          )}

          {extendedStats && (
            <div className="rounded-xl border border-gray-100 bg-white p-3 lg:p-5">
              <div className="mb-2 flex min-h-[1.25rem] items-center justify-between gap-2 lg:mb-3 lg:min-h-[1.375rem]">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700 lg:text-sm">Сводка</h2>
                <p className="flex max-w-[min(100%,14rem)] shrink-0 flex-wrap items-baseline justify-end gap-x-1 gap-y-0 text-[10px] leading-none sm:max-w-none lg:text-xs">
                  <span className="font-semibold" style={{ color: MASTER_STATS_STACK_CONFIRMED_CURRENT }}>
                    Факт
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="font-semibold" style={{ color: MASTER_STATS_STACK_PENDING_CURRENT }}>
                    План
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="font-semibold text-gray-900">Факт + План</span>
                </p>
              </div>
              <div
                className={
                  extendedStats.forecast
                    ? 'grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-4'
                    : 'grid grid-cols-2 gap-2 lg:gap-4'
                }
              >
                <div className="min-w-0 rounded-lg border border-gray-100 bg-gray-50/90 p-2.5 lg:p-4">
                  <h3 className="text-xs font-medium text-gray-600">Текущий период</h3>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 lg:text-xl">
                    <span style={{ color: MASTER_STATS_STACK_CONFIRMED_CURRENT }}>
                      {extendedStats.current_period?.factual?.bookings_count ?? 0}
                    </span>
                    <span className="text-gray-500"> (</span>
                    <span style={{ color: MASTER_STATS_STACK_PENDING_CURRENT }}>
                      {extendedStats.current_period?.plan?.bookings_count ?? 0}
                    </span>
                    <span className="text-gray-500">)</span>
                  </p>
                  <p className="mt-0.5 text-xs font-semibold tabular-nums text-gray-600 lg:text-sm">
                    <span style={{ color: MASTER_STATS_STACK_CONFIRMED_CURRENT }}>
                      {Math.round(extendedStats.current_period?.factual?.revenue ?? 0).toLocaleString('ru-RU')}
                    </span>
                    <span className="text-gray-500"> ₽ (</span>
                    <span style={{ color: MASTER_STATS_STACK_PENDING_CURRENT }}>
                      {Math.round(extendedStats.current_period?.plan?.revenue ?? 0).toLocaleString('ru-RU')}
                    </span>
                    <span className="text-gray-500">)</span>
                  </p>
                </div>

                <div className="min-w-0 rounded-lg border border-gray-100 bg-gray-50/90 p-2.5 lg:p-4">
                  <h3 className="text-xs font-medium text-gray-600">Сравнение</h3>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 lg:text-xl">
                    {extendedStats.comparison?.revenue_change_percent >= 0 ? '+' : ''}
                    {extendedStats.comparison?.revenue_change_percent?.toFixed(1) || 0}%
                    <span className="font-medium text-gray-500"> (₽)</span>
                  </p>
                  <p className="mt-0.5 text-xs font-semibold tabular-nums text-gray-900 lg:text-sm">
                    {extendedStats.comparison?.bookings_change_percent >= 0 ? '+' : ''}
                    {extendedStats.comparison?.bookings_change_percent?.toFixed(1) || 0}%{' '}
                    <span className="font-normal text-gray-500">записей</span>
                  </p>
                </div>

                {extendedStats.forecast && (
                  <div className="min-w-0 col-span-2 rounded-lg border border-gray-100 bg-gray-50/90 p-2.5 lg:col-span-1 lg:p-4">
                    <h3 className="text-xs font-medium text-gray-900">Итого</h3>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 lg:text-xl">
                      {Math.round(
                        extendedStats.current_period?.period_total?.revenue ??
                          extendedStats.forecast?.predicted_revenue ??
                          0
                      ).toLocaleString('ru-RU')}{' '}
                      ₽
                    </p>
                    <p className="mt-0.5 text-xs font-semibold tabular-nums text-gray-900 lg:text-sm">
                      {extendedStats.current_period?.period_total?.bookings_count ??
                        extendedStats.forecast?.predicted_bookings ??
                        0}{' '}
                      записей
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
