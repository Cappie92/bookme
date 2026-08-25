import source from '../content/legal/privacy-policy.source.txt?raw'
import LegalDocumentLayout from './legal/LegalDocumentLayout'
import LegalPlainBody from './legal/LegalPlainBody'

const DRAFT_WARNING = '[ЛОКАЛЬНЫЙ DRAFT — НЕ ПУБЛИКОВАТЬ]'

function splitHeadingAndBody(raw) {
  const trimmed = raw.trim()
  const nl = trimmed.indexOf('\n')
  if (nl === -1) return { heading: trimmed, body: '' }
  return {
    heading: trimmed.slice(0, nl).trim(),
    body: trimmed.slice(nl + 1).replace(DRAFT_WARNING, '').trim(),
  }
}

export default function PrivacyPolicyPage() {
  const { heading, body } = splitHeadingAndBody(source)
  return (
    <LegalDocumentLayout
      title="Политика конфиденциальности"
      documentTitle={heading}
      description="Политика конфиденциальности сервиса DeDato."
      robots="noindex, nofollow"
    >
      {import.meta.env.DEV ? (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-semibold text-amber-900">
          Локальный проект документа. Не публиковать до подтверждения владельцем всех отмеченных положений.
        </div>
      ) : null}
      <LegalPlainBody text={body} />
    </LegalDocumentLayout>
  )
}
