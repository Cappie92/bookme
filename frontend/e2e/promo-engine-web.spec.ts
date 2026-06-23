import { test, expect } from '@playwright/test'

test.describe('promo-engine web UI', () => {
  test('/register promo query opens master registration with prefilled promo code', async ({ page }) => {
    await page.goto('/register?promo_code=REF123')

    const authModal = page.locator('[data-testid="auth-modal"]')
    await expect(authModal).toBeVisible({ timeout: 5000 })
    await expect(authModal.getByRole('button', { name: 'Регистрация' })).toHaveClass(/border-\[#4CAF50\]|text-\[#4CAF50\]/)
    await expect(authModal.getByRole('button', { name: 'Мастер' })).toHaveClass(/bg-\[#4CAF50\]/)
    await expect(authModal.locator('input[name="promo_code"]')).toHaveValue('REF123')

    await authModal.getByRole('button', { name: 'Клиент' }).click()
    await expect(authModal.locator('input[name="promo_code"]')).toHaveCount(0)
  })

  test('subscription calculation recalculates when selected tariff changes', async ({ page }) => {
    const plans = [
      {
        id: 101,
        name: 'Basic',
        display_name: 'Базовый',
        subscription_type: 'MASTER',
        price_1month: 500,
        price_3months: 1350,
        price_6months: 2520,
        price_12months: 4560,
        features: {},
        limits: {},
        is_active: true,
        display_order: 2,
      },
      {
        id: 202,
        name: 'Premium',
        display_name: 'Премиум',
        subscription_type: 'MASTER',
        price_1month: 1000,
        price_3months: 2700,
        price_6months: 5040,
        price_12months: 9120,
        features: {},
        limits: {},
        is_active: true,
        display_order: 4,
      },
    ]
    const calculateRequests = []

    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'e2e-token')
      localStorage.setItem('user_role', 'MASTER')
    })

    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname
      const method = request.method()

      if (path === '/api/auth/users/me') {
        return route.fulfill({ json: { id: 1, role: 'MASTER', phone: '+79990000000', full_name: 'E2E Master' } })
      }
      if (path === '/api/subscription-plans/available') {
        return route.fulfill({ json: plans })
      }
      if (path === '/api/subscriptions/calculate' && method === 'POST') {
        const body = request.postDataJSON()
        calculateRequests.push(body)
        const total = body.plan_id === 202 ? 9120 : 4560
        return route.fulfill({
          json: {
            calculation_id: calculateRequests.length,
            plan_id: body.plan_id,
            duration_months: body.duration_months,
            upgrade_type: body.upgrade_type,
            total_price: total,
            final_price: total,
            savings_percent: 0,
            promo_preview: null,
          },
        })
      }
      if (path.startsWith('/api/subscriptions/calculate/') && method === 'DELETE') {
        return route.fulfill({ json: { ok: true } })
      }
      if (path === '/api/balance/subscription-status') {
        return route.fulfill({
          json: {
            plan_name: 'Free',
            plan_display_name: 'Бесплатный',
            plan_display_order: 1,
            features: {},
            limits: {},
            is_unlimited: false,
            is_always_free: false,
            can_continue: true,
          },
        })
      }
      if (path === '/api/subscriptions/my') {
        return route.fulfill({ status: 404, json: { detail: 'no_subscription' } })
      }
      if (path === '/api/subscriptions/freeze') {
        return route.fulfill({ json: { can_freeze: false, active_freezes: [] } })
      }
      if (path === '/api/master/referral-code') {
        return route.fulfill({ json: { code: 'MTEST123', beneficiary_bonus_rules: {}, referrer_bonus_rules: {}, stats: {} } })
      }
      if (path === '/api/master/promo-code/current') {
        return route.fulfill({ json: { promo_code: null } })
      }
      if (path === '/api/master/subscription-points') {
        return route.fulfill({ json: { balance: 0, items: [] } })
      }
      if (path === '/api/master/settings') {
        return route.fulfill({ json: { user: { id: 1, role: 'MASTER' }, master: { id: 1, city: 'Москва', domain: 'e2e-master' } } })
      }
      if (path.includes('/api/master/schedule/weekly')) {
        return route.fulfill({ json: { slots: [] } })
      }
      if (
        path === '/api/master/service-functions' ||
        path === '/api/master/services' ||
        path === '/api/master/categories' ||
        path === '/api/master/invitations'
      ) {
        return route.fulfill({ json: [] })
      }
      if (path === '/api/master/bookings/limit') {
        return route.fulfill({ json: { limit: 0, used: 0 } })
      }
      if (path === '/api/master/salon-work') {
        return route.fulfill({ json: {} })
      }
      if (path === '/api/balance/') {
        return route.fulfill({ json: { balance: 0 } })
      }

      return route.fulfill({ json: {} })
    })

    await page.goto('/master?tab=tariff')
    await expect(page.getByTestId('tariff-page-title')).toBeVisible()
    await page.getByTestId('tariff-buy-button').click()

    await page.getByTestId('tariff-plan-basic').click()
    await page.getByTestId('tariff-duration-12').click()
    await expect(page.getByTestId('tariff-final-price')).toHaveText('4 560 ₽')

    await page.getByTestId('tariff-plan-premium').click()
    await expect(page.getByTestId('tariff-final-price')).toHaveText('9 120 ₽')
    await expect.poll(() => calculateRequests[calculateRequests.length - 1]).toMatchObject({ plan_id: 202, duration_months: 12 })
  })
})
