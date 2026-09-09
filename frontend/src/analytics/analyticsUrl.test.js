import { describe, expect, it } from 'vitest'
import { analyticsSafePath, analyticsSafeReferrer } from './analyticsUrl'

describe('analytics-only URL sanitization', () => {
  it.each([
    '/auth/mobile-handoff',
    '/auth/mobile-handoff?code=SYNTHETIC_HANDOFF_TICKET',
    '/auth/mobile-handoff?source=ios&code=SYNTHETIC_HANDOFF_TICKET',
    '/auth/mobile-handoff?%63ode=SYNTHETIC%5FHANDOFF%5FTICKET',
    '/auth/mobile-handoff?code=first&code=second#access_token=SYNTHETIC_TOKEN',
    '/auth/mobile-handoff/#SYNTHETIC_CREDENTIAL',
  ])('canonicalizes handoff before any route cleanup: %s', (url) => {
    expect(analyticsSafePath(url)).toBe('/auth/mobile-handoff')
  })

  it.each([
    ['/auth/oauth/callback?ticket=SYNTHETIC_TICKET&state=SYNTHETIC_STATE', '/auth/oauth/callback'],
    ['/auth/oauth/callback?onboarding_ticket=SYNTHETIC_TICKET&return_to=%2Fclient', '/auth/oauth/callback'],
    ['/verify-email?token=SYNTHETIC_TOKEN#SYNTHETIC_CREDENTIAL', '/verify-email'],
    ['/?reset_token=SYNTHETIC_TOKEN&utm_source=mail#features', '/?utm_source=mail#features'],
    ['/pricing?tab=master&%61ccess_token=SYNTHETIC_TOKEN&promo_code=SAFE', '/pricing?tab=master&promo_code=SAFE'],
    ['/about?TOKEN=first&token=second&x=1#refresh_token=SYNTHETIC_TOKEN', '/about?x=1'],
    ['/about?x=1#/callback?code=SYNTHETIC_TICKET', '/about?x=1'],
    ['/about?x=1#access_token=SYNTHETIC_TOKEN?extra=1', '/about?x=1'],
    ['/reset-password?token=SYNTHETIC_TOKEN&utm_source=mail', '/reset-password?utm_source=mail'],
  ])('removes credential parameters without changing business URLs: %s', (url, expected) => {
    expect(analyticsSafePath(url)).toBe(expected)
  })

  it.each([
    '/pricing?x=1&subscription_type=master&utm_source=mail#plans',
    '/master?tab=settings&section=public-page',
    '/?promo_code=SAFE&ref=campaign&q=a%20b&x=1&x=2#features',
  ])('preserves ordinary analytics dimensions and encoding: %s', (url) => {
    expect(analyticsSafePath(url)).toBe(url)
  })

  it('sanitizes referrer too, including embedded URL credentials', () => {
    expect(analyticsSafeReferrer('https://dedato.ru/auth/mobile-handoff?code=SYNTHETIC_TICKET#secret')).toBe('https://dedato.ru/auth/mobile-handoff')
    expect(analyticsSafeReferrer('https://example.com/?utm_source=mail&reset_token=SYNTHETIC_TOKEN')).toBe('https://example.com/?utm_source=mail')
    expect(analyticsSafeReferrer('https://user:password@example.com/about')).toBe('https://example.com/about')
    expect(analyticsSafeReferrer('https://example.com/?q=a%20b#section')).toBe('https://example.com/?q=a%20b#section')
  })

  it.each(['', 'not a URL', 'javascript:alert(1)'])('omits invalid/non-HTTP referrer: %s', (url) => {
    expect(analyticsSafeReferrer(url)).toBeUndefined()
  })
})
