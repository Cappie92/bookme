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
        features: { service_functions: [1, 6] },
        limits: {},
        is_active: true,
        display_order: 2,
      },
      {
        id: 151,
        name: 'Pro',
        display_name: 'Стандартный',
        subscription_type: 'MASTER',
        price_1month: 700,
        price_3months: 1890,
        price_6months: 3780,
        price_12months: 6960,
        features: { service_functions: [1, 2, 5, 6, 7] },
        limits: {},
        is_active: true,
        display_order: 3,
      },
      {
        id: 202,
        name: 'Premium',
        display_name: 'Премиум',
        subscription_type: 'MASTER',
        price_1month: 1000,
        price_3months: 2700,
        price_6months: 5040,
        price_12months: 10800,
        features: { service_functions: [1, 2, 3, 4, 5, 6, 7] },
        limits: {},
        is_active: true,
        display_order: 4,
      },
    ]
    const serviceFunctions = [
      { id: 2, name: 'extended_statistics', display_name: 'Статистика', display_order: 3 },
      { id: 3, name: 'loyalty_program', display_name: 'Лояльность', display_order: 4 },
      { id: 4, name: 'finance_management', display_name: 'Финансы', display_order: 5 },
      { id: 5, name: 'client_restrictions', display_name: 'Стоп-листы и предоплата', display_order: 6 },
      { id: 6, name: 'custom_domain', display_name: 'Персональный домен', display_order: 7 },
      { id: 7, name: 'clients', display_name: 'Клиенты', display_order: 8 },
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
        const isPremium = body.plan_id === 202
        const total = isPremium ? 10800 : 4560
        const points = isPremium ? 2700 : 1140
        return route.fulfill({
          json: {
            calculation_id: calculateRequests.length,
            plan_id: body.plan_id,
            duration_months: body.duration_months,
            upgrade_type: body.upgrade_type,
            total_price: total,
            final_price: total,
            savings_percent: 0,
            promo_preview: {
              code: 'MTEST123',
              campaign_type: 'MASTER_REFERRAL',
              eligible: true,
              period_months: body.duration_months,
              percent: 25,
              points_amount: points,
              label: `+${points} бонусных баллов после оплаты`,
              ineligible_reason: null,
            },
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
        path === '/api/master/services' ||
        path === '/api/master/categories' ||
        path === '/api/master/invitations'
      ) {
        return route.fulfill({ json: [] })
      }
      if (path === '/api/master/service-functions') {
        return route.fulfill({ json: serviceFunctions })
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

    const basicCard = page.getByTestId('tariff-plan-basic')
    await expect(basicCard).toContainText('Без ограничений на запись')
    await expect(basicCard).toContainText('Персональный домен')

    const standardCard = page.getByTestId('tariff-plan-pro')
    await expect(standardCard).toContainText('Без ограничений на запись')
    await expect(standardCard).toContainText('Статистика')
    await expect(standardCard).toContainText('Стоп-листы и предоплата')
    await expect(standardCard).toContainText('Персональный домен')
    await expect(standardCard).toContainText('Клиенты')

    const premiumCard = page.getByTestId('tariff-plan-premium')
    await expect(premiumCard).toContainText('Без ограничений на запись')
    await expect(premiumCard).toContainText('Статистика')
    await expect(premiumCard).toContainText('Лояльность')
    await expect(premiumCard).toContainText('Финансы')
    await expect(premiumCard).toContainText('Стоп-листы и предоплата')
    await expect(premiumCard).toContainText('Персональный домен')
    await expect(premiumCard).toContainText('Клиенты')

    await page.getByTestId('tariff-plan-premium').click()
    await page.getByTestId('tariff-duration-12').click()
    await expect(page.getByTestId('tariff-final-price')).toHaveText('10 800 ₽')
    await expect(page.getByTestId('subscription-promo-preview')).toContainText('+2 700 бонусных баллов после оплаты')
    await expect(page.getByTestId('tariff-payment-button')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Назад' })).toHaveCount(0)
    await expect(page.getByText('Debug preview breakdown')).toHaveCount(0)
    await expect.poll(() => calculateRequests[calculateRequests.length - 1]).toMatchObject({ plan_id: 202, duration_months: 12 })

    await page.getByTestId('tariff-plan-basic').click()
    await expect(page.getByTestId('tariff-final-price')).toHaveText('4 560 ₽')
    await expect(page.getByTestId('subscription-promo-preview')).toContainText('+1 140 бонусных баллов после оплаты')
    await expect.poll(() => calculateRequests[calculateRequests.length - 1]).toMatchObject({ plan_id: 101, duration_months: 12 })

    await page.getByTestId('tariff-plan-premium').click()
    await expect(page.getByTestId('tariff-final-price')).toHaveText('10 800 ₽')
    await expect(page.getByTestId('subscription-promo-preview')).toContainText('+2 700 бонусных баллов после оплаты')
    await expect.poll(() => calculateRequests[calculateRequests.length - 1]).toMatchObject({ plan_id: 202, duration_months: 12 })
  })
})
