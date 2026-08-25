import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Footer from '../components/Footer.jsx'

const here = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.join(here, '../App.jsx'), 'utf8')
const policySource = readFileSync(
  path.join(here, '../content/legal/privacy-policy.source.txt'),
  'utf8'
)

describe('Privacy Policy legal architecture', () => {
  it('adds the dedicated route while retaining agreement and consent routes', () => {
    expect(appSource).toContain('<Route path="/privacy-policy"')
    expect(appSource).toContain('<Route path="/personal-data-consent"')
    expect(appSource).toContain('<Route path="/user-agreement"')
  })

  it('links all three distinct legal documents in the footer', () => {
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(Footer))
    )
    expect(html).toContain('href="/privacy-policy"')
    expect(html).toContain('Политика конфиденциальности')
    expect(html).toContain('href="/personal-data-consent"')
    expect(html).toContain('href="/user-agreement"')
  })

  it('keeps unresolved owner/legal inputs visibly marked in the local source', () => {
    expect(policySource).toContain('[ЛОКАЛЬНЫЙ DRAFT — НЕ ПУБЛИКОВАТЬ]')
    expect(policySource).toContain('[ТРЕБУЕТ ПОДТВЕРЖДЕНИЯ ВЛАДЕЛЬЦА ПЕРЕД ПУБЛИКАЦИЕЙ')
  })
})
