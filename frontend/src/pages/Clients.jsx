import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Clients() {
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    const role = (user?.role || localStorage.getItem('user_role') || '').toString().toLowerCase()
    if (role === 'master' || role === 'indie') {
      navigate('/master?tab=clients', { replace: true })
      return
    }
    // Защита от регрессии: лог при показе заглушки
    console.warn(
      '[Clients.jsx] Показана заглушка «Раздел в разработке». ' +
      'Мастера перенаправляются на /master?tab=clients. Роль:',
      role || 'не определена'
    )
  }, [user?.role, navigate])

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-4">Клиенты</h1>
      <p className="text-gray-600">Раздел в разработке</p>
    </div>
  )
}
