import { APPLE_SUBSCRIPTION_MANAGEMENT_URL } from '../utils/accountDeletionApple'

export default function AppleSubscriptionDeletionWarning({ onCancel, onContinueDeletion }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apple-subscription-delete-warning-title"
      >
        <h3 id="apple-subscription-delete-warning-title" className="mb-3 text-lg font-semibold text-red-700">
          Активная подписка App Store
        </h3>
        <p className="mb-3 text-sm leading-relaxed text-gray-800" data-testid="apple-subscription-deletion-warning">
          Удаление аккаунта DeDato не отменяет Apple auto-renewal. Управление списаниями выполняется
          отдельно через Apple. Если вы не хотите последующих списаний, отключите автопродление через
          «Manage Subscription».
        </p>
        <p className="mb-5 text-sm leading-relaxed text-gray-600">
          Вы можете вернуться и продолжить немедленное удаление аккаунта. DeDato не может
          самостоятельно отменить подписку Apple.
        </p>
        <div className="flex flex-col gap-2">
          <a
            href={APPLE_SUBSCRIPTION_MANAGEMENT_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#4CAF50] px-4 text-sm font-semibold text-[#2e7d32] hover:bg-[#f1f8f1]"
            data-testid="account-deletion-manage-apple-subscription"
          >
            Manage Subscription
          </a>
          <button
            type="button"
            onClick={onContinueDeletion}
            className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
            data-testid="account-deletion-continue"
          >
            Продолжить удаление аккаунта
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg px-4 text-sm font-medium text-gray-700 hover:bg-gray-100"
            data-testid="account-deletion-cancel"
          >
            Не удалять аккаунт
          </button>
        </div>
      </div>
    </div>
  )
}
