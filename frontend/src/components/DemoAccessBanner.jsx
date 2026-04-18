import React from 'react'
import { InformationCircleIcon } from '@heroicons/react/24/outline'

/**
 * Унифицированный баннер для демо-режима платных разделов.
 * Показывается фиксированно сверху при отсутствии доступа.
 * @param {string} title - Название раздела
 * @param {string} description - Текст «Раздел доступен в тарифе X» / «Демонстрационный доступ»
 * @param {string} ctaText - Текст кнопки (по умолчанию «Перейти к тарифам»)
 * @param {function} onCtaClick - Обработчик клика по CTA (по умолчанию переход на /master?tab=tariff)
 * @param {string} link - Альтернатива: href для ссылки вместо кнопки
 */
export default function DemoAccessBanner({ title, description, ctaText = 'Перейти к тарифам', onCtaClick, link }) {
  const handleClick = () => {
    if (onCtaClick) {
      onCtaClick()
    } else if (link) {
      window.location.href = link
    } else {
      window.location.href = '/master?tab=tariff'
    }
  }

  return (
    <div className="sticky top-0 z-[30] flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4">
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 sm:mt-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-900">
            Демонстрационный доступ
          </p>
          <p className="break-words text-sm text-amber-800 sm:truncate" title={description}>
            {description || `${title || 'Раздел'} доступен в подписке.`}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleClick}
        className="min-h-11 w-full shrink-0 rounded-lg bg-amber-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-amber-700 sm:w-auto sm:py-2"
      >
        {ctaText}
      </button>
    </div>
  )
}
