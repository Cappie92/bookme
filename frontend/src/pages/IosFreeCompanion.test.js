import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, beforeAll } from 'vitest'
import React from 'react'
import { HelmetProvider } from 'react-helmet-async'
import { renderToStaticMarkup } from 'react-dom/server'
import { Routes, Route, MemoryRouter, matchPath } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext.jsx'
import Header from '../components/Header.jsx'
import Footer from '../components/Footer.jsx'
import IosFreeCompanionPage from './IosFreeCompanionPage.jsx'

const here = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.join(here, '../App.jsx'), 'utf8')
const agreementSource = readFileSync(path.join(here, './UserAgreement.jsx'), 'utf8')
const pageSource = readFileSync(path.join(here, './IosFreeCompanionPage.jsx'), 'utf8')
const homeSource = readFileSync(path.join(here, './Home.jsx'), 'utf8')
const headerSource = readFileSync(path.join(here, '../components/Header.jsx'), 'utf8')
const footerSource = readFileSync(path.join(here, '../components/Footer.jsx'), 'utf8')

const FORBIDDEN_SUPPORT_LINKS = [
  'href="/pricing"',
  'href="/blog"',
  'href="/master"',
  'href="/about"',
  'href="/#features"',
  'href="/#how"',
  'href="/#devices"',
  'href="/personal-data-consent"',
]

function renderSupport(entry) {
  return renderToStaticMarkup(
    React.createElement(
      HelmetProvider,
      null,
      React.createElement(
        MemoryRouter,
        { initialEntries: [entry] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: '/ios-free-companion',
            element: React.createElement(IosFreeCompanionPage),
          }),
          React.createElement(Route, { path: '*', element: React.createElement('p', null, 'missing-route') }),
        ),
      ),
    ),
  )
}

describe('iOS free companion public page', () => {
  beforeAll(() => {
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }
  })
  it('publishes the route without a login or pricing guard', () => {
    expect(appSource).toContain('<Route path="/ios-free-companion" element={<IosFreeCompanionPage />} />')
    expect(appSource).toContain('<Route path="/user-agreement"')
    expect(appSource).toContain('<Route path="/privacy-policy"')
    expect(appSource).not.toContain('IosCommerceRouteGuard><IosFreeCompanionPage')
  })

  it('opens the same commerce-safe support page with and without a trailing slash', () => {
    const plain = renderSupport('/ios-free-companion?context=ios_app')
    const slashed = renderSupport('/ios-free-companion/?context=ios_app')
    expect(matchPath('/ios-free-companion', '/ios-free-companion/')).toBeTruthy()
    expect(plain).not.toContain('missing-route')
    expect(slashed).not.toContain('missing-route')
    expect(slashed).toBe(plain)
    for (const html of [plain, slashed]) {
      expect(html).toContain('DeDato для iOS — бесплатный компаньон')
      expect(html).toContain('управление рабочим расписанием')
      expect(html).toContain('не становятся доступными при наличии')
      expect(html).toContain('реальным услугам специалистов')
      expect(html).toContain('DeDato for iOS is a free stand-alone companion app')
      expect(html).toContain('href="/user-agreement"')
      expect(html).toContain('href="/privacy-policy"')
      expect(html).toContain('mailto:support@dedato.ru')
      for (const link of FORBIDDEN_SUPPORT_LINKS) expect(html).not.toContain(link)
      expect(html).not.toMatch(/Войти|Зарегистрироваться|Robokassa/i)
    }
    expect(pageSource).not.toContain('Header')
    expect(pageSource).not.toContain('Footer')
    expect(pageSource).toContain('does not offer digital subscription purchases')
  })

  it('keeps ordinary web navigation on the shared header and footer', () => {
    expect(headerSource).toContain('to="/pricing"')
    expect(headerSource).toContain('to="/blog"')
    expect(headerSource).toContain('to="/#features"')
    expect(headerSource).toContain('to="/#how"')
    expect(headerSource).toContain('to="/#devices"')
    expect(headerSource).toContain('to="/about"')
    expect(footerSource).toContain('to="/pricing"')
    expect(footerSource).toContain('to="/blog"')
    expect(footerSource).toContain('to="/about"')
    for (const entry of ['/', '/about', '/pricing']) {
      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [entry] },
          React.createElement(AuthProvider, null, React.createElement(Header), React.createElement(Footer)),
        ),
      )
      expect(html).toContain('href="/blog"')
      expect(html).toContain('href="/about"')
      expect(html).toContain(entry === '/' ? 'href="#features"' : 'href="/#features"')
      expect(html).toContain('Войти')
    }
  })

  it('does not claim that web and Android provide the complete service', () => {
    expect(homeSource).not.toContain('полный набор возможностей сервиса')
    expect(homeSource).toContain('бесплатный компаньон с базовыми функциями записи, расписания и услуг')
    expect(homeSource).toContain('Основные возможности сервиса доступны в веб-версии и на Android.')
    expect(homeSource).toContain('Расширенные возможности сервиса доступны в веб-версии и на Android.')
  })

  it('keeps the user agreement on the same iOS contract', () => {
    expect(agreementSource).toContain('бесплатным приложением-компаньоном')
    expect(agreementSource).toContain('не открывает в приложении для iOS дополнительные экраны')
    expect(agreementSource).toContain('ценами реальных услуг специалистов')
    expect(agreementSource).toContain('Standard Apple EULA')
    expect(agreementSource).not.toContain('не содержит цен')
  })
})
