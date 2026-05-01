import React, { useState, useEffect } from 'react'
import { apiGet } from '../utils/api'
import Header from '../components/Header'

export default function ClientLayout({ children }) {
  const [managedBranches, setManagedBranches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadManagedBranches()
  }, [])

  const loadManagedBranches = async () => {
    try {
      const branches = await apiGet('/api/salon/my-managed-branches')
      setManagedBranches(branches || [])
    } catch (error) {
      console.error('Ошибка загрузки управляемых филиалов:', error)
      setManagedBranches([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50" data-testid="client-page">
        <Header clientManagedBranches={[]} />
        <div className="flex justify-center items-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50]" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] lg:bg-gray-50" data-testid="client-page">
      <Header clientManagedBranches={managedBranches} />
      <main className="ml-0 w-full min-w-0 overflow-x-hidden px-3 sm:px-4 lg:px-6 max-[760px]:px-[18px] pt-24 pb-12 lg:pb-10 min-h-screen">
        {children}
      </main>
    </div>
  )
}
