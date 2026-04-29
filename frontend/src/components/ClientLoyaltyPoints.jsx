import React, { useState, useEffect } from 'react'
import { apiGet } from '../utils/api'
import { Link } from 'react-router-dom'

export default function ClientLoyaltyPoints({ onShowHistory }) {
  const [points, setPoints] = useState([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPoints()
  }, [])

  const loadPoints = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await apiGet('/api/client/loyalty/points')
      // Новый контракт API: объект с masters и total_balance
      setPoints(data?.masters || [])
      setTotalBalance(data?.total_balance || 0)
    } catch (err) {
      // Тихая обработка ошибки без спама в консоль
      setError('temporary_unavailable')
      setPoints([])
      setTotalBalance(0)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-500">
          Информация о баллах временно недоступна
        </p>
      </div>
    )
  }

  if (points.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-500">
          Пока нет начисленных баллов
        </p>
      </div>
    )
  }

  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b">
          <th className="py-2 px-3">Мастер</th>
          <th className="py-2 px-3">Баланс</th>
        </tr>
      </thead>
      <tbody>
        {points.map((masterPoints) => (
          <tr key={masterPoints.master_id} className="border-b hover:bg-gray-50">
            <td className="py-2 px-3">
              {masterPoints.master_domain ? (
                <Link 
                  to={`/m/${masterPoints.master_domain}`}
                  className="text-green-600 hover:text-green-800 hover:underline font-medium"
                >
                  {masterPoints.master_name}
                </Link>
              ) : (
                <span className="font-medium text-gray-900">{masterPoints.master_name}</span>
              )}
            </td>
            <td className="py-2 px-3">
              <span className="font-semibold text-gray-900">{masterPoints.balance} баллов</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

