import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import {
  ComposedChart,
  Bar,
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

export default function MasterAccounting() {
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [timeOffset, setTimeOffset] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    loadSummary();
    loadOperations();
    loadCurrentTaxRate();
  }, [selectedPeriod, timeOffset, startDate, endDate, useCustomDates, currentPage, sortField, sortOrder, operationTypeFilter]);

  const loadSummary = async () => {
    try {
      setLoading(true);
      let url = `/api/master/accounting/summary?period=${selectedPeriod}&offset=${timeOffset}`;
      
      if (useCustomDates && startDate && endDate) {
        url = `/api/master/accounting/summary?start_date=${startDate}&end_date=${endDate}`;
      }
      
      const data = await apiGet(url);
      setSummary(data);
    } catch (error) {
      console.error('Ошибка при загрузке сводки:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOperations = async () => {
    try {
      let url = `/api/master/accounting/operations?page=${currentPage}&limit=20`;
      
      if (useCustomDates && startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
      }
      
      if (operationTypeFilter !== 'all') {
        url += `&operation_type=${operationTypeFilter}`;
      }
      
      const data = await apiGet(url);
      setExpenses(data.operations || []);
      setTotalPages(data.pages || 1);
    } catch (error) {
      console.error('Ошибка при загрузке операций:', error);
    }
  };

  const loadCurrentTaxRate = async () => {
    try {
      const data = await apiGet('/api/master/tax-rates/current');
      setCurrentTaxRate(data);
    } catch (error) {
      console.error('Ошибка при загрузке налоговой ставки:', error);
    }
  };

  const handlePeriodChange = (newPeriod) => {
    setSelectedPeriod(newPeriod);
    setTimeOffset(0);
    setUseCustomDates(false);
  };

  const handleNavigate = (direction) => {
    setTimeOffset(prev => prev + direction);
  };

  const handleToday = () => {
    setTimeOffset(0);
  };

  const handleExport = async (format) => {
    try {
      let url = `/api/master/accounting/export?format=${format}`;
      
      if (useCustomDates && startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
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

  const periodLabels = {
    day: 'День',
    week: 'Неделя',
    month: 'Месяц',
    quarter: 'Квартал',
    year: 'Год'
  };

  return (
    <div className="space-y-6">
      {/* Заголовок и фильтры */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">Финансы</h2>
          <div className="flex items-center gap-3">
            {/* Поле налога */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Налог:</span>
              <span className="text-lg font-semibold text-blue-600">
                {currentTaxRate?.rate || 0}%
              </span>
              <button
                onClick={() => setIsTaxModalOpen(true)}
                className="text-blue-600 hover:text-blue-800 text-sm underline"
              >
                Изменить
              </button>
            </div>
            <button
              onClick={() => {
                setEditingExpense(null);
                setIsExpenseModalOpen(true);
              }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              + Добавить расход
            </button>
          </div>
        </div>

        {/* Фильтры периода */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Период
            </label>
            <div className="flex gap-2">
              <select
                value={selectedPeriod}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
                disabled={useCustomDates}
              >
                {Object.entries(periodLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button
                onClick={() => handleNavigate(-1)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={useCustomDates}
                title="Предыдущий период"
              >
                ← Назад
              </button>
              <button
                onClick={handleToday}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={useCustomDates}
                title="Сегодня"
              >
                Сегодня
              </button>
              <button
                onClick={() => handleNavigate(1)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={useCustomDates}
                title="Следующий период"
              >
                Вперед →
              </button>
            </div>
          </div>
        </div>

        {/* Свободный выбор дат */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Или выберите даты
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (e.target.value) {
                  setUseCustomDates(true);
                  if (!endDate) {
                    setEndDate(e.target.value);
                  }
                } else if (!endDate) {
                  setUseCustomDates(false);
                }
              }}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
              placeholder="От"
            />
            <span className="flex items-center text-gray-500">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                if (e.target.value) {
                  setUseCustomDates(true);
                  if (!startDate) {
                    setStartDate(e.target.value);
                  }
                } else if (!startDate) {
                  setUseCustomDates(false);
                }
              }}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
              placeholder="До"
            />
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setUseCustomDates(false);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              title="Очистить даты"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Сводная панель */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Подтвержденные доходы (чистые)</div>
            <div className="text-3xl font-bold text-green-600">
              {summary.total_income?.toFixed(2) || 0} ₽
            </div>
            <div className="text-xs text-gray-500 mt-1">
              С учетом налога {currentTaxRate?.rate || 0}%
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Ожидаемые доходы</div>
            <div className="text-3xl font-bold text-blue-600">
              {summary.total_expected_income?.toFixed(2) || 0} ₽
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Расходы</div>
            <div className="text-3xl font-bold text-red-600">
              {summary.total_expense?.toFixed(2) || 0} ₽
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Общая прибыль</div>
            <div className={`text-3xl font-bold ${summary.net_profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {summary.net_profit?.toFixed(2) || 0} ₽
            </div>
          </div>
        </div>
      )}

      {/* Графики */}
      {summary && summary.chart_data && summary.chart_data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* График доходов и расходов */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Доходы и расходы</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={summary.chart_data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                {/* Ожидаемые доходы - голубой */}
                <Bar dataKey="expected_income" fill="#64B5F6" name="Ожидаемые доходы" />
                {/* Подтвержденные доходы (чистые) - зеленый */}
                <Bar dataKey="income" fill="#4CAF50" name="Подтвержденные доходы (чистые)" />
                {/* Расходы - красный */}
                <Bar dataKey="expense" fill="#F44336" name="Расходы" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* График чистой прибыли */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Общая прибыль</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={summary.chart_data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="net_profit" stroke="#2196F3" name="Общая прибыль" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Таблица операций */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Операции</h3>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport('csv')}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                📥 Экспорт CSV
              </button>
              <button
                onClick={() => handleExport('excel')}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                📊 Экспорт Excel
              </button>
            </div>
          </div>
          
          {/* Фильтры */}
          <div className="flex gap-4 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Тип операции
              </label>
              <select
                value={operationTypeFilter}
                onChange={(e) => setOperationTypeFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="all">Все операции</option>
                <option value="income">Только доходы</option>
                <option value="expense">Только расходы</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Сортировка
              </label>
              <select
                value={`${sortField}_${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('_');
                  setSortField(field);
                  setSortOrder(order);
                }}
                className="border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="date_desc">Дата (новые сначала)</option>
                <option value="date_asc">Дата (старые сначала)</option>
                <option value="amount_desc">Сумма (по убыванию)</option>
                <option value="amount_asc">Сумма (по возрастанию)</option>
                <option value="name_asc">Название (А-Я)</option>
                <option value="name_desc">Название (Я-А)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('date')}
                >
                  Дата {sortField === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('name')}
                >
                  Название {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('type')}
                >
                  Тип операции {sortField === 'type' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Исходная сумма
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Налог (%)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Чистый доход
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {expenses.map((operation) => (
                <tr key={operation.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {operation.date ? new Date(operation.date).toLocaleDateString('ru-RU') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {operation.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      operation.operation_type === 'income' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {operation.type}
                    </span>
                  </td>
                  {operation.operation_type === 'income' ? (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {operation.gross_amount ? operation.gross_amount.toFixed(2) : '-'} ₽
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {operation.tax_rate ? operation.tax_rate.toFixed(1) : '0'}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                        {operation.net_amount ? operation.net_amount.toFixed(2) : operation.amount.toFixed(2)} ₽
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                        {Math.abs(operation.amount).toFixed(2)} ₽
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        -
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                        {operation.amount.toFixed(2)} ₽
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {operation.operation_type === 'expense' ? (
                      <>
                        <button
                          onClick={() => {
                            setEditingExpense(operation);
                            setIsExpenseModalOpen(true);
                          }}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(operation.id.replace('expense_', ''))}
                          className="text-red-600 hover:text-red-900"
                        >
                          Удалить
                        </button>
                      </>
                    ) : (
                      <span className="text-gray-400">Только просмотр</span>
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
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                ← Назад
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Вперед →
              </button>
            </div>
          </div>
        )}
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
    </div>
  );
}
