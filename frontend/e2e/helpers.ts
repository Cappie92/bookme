import { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import * as path from 'path'

const LOGIN_TIMEOUT_MS = 45000
const NAV_DASHBOARD_TIMEOUT_MS = 20000

export async function loginViaUI(page: Page, phone: string, password: string) {
  let loginStatus: number | null = null
  let loginBody: string | null = null
  let usersMeStatus: number | null = null

  const loginResPromise = page.waitForResponse(
    (res) => res.url().includes('auth/login') && res.request().method() === 'POST',
    { timeout: LOGIN_TIMEOUT_MS }
  ).then(async (res) => {
    loginStatus = res.status()
    if (loginStatus !== 200) {
      try {
        const json = await res.json()
        loginBody = JSON.stringify(json)
          .replace(/"access_token"[^,}]*/g, '"access_token":"<redacted>"')
          .replace(/"refresh_token"[^,}]*/g, '"refresh_token":"<redacted>"')
      } catch {
        loginBody = await res.text().catch(() => '')
      }
    }
    return res
  })

  const usersMePromise = page.waitForResponse(
    (res) => res.url().includes('users/me') && res.request().method() === 'GET',
    { timeout: LOGIN_TIMEOUT_MS }
  ).then((res) => {
    usersMeStatus = res.status()
    return res
  })

  await page.goto('/')
  await page.getByRole('button', { name: /Войти/i }).first().click()

  await page.locator('[data-testid="auth-modal"]').waitFor({ state: 'visible', timeout: 5000 })
  const form = page.locator('[data-testid="auth-modal"] form')
  await form.locator('input[name="phone"]').fill(phone)
  await form.locator('input[name="password"]').fill(password)

  await page.locator('[data-testid="auth-login-submit"]').click()

  try {
    await loginResPromise
  } catch (e) {
    throw new Error(`Login timeout (${LOGIN_TIMEOUT_MS}ms). No auth/login response. ${loginStatus != null ? `Status: ${loginStatus}` : ''}`)
  }
  if (loginStatus !== 200) {
    const msg = [`Login API returned ${loginStatus}`, loginBody].filter(Boolean).join(' | ')
    throw new Error(msg)
  }

  try {
    await usersMePromise
  } catch (e) {
    throw new Error(`users/me timeout. Login was 200.`)
  }
  if (usersMeStatus !== null && usersMeStatus !== 200) {
    throw new Error(`users/me returned ${usersMeStatus}`)
  }

  try {
    await page.locator('[data-testid="nav-dashboard"]').or(page.locator('text=Мои записи').or(page.locator('text=Записи'))).first().waitFor({ state: 'visible', timeout: NAV_DASHBOARD_TIMEOUT_MS })
  } catch (e) {
    const errEl = await page.locator('[data-testid="auth-login-error"]').textContent().catch(() => null)
    const modalVisible = await page.locator('[data-testid="auth-modal"]').isVisible().catch(() => false)
    const screenshotPath = path.join(process.cwd(), 'test-results', `login-failed-${Date.now()}.png`)
    await page.screenshot({ path: screenshotPath }).catch(() => {})
    const diag = [
      `Dashboard did not appear within ${NAV_DASHBOARD_TIMEOUT_MS}ms`,
      `URL: ${page.url()}`,
      `auth-modal still visible: ${modalVisible}`,
      `auth-login-error: ${errEl || 'none'}`,
      `Screenshot: ${screenshotPath}`,
    ].join('; ')
    throw new Error(diag)
  }
}
