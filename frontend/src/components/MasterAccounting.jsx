import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  ArrowDownIcon,
  ArrowDownTrayIcon,
  ArrowUpIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';
import { apiFetch, apiGet, apiDelete } from '../utils/api';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart
} from 'recharts';
import ExpenseModal from '../modals/ExpenseModal';
import TaxRateModal from '../modals/TaxRateModal';
import { FINANCE_THEME } from '../constants/financeTheme';
import { formatDayMonth } from 'shared/statsPeriodLabels';

const SHOW_EXPORT = false;

/** Единый отображаемый формат дат на экране «Финансы» (web / mobile web). */
const DATE_DISPLAY_PLACEHOLDER = 'дд.мм.гггг';

function ymdToDdMmYyyy(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

function formatFinanceDateDisplay(isoOrYmd) {
  if (!isoOrYmd) return '';
  const raw = String(isoOrYmd);
  const ymd = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymdToDdMmYyyy(ymd);
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return '';
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}.${m}.${y}`;
}

const RU_MONTHS_FULL = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

/** Подписи оси графика финансов по шагу `chart_axis_granularity` из API */
function formatAccountingChartTick(iso, granularity) {
  if (!iso || typeof iso !== 'string') return '';
  const head = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return formatDayMonth(iso);
  const [y, m] = head.split('-').map(Number);
  if (granularity === 'month') {
    const label = RU_MONTHS_FULL[m - 1];
    return label ? `${label} ${y}` : formatDayMonth(iso);
  }
  return formatDayMonth(iso);
}

export default function MasterAccounting({ hasFinanceAccess = true }) {
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [timeOffset, setTimeOffset] = useState(0);
  /** Как в MasterStats: якорь для period=day и те же query params, что /dashboard/stats */
  const [dayAnchorDate, setDayAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [taxLoading, setTaxLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [operationsError, setOperationsError] = useState('');
  const [taxError, setTaxError] = useState('');
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
  const [currentTaxRate, setCurrentTaxRate] = useState(null);
  
  // Пагинация для таблицы
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [operationTypeFilter, setOperationTypeFilter] = useState('all');

  const summaryReqIdRef = useRef(0);
  const operationsReqIdRef = useRef(0);
  const taxReqIdRef = useRef(0);
  const startDateInputRef = useRef(null);
  const endDateInputRef = useRef(null);

  const handleUnauthorized = () => {
    localStorage.removeItem('access_token');
    alert('Нужно войти заново');
    window.location.href = '/';
  };

  useEffect(() => {
    if (!hasFinanceAccess) return;
    loadSummary();
    loadOperations();
    loadCurrentTaxRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasFinanceAccess,
    selectedPeriod,
    timeOffset,
    dayAnchorDate,
    startDate,
    endDate,
    useCustomDates,
    currentPage,
    operationTypeFilter,
  ]);

  const loadSummary = async () => {
    const reqId = ++summaryReqIdRef.current;
    try {
      setSummaryLoading(true);
      setSummaryError('');
      let url;
      if (useCustomDates && startDate && endDate) {
        url = `/api/master/accounting/summary?start_date=${startDate}&end_date=${endDate}`;
      } else {
        url = `/api/master/accounting/summary?period=${selectedPeriod}&offset=${timeOffset}`;
        if (selectedPeriod === 'day') {
          url += `&anchor_date=${dayAnchorDate}&window_before=9&window_after=9`;
        }
      }
      
      const data = await apiGet(url);
      if (reqId !== summaryReqIdRef.current) return;
      setSummary(data);
    } catch (error) {
      if (reqId !== summaryReqIdRef.current) return;
      console.error('Ошибка при загрузке сводки:', error);
      setSummaryError('Не удалось загрузить сводку');
    } finally {
      if (reqId !== summaryReqIdRef.current) return;
      setSummaryLoading(false);
    }
  };

  const loadOperations = async () => {
    const reqId = ++operationsReqIdRef.current;
    try {
      setOperationsLoading(true);
      setOperationsError('');
      let url = `/api/master/accounting/operations?page=${currentPage}&limit=20`;
      if (useCustomDates && startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
      } else {
        url += `&period=${selectedPeriod}&offset=${timeOffset}`;
        if (selectedPeriod === 'day') {
          url += `&anchor_date=${dayAnchorDate}&window_before=9&window_after=9`;
        }
      }
      
      if (operationTypeFilter !== 'all') {
        url += `&operation_type=${operationTypeFilter}`;
      }
      
      const data = await apiGet(url);
      if (reqId !== operationsReqIdRef.current) return;
      setExpenses(data.operations || []);
      setTotalPages(data.pages || 1);
    } catch (error) {
      if (reqId !== operationsReqIdRef.current) return;
      console.error('Ошибка при загрузке операций:', error);
      setOperationsError('Не удалось загрузить операции');
    } finally {
      if (reqId !== operationsReqIdRef.current) return;
      setOperationsLoading(false);
    }
  };

  const loadCurrentTaxRate = async () => {
    const reqId = ++taxReqIdRef.current;
    try {
      setTaxLoading(true);
      setTaxError('');
      const data = await apiGet('/api/master/tax-rates/current');
      if (reqId !== taxReqIdRef.current) return;
      setCurrentTaxRate(data);
    } catch (error) {
      if (reqId !== taxReqIdRef.current) return;
      console.error('Ошибка при загрузке налоговой ставки:', error);
      setTaxError('Не удалось загрузить налоговую ставку');
    } finally {
      if (reqId !== taxReqIdRef.current) return;
      setTaxLoading(false);
    }
  };

  const handlePeriodChange = (newPeriod) => {
    setSelectedPeriod(newPeriod);
    setTimeOffset(0);
    setStartDate('');
    setEndDate('');
    setUseCustomDates(false);
    if (newPeriod === 'day') {
      setDayAnchorDate(new Date().toISOString().slice(0, 10));
    }
  };

  const handleNavigate = (direction) => {
    if (selectedPeriod === 'day') {
      const d = new Date(dayAnchorDate);
      d.setDate(d.getDate() + direction);
      setDayAnchorDate(d.toISOString().slice(0, 10));
    } else {
      setTimeOffset((prev) => prev + direction);
    }
  };

  const handleToday = () => {
    if (selectedPeriod === 'day') {
      setDayAnchorDate(new Date().toISOString().slice(0, 10));
    } else {
      setTimeOffset(0);
    }
  };

  const handleExport = async (format) => {
    try {
      let url = `/api/master/accounting/export?format=${format}`;
      
      if (useCustomDates && startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
      }

      const response = await apiFetch(url, { method: 'GET' });

      if (response.status === 401) {
        alert('Нужно войти заново');
        handleUnauthorized();
        return;
      }

      if (response.status === 403) {
        alert('Нет доступа к Финансам (нужен Pro)');
        return;
      }

      if (format === 'csv' && response.status === 500) {
        alert('CSV временно недоступен, используйте Excel');
        return;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        alert(errorText ? `Ошибка экспорта: ${errorText}` : `Ошибка экспорта: ${response.status}`);
        return;
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `accounting_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error('Ошибка при экспорте:', error);
      alert('Ошибка экспорта. Проверьте соединение и попробуйте позже.');
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!confirm('Вы уверены, что хотите удалить этот расход?')) {
      return;
    }
    
    try {
      await apiDelete(`/api/master/accounting/expenses/${expenseId}`);
      loadOperations();
      loadSummary();
    } catch (error) {
      console.error('Ошибка при удалении расхода:', error);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleTaxRateSuccess = () => {
    loadCurrentTaxRate();
    loadSummary();
    loadOperations();
  };

  useEffect(() => {
    setUseCustomDates(Boolean(startDate && endDate));
  }, [startDate, endDate]);

  const handleCustomStartChange = useCallback((e) => {
    const v = e.target.value;
    setStartDate(v);
    if (v && endDate && endDate < v) {
      setEndDate(v);
    }
    if (v) {
      window.setTimeout(() => {
        endDateInputRef.current?.showPicker?.();
      }, 150);
    }
  }, [endDate]);

  const handleCustomEndChange = useCallback((e) => {
    const v = e.target.value;
    if (v && startDate && v < startDate) {
      setEndDate(startDate);
      return;
    }
    setEndDate(v);
  }, [startDate]);

  const periodLabels = {
    day: 'День',
    week: 'Неделя',
    month: 'Месяц',
    quarter: 'Квартал',
    year: 'Год'
  };

  const currentPeriodLabel = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const pad2 = (v) => String(v).padStart(2, '0');
    const toDM = (d) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
    const toDMY = (d) => `${toDM(d)}.${String(d.getFullYear()).slice(-2)}`;
    const addDays = (d, days) => {
      const n = new Date(d);
      n.setDate(n.getDate() + days);
      return n;
    };
    const addMonths = (d, months) => {
      const n = new Date(d);
      n.setMonth(n.getMonth() + months);
      return n;
    };
    const startOfWeekMonday = (d) => {
      const n = new Date(d);
      const day = n.getDay();
      const shift = day === 0 ? -6 : 1 - day;
      n.setDate(n.getDate() + shift);
      return n;
    };

    if (selectedPeriod === 'day') {
      const [yy, mm, dd] = dayAnchorDate.split('-').map(Number);
      const target = new Date(yy, mm - 1, dd);
      return toDMY(target);
    }
    if (selectedPeriod === 'week') {
      const weekStart = addDays(startOfWeekMonday(now), timeOffset * 7);
      const weekEnd = addDays(weekStart, 6);
      return `${toDM(weekStart)}–${toDM(weekEnd)}`;
    }
    if (selectedPeriod === 'month') {
      const target = addMonths(now, timeOffset);
      return timeOffset === 0 ? RU_MONTHS_FULL[target.getMonth()] : `${RU_MONTHS_FULL[target.getMonth()]} ${target.getFullYear()}`;
    }
    if (selectedPeriod === 'quarter') {
      const shifted = addMonths(now, timeOffset * 3);
      const quarter = Math.floor(shifted.getMonth() / 3) + 1;
      return `Q${quarter} ${String(shifted.getFullYear()).slice(-2)}`;
    }
    return String(now.getFullYear() + timeOffset);
  }, [selectedPeriod, timeOffset, dayAnchorDate]);

  const isEmptySummary =
    !summaryLoading &&
    !summaryError &&
    summary &&
    (!summary.chart_data || summary.chart_data.length === 0) &&
    (summary.total_income || 0) === 0 &&
    (summary.total_expected_income || 0) === 0 &&
    (summary.total_expense || 0) === 0;

  const sortedOperations = useMemo(() => {
    const copy = Array.isArray(expenses) ? [...expenses] : [];
    const dir = sortOrder === 'asc' ? 1 : -1;

    const safeDate = (v) => {
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : 0;
    };

    copy.sort((a, b) => {
      if (sortField === 'date') return (safeDate(a.date) - safeDate(b.date)) * dir;
      if (sortField === 'amount') return ((Number(a.amount) || 0) - (Number(b.amount) || 0)) * dir;
      if (sortField === 'name') return ((a.name || '').toString()).localeCompare((b.name || '').toString(), 'ru') * dir;
      if (sortField === 'type') return ((a.type || '').toString()).localeCompare((b.type || '').toString(), 'ru') * dir;
      return 0;
    });

    return copy;
  }, [expenses, sortField, sortOrder]);

  const chartAxisGranularity = summary?.chart_axis_granularity ?? 'day';
  const accountingChartTickFormatter = useCallback(
    (v) => formatAccountingChartTick(String(v), chartAxisGranularity),
    [chartAxisGranularity]
  );
  const financeChartPointCount = summary?.chart_data?.length ?? 0;
  const financeXAxisInterval = financeChartPointCount > 0 && financeChartPointCount <= 18 ? 0 : undefined;

  return (
    <div className="space-y-6">
      {!hasFinanceAccess && (
        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="text-sm text-gray-600">
            Нет доступа к Финансам. Нужна подписка Pro.
          </div>
        </div>
      )}

      {hasFinanceAccess && (
        <>
      {/* Заголовок страницы и налог — как у «Статистика»: один h1, secondary справа */}
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 lg:mb-6">
        <h1 className="text-xl font-bold leading-snug tracking-tight text-gray-900 lg:text-3xl">
          Финансы
        </h1>
        <div className="flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="text-gray-600">Налог:</span>
          <span className="text-base font-semibold tabular-nums" style={{ color: FINANCE_THEME.primaryGreen }}>
            {taxLoading ? '…' : `${currentTaxRate?.rate || 0}%`}
          </span>
          {taxError && (
            <span className="text-xs text-gray-500">{taxError}</span>
          )}
          <button
            type="button"
            onClick={() => setIsTaxModalOpen(true)}
            className="min-h-9 px-1 text-sm underline transition-colors"
            style={{ color: FINANCE_THEME.primaryGreen }}
            onMouseEnter={(e) => { e.currentTarget.style.color = FINANCE_THEME.primaryGreenHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = FINANCE_THEME.primaryGreen; }}
          >
            Изменить
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
      {/* Карточка фильтров и действий */}
      <div className="order-1 rounded-lg bg-white p-4 shadow sm:p-6 lg:p-5">
        {/* Desktop: пресеты периода + кнопка расхода на одной линии */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 sm:mb-2">
              Период
            </label>
            <div className="space-y-2">
              {/* Узкий viewport: один ряд + горизонтальный скролл без «ломаных» переносов; sm+: wrap */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/90 p-1.5">
                <div className="-mx-0.5 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-0.5 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:pb-0 sm:snap-none">
                  {Object.entries(periodLabels).map(([value, label]) => {
                    const active = selectedPeriod === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handlePeriodChange(value)}
                        className={`min-h-9 shrink-0 snap-start rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors sm:min-h-10 sm:px-3 sm:py-2 ${
                          active ? 'text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                        style={active ? { backgroundColor: FINANCE_THEME.primaryGreen } : undefined}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 lg:pt-[1.95rem]">
            <button
              type="button"
              onClick={() => {
                setEditingExpense(null);
                setIsExpenseModalOpen(true);
              }}
              className="min-h-11 w-full rounded-lg px-4 py-3 text-white transition-colors sm:w-auto sm:py-2 lg:min-h-10 lg:px-4 lg:py-2"
              style={{ backgroundColor: FINANCE_THEME.primaryGreen }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = FINANCE_THEME.primaryGreenHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = FINANCE_THEME.primaryGreen; }}
            >
              + Добавить расход
            </button>
          </div>
        </div>

        {/* Навигация периода (под пресетами, но визуально часть того же control-block) */}
        <div className="mt-3 lg:mt-2">
              <div className="rounded-lg border border-gray-200 bg-white px-1.5 py-1.5 shadow-sm">
                <div className="flex min-h-[2.25rem] items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleNavigate(-1)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
                    disabled={useCustomDates}
                    title="Предыдущий период"
                    aria-label="Предыдущий период"
                  >
                    <ChevronLeftIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={handleToday}
                    className="min-h-9 min-w-0 flex-1 rounded-md px-2 py-1.5 text-center text-sm font-semibold leading-tight transition-colors"
                    style={{ color: FINANCE_THEME.primaryGreen, backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => {
                      if (!useCustomDates) e.currentTarget.style.backgroundColor = FINANCE_THEME.periodNavHoverBg;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    disabled={useCustomDates}
                    title="Текущий период"
                  >
                    {currentPeriodLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate(1)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
                    disabled={useCustomDates}
                    title="Следующий период"
                    aria-label="Следующий период"
                  >
                    <ChevronRightIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                </div>
              </div>
        </div>

        {/* Свободный выбор дат: подсказка формата только в строке значения (как placeholder) */}
        <div className="mt-3 sm:mt-4 lg:mt-3">
          <label className="mb-1.5 block text-sm font-medium text-gray-700 sm:mb-2">
            Или выберите даты
          </label>
          <div className="grid min-w-0 grid-cols-2 gap-2 max-[230px]:grid-cols-1 sm:gap-3">
            <div className="min-w-0 rounded-lg border border-gray-300 bg-white px-2.5 py-2 shadow-sm [color-scheme:light] focus-within:border-green-600 focus-within:ring-2 focus-within:ring-green-600/20">
              <div className="relative flex min-h-[2.25rem] items-center gap-1.5">
                <CalendarDaysIcon className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={1.75} aria-hidden />
                <input
                  ref={startDateInputRef}
                  type="date"
                  value={startDate}
                  onChange={handleCustomStartChange}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-[0.0125] [color-scheme:light]"
                  aria-label={`Дата начала периода, формат ${DATE_DISPLAY_PLACEHOLDER}`}
                />
                <span
                  className={`pointer-events-none relative z-0 flex-1 select-none text-sm tabular-nums leading-snug ${
                    startDate ? 'text-gray-900' : 'text-gray-400'
                  }`}
                  aria-hidden
                >
                  {startDate ? ymdToDdMmYyyy(startDate) : DATE_DISPLAY_PLACEHOLDER}
                </span>
              </div>
            </div>
            <div className="min-w-0 rounded-lg border border-gray-300 bg-white px-2.5 py-2 shadow-sm [color-scheme:light] focus-within:border-green-600 focus-within:ring-2 focus-within:ring-green-600/20">
              <div className="relative flex min-h-[2.25rem] items-center gap-1.5">
                <CalendarDaysIcon className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={1.75} aria-hidden />
                <input
                  ref={endDateInputRef}
                  type="date"
                  value={endDate}
                  onChange={handleCustomEndChange}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-[0.0125] [color-scheme:light]"
                  aria-label={`Дата окончания периода, формат ${DATE_DISPLAY_PLACEHOLDER}`}
                />
                <span
                  className={`pointer-events-none relative z-0 flex-1 select-none text-sm tabular-nums leading-snug ${
                    endDate ? 'text-gray-900' : 'text-gray-400'
                  }`}
                  aria-hidden
                >
                  {endDate ? ymdToDdMmYyyy(endDate) : DATE_DISPLAY_PLACEHOLDER}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:bg-gray-50 sm:w-auto"
              title="Очистить даты"
            >
              Сбросить даты
            </button>
          </div>
        </div>
      </div>

      {/* Сводная панель — на телефоне 2×2, на lg ряд из 4 */}
      <div className="order-2 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {summaryLoading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg bg-white p-4 shadow sm:p-6">
                <div className="mb-3 h-4 w-2/3 rounded bg-gray-100" />
                <div className="h-8 w-1/2 rounded bg-gray-100" />
              </div>
            ))}
          </>
        ) : summaryError ? (
          <div className="col-span-2 rounded-lg bg-white p-4 shadow sm:p-6 lg:col-span-4">
            <div className="text-sm text-gray-600">{summaryError}</div>
          </div>
        ) : isEmptySummary ? (
          <div className="col-span-2 rounded-lg bg-white p-4 shadow sm:p-6 lg:col-span-4">
            <div className="text-sm text-gray-900 font-medium">Нет данных за период</div>
            <div className="text-sm text-gray-600 mt-1">Попробуйте выбрать другой период.</div>
          </div>
        ) : summary ? (
          <>
            <div className="flex flex-col rounded-lg bg-white p-4 shadow sm:p-6 lg:p-4">
              <div className="mb-1 text-xs text-gray-600 sm:text-sm">Подтвержденные доходы</div>
              <div
                className="flex min-h-[2rem] items-end text-2xl font-bold leading-none sm:min-h-[2.25rem] sm:text-3xl lg:min-h-[1.75rem]"
                style={{ color: FINANCE_THEME.primaryGreen }}
              >
                {summary.total_income?.toFixed(2) || 0} ₽
              </div>
              <div className="mt-2 min-h-[2.75rem] text-xs text-gray-500 lg:min-h-[2.1rem] lg:mt-1.5">
                С учетом налога {currentTaxRate?.rate || 0}%
                {summary.total_points_spent > 0 && (
                  <span className="mt-1 block text-orange-600">
                    Списанно баллов: {summary.total_points_spent?.toFixed(0) || 0} ₽
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col rounded-lg bg-white p-4 shadow sm:p-6 lg:p-4">
              <div className="mb-1 text-xs text-gray-600 sm:text-sm">Ожидаемые доходы</div>
              <div
                className="flex min-h-[2rem] items-end text-2xl font-bold leading-none sm:min-h-[2.25rem] sm:text-3xl lg:min-h-[1.75rem]"
                style={{ color: FINANCE_THEME.lightGreen }}
              >
                {summary.total_expected_income?.toFixed(2) || 0} ₽
              </div>
              <div className="mt-2 min-h-[2.75rem] text-xs text-gray-500 lg:min-h-[2.1rem] lg:mt-1.5" aria-hidden>
                {'\u00A0'}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow sm:p-6 lg:p-4">
              <div className="mb-1 text-xs text-gray-600 sm:text-sm">Расходы</div>
              <div className="text-2xl font-bold sm:text-3xl" style={{ color: FINANCE_THEME.lossRed }}>
                {summary.total_expense?.toFixed(2) || 0} ₽
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow sm:p-6 lg:p-4">
              <div className="mb-1 text-xs text-gray-600 sm:text-sm">Общая прибыль</div>
              <div
                className="text-2xl font-bold sm:text-3xl"
                style={{
                  color: summary.net_profit >= 0 ? FINANCE_THEME.primaryGreen : FINANCE_THEME.lossRed,
                }}
              >
                {summary.net_profit?.toFixed(2) || 0} ₽
              </div>
            </div>
          </>
        ) : (
          <div className="col-span-2 rounded-lg bg-white p-4 shadow sm:p-6 lg:col-span-4">
            <div className="text-sm text-gray-600">Данные не загружены</div>
          </div>
        )}
      </div>

      {/* Графики — на mobile ниже операций (order) */}
      <div className="order-4 grid grid-cols-1 gap-6 lg:order-3 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <h3 className="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">Доходы и расходы</h3>
          {summaryLoading ? (
            <div className="h-[240px] rounded bg-gray-50 sm:h-[280px] lg:h-[300px]" />
          ) : summaryError ? (
            <div className="text-sm text-gray-600">{summaryError}</div>
          ) : summary?.chart_data?.length ? (
            <div className="max-w-full overflow-x-auto overscroll-contain">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={summary.chart_data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={accountingChartTickFormatter}
                  interval={financeXAxisInterval}
                />
                <YAxis />
                <Tooltip labelFormatter={accountingChartTickFormatter} />
                <Legend />
                {/* Порядок: легенда и слои — сначала подтверждённые, затем ожидаемые, затем расходы; ожидаемые тоньше/мягче, чтобы снизить шум */}
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke={FINANCE_THEME.primaryGreen}
                  strokeWidth={2.6}
                  dot={false}
                  name="Подтверждённые доходы"
                />
                <Line
                  type="monotone"
                  dataKey="expected_income"
                  stroke={FINANCE_THEME.lightGreen}
                  strokeWidth={1.6}
                  strokeOpacity={0.92}
                  dot={false}
                  name="Ожидаемые доходы"
                />
                <Line
                  type="monotone"
                  dataKey="expense"
                  stroke={FINANCE_THEME.expenseRed}
                  strokeWidth={2}
                  dot={false}
                  name="Расходы"
                />
              </LineChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[240px] items-center justify-center text-sm text-gray-600 sm:h-[280px] lg:h-[300px]">
              Нет данных за период. Попробуйте выбрать другой период.
            </div>
          )}
        </div>

        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <h3 className="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">Общая прибыль</h3>
          {summaryLoading ? (
            <div className="h-[240px] rounded bg-gray-50 sm:h-[280px] lg:h-[300px]" />
          ) : summaryError ? (
            <div className="text-sm text-gray-600">{summaryError}</div>
          ) : summary?.chart_data?.length ? (
            <div className="max-w-full overflow-x-auto overscroll-contain">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={summary.chart_data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={accountingChartTickFormatter}
                  interval={financeXAxisInterval}
                />
                <YAxis />
                <Tooltip labelFormatter={accountingChartTickFormatter} />
                <Legend />
                <Line type="monotone" dataKey="net_profit" stroke={FINANCE_THEME.primaryGreen} name="Общая прибыль" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[240px] items-center justify-center text-sm text-gray-600 sm:h-[280px] lg:h-[300px]">
              Нет данных за период. Попробуйте выбрать другой период.
            </div>
          )}
        </div>
      </div>

      {/* Операции: карточки на mobile, таблица на lg+ */}
      <div className="order-3 rounded-lg border border-gray-200/90 bg-white shadow-sm lg:order-4">
        <div className="border-b p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold">Операции</h3>
            {SHOW_EXPORT && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <ArrowDownTrayIcon className="h-4 w-4 shrink-0 text-gray-600" strokeWidth={2} aria-hidden />
                  Экспорт CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('excel')}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <TableCellsIcon className="h-4 w-4 shrink-0 text-gray-600" strokeWidth={2} aria-hidden />
                  Экспорт Excel
                </button>
              </div>
            )}
          </div>
          
          {/* Фильтры: один горизонтальный ряд */}
          <div className="flex min-w-0 flex-row flex-nowrap items-end gap-2 sm:gap-3">
            <div className="min-w-0 flex-1 basis-0">
              <label className="mb-0.5 block text-[10px] font-medium leading-tight text-gray-600">
                Тип операции
              </label>
              <select
                value={operationTypeFilter}
                onChange={(e) => setOperationTypeFilter(e.target.value)}
                className="min-h-9 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs sm:text-sm"
              >
                <option value="all">Все операции</option>
                <option value="income">Только доходы</option>
                <option value="expense">Только расходы</option>
              </select>
            </div>
            <div className="min-w-0 flex-1 basis-0">
              <label className="mb-0.5 block text-[10px] font-medium leading-tight text-gray-600">
                Сортировка
              </label>
              <select
                value={`${sortField}_${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('_');
                  setSortField(field);
                  setSortOrder(order);
                }}
                className="min-h-9 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs sm:text-sm"
              >
                <option value="date_desc">Дата (новые сначала)</option>
                <option value="date_asc">Дата (старые сначала)</option>
                <option value="amount_desc">Сумма (по убыванию)</option>
                <option value="amount_asc">Сумма (по возрастанию)</option>
              </select>
            </div>
          </div>
          <p className="mt-1 text-[10px] leading-tight text-gray-500">
            Сортировка применяется только к текущей странице
          </p>
        </div>

        {operationsLoading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-600 sm:px-6">Загрузка операций…</div>
        ) : operationsError ? (
          <div className="px-4 py-8 text-center text-sm text-gray-600 sm:px-6">{operationsError}</div>
        ) : sortedOperations.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-600 sm:px-6">
            Нет данных за период. Попробуйте выбрать другой период.
          </div>
        ) : (
          <>
            <div className="space-y-2 px-2 pb-2 lg:hidden">
              {sortedOperations.map((operation) => (
                <div
                  key={operation.id}
                  className="rounded-lg border border-gray-200/95 bg-white px-2.5 py-2 shadow-sm sm:px-3"
                >
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] tabular-nums text-gray-500">
                          {formatFinanceDateDisplay(operation.date) || '-'}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0 text-[10px] font-medium leading-tight"
                          style={
                            operation.operation_type === 'income'
                              ? { backgroundColor: FINANCE_THEME.incomeChipBg, color: FINANCE_THEME.incomeChipText }
                              : { backgroundColor: FINANCE_THEME.expenseChipBg, color: FINANCE_THEME.expenseChipText }
                          }
                        >
                          {operation.type}
                        </span>
                      </div>
                      <p className="text-[13px] font-medium leading-snug text-gray-900">{operation.name}</p>
                      {operation.operation_type === 'income' ? (
                        <div className="space-y-0.5">
                          <div className="text-[11px] leading-snug text-gray-600">
                            Чистый:{' '}
                            <span className="font-semibold" style={{ color: FINANCE_THEME.primaryGreen }}>
                              {operation.net_amount ? operation.net_amount.toFixed(2) : operation.amount.toFixed(2)} ₽
                            </span>
                          </div>
                          <p className="text-[10px] leading-tight text-gray-500">
                            Исходная{' '}
                            <span className="font-medium text-gray-700">
                              {operation.gross_amount != null ? operation.gross_amount.toFixed(2) : '—'} ₽
                            </span>
                            <span className="text-gray-400"> · </span>
                            Налог{' '}
                            <span className="font-medium text-gray-700">
                              {operation.tax_rate != null ? operation.tax_rate.toFixed(1) : '0'}%
                            </span>
                          </p>
                        </div>
                      ) : (
                        <div className="text-[11px] text-gray-600">
                          Сумма:{' '}
                          <span className="font-semibold" style={{ color: FINANCE_THEME.lossRed }}>
                            {operation.amount.toFixed(2)} ₽
                          </span>
                        </div>
                      )}
                      {operation.operation_type !== 'expense' ? (
                        <p className="text-[10px] leading-tight text-gray-400">Только просмотр</p>
                      ) : null}
                    </div>
                    {operation.operation_type === 'expense' ? (
                      <div className="flex shrink-0 flex-col items-end gap-1 self-start pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingExpense(operation);
                            setIsExpenseModalOpen(true);
                          }}
                          className="min-h-8 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] shadow-sm"
                          style={{ color: FINANCE_THEME.primaryGreen }}
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(operation.id.replace('expense_', ''))}
                          className="min-h-8 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] shadow-sm"
                          style={{ color: FINANCE_THEME.lossRed }}
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto lg:block">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('date')}
                >
                  <span className="inline-flex items-center gap-1">
                    Дата
                    {sortField === 'date' &&
                      (sortOrder === 'asc' ? (
                        <ArrowUpIcon className="h-3.5 w-3.5 text-gray-500" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <ArrowDownIcon className="h-3.5 w-3.5 text-gray-500" strokeWidth={2.5} aria-hidden />
                      ))}
                  </span>
                </th>
                <th 
                  className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('name')}
                >
                  <span className="inline-flex items-center gap-1">
                    Название
                    {sortField === 'name' &&
                      (sortOrder === 'asc' ? (
                        <ArrowUpIcon className="h-3.5 w-3.5 text-gray-500" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <ArrowDownIcon className="h-3.5 w-3.5 text-gray-500" strokeWidth={2.5} aria-hidden />
                      ))}
                  </span>
                </th>
                <th 
                  className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('type')}
                >
                  <span className="inline-flex items-center gap-1">
                    Тип операции
                    {sortField === 'type' &&
                      (sortOrder === 'asc' ? (
                        <ArrowUpIcon className="h-3.5 w-3.5 text-gray-500" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <ArrowDownIcon className="h-3.5 w-3.5 text-gray-500" strokeWidth={2.5} aria-hidden />
                      ))}
                  </span>
                </th>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Исходная сумма
                </th>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Налог (%)
                </th>
                <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Чистый доход
                </th>
                <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {sortedOperations.map((operation) => (
                <tr key={operation.id}>
                  <td className="whitespace-nowrap px-3 py-1.5 text-[11px] tabular-nums text-gray-900">
                    {formatFinanceDateDisplay(operation.date) || '-'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-900">
                    {operation.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs">
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px]"
                      style={
                        operation.operation_type === 'income'
                          ? { backgroundColor: FINANCE_THEME.incomeChipBg, color: FINANCE_THEME.incomeChipText }
                          : { backgroundColor: FINANCE_THEME.expenseChipBg, color: FINANCE_THEME.expenseChipText }
                      }
                    >
                      {operation.type}
                    </span>
                  </td>
                  {operation.operation_type === 'income' ? (
                    <>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-900">
                        {operation.gross_amount ? operation.gross_amount.toFixed(2) : '-'} ₽
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-900">
                        {operation.tax_rate ? operation.tax_rate.toFixed(1) : '0'}%
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-1.5 text-xs font-medium"
                        style={{ color: FINANCE_THEME.primaryGreen }}
                      >
                        {operation.net_amount ? operation.net_amount.toFixed(2) : operation.amount.toFixed(2)} ₽
                      </td>
                    </>
                  ) : (
                    <>
                      <td
                        className="whitespace-nowrap px-3 py-1.5 text-xs font-medium"
                        style={{ color: FINANCE_THEME.lossRed }}
                      >
                        {Math.abs(operation.amount).toFixed(2)} ₽
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-500">
                        -
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-1.5 text-xs font-medium"
                        style={{ color: FINANCE_THEME.lossRed }}
                      >
                        {operation.amount.toFixed(2)} ₽
                      </td>
                    </>
                  )}
                  <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs text-gray-500">
                    {operation.operation_type === 'expense' ? (
                      <div className="inline-flex flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingExpense(operation);
                            setIsExpenseModalOpen(true);
                          }}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] shadow-sm"
                          style={{ color: FINANCE_THEME.primaryGreen }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = FINANCE_THEME.primaryGreenHover; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = FINANCE_THEME.primaryGreen; }}
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(operation.id.replace('expense_', ''))}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] shadow-sm transition-colors"
                          style={{ color: FINANCE_THEME.lossRed }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#B71C1C'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = FINANCE_THEME.lossRed; }}
                        >
                          Удалить
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-400">Только просмотр</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          </>
        )}

        {/* Пагинация */}
        {totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="text-sm text-gray-600">
              Страница {currentPage} из {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded border border-gray-300 px-3 py-2 hover:bg-gray-50 disabled:opacity-50 sm:flex-none sm:py-1"
              >
                <ChevronLeftIcon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                Назад
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded border border-gray-300 px-3 py-2 hover:bg-gray-50 disabled:opacity-50 sm:flex-none sm:py-1"
              >
                Вперёд
                <ChevronRightIcon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Модальное окно расхода */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setEditingExpense(null);
        }}
        expense={editingExpense}
        onSuccess={() => {
          loadOperations();
          loadSummary();
        }}
      />

      {/* Модальное окно налоговой ставки */}
      <TaxRateModal
        isOpen={isTaxModalOpen}
        onClose={() => setIsTaxModalOpen(false)}
        onSuccess={handleTaxRateSuccess}
      />
      </>
      )}
    </div>
  );
}
