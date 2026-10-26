import { Link } from 'react-router-dom'

function StateCard({ testId, title, children }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-xl" data-testid={testId} role="status">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <div className="mt-2 text-sm text-gray-600 space-y-3">{children}</div>
    </div>
  )
}

const primaryButton = 'inline-flex items-center px-4 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#43a047]'

export function AdminAccessLoading() {
  return (
    <div className="flex items-center justify-center h-64" data-testid="admin-access-loading" role="status">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4CAF50]"></div>
      <span className="sr-only">Проверяем доступ…</span>
    </div>
  )
}

export function AdminForbidden({ fallback }) {
  return (
    <StateCard testId="admin-forbidden" title="Нет доступа к разделу">
      <p>У вашей учётной записи нет прав на этот раздел административной панели.</p>
      {fallback ? (
        <Link to={fallback.path} className={primaryButton}>Перейти: {fallback.label}</Link>
      ) : null}
    </StateCard>
  )
}

export function AdminNoSections() {
  return (
    <StateCard testId="admin-no-sections" title="Нет доступных разделов">
      <p>Для вашей учётной записи пока не назначено ни одного права в административной панели.</p>
      <p>Обратитесь к администратору, чтобы получить доступ.</p>
    </StateCard>
  )
}

export function AdminSessionExpired({ onLogin }) {
  return (
    <StateCard testId="admin-session-expired" title="Сессия истекла">
      <p>Войдите снова, чтобы продолжить работу в административной панели.</p>
      <button type="button" onClick={onLogin} className={primaryButton}>Войти</button>
    </StateCard>
  )
}

export function AdminNotStaff() {
  return (
    <StateCard testId="admin-not-staff" title="Нет доступа к административной панели">
      <p>Учётная запись больше не имеет административной роли. Обновляем данные сессии…</p>
    </StateCard>
  )
}

export function AdminAccessError({ onRetry }) {
  return (
    <StateCard testId="admin-access-error" title="Не удалось проверить доступ">
      <p>Права не загружены, поэтому разделы скрыты. Повторите попытку.</p>
      <button type="button" onClick={onRetry} className={primaryButton}>Повторить</button>
    </StateCard>
  )
}
