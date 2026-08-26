import source from '../content/legal/privacy-policy.source.txt?raw'
import LegalDocumentLayout from './legal/LegalDocumentLayout'
import LegalPlainBody from './legal/LegalPlainBody'

function splitHeadingAndBody(raw) {
  const trimmed = raw.trim()
  const nl = trimmed.indexOf('\n')
  if (nl === -1) return { heading: trimmed, body: '' }
  return {
    heading: trimmed.slice(0, nl).trim(),
    body: trimmed.slice(nl + 1).trim(),
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
      <LegalPlainBody text={body} />
    </LegalDocumentLayout>
  )
}
