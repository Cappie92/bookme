import { useState } from "react"

export default function PlaceCreateModal({ isOpen, onClose, onCreate, branches }) {
  const [name, setName] = useState("")
  const [branchId, setBranchId] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Укажите название места")
      return
    }
    if (!branchId) {
      setError("Выберите филиал")
      return
    }
    
    // Дополнительная проверка - убеждаемся, что выбран валидный филиал
    const selectedBranch = branches.find(b => b.id === parseInt(branchId))
    if (!selectedBranch) {
      setError("Выбран несуществующий филиал")
      return
    }
    
    onCreate({
      name: name.trim(),
      branch_id: parseInt(branchId)
    })
    setName("")
    setBranchId("")
    setError("")
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
        <button onClick={() => {
          setName("")
          setBranchId("")
          setError("")
          onClose()
        }} className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-2xl">×</button>
        <h2 className="text-xl font-semibold mb-4">Создать место</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Филиал <span className="text-red-500">*</span>
            </label>
                          <select
                value={branchId || ''}
                onChange={e => {
                  setBranchId(e.target.value)
                  if (e.target.value) {
                    setError("")
                  }
                }}
                className={`w-full border rounded-lg px-3 py-2 ${
                  branchId ? 'border-gray-300' : 'border-red-300'
                }`}
                required
              >
              <option value="">Выберите филиал</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Название места</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Введите название"
            />
          </div>
          {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => {
              setName("")
              setBranchId("")
              setError("")
              onClose()
            }} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Отмена</button>
            <button type="submit" className="px-4 py-2 bg-[#4CAF50] text-white rounded hover:bg-[#45A049]">Создать</button>
          </div>
        </form>
      </div>
    </div>
  )
} 