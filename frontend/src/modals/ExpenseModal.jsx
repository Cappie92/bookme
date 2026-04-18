import { useState, useEffect } from 'react';
import { apiFetch, apiGet } from '../utils/api';
import { useModal } from '../hooks/useModal';

export default function ExpenseModal({ isOpen, onClose, expense, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    expense_type: 'one_time',
    amount: '',
    recurrence_type: 'monthly',
    condition_type: 'has_bookings',
    service_id: '',
    expense_date: new Date().toISOString().split('T')[0]
  });
  
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const hasServices = services.length > 0;

  useEffect(() => {
    if (isOpen) {
      loadServices();
      if (expense) {
        setFormData({
          name: expense.name || '',
          expense_type: expense.expense_type || 'one_time',
          amount: expense.amount || '',
          recurrence_type: expense.recurrence_type || 'monthly',
          condition_type: expense.condition_type || 'has_bookings',
          service_id: expense.service_id || '',
          expense_date: expense.expense_date ? expense.expense_date.split('T')[0] : new Date().toISOString().split('T')[0]
        });
      } else {
        setFormData({
          name: '',
          expense_type: 'one_time',
          amount: '',
          recurrence_type: 'monthly',
          condition_type: 'has_bookings',
          service_id: '',
          expense_date: new Date().toISOString().split('T')[0]
        });
      }
    }
  }, [isOpen, expense]);

  const loadServices = async () => {
    try {
      const data = await apiGet('/api/master/services');
      const servicesList = Array.isArray(data) ? data : (data?.services || []);
      setServices(servicesList);
    } catch (err) {
      console.error('Ошибка при загрузке услуг:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setLoading(true);

    try {
      const nextErrors = {};
      const trimmedName = (formData.name || '').trim();
      const amountValue = parseFloat(formData.amount);

      if (!trimmedName) nextErrors.name = 'Введите название';
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        nextErrors.amount = 'Укажите сумму больше 0';
      }

      if (formData.expense_type === 'one_time' && !formData.expense_date) {
        nextErrors.expense_date = 'Выберите дату';
      }

      if (formData.expense_type === 'recurring') {
        if (!formData.recurrence_type) nextErrors.recurrence_type = 'Выберите тип цикла';
        if (formData.recurrence_type === 'conditional' && !formData.condition_type) {
          nextErrors.condition_type = 'Выберите условие';
        }
      }

      if (formData.expense_type === 'service_based') {
        if (!formData.service_id) nextErrors.service_id = 'Выберите услугу';
        if (services.length === 0) nextErrors.service_id = 'Нет услуг для выбора';
      }

      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        setLoading(false);
        return;
      }

      const payload = {
        name: trimmedName,
        expense_type: formData.expense_type,
        amount: amountValue,
      };

      if (formData.expense_type === 'recurring') {
        payload.recurrence_type = formData.recurrence_type;
        if (formData.recurrence_type === 'conditional') {
          payload.condition_type = formData.condition_type;
        }
      }

      if (formData.expense_type === 'service_based') {
        payload.service_id = parseInt(formData.service_id);
      }

      if (formData.expense_type === 'one_time') {
        payload.expense_date = new Date(formData.expense_date).toISOString();
      }

      // Backend ожидает параметры в query-string (не JSON body).
      const params = new URLSearchParams();
      Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined || value === null || Number.isNaN(value)) return;
        params.set(key, String(value));
      });

      const endpoint = expense
        ? `/api/master/accounting/expenses/${expense.id}?${params.toString()}`
        : `/api/master/accounting/expenses?${params.toString()}`;

      const response = await apiFetch(endpoint, { method: expense ? 'PUT' : 'POST' });
      if (!response.ok) {
        const txt = await response.text().catch(() => '');
        throw new Error(txt || `HTTP ${response.status}`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err?.message || 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const { handleBackdropClick, handleMouseDown } = useModal(onClose);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">
          {expense ? 'Редактировать расход' : 'Добавить расход'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Название расхода *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (fieldErrors.name) {
                  setFieldErrors({ ...fieldErrors, name: undefined });
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
            {fieldErrors.name && (
              <div className="text-xs text-red-600 mt-1">{fieldErrors.name}</div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тип расхода *
            </label>
            <select
              value={formData.expense_type}
              onChange={(e) => {
                setFormData({ ...formData, expense_type: e.target.value });
                if (fieldErrors.expense_type) {
                  setFieldErrors({ ...fieldErrors, expense_type: undefined });
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            >
              <option value="one_time">Разовый</option>
              <option value="recurring">Циклический</option>
              <option value="service_based" disabled={!hasServices}>По услуге</option>
            </select>
          </div>

          {formData.expense_type === 'recurring' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Тип цикла *
              </label>
              <select
                value={formData.recurrence_type}
              onChange={(e) => {
                setFormData({ ...formData, recurrence_type: e.target.value });
                if (fieldErrors.recurrence_type) {
                  setFieldErrors({ ...fieldErrors, recurrence_type: undefined });
                }
              }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              >
                <option value="daily">Ежедневно</option>
                <option value="weekly">Еженедельно</option>
                <option value="monthly">Ежемесячно</option>
                <option value="conditional">Условный</option>
              </select>
            {fieldErrors.recurrence_type && (
              <div className="text-xs text-red-600 mt-1">{fieldErrors.recurrence_type}</div>
            )}
            </div>
          )}

          {formData.expense_type === 'recurring' && formData.recurrence_type === 'conditional' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Условие *
              </label>
              <select
                value={formData.condition_type}
              onChange={(e) => {
                setFormData({ ...formData, condition_type: e.target.value });
                if (fieldErrors.condition_type) {
                  setFieldErrors({ ...fieldErrors, condition_type: undefined });
                }
              }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              >
                <option value="has_bookings">День с записями</option>
                <option value="schedule_open">Расписание открыто</option>
              </select>
            {fieldErrors.condition_type && (
              <div className="text-xs text-red-600 mt-1">{fieldErrors.condition_type}</div>
            )}
            </div>
          )}

          {formData.expense_type === 'service_based' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Услуга *
              </label>
              <select
                value={formData.service_id}
              onChange={(e) => {
                setFormData({ ...formData, service_id: e.target.value });
                if (fieldErrors.service_id) {
                  setFieldErrors({ ...fieldErrors, service_id: undefined });
                }
              }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
              disabled={!hasServices}
              >
                <option value="">Выберите услугу</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            {!hasServices && (
              <div className="text-xs text-gray-500 mt-1">Нет услуг для выбора</div>
            )}
            {fieldErrors.service_id && (
              <div className="text-xs text-red-600 mt-1">{fieldErrors.service_id}</div>
            )}
            </div>
          )}

          {formData.expense_type === 'one_time' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата расхода *
              </label>
              <input
                type="date"
                value={formData.expense_date}
              onChange={(e) => {
                setFormData({ ...formData, expense_date: e.target.value });
                if (fieldErrors.expense_date) {
                  setFieldErrors({ ...fieldErrors, expense_date: undefined });
                }
              }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              />
            {fieldErrors.expense_date && (
              <div className="text-xs text-red-600 mt-1">{fieldErrors.expense_date}</div>
            )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Стоимость (₽) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => {
                setFormData({ ...formData, amount: e.target.value });
                if (fieldErrors.amount) {
                  setFieldErrors({ ...fieldErrors, amount: undefined });
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
            {fieldErrors.amount && (
              <div className="text-xs text-red-600 mt-1">{fieldErrors.amount}</div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

