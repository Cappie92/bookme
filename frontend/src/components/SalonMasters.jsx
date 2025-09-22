import React, { useState, useEffect } from 'react'
import MasterSettingsModal from '../modals/MasterSettingsModal'
import { Button } from '../components/ui'

export default function SalonMasters({ getAuthHeaders }) {
  const [masters, setMasters] = useState([])
  const [invited, setInvited] = useState([])
  const [branches, setBranches] = useState([])
  const [mastersLoading, setMastersLoading] = useState(false)
  const [mastersError, setMastersError] = useState('')
  const [invitePhone, setInvitePhone] = useState('+7')
  const [inviteBranchId, setInviteBranchId] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteError, setInviteError] = useState('')
  
  // Состояние для модального окна настроек мастера
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [selectedMaster, setSelectedMaster] = useState(null)

  const validatePhone = (phone) => /^\+7\d{10}$/.test(phone)
  const formatPhone = (input) => input.replace(/[^\d+]/g, '').slice(0, 12)

  const loadBranches = async () => {
    try {
      const response = await fetch('/salon/branches', {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const branchesData = await response.json()
        setBranches(branchesData)
      }
    } catch (error) {
      console.error('Ошибка загрузки филиалов:', error)
    }
  }

  const loadMasters = async () => {
    try {
      setMastersLoading(true)
      setMastersError('')
      const response = await fetch('/salon/masters', {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Loaded masters data:', data)
        console.log('Masters count:', data.masters?.length || 0)
        console.log('Invited count:', data.invited?.length || 0)
        console.log('Masters with branch_id:', data.masters?.map(m => ({ id: m.id, name: m.name, branch_id: m.branch_id })))
        setMasters(data.masters || [])
        setInvited(data.invited || [])
      } else {
        const errorData = await response.json()
        console.error('Error loading masters:', errorData)
        setMastersError('Ошибка загрузки мастеров')
      }
    } catch (err) {
      console.error('Ошибка загрузки мастеров:', err)
      setMastersError('Ошибка загрузки мастеров')
    } finally {
      setMastersLoading(false)
    }
  }

  const handleInviteMaster = async (e) => {
    e.preventDefault()
    if (!validatePhone(invitePhone)) {
      setInviteError('Телефон должен быть в формате +7XXXXXXXXXX (10 цифр после +7)')
      return
    }
    setInviteError('')
    setInviteMessage('')
    try {
      setInviteLoading(true)
      console.log('Inviting master with phone:', invitePhone.trim())
      const response = await fetch('/salon/masters/invite', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          phone: invitePhone.trim(),
          branch_id: inviteBranchId || null
        })
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Invitation response:', data)
        setInviteMessage(data.message)
        setInvitePhone('+7')
        setInviteBranchId('')
        loadMasters()
      } else {
        const errorData = await response.json()
        console.error('Invitation error:', errorData)
        setInviteError(errorData.detail || 'Ошибка отправки приглашения')
      }
    } catch (err) {
      console.error('Ошибка отправки приглашения:', err)
      setInviteError('Ошибка отправки приглашения')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRemoveMaster = async (masterId) => {
    if (!confirm('Вы уверены, что хотите удалить этого мастера из салона?')) return
    try {
      console.log('Removing master with ID:', masterId)
      const response = await fetch(`/salon/masters/${masterId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Master removal response:', data)
        loadMasters()
      } else {
        const errorData = await response.json()
        console.error('Master removal error:', errorData)
        setMastersError(errorData.detail || 'Ошибка удаления мастера')
      }
    } catch (err) {
      console.error('Ошибка удаления мастера:', err)
      setMastersError('Ошибка удаления мастера')
    }
  }

  const handleDeleteInvitation = async (invitationId) => {
    if (!confirm('Удалить приглашение для этого мастера?')) return
    try {
      const response = await fetch(`/salon/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (response.ok) {
        loadMasters()
      } else {
        alert('Ошибка удаления приглашения')
      }
    } catch (err) {
      alert('Ошибка удаления приглашения')
    }
  }

  const handleOpenSettings = (master) => {
    setSelectedMaster(master)
    setSettingsModalOpen(true)
  }

  const handleCloseSettings = () => {
    setSettingsModalOpen(false)
    setSelectedMaster(null)
  }

  const handleSettingsSaved = () => {
    loadMasters()
  }

  // Группировка мастеров по филиалам
  const groupMastersByBranch = () => {
    const grouped = {}
    
    console.log('Grouping masters:', masters.map(m => ({ id: m.id, name: m.name, branch_id: m.branch_id })))
    console.log('Available branches:', branches.map(b => ({ id: b.id, name: b.name })))
    
    // Добавляем основной салон (без филиала)
    grouped['main'] = {
      name: 'Основной салон',
      masters: masters.filter(master => !master.branch_id)
    }
    
    // Группируем по филиалам
    branches.forEach(branch => {
      grouped[branch.id] = {
        name: branch.name,
        address: branch.address,
        masters: masters.filter(master => master.branch_id === branch.id)
      }
    })
    
    console.log('Grouped result:', Object.entries(grouped).map(([id, data]) => ({
      branchId: id,
      branchName: data.name,
      mastersCount: data.masters.length,
      masters: data.masters.map(m => m.name)
    })))
    
    return grouped
  }

  useEffect(() => {
    loadMasters()
    loadBranches()
  }, [])

  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold mb-6">Мастера</h1>
      {/* Форма добавления мастера */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Добавить мастера</h2>
        <form onSubmit={handleInviteMaster} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Номер телефона мастера <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={invitePhone}
                onChange={(e) => setInvitePhone(formatPhone(e.target.value))}
                placeholder="+7 (999) 123-45-67"
                className={`border rounded px-3 py-2 w-full ${inviteError ? 'border-red-500' : 'border-gray-300'}`}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Филиал (необязательно)
              </label>
              <select
                value={inviteBranchId}
                onChange={(e) => setInviteBranchId(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              >
                <option value="">Основной салон</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {inviteError && (
            <div className="text-red-500 text-sm">{inviteError}</div>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={inviteLoading || !validatePhone(invitePhone)}
            >
              {inviteLoading ? 'Отправка...' : 'Добавить мастера'}
            </Button>
          </div>
        </form>
        {inviteMessage && (
          <div className="mt-3 p-3 rounded-lg text-sm bg-green-100 text-green-700 border border-green-200">
            {inviteMessage}
          </div>
        )}
      </div>
      {/* Список мастеров по филиалам */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Работающие мастера</h2>
        {mastersLoading ? (
          <div className="text-center py-8">
            <div className="text-gray-500">Загрузка мастеров...</div>
          </div>
        ) : mastersError ? (
          <div className="text-red-500 text-center py-8">{mastersError}</div>
        ) : masters.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-500 mb-2">У вас пока нет мастеров</div>
            <p className="text-sm text-gray-400">Пригласите мастеров, используя форму выше</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupMastersByBranch()).map(([branchId, branchData]) => (
              <div key={branchId} className="border border-gray-200 rounded-lg p-4">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <span className="w-3 h-3 bg-[#4CAF50] rounded-full"></span>
                    {branchData.name}
                  </h3>
                  {branchData.address && (
                    <p className="text-sm text-gray-600 mt-1">📍 {branchData.address}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-1">
                    Мастеров: {branchData.masters.length}
                  </p>
                </div>
                
                {branchData.masters.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    <p>В этом филиале пока нет мастеров</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {branchData.masters.map(master => (
                      <div key={master.id} className="border rounded-lg p-3 hover:shadow-md transition-shadow bg-gray-50">
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900">{master.name}</h4>
                            <p className="text-sm text-gray-600">{master.phone}</p>
                            <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full mt-1">
                              Активен
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              onClick={() => handleOpenSettings(master)}
                              size="sm"
                            >
                              Настройки
                            </Button>
                            <Button 
                              onClick={() => handleRemoveMaster(master.id)}
                              variant="secondary"
                              size="sm"
                              className="text-[#4CAF50] hover:text-[#45A049]"
                            >
                              Удалить
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Список приглашённых */}
      {invited.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">Приглашённые мастера</h2>
          <div className="space-y-4">
            {invited.map(master => (
              <div key={master.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-gray-900">{master.name}</h3>
                    <p className="text-gray-600">{master.phone}</p>
                    <span className={`inline-block text-xs px-2 py-1 rounded-full mt-1 ${
                      master.invite_status === 'pending' 
                        ? 'bg-yellow-100 text-yellow-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {master.invite_status === 'pending' ? 'Ожидает ответа' : 'Отклонено'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleDeleteInvitation(master.invitation_id)}
                      variant="secondary"
                      size="sm"
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      Удалить приглашение
                    </Button>
                    {master.invite_status === 'declined' && (
                      <Button size="sm">
                        Отправить повторно
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Модальное окно настроек мастера */}
      <MasterSettingsModal
        open={settingsModalOpen}
        onClose={handleCloseSettings}
        master={selectedMaster}
        getAuthHeaders={getAuthHeaders}
        onSave={handleSettingsSaved}
      />
    </div>
  )
} 