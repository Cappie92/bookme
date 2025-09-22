import React, { useState, useEffect } from 'react'
import { Button } from './ui'
import { apiGet } from '../utils/api'

const ManagerInvitations = () => {
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(false)

  const loadInvitations = async () => {
    try {
      setLoading(true)
      
      // Пока что этот endpoint не реализован, возвращаем пустой массив
      setInvitations([])
    } catch (error) {
      console.error('Ошибка при загрузке приглашений:', error)
      setInvitations([])
    } finally {
      setLoading(false)
    }
  }

  const respondToInvitation = async (invitationId, branchId, status, message = '') => {
    try {
      const response = await fetch(`/salon/branches/${branchId}/invitations/${invitationId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: status,
          message: message
        })
      })
      
      if (response.ok) {
        alert(status === 'accepted' ? 'Приглашение принято!' : 'Приглашение отклонено')
        loadInvitations() // Перезагружаем список
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка ответа на приглашение')
      }
    } catch (error) {
      console.error('Ошибка ответа на приглашение:', error)
      alert(`Ошибка: ${error.message}`)
    }
  }

  useEffect(() => {
    loadInvitations()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4CAF50]"></div>
      </div>
    )
  }

  if (invitations.length === 0) {
    return null // Не показываем компонент, если нет приглашений
  }

  const pendingInvitations = invitations.filter(inv => inv.status === 'pending')

  if (pendingInvitations.length === 0) {
    return null
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Приглашения стать управляющим филиала
      </h2>
      
      <div className="space-y-4">
        {pendingInvitations.map((invitation) => (
          <div key={invitation.id} className="border border-[#4CAF50] rounded-lg p-4 bg-[#DFF5EC]">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium text-[#2E7D32] mb-2">
                  Приглашение от {invitation.salon_name}
                </h3>
                <p className="text-sm text-[#2E7D32] mb-2">
                  <strong>Филиал:</strong> {invitation.branch_name}
                </p>
                <p className="text-sm text-[#2E7D32] mb-2">
                  <strong>Должность:</strong> Управляющий филиалом
                </p>
                {invitation.message && (
                  <p className="text-sm text-[#2E7D32] mb-3">
                    <strong>Сообщение:</strong> {invitation.message}
                  </p>
                )}
                <p className="text-xs text-[#4CAF50]">
                  Отправлено: {new Date(invitation.created_at).toLocaleDateString('ru-RU')}
                </p>
              </div>
              
              <div className="flex gap-2 ml-4">
                <Button
                  onClick={() => respondToInvitation(invitation.id, invitation.branch_id, 'accepted')}
                  size="sm"
                  className="bg-[#4CAF50] hover:bg-[#45A049] text-white"
                >
                  Принять
                </Button>
                <Button
                  onClick={() => respondToInvitation(invitation.id, invitation.branch_id, 'declined')}
                  variant="secondary"
                  size="sm"
                >
                  Отклонить
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ManagerInvitations
