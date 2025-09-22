import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../utils/api';

export default function ClientDashboardStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await apiGet('/client/dashboard/stats');
      setStats(data);
    } catch (error) {
      console.error('Ошибка при загрузке статистики:', error);
      setError('Не удалось загрузить статистику');
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
          onClick={loadStats}
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
      {/* Основная статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-blue-500">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Прошлых записей</p>
              <p className="text-2xl font-semibold text-gray-900">{stats && stats.past_bookings ? stats.past_bookings : 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Будущих записей</p>
              <p className="text-2xl font-semibold text-gray-900">{stats && stats.future_bookings ? stats.future_bookings : 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Любимых салонов</p>
              <p className="text-2xl font-semibold text-gray-900">{stats && stats.top_salons ? stats.top_salons.length : 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Любимых мастеров</p>
              <p className="text-2xl font-semibold text-gray-900">{stats && stats.top_masters ? stats.top_masters.length : 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Топ салонов */}
      {stats && stats.top_salons && stats.top_salons.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-3">Топ салонов</h3>
          <div className="space-y-2">
            {stats.top_salons.slice(0, 3).map((salon, index) => (
              <div key={salon.salon_id} className="flex justify-between items-center">
                <span className="text-sm">{salon.salon_name}</span>
                <span className="text-sm font-medium">{salon.booking_count} записей</span>
              </div>
            ))}
          </div>
        </div>
      )}
        
      {stats && stats.top_masters && stats.top_masters.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-3">Топ мастеров</h3>
          <div className="space-y-2">
            {stats.top_masters.slice(0, 3).map((master, index) => (
              <div key={master.master_id} className="flex justify-between items-center">
                <span className="text-sm">{master.master_name}</span>
                <span className="text-sm font-medium">{master.booking_count} записей</span>
              </div>
            ))}
          </div>
        </div>
      )}
        
      {stats && stats.top_indie_masters && stats.top_indie_masters.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-3">Топ индивидуальных мастеров</h3>
          <div className="space-y-2">
            {stats.top_indie_masters.slice(0, 3).map((master, index) => (
              <div key={master.indie_master_id} className="flex justify-between items-center">
                <span className="text-sm">{master.indie_master_name}</span>
                <span className="text-sm font-medium">{master.booking_count} записей</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Управляемые филиалы */}
      {stats && stats.managed_branches && stats.managed_branches.length > 0 && (
        <div className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-green-500">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Управляемые филиалы</h3>
          <div className="space-y-3">
            {stats.managed_branches.map((branch) => (
              <div key={branch.branch_id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{branch.branch_name}</p>
                  <p className="text-sm text-gray-600">{branch.salon_name}</p>
                </div>
                <button
                  onClick={() => navigate(`/branch/manage/${branch.branch_id}`)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Управлять
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Незаполненные данные профиля */}
      {stats && stats.missing_profile_data && stats.missing_profile_data.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-yellow-800 mb-4">⚠️ Заполните недостающие данные</h3>
          <div className="space-y-2">
            {stats.missing_profile_data.map((field) => (
              <p key={field} className="text-yellow-700">• {field}</p>
            ))}
          </div>
          <button
            onClick={() => navigate('/client/profile')}
            className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            Заполнить профиль
          </button>
        </div>
      )}
    </div>
  );
}
