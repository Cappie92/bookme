import { useState, useEffect } from 'react';
import { apiFetch, apiGet } from '../utils/api';
import { useModal } from '../hooks/useModal';

export default function TaxRateModal({ isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    rate: '',
    effective_from_date: '',
    recalculate_existing: false
  });
  const [currentRate, setCurrentRate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadCurrentRate();
    }
  }, [isOpen]);

  const loadCurrentRate = async () => {
    try {
      const data = await apiGet('/api/master/tax-rates/current');
      setCurrentRate(data);
      
      // Устанавливаем сегодняшнюю дату по умолчанию
      const today = new Date().toISOString().split('T')[0];
      setFormData(prev => ({
        ...prev,
        effective_from_date: today
      }));
    } catch (error) {
      console.error('Ошибка при загрузке текущей ставки:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Валидация
      const rate = parseFloat(formData.rate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        setError('Налоговая ставка должна быть от 0 до 100%');
        return;
      }

      if (!formData.effective_from_date) {
        setError('Укажите дату вступления в силу');
        return;
      }

      // Backend ожидает параметры в query-string (не JSON body).
      const params = new URLSearchParams();
      params.set('rate', String(rate));
      params.set('effective_from_date', formData.effective_from_date);
      params.set('recalculate_existing', String(!!formData.recalculate_existing));

      const response = await apiFetch(`/api/master/tax-rates/?${params.toString()}`, {
        method: 'POST'
      });
      if (!response.ok) {
        const txt = await response.text().catch(() => '');
        throw new Error(txt || `HTTP ${response.status}`);
      }

      if (onSuccess) {
        onSuccess();
      }
      
      onClose();
      
      // Сброс формы
      setFormData({
        rate: '',
        effective_from_date: '',
        recalculate_existing: false
      });
    } catch (error) {
      setError(error?.message || 'Ошибка при сохранении налоговой ставки');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    setFormData({
      rate: '',
      effective_from_date: '',
      recalculate_existing: false
    });
    onClose();
  };

  const { handleBackdropClick, handleMouseDown } = useModal(onClose);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Изменить налог</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {currentRate && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              Текущая ставка: <span className="font-semibold">{currentRate.rate}%</span>
              {currentRate.effective_from_date && (
                <span className="ml-2">(действует с {new Date(currentRate.effective_from_date).toLocaleDateString('ru-RU')})</span>
              )}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Новая ставка налога (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={formData.rate}
              onChange={(e) => setFormData(prev => ({ ...prev, rate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Применить с даты
            </label>
            <input
              type="date"
              value={formData.effective_from_date}
              onChange={(e) => setFormData(prev => ({ ...prev, effective_from_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="recalculate_existing"
              checked={formData.recalculate_existing}
              onChange={(e) => setFormData(prev => ({ ...prev, recalculate_existing: e.target.checked }))}
              className="mr-2"
            />
            <label htmlFor="recalculate_existing" className="text-sm text-gray-700">
              Пересчитать все существующие доходы
            </label>
          </div>

          {formData.recalculate_existing && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ Внимание! При включении этой опции все подтвержденные доходы начиная с указанной даты будут пересчитаны с новой налоговой ставкой.
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">
            💡 Налог указывается только для внутренних расчетов и ни на что не влияет, кроме большей прозрачности собственного заработка.
          </p>
        </div>
      </div>
    </div>
  );
}

