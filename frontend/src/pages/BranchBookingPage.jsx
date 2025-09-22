import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import BranchBookingModule from '../components/booking/BranchBookingModule'

export default function BranchBookingPage() {
  const { salonId, branchId } = useParams()
  const navigate = useNavigate()
  const [salon, setSalon] = useState(null)
  const [branch, setBranch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadSalonAndBranch()
  }, [salonId, branchId])

  const loadSalonAndBranch = async () => {
    try {
      setLoading(true)
      
      // Загружаем информацию о салоне
      const salonResponse = await fetch(`/salon/profile/public?salon_id=${salonId}`)
      if (!salonResponse.ok) {
        throw new Error('Салон не найден')
      }
      const salonData = await salonResponse.json()
      setSalon(salonData)

      // Загружаем информацию о филиале
      const branchResponse = await fetch(`/salon/branches/public?salon_id=${salonId}`)
      if (!branchResponse.ok) {
        throw new Error('Филиал не найден')
      }
      const branchData = await branchResponse.json()
      const currentBranch = branchData.branches.find(b => b.id === parseInt(branchId))
      
      if (!currentBranch) {
        throw new Error('Филиал не найден')
      }
      
      setBranch(currentBranch)
    } catch (error) {
      console.error('Ошибка загрузки данных:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBookingSuccess = (booking) => {
    console.log('Бронирование создано:', booking)
    // Можно добавить редирект или показать уведомление
  }

  const handleBookingError = (error) => {
    console.error('Ошибка бронирования:', error)
    setError(error)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50] mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Ошибка</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="bg-[#4CAF50] text-white px-6 py-2 rounded-lg hover:bg-[#45A049]"
            >
              Вернуться на главную
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!salon || !branch) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Не найдено</h1>
            <p className="text-gray-600 mb-6">Салон или филиал не найден</p>
            <button
              onClick={() => navigate('/')}
              className="bg-[#4CAF50] text-white px-6 py-2 rounded-lg hover:bg-[#45A049]"
            >
              Вернуться на главную
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Заголовок */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Запись в филиал "{branch.name}"
          </h1>
          <p className="text-lg text-gray-600">
            {salon.name} • {branch.address}
          </p>
        </div>

        {/* Форма бронирования */}
        <BranchBookingModule
          salonId={parseInt(salonId)}
          branchId={parseInt(branchId)}
          onBookingSuccess={handleBookingSuccess}
          onBookingError={handleBookingError}
          title="Запись на услугу"
        />
      </div>
    </div>
  )
} 