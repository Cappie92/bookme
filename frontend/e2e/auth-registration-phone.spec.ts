import { expect, test } from '@playwright/test'

const PHONE = '+79005550001'
const RESTRICTED_REGISTER = 'restricted-register-token'
const RESTRICTED_LEGACY = 'restricted-legacy-token'
const FULL_ACCESS = 'full-access-token'
const FULL_REFRESH = 'full-refresh-token'

async function openRegistration(page) {
  await page.goto('/')
  await page.getByTestId('header-login').first().click()
  const modal = page.getByTestId('auth-modal')
  await modal.getByRole('button', { name: 'Регистрация' }).click()
  await modal.locator('input[name="name"]').fill('Signup User')
  await modal.locator('input[name="phone"]').fill(PHONE)
  await modal.locator('input[name="email"]').fill('signup@example.com')
  await modal.locator('input[name="password"]').fill('testpassword')
  await modal.locator('input[name="password2"]').fill('testpassword')
  await modal.locator('#agreeTerms').check()
  await modal.locator('#agreePersonalData').check()
  await modal.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  return modal
}

test.describe('common web registration phone verification', () => {
  test('close cancels pre-registration and login cannot resume an account that does not exist', async ({ page }) => {
    let registerCalls = 0
    let loginCalls = 0
    let phoneChangeCalls = 0
    const signupRequestAuth: string[] = []
    const signupRequestBodies: Array<string | null> = []
    const cancelAuth: string[] = []

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path === '/api/auth/users/me') {
        return route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
      }
      if (path === '/api/auth/register') {
        registerCalls += 1
        return route.fulfill({
          json: {
            status: 'phone_verification_required',
            verification_token: RESTRICTED_REGISTER,
            phone: PHONE,
            expires_in: 900,
            verification_kind: 'new_registration',
          },
        })
      }
      if (path === '/api/auth/login') {
        loginCalls += 1
        return route.fulfill({ status: 401, json: { detail: 'Неверный номер телефона или пароль' } })
      }
      if (path === '/api/auth/cancel-signup-phone-verification') {
        cancelAuth.push(request.headers().authorization || '')
        return route.fulfill({ status: 204, body: '' })
      }
      if (path === '/api/auth/request-signup-phone-verification') {
        signupRequestAuth.push(request.headers().authorization || '')
        signupRequestBodies.push(request.postData())
        return route.fulfill({
          json: { success: true, call_id: `call-${signupRequestAuth.length}` },
        })
      }
      if (path.includes('phone-change')) {
        phoneChangeCalls += 1
      }
      return route.fulfill({ json: {} })
    })

    const modal = await openRegistration(page)
    await expect(modal.getByRole('heading', { name: 'Верификация телефона' })).toBeVisible()
    await expect(page.getByTestId('signup-phone-readonly')).toHaveText(PHONE)
    await expect(modal.locator('input[name="phone"]')).toHaveCount(0)
    await expect(page.getByTestId('phone-completion-modal')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull()

    await page.getByTestId('auth-login-close').click()
    await expect(modal).not.toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull()
    expect(await page.evaluate(() => localStorage.getItem('refresh_token'))).toBeNull()

    await page.getByTestId('header-login').first().click()
    await modal.locator('input[name="phone"]').fill(PHONE)
    await modal.locator('input[name="password"]').fill('testpassword')
    await page.getByTestId('auth-login-submit').click()

    await expect(page.getByTestId('auth-login-error')).toContainText('Неверный номер телефона или пароль')
    await expect(page.getByTestId('phone-completion-modal')).toHaveCount(0)
    expect(registerCalls).toBe(1)
    expect(loginCalls).toBe(1)
    expect(phoneChangeCalls).toBe(0)
    expect(signupRequestAuth).toEqual([`Bearer ${RESTRICTED_REGISTER}`])
    expect(signupRequestBodies).toEqual([null])
    expect(cancelAuth).toEqual([`Bearer ${RESTRICTED_REGISTER}`])
  })

  test('full tokens are stored only after confirmation and users/me hydration', async ({ page }) => {
    let confirmBody: Record<string, unknown> | null = null
    let confirmAuth = ''
    let hydratedWith = ''

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path === '/api/auth/users/me') {
        const auth = request.headers().authorization || ''
        if (auth !== `Bearer ${FULL_ACCESS}`) {
          return route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
        }
        hydratedWith = auth
        return route.fulfill({
          json: {
            id: 501,
            email: 'signup@example.com',
            phone: PHONE,
            full_name: 'Signup User',
            role: 'client',
            is_active: true,
            is_verified: false,
            is_phone_verified: true,
            phone_required: false,
            phone_verified: true,
            is_always_free: false,
            created_at: '2026-08-11T10:00:00',
            updated_at: '2026-08-11T10:00:00',
          },
        })
      }
      if (path === '/api/auth/register') {
        return route.fulfill({
          json: {
            status: 'phone_verification_required',
            verification_token: RESTRICTED_REGISTER,
            phone: PHONE,
            expires_in: 900,
            verification_kind: 'new_registration',
          },
        })
      }
      if (path === '/api/auth/request-signup-phone-verification') {
        return route.fulfill({ json: { success: true, call_id: 'signup-call' } })
      }
      if (path === '/api/auth/confirm-signup-phone-verification') {
        confirmAuth = request.headers().authorization || ''
        confirmBody = request.postDataJSON()
        return route.fulfill({
          json: {
            access_token: FULL_ACCESS,
            refresh_token: FULL_REFRESH,
            token_type: 'bearer',
          },
        })
      }
      return route.fulfill({ json: {} })
    })

    await openRegistration(page)
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull()
    await page.getByTestId('signup-phone-digits').fill('1234')
    await page.getByRole('button', { name: 'Подтвердить', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Регистрация успешна!' })).toBeVisible()
    expect(confirmAuth).toBe(`Bearer ${RESTRICTED_REGISTER}`)
    expect(confirmBody).toEqual({ call_id: 'signup-call', phone_digits: '1234' })
    expect(hydratedWith).toBe(`Bearer ${FULL_ACCESS}`)
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBe(FULL_ACCESS)
    expect(await page.evaluate(() => localStorage.getItem('refresh_token'))).toBe(FULL_REFRESH)
    expect(await page.evaluate(() => localStorage.getItem('user_role'))).toBe('client')
    await expect(page.getByTestId('phone-completion-modal')).toHaveCount(0)
    await expect(page).toHaveURL(/\/client/, { timeout: 10000 })
  })

  test('legacy unverified login uses the existing-account artifact and keeps the same login flow', async ({ page }) => {
    let loginCalls = 0
    let requestAuth = ''
    let confirmAuth = ''

    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path === '/api/auth/login') {
        loginCalls += 1
        return route.fulfill({
          json: {
            status: 'phone_verification_required',
            verification_token: RESTRICTED_LEGACY,
            phone: PHONE,
            expires_in: 900,
            verification_kind: 'existing_account',
          },
        })
      }
      if (path === '/api/auth/request-signup-phone-verification') {
        requestAuth = request.headers().authorization || ''
        return route.fulfill({ json: { success: true, call_id: 'legacy-call' } })
      }
      if (path === '/api/auth/confirm-signup-phone-verification') {
        confirmAuth = request.headers().authorization || ''
        return route.fulfill({
          json: {
            access_token: FULL_ACCESS,
            refresh_token: FULL_REFRESH,
            token_type: 'bearer',
          },
        })
      }
      if (path === '/api/auth/users/me') {
        if (request.headers().authorization !== `Bearer ${FULL_ACCESS}`) {
          return route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
        }
        return route.fulfill({
          json: {
            id: 77,
            email: 'legacy@example.com',
            phone: PHONE,
            full_name: 'Legacy User',
            role: 'client',
            is_active: true,
            is_verified: true,
            is_phone_verified: true,
            phone_required: false,
            phone_verified: true,
            is_always_free: false,
            created_at: '2025-01-01T00:00:00',
            updated_at: '2026-08-11T10:00:00',
          },
        })
      }
      return route.fulfill({ json: {} })
    })

    await page.goto('/')
    await page.getByTestId('header-login').first().click()
    const modal = page.getByTestId('auth-modal')
    await modal.locator('input[name="phone"]').fill(PHONE)
    await modal.locator('input[name="password"]').fill('testpassword')
    await page.getByTestId('auth-login-submit').click()

    await expect(modal.getByRole('heading', { name: 'Верификация телефона' })).toBeVisible()
    await expect(page.getByTestId('signup-phone-readonly')).toHaveText(PHONE)
    expect(requestAuth).toBe(`Bearer ${RESTRICTED_LEGACY}`)
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull()

    await page.getByTestId('signup-phone-digits').fill('1234')
    await page.getByRole('button', { name: 'Подтвердить', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Телефон подтверждён!' })).toBeVisible()
    expect(confirmAuth).toBe(`Bearer ${RESTRICTED_LEGACY}`)
    expect(loginCalls).toBe(1)
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBe(FULL_ACCESS)
  })

  test('already verified login remains a direct full-session flow', async ({ page }) => {
    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path === '/api/auth/login') {
        return route.fulfill({
          json: {
            access_token: FULL_ACCESS,
            refresh_token: FULL_REFRESH,
            token_type: 'bearer',
          },
        })
      }
      if (path === '/api/auth/users/me') {
        if (request.headers().authorization !== `Bearer ${FULL_ACCESS}`) {
          return route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
        }
        return route.fulfill({
          json: {
            id: 88,
            email: 'verified@example.com',
            phone: PHONE,
            full_name: 'Verified User',
            role: 'client',
            is_active: true,
            is_verified: true,
            is_phone_verified: true,
            phone_required: false,
            phone_verified: true,
            is_always_free: false,
            created_at: '2025-01-01T00:00:00',
            updated_at: '2026-08-11T10:00:00',
          },
        })
      }
      return route.fulfill({ json: {} })
    })

    await page.goto('/')
    await page.getByTestId('header-login').first().click()
    const modal = page.getByTestId('auth-modal')
    await modal.locator('input[name="phone"]').fill(PHONE)
    await modal.locator('input[name="password"]').fill('testpassword')
    await page.getByTestId('auth-login-submit').click()

    await expect(page.getByTestId('phone-completion-modal')).toHaveCount(0)
    await expect(modal).not.toBeVisible()
    await expect(page).toHaveURL(/\/client/, { timeout: 10000 })
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBe(FULL_ACCESS)
  })
})
