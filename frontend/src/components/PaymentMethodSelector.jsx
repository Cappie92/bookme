import React, { useState, useEffect } from 'react'
import { CreditCardIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'

const PaymentMethodSelector = ({ 
  paymentOnVisit, 
  paymentAdvance, 
  onPaymentMethodsChange,
  disabled = false 
}) => {
  const [localPaymentOnVisit, setLocalPaymentOnVisit] = useState(paymentOnVisit)
  const [localPaymentAdvance, setLocalPaymentAdvance] = useState(paymentAdvance)

  useEffect(() => {
    setLocalPaymentOnVisit(paymentOnVisit)
    setLocalPaymentAdvance(paymentAdvance)
  }, [paymentOnVisit, paymentAdvance])

  const handlePaymentOnVisitChange = (checked) => {
    setLocalPaymentOnVisit(checked)
    // Если отключаем оплату при посещении и предоплата тоже отключена, включаем предоплату
    if (!checked && !localPaymentAdvance) {
      setLocalPaymentAdvance(true)
      onPaymentMethodsChange(false, true)
    } else {
      onPaymentMethodsChange(checked, localPaymentAdvance)
    }
  }

  const handlePaymentAdvanceChange = (checked) => {
    setLocalPaymentAdvance(checked)
    // Если отключаем предоплату и оплата при посещении тоже отключена, включаем оплату при посещении
    if (!checked && !localPaymentOnVisit) {
      setLocalPaymentOnVisit(true)
      onPaymentMethodsChange(true, false)
    } else {
      onPaymentMethodsChange(localPaymentOnVisit, checked)
    }
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        💳 Способы оплаты
      </h3>
      
      <div className="space-y-4">
        {/* Оплата при посещении */}
        <div className="flex items-start space-x-3">
          <div className="flex items-center h-5">
            <input
              id="payment_on_visit"
              type="checkbox"
              checked={localPaymentOnVisit}
              onChange={(e) => handlePaymentOnVisitChange(e.target.checked)}
              disabled={disabled}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="payment_on_visit" className="flex items-center space-x-2 cursor-pointer">
              <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
              <span className="font-medium text-gray-900">Оплата при посещении</span>
            </label>
            <p className="text-sm text-gray-600 mt-1">
              Клиент оплачивает услугу непосредственно при посещении салона/мастера
            </p>
          </div>
        </div>

        {/* Предоплата при бронировании */}
        <div className="flex items-start space-x-3">
          <div className="flex items-center h-5">
            <input
              id="payment_advance"
              type="checkbox"
              checked={localPaymentAdvance}
              onChange={(e) => handlePaymentAdvanceChange(e.target.checked)}
              disabled
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded opacity-60 cursor-not-allowed"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="payment_advance" className="flex items-center space-x-2">
              <CreditCardIcon className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-gray-900">Предоплата при бронировании</span>
            </label>
            <p className="text-sm text-gray-600 mt-1">
              В данный момент сервис не предоставляет функцию предоплаты. Осуществление предоплаты и контроль — на стороне мастера.
            </p>
          </div>
        </div>
      </div>

      {/* Информация */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start space-x-2">
          <div className="text-blue-600 text-sm">💡</div>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Важно:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Должен быть выбран хотя бы один способ оплаты</li>
              <li>Предоплата и её контроль осуществляются мастером вне платформы</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Предупреждение если оба способа отключены */}
      {!localPaymentOnVisit && !localPaymentAdvance && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start space-x-2">
            <div className="text-red-600 text-sm">⚠️</div>
            <div className="text-sm text-red-800">
              <p className="font-medium">Внимание!</p>
              <p>Необходимо выбрать хотя бы один способ оплаты для работы с клиентами.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PaymentMethodSelector
