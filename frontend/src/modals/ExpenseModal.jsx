import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut } from '../utils/api';

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
      setServices(data.services || []);
    } catch (err) {
      console.error('Ошибка при загрузке услуг:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        name: formData.name,
        expense_type: formData.expense_type,
        amount: parseFloat(formData.amount),
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

      if (expense) {
        // Редактирование
        await apiPut(`/api/master/accounting/expenses/${expense.id}`, payload);
      } else {
        // Создание
        await apiPost('/api/master/accounting/expenses', payload);
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">
          {expense ? 'Редактировать расход' : 'Добавить расход'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Название расхода *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тип расхода *
            </label>
            <select
              value={formData.expense_type}
              onChange={(e) => setFormData({ ...formData, expense_type: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            >
              <option value="one_time">Разовый</option>
              <option value="recurring">Циклический</option>
              <option value="service_based">По услуге</option>
            </select>
          </div>

          {formData.expense_type === 'recurring' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Тип цикла *
              </label>
              <select
                value={formData.recurrence_type}
                onChange={(e) => setFormData({ ...formData, recurrence_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              >
                <option value="daily">Ежедневно</option>
                <option value="weekly">Еженедельно</option>
                <option value="monthly">Ежемесячно</option>
                <option value="conditional">Условный</option>
              </select>
            </div>
          )}

          {formData.expense_type === 'recurring' && formData.recurrence_type === 'conditional' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Условие *
              </label>
              <select
                value={formData.condition_type}
                onChange={(e) => setFormData({ ...formData, condition_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              >
                <option value="has_bookings">День с записями</option>
                <option value="schedule_open">Расписание открыто</option>
              </select>
            </div>
          )}

          {formData.expense_type === 'service_based' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Услуга *
              </label>
              <select
                value={formData.service_id}
                onChange={(e) => setFormData({ ...formData, service_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              >
                <option value="">Выберите услугу</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
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
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              />
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
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
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

