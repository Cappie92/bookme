/**
 * Промпт «Подтвердите запись» на публичной странице /m/:slug.
 * Показывается при клике «Записаться» без авторизации; после выбора «Войти»/«Зарегистрироваться»
 * открывается стандартная AuthModal с нужной вкладкой.
 */
import React from 'react'

export default function PublicBookingAuthPrompt({
  open,
  onClose,
  profile,
  summary,
  onLogin,
  onRegister,
}) {
  if (!open) return null

  const masterName = profile?.master_name ?? 'Мастер'
  const {
    serviceName = '',
    price = '',
    duration = '',
    dateLabel = '',
    timeLabel = '',
    timezoneOrCity = '',
  } = summary ?? {}

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      data-testid="public-auth-prompt"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-auth-prompt-title"
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 id="public-auth-prompt-title" className="text-xl font-semibold text-gray-900 mb-2">
            Подтвердите запись
          </h2>
          <p className="text-gray-600 text-sm mb-4">
            Чтобы завершить бронирование, войдите или зарегистрируйтесь. Это нужно, чтобы отправить подтверждение и вы могли управлять записью.
          </p>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 space-y-1 mb-5">
            <div>Мастер: {masterName}</div>
            {serviceName && <div>Услуга: {serviceName}{price ? ` — ${price} ₽` : ''}{duration ? `, ${duration} мин` : ''}</div>}
            {dateLabel && <div>Дата: {dateLabel}</div>}
            {timeLabel && <div>Время: {timeLabel}</div>}
            {timezoneOrCity && <div>Время записи: {timezoneOrCity}</div>}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onLogin}
              className="w-full py-3 rounded-lg font-semibold text-white bg-[#4CAF50] hover:bg-[#45a049]"
              data-testid="public-auth-login"
            >
              Войти
            </button>
            <button
              type="button"
              onClick={onRegister}
              className="w-full py-3 rounded-lg font-semibold text-[#4CAF50] bg-green-50 border border-[#4CAF50] hover:bg-green-100"
              data-testid="public-auth-register"
            >
              Зарегистрироваться
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-lg font-medium text-gray-600 hover:bg-gray-100"
              data-testid="public-auth-cancel"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
