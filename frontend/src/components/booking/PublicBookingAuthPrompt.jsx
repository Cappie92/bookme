/**
 * Промпт «Подтвердите запись» — визуал .modal-preview из dedato-public-master-page-preview-v2.
 */
import React from 'react'

export default function PublicBookingAuthPrompt({
  open,
  onClose,
  profile,
  summary,
  pricePreview,
  onLogin,
  onRegister,
}) {
  if (!open) return null

  const masterName = profile?.master_name ?? 'Мастер'
  const {
    serviceName = '',
    price = '',
    dateLabel = '',
    timeLabel = '',
    timezoneOrCity = '',
  } = summary ?? {}

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/35 p-0 sm:p-6"
      data-testid="public-auth-prompt"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-auth-prompt-title"
    >
      <div
        className="bg-white rounded-t-[18px] sm:rounded-[18px] w-full max-w-[480px] overflow-hidden border border-[#E8E2DD]"
        style={{ boxShadow: '0 24px 50px -28px rgba(24,24,24,.26)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-7 max-sm:px-5 max-sm:py-6">
          <h2 id="public-auth-prompt-title" className="m-0 text-[22px] font-bold text-[#222222] tracking-tight">
            Подтвердите запись
          </h2>
          <p className="mt-3.5 text-base leading-[1.55] text-[#4A4E57]">
            Чтобы завершить бронирование, войдите или зарегистрируйтесь. Это нужно, чтобы отправить подтверждение и вы
            могли управлять записью.
          </p>

          <div className="mt-[18px] rounded-2xl border border-[#BFE9D1] bg-[#EEF9F0] px-[18px] py-4 text-[#2D6E43]">
            <div className="text-[15px] leading-[1.55] mb-1.5 last:mb-0">Мастер: {masterName}</div>
            {serviceName ? (
              <div className="text-[15px] leading-[1.55] mb-1.5 last:mb-0">Услуга: {serviceName}</div>
            ) : null}
            {dateLabel ? (
              <div className="text-[15px] leading-[1.55] mb-1.5 last:mb-0">Дата: {dateLabel}</div>
            ) : null}
            {timeLabel ? <div className="text-[15px] leading-[1.55] mb-1.5 last:mb-0">Время: {timeLabel}</div> : null}
            {timezoneOrCity ? (
              <div className="text-[15px] leading-[1.55] mb-1.5">Время записи: {timezoneOrCity}</div>
            ) : null}
            {pricePreview && Number(pricePreview.discount_amount) > 0 ? (
              <div className="text-[15px] leading-[1.55] mb-1.5">
                Скидка: {'\u2212'}
                {Number(pricePreview.discount_amount).toLocaleString('ru-RU')} ₽
                {pricePreview.discount_percent != null ? (
                  <>
                    {' / \u2212'}
                    {Number(pricePreview.discount_percent)}%
                  </>
                ) : null}
              </div>
            ) : null}
            <div className="text-[15px] font-semibold leading-[1.55] mb-0">
              К оплате:{' '}
              {pricePreview
                ? Number(
                    Number(pricePreview.discount_amount) > 0 ? pricePreview.final_price : pricePreview.base_price
                  ).toLocaleString('ru-RU')
                : price
                  ? Number(price).toLocaleString('ru-RU')
                  : '—'}{' '}
              ₽
            </div>
          </div>

          <div className="flex flex-col gap-3.5 mt-5">
            <button
              type="button"
              onClick={onLogin}
              className="w-full min-h-[54px] rounded-xl text-lg font-bold text-white bg-[#4CAF50] hover:bg-[#45A049] shadow-[0_1px_0_#2F7C43,0_6px_16px_-8px_rgba(76,175,80,0.45)]"
              data-testid="public-auth-login"
            >
              Войти
            </button>
            <button
              type="button"
              onClick={onRegister}
              className="w-full min-h-[54px] rounded-xl text-lg font-bold bg-[#F7FFFA] text-[#45A049] border-2 border-[#62BC6A] hover:bg-[#EEF9F0]"
              data-testid="public-auth-register"
            >
              Зарегистрироваться
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-2.5 flex items-center justify-center text-base font-medium text-[#555A64] hover:text-[#222] py-2"
            data-testid="public-auth-cancel"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
