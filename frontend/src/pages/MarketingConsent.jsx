import source from '../content/legal/marketing-consent.source.txt?raw'
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

export default function MarketingConsent() {
  const { heading, body } = splitHeadingAndBody(source)
  return (
    <LegalDocumentLayout title="Согласие на маркетинговые рассылки" documentTitle={heading}>
      <LegalPlainBody text={body} />
    </LegalDocumentLayout>
  )
}
