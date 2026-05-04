/**
 * Подтверждение записи (logged-in) — .modal-preview из preview v2.
 */
import React from 'react'

export default function PublicBookingLoggedInConfirmModal({
  open,
  onClose,
  onConfirm,
  onChangeTime,
  profile,
  summary,
  pricePreview,
  selectedSlotHhLabel,
  submitting,
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
      data-testid="public-logged-in-confirm-modal"
      onClick={(e) => e.target === e.currentTarget && !submitting && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-logged-in-confirm-title"
    >
      <div
        className="bg-white rounded-t-[18px] sm:rounded-[18px] w-full max-w-[480px] overflow-hidden border border-[#E8E2DD]"
        style={{ boxShadow: '0 24px 50px -28px rgba(24,24,24,.26)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-7 max-sm:px-5 max-sm:py-6">
          <h2 id="public-logged-in-confirm-title" className="m-0 text-[22px] font-bold text-[#222222] tracking-tight">
            Подтвердите запись
          </h2>
          <p className="mt-3.5 text-base leading-[1.55] text-[#4A4E57]">
            Проверьте выбранную услугу и время. После подтверждения запись появится в личном кабинете.
          </p>

          <div className="mt-[18px] rounded-2xl border border-[#BFE9D1] bg-[#EEF9F0] px-[18px] py-4 text-[#2D6E43]">
            <div className="text-[15px] leading-[1.55] mb-1.5 last:mb-0">Мастер: {masterName}</div>
            {serviceName ? (
              <div className="text-[15px] leading-[1.55] mb-1.5 last:mb-0">Услуга: {serviceName}</div>
            ) : null}
            {dateLabel ? (
              <div className="text-[15px] leading-[1.55] mb-1.5 last:mb-0">Дата: {dateLabel}</div>
            ) : null}
            {timeLabel ? (
              <div className="text-[15px] leading-[1.55] mb-1.5 last:mb-0 flex flex-wrap items-center gap-2">
                <span>Время: {timeLabel}</span>
                {selectedSlotHhLabel ? (
                  <span className="inline-flex items-center h-[26px] px-2 rounded-lg bg-[#F3FFF6] border border-[#CAEAD4] text-xs font-bold text-[#2F7C43] tabular-nums">
                    Счастливые часы {selectedSlotHhLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
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

          <p className="mt-3.5 text-[13px] text-[#7A7F88] leading-snug">
            Подтверждение и напоминание будут отправлены на контакты, указанные в аккаунте.
          </p>

          <div className="flex flex-col gap-3.5 mt-5">
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting}
              className="w-full min-h-[54px] rounded-xl text-lg font-bold text-white bg-[#4CAF50] hover:bg-[#45A049] shadow-[0_1px_0_#2F7C43,0_6px_16px_-8px_rgba(76,175,80,0.45)] disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid="public-logged-in-confirm-submit"
            >
              {submitting ? 'Создание записи…' : 'Подтвердить запись'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={onChangeTime}
              className="w-full min-h-[48px] rounded-xl text-base font-medium text-[#3C3F45] bg-white border border-[#E8E2DD] hover:bg-[#FAFAFB] disabled:opacity-50"
              data-testid="public-logged-in-change-time"
            >
              Изменить время
            </button>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="w-full mt-2 text-base font-medium text-[#555A64] hover:text-[#222] py-2"
            data-testid="public-logged-in-confirm-cancel"
          >
            Назад
          </button>
        </div>
      </div>
    </div>
  )
}
