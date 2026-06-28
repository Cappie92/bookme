import { test, expect } from '@playwright/test'

async function navigateSpa(page, path: string) {
  await page.goto('/')
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

test.describe('Yandex auth web MVP', () => {
  test('login modal renders Yandex login button with logo and navigates to backend', async ({ page }) => {
    await page.route('**/api/auth/users/me', route => route.fulfill({ status: 401, json: { detail: 'Not authenticated' } }))

    await page.goto('/')
    await page.getByTestId('header-login').first().click()

    await expect(page.getByTestId('auth-yandex-login')).toBeVisible()
    await expect(page.getByTestId('auth-yandex-login')).toHaveText('Войти через Яндекс')
    await expect(page.getByTestId('auth-yandex-login-logo')).toBeVisible()
    await expect(page.getByTestId('auth-yandex-login-logo')).toHaveAttribute('src', '/YaLogo.webp')

    await page.route('**/api/auth/yandex/login', route => route.fulfill({ status: 204, body: '' }))
    const requestPromise = page.waitForRequest('**/api/auth/yandex/login')
    await page.getByTestId('auth-yandex-login').click()
    const request = await requestPromise
    expect(new URL(request.url()).pathname).toBe('/api/auth/yandex/login')
  })

  test('register tab renders Yandex login option with hint and logo', async ({ page }) => {
    await page.route('**/api/auth/users/me', route => route.fulfill({ status: 401, json: { detail: 'Not authenticated' } }))

    await page.goto('/')
    await page.getByTestId('header-login').first().click()
    await page.getByRole('button', { name: 'Регистрация' }).click()

    await expect(page.getByText('Можно не заполнять форму — войдите через Яндекс, и мы создадим аккаунт автоматически.')).toBeVisible()
    await expect(page.getByTestId('auth-yandex-register')).toBeVisible()
    await expect(page.getByTestId('auth-yandex-register')).toHaveText('Войти через Яндекс')
    await expect(page.getByTestId('auth-yandex-register-logo')).toBeVisible()
    await expect(page.getByTestId('auth-yandex-register-logo')).toHaveAttribute('src', '/YaLogo.webp')

    await page.route('**/api/auth/yandex/login', route => route.fulfill({ status: 204, body: '' }))
    const requestPromise = page.waitForRequest('**/api/auth/yandex/login')
    await page.getByTestId('auth-yandex-register').click()
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
            phone: '+79005550001',
            phone_required: false,
            phone_verified: true,
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
    await expect(page.getByTestId('phone-completion-modal')).toHaveCount(0)
  })

  test('oauth callback with missing phone redirects and opens phone completion modal', async ({ page }) => {
    let exchangeCalls = 0
    let phoneChangeAuthorization = ''
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/auth/oauth/exchange') {
        exchangeCalls += 1
        return route.fulfill({
          json: {
            access_token: 'test-access-token-no-phone',
            refresh_token: 'test-refresh-token-no-phone',
            token_type: 'bearer',
            user: {
              id: 101,
              email: 'oauth-no-phone@example.com',
              phone: null,
              phone_required: true,
              phone_verified: false,
              role: 'client',
              full_name: 'OAuth No Phone',
            },
          },
        })
      }
      if (url.pathname === '/api/auth/request-phone-change') {
        phoneChangeAuthorization = route.request().headers().authorization || ''
        return route.fulfill({
          json: {
            success: true,
            call_id: 'test-call-id',
            verification_number: '1234',
          },
        })
      }
      if (url.pathname === '/api/auth/users/me') {
        return route.fulfill({
          json: {
            id: 101,
            email: 'oauth-no-phone@example.com',
            phone: null,
            phone_required: true,
            phone_verified: false,
            role: 'client',
            full_name: 'OAuth No Phone',
          },
        })
      }
      return route.fulfill({ json: {} })
    })

    await navigateSpa(page, '/auth/oauth/callback?ticket=test-oauth-ticket-no-phone')

    await expect(page).toHaveURL(/\/client/)
    expect(exchangeCalls).toBe(1)
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('access_token'))).toBe('test-access-token-no-phone')
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('refresh_token'))).toBe('test-refresh-token-no-phone')
    await expect(page.getByText('Ошибка входа')).toHaveCount(0)
    await expect(page.getByTestId('phone-completion-modal')).toBeVisible()
    await expect(page.getByText('Чтобы завершить вход через Яндекс, укажите номер телефона. Мы подтвердим его звонком.')).toBeVisible()
    await page.getByTestId('phone-completion-modal').getByPlaceholder('+7 (999) 999 99 99').fill('+79005550004')
    await page.getByRole('button', { name: 'Подтвердить звонком' }).click()
    await expect.poll(() => phoneChangeAuthorization).toBe('Bearer test-access-token-no-phone')
  })

  test('normal phone login does not open phone completion modal', async ({ page }) => {
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/auth/login') {
        return route.fulfill({
          json: {
            access_token: 'phone-login-token',
            refresh_token: 'phone-login-refresh',
            token_type: 'bearer',
          },
        })
      }
      if (url.pathname === '/api/auth/users/me') {
        const hasAuth = !!route.request().headers().authorization
        if (!hasAuth) {
          return route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
        }
        return route.fulfill({
          json: {
            id: 102,
            email: 'phone-client@example.com',
            phone: '+79005550002',
            phone_required: false,
            phone_verified: true,
            role: 'client',
            full_name: 'Phone Client',
          },
        })
      }
      return route.fulfill({ json: {} })
    })

    await page.goto('/')
    await page.getByTestId('header-login').first().click()
    await page.getByPlaceholder('+7 (999) 999 99 99').fill('+79005550002')
    await page.getByPlaceholder('Пароль').fill('password123')
    await page.getByTestId('auth-login-submit').click()

    await expect(page).toHaveURL(/\/client/)
    await expect(page.getByTestId('phone-completion-modal')).toHaveCount(0)
  })

  test('oauth callback failed exchange shows error', async ({ page }) => {
    await page.route('**/api/auth/oauth/exchange', route => route.fulfill({ status: 400, json: { detail: 'invalid ticket' } }))

    await navigateSpa(page, '/auth/oauth/callback?ticket=bad-ticket')

    await expect(page.getByText('Не удалось войти через Яндекс')).toBeVisible()
    const accessToken = await page.evaluate(() => localStorage.getItem('access_token'))
    expect(accessToken).toBeNull()
  })

  test('oauth link callback redirects to return_to and shows success', async ({ page }) => {
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/auth/oauth/exchange') {
        return route.fulfill({
          json: {
            access_token: 'linked-access-token',
            refresh_token: 'linked-refresh-token',
            token_type: 'bearer',
            user: {
              id: 103,
              email: 'linked-client@example.com',
              phone: '+79005550003',
              phone_required: false,
              phone_verified: true,
              role: 'client',
              full_name: 'Linked Client',
            },
            oauth: {
              purpose: 'oauth_link',
              provider: 'yandex',
              status: 'linked',
              message: 'Яндекс аккаунт привязан',
              return_to: '/client/profile',
            },
          },
        })
      }
      if (url.pathname === '/api/auth/users/me') {
        return route.fulfill({
          json: {
            id: 103,
            email: 'linked-client@example.com',
            phone: '+79005550003',
            phone_required: false,
            phone_verified: true,
            role: 'client',
            full_name: 'Linked Client',
          },
        })
      }
      if (url.pathname === '/api/client/profile') {
        return route.fulfill({
          json: {
            email: 'linked-client@example.com',
            phone: '+79005550003',
            name: 'Linked Client',
            birth_date: null,
          },
        })
      }
      if (url.pathname === '/api/auth/oauth/accounts') {
        return route.fulfill({
          json: {
            items: [{ provider: 'yandex', email: 'linked-client@example.com', created_at: '2026-01-01T00:00:00', is_linked: true }],
          },
        })
      }
      return route.fulfill({ json: {} })
    })

    await navigateSpa(page, '/auth/oauth/callback?ticket=link-ticket&mode=link')

    await expect(page).toHaveURL(/\/client\/profile/)
    await expect(page.getByText('Яндекс аккаунт привязан')).toBeVisible()
  })
})
