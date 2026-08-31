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
const agreementSource = readFileSync(path.join(here, './UserAgreement.jsx'), 'utf8')
const consentSource = readFileSync(
  path.join(here, '../content/legal/personal-data-consent.source.txt'),
  'utf8'
)
const marketingSource = readFileSync(
  path.join(here, '../content/legal/marketing-consent.source.txt'),
  'utf8'
)
const deletionSource = readFileSync(path.join(here, './AccountDeletionPage.jsx'), 'utf8')

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

  it('contains no unresolved publication markers', () => {
    for (const source of [policySource, agreementSource]) {
      expect(source).not.toMatch(/\[(?:ЛОКАЛЬНЫЙ|ТРЕБУЕТ)[^\]]+\]/)
    }
  })

  it('keeps the approved operator identity consistent across legal documents', () => {
    for (const source of [policySource, agreementSource, consentSource, marketingSource]) {
      expect(source).toContain('325774600117850')
      expect(source).toContain('770171594527')
      expect(source).toContain('105005, Москва, ул. Ладожская, д. 13')
      expect(source).toContain('support@dedato.ru')
      expect(source).toContain('admin@dedato.ru')
      expect(source).toContain('+7 (985) 319-73-73')
    }
  })

  it('separates policy, agreement, personal-data consent and marketing consent', () => {
    expect(agreementSource).not.toContain('Политикой (Согласием)')
    expect(agreementSource).toContain('https://dedato.ru/privacy-policy')
    expect(agreementSource).toContain('https://dedato.ru/personal-data-consent')
    expect(agreementSource).toContain('https://dedato.ru/marketing-consent')
  })

  it('omits a general 18+ restriction and describes the iOS free-companion model', () => {
    expect(policySource).not.toContain('только для пользователей, достигших 18 лет')
    expect(agreementSource).not.toContain('только для пользователей, достигших 18 лет')
    expect(agreementSource).not.toContain('Restore Purchases')
    expect(agreementSource).not.toContain('Apple In-App Purchase')
    expect(agreementSource).toContain('бесплатным companion-приложением')
    expect(agreementSource).toContain('Standard Apple EULA')
    expect(deletionSource).not.toContain('Apple auto-renewal')
    expect(policySource).not.toContain('Apple (подписки App Store)')
    expect(policySource).toContain('лимите активных будущих записей')
    expect(policySource).toContain('В этот ответ не включаются стоимость подписки')
  })

  it('uses the approved revision date in changed legal documents', () => {
    expect(policySource).toContain('Дата вступления в силу: 30 августа 2026 г.')
    expect(agreementSource).toContain('Дата последнего обновления: 30 августа 2026 г.')
  })
})
