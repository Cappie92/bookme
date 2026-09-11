import { readFileSync } from 'node:fs'
import { parse } from '@babel/parser'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithEsbuild } from 'vite'
import { describe, expect, it, vi } from 'vitest'

// Compile the actual route guard, without mounting the application/router or
// making network requests. The child is a canary for commerce effects/handlers.
const source = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
const declaration = ast.program.body.find((n) =>
  n.type === 'FunctionDeclaration' && n.id.name === 'IosCommerceRouteGuard')
const transformed = await transformWithEsbuild(
  source.slice(declaration.start, declaration.end), 'guard.jsx',
  { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement' },
)

describe('demo cannot mount commerce routes', () => {
  it.each(['demo', 'ordinary', 'ios_app', 'loading', 'unresolved'])('%s boundary', (session) => {
    const api = vi.fn()
    const purchaseHandler = vi.fn()
    const mounted = vi.fn()
    function CommercePage() {
      mounted()
      api()
      return React.createElement('button', { onClick: purchaseHandler }, 'Purchase canary')
    }
    const state = {
      user: { role: 'master', is_demo_session: session === 'demo' },
      isIosAppWebSession: session === 'ios_app',
      commerceAllowed: session !== 'unresolved',
      loading: session === 'loading',
    }
    const Guard = Function('useAuth', 'React', 'Navigate', 'PageLoader', 'IsolatedSessionError',
      transformed.code + ';return IosCommerceRouteGuard')(
      () => state, React,
      ({ to }) => React.createElement('span', null, to),
      () => React.createElement('span', null, 'loading'),
      () => React.createElement('span', null, 'isolated'),
    )
    const html = renderToStaticMarkup(
      React.createElement(Guard, null, React.createElement(CommercePage)))
    expect(mounted).toHaveBeenCalledTimes(session === 'ordinary' ? 1 : 0)
    expect(api).toHaveBeenCalledTimes(session === 'ordinary' ? 1 : 0)
    expect(html.includes('Purchase canary')).toBe(session === 'ordinary')
    expect(purchaseHandler).not.toHaveBeenCalled()
    if (session === 'demo') expect(html).toContain('/master?tab=tariff')
    if (session === 'ios_app') expect(html).toBe('<span>/master</span>')
  })

  it('guards every directly addressable purchase/pricing page', () => {
    for (const path of ['/pricing', '/payment/success', '/payment/failed',
      '/master/tariff', '/master/subscription/plans']) {
      expect(source).toContain('<Route path="' + path + '" element={<IosCommerceRouteGuard>')
    }
  })
})
