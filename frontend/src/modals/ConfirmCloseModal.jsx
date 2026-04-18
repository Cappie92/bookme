import React from 'react'

export default function ConfirmCloseModal({ 
  isOpen, 
  onClose, 
  onConfirmCancel, 
  onReturnToSetup,
  type = 'password' // 'password' или 'unsaved'
}) {
  if (!isOpen) return null

  const isPasswordType = type === 'password'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {isPasswordType ? 'Внимание!' : 'Несохраненные изменения'}
          </h2>
          <p className="text-gray-600">
            {isPasswordType 
              ? 'Без регистрации бронирование не сохранится, вы уверены что хотите закрыть окно?'
              : 'У вас есть несохраненные изменения. Если вы закроете окно, все изменения будут потеряны. Вы уверены, что хотите закрыть?'
            }
          </p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onConfirmCancel}
            className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
              isPasswordType 
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-600 text-white hover:bg-gray-700'
            }`}
          >
            {isPasswordType ? 'Да, отменить бронирование' : 'Да, закрыть без сохранения'}
          </button>
          <button
            onClick={onReturnToSetup}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {isPasswordType ? 'Нет, зарегистрироваться' : 'Нет, продолжить редактирование'}
          </button>
        </div>
      </div>
    </div>
  )
} 