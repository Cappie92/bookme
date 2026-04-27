import { Fragment } from 'react'

/**
 * Рендерит юридический plain-text (как в source of truth): абзацы, списки с «- »,
 * крупные разделы «N. ЗАГОЛОВОК», подпункты «N.N. …», строки «буква) …».
 */
export default function LegalPlainBody({ text }) {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n')
  const blocks = []
  let i = 0

  const flushList = (items) => {
    if (!items.length) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc pl-5 sm:pl-6 space-y-1.5 text-neutral-800">
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>,
    )
  }

  let listBuf = []

  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) {
      i += 1
      continue
    }

    if (line.startsWith('- ')) {
      while (i < lines.length) {
        const t = lines[i].trim()
        if (!t || !t.startsWith('- ')) break
        listBuf.push(t.slice(2).trim())
        i += 1
      }
      flushList(listBuf)
      listBuf = []
      continue
    }

    if (/^[а-яa-z]\)/iu.test(line)) {
      const letterLines = []
      while (i < lines.length) {
        const t = lines[i].trim()
        if (!t || !/^[а-яa-z]\)/iu.test(t)) break
        letterLines.push(t)
        i += 1
      }
      blocks.push(
        <ul key={`sub-${blocks.length}`} className="list-none pl-0 space-y-1.5 text-neutral-800">
          {letterLines.map((t, idx) => (
            <li key={idx}>{t}</li>
          ))}
        </ul>,
      )
      continue
    }

    const isSubsection = /^\d+\.\d+\./.test(line)
    const isMajorHeading = /^\d+\.\s+[А-ЯЁA-Z0-9]/.test(line) && !isSubsection

    if (isMajorHeading) {
      blocks.push(
        <h2
          key={`h2-${blocks.length}`}
          className="text-lg sm:text-xl font-bold text-[#1C1917] tracking-tight mt-8 first:mt-0 mb-3"
        >
          {line}
        </h2>,
      )
      i += 1
      continue
    }

    if (/^Редакция от/.test(line)) {
      blocks.push(
        <p key={`rev-${blocks.length}`} className="text-sm text-neutral-500 mb-6">
          {line}
        </p>,
      )
      i += 1
      continue
    }

    const para = []
    while (i < lines.length) {
      const t = lines[i].trim()
      if (!t) break
      if (t.startsWith('- ')) break
      if (/^[а-яa-z]\)/iu.test(t)) break
      if (/^\d+\.\s+[А-ЯЁA-Z0-9]/.test(t) && !/^\d+\.\d+\./.test(t)) break
      para.push(t)
      i += 1
    }
    if (para.length) {
      const body = para.join(' ')
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-[15px] sm:text-base leading-relaxed text-neutral-800 mb-3">
          {body}
        </p>,
      )
    }
  }

  return (
    <div className="legal-plain-body space-y-1">
      {blocks.map((node, idx) => (
        <Fragment key={idx}>{node}</Fragment>
      ))}
    </div>
  )
}
