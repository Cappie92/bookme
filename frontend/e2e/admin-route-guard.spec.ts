import { test, expect } from '@playwright/test'

async function mockApi(page, role: string | null) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path === '/api/auth/users/me') {
      if (!role) {
        return route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
      }
      return route.fulfill({
        json: {
          id: 1,
          role,
          phone: '+79990000000',
          full_name: `${role} User`,
        },
      })
    }

    if (path === '/api/admin/promo-engine/stats') {
      return route.fulfill({
        json: {
          total_campaigns: 0,
          active_campaigns: 0,
          total_codes: 0,
          active_codes: 0,
          total_redemptions: 0,
          pending_redemptions: 0,
          redeemed_redemptions: 0,
          total_grants: 0,
          applied_grants: 0,
          total_points_granted: 0,
          total_ledger_entries: 0,
          total_ledger_points: 0,
        },
      })
    }

    if (path.startsWith('/api/admin/promo-engine/')) {
      return route.fulfill({ json: { items: [], total: 0, skip: 0, limit: 50 } })
    }

    return route.fulfill({ json: {} })
  })
}

async function navigateSpa(page, path: string) {
  await page.goto('/')
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

test.describe('admin route guard', () => {
  test('guest cannot render admin sidebar or promo page', async ({ page }) => {
    await mockApi(page, null)

    await navigateSpa(page, '/admin/promo-engine')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Панель администратора')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Промокоды' })).toHaveCount(0)
  })

  test('non-admin cannot render admin sidebar', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'master-token')
    })
    await mockApi(page, 'master')

    await navigateSpa(page, '/admin/functions')

    await expect(page).toHaveURL(/\/master/)
    await expect(page.getByText('Панель администратора')).toHaveCount(0)
  })

  test('admin can render admin promo route', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'admin-token')
    })
    await mockApi(page, 'admin')

    await navigateSpa(page, '/admin/promo-engine')

    await expect(page.getByText('Панель администратора')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Промокоды' })).toBeVisible()
  })
})
