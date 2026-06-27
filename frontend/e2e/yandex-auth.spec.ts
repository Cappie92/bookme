import { test, expect } from '@playwright/test'

async function navigateSpa(page, path: string) {
  await page.goto('/')
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

test.describe('Yandex auth web MVP', () => {
  test('login modal renders Yandex login button', async ({ page }) => {
    await page.route('**/api/auth/users/me', route => route.fulfill({ status: 401, json: { detail: 'Not authenticated' } }))

    await page.goto('/')
    await page.getByTestId('header-login').first().click()

    await expect(page.getByTestId('auth-yandex-login')).toBeVisible()
    await expect(page.getByTestId('auth-yandex-login')).toHaveText('Войти через Яндекс')

    await page.route('**/api/auth/yandex/login', route => route.fulfill({ status: 204, body: '' }))
    const requestPromise = page.waitForRequest('**/api/auth/yandex/login')
    await page.getByTestId('auth-yandex-login').click()
    const request = await requestPromise
    expect(new URL(request.url()).pathname).toBe('/api/auth/yandex/login')
  })

  test('oauth callback exchanges ticket, stores token and redirects by role', async ({ page }) => {
    let exchangedTicket = ''
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/auth/oauth/exchange') {
        exchangedTicket = route.request().postDataJSON()?.ticket
        return route.fulfill({
          json: {
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            token_type: 'bearer',
          },
        })
      }
      if (url.pathname === '/api/auth/users/me') {
        return route.fulfill({
          json: {
            id: 100,
            email: 'oauth-client@example.com',
            role: 'client',
            full_name: 'OAuth Client',
          },
        })
      }
      return route.fulfill({ json: {} })
    })

    await navigateSpa(page, '/auth/oauth/callback?ticket=test-oauth-ticket')

    await expect(page).toHaveURL(/\/client/)
    const accessToken = await page.evaluate(() => localStorage.getItem('access_token'))
    const refreshToken = await page.evaluate(() => localStorage.getItem('refresh_token'))
    const role = await page.evaluate(() => localStorage.getItem('user_role'))
    expect(exchangedTicket).toBe('test-oauth-ticket')
    expect(accessToken).toBe('test-access-token')
    expect(refreshToken).toBe('test-refresh-token')
    expect(role).toBe('client')
  })

  test('oauth callback failed exchange shows error', async ({ page }) => {
    await page.route('**/api/auth/oauth/exchange', route => route.fulfill({ status: 400, json: { detail: 'invalid ticket' } }))

    await navigateSpa(page, '/auth/oauth/callback?ticket=bad-ticket')

    await expect(page.getByText('Не удалось войти через Яндекс')).toBeVisible()
    const accessToken = await page.evaluate(() => localStorage.getItem('access_token'))
    expect(accessToken).toBeNull()
  })
})
