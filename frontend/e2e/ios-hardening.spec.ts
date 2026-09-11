import { test, expect, type Page } from '@playwright/test'

const forbidden = /pricing-catalog|subscription-plans|subscription|balance|payment\/init|loyalty|invitations/
const commerceLinks = 'a[href="/pricing"], a[href="/master/tariff"], a[href="/master/subscription/plans"]'

for (const staleError of [false, true]) {
  test(`batch A web schedule A → B → C ignores late response/error ${staleError}`, async ({ page }) => {
    const evidence = await fixture(page)
    await page.clock.setFixedTime(new Date('2026-09-11T12:00:00Z'))
    const held = new Map<number, () => Promise<void>>()
    const calls: number[] = []
    await page.route('**/api/master/schedule/weekly?**', async route => {
      const params = new URL(route.request().url()).searchParams
      // The independent conflict summary loads a different, wide date range.
      if (params.get('weeks_ahead') !== '3') return route.fulfill({ json: { slots: [] } })
      const offset = Number(params.get('week_offset'))
      calls.push(offset)
      if (!offset) return route.fulfill({ json: { slots: [] } })
      await new Promise<void>(resolve => {
        held.set(offset, async () => {
          await route.fulfill(staleError && offset === 1
            ? { status: 500, json: { detail: 'Old request error' } }
            : { json: { slots: [{ schedule_date: offset === 3 ? '2026-09-28' : '2026-09-14', hour: 8, minute: 0, is_working: true }] } })
          resolve()
        })
      })
    })
    await page.goto('/master?tab=schedule')
    for (const offset of [1, 2, 3]) {
      await page.getByRole('button', { name: 'Следующая неделя', exact: true }).click()
      await expect.poll(() => held.has(offset)).toBe(true)
    }
    const mondayEight = page.locator('#schedule-table tbody tr').nth(16).locator('td').nth(1)
    await held.get(3)!()
    await expect(mondayEight).toHaveClass(/bg-green-100/)
    await held.get(2)!()
    await held.get(1)!()
    await page.waitForLoadState('networkidle')
    await expect(mondayEight).toHaveClass(/bg-green-100/)
    await expect(page.getByText('Ошибка сети', { exact: true })).toHaveCount(0)
    // Development StrictMode replays initial mount; navigation itself fetches once.
    expect(calls).toEqual([0, 0, 1, 2, 3])
    expect(evidence.errors).toEqual([])
  })
}

for (const origin of ['ios_app', null]) {
  for (const outcome of ['success', 'error', 'newer-tab']) {
    test(`batch A OAuth ${origin} ${outcome}: unresolved origin never opens commerce`, async ({ page }) => {
      const evidence = await fixture(page, { origin })
      let release!: () => void
      const pending = new Promise<void>(resolve => { release = resolve })
      let started = false
      await page.route('**/api/auth/oauth/exchange', async route => {
        started = true
        await pending
        return route.fulfill(outcome === 'error'
          ? { status: 400, json: { detail: 'Invalid ticket' } }
          : { json: { access_token: 'oauth-result', user: user(origin, 'Paid'), oauth: { purpose: 'oauth_link', return_to: '/master' } } })
      })
      await page.goto('/auth/oauth/callback?ticket=local-fixture&mode=link')
      await expect.poll(() => started).toBe(true)
      await expect(page.locator(commerceLinks)).toHaveCount(0)
      expect(evidence.requests.filter(url => forbidden.test(url))).toEqual([])
      if (outcome === 'newer-tab') {
        await page.evaluate(() => {
          localStorage.setItem('access_token', 'test-ios-session')
          window.dispatchEvent(new StorageEvent('storage', { key: 'access_token' }))
        })
      }
      release()
      if (outcome === 'success') {
        await expect(page).toHaveURL(/\/master$/)
        if (origin === 'ios_app') {
          await expect(page.getByRole('complementary', { name: 'Навигация кабинета' })).toBeVisible()
          await expect(page.locator(commerceLinks)).toHaveCount(0)
          expect(evidence.requests.filter(url => forbidden.test(url))).toEqual([])
        } else await expect.poll(() => evidence.requests.some(url => /subscription|balance/.test(url))).toBe(true)
      } else if (outcome === 'error') {
        await expect(page.getByText('Не удалось войти через Яндекс. Попробуйте ещё раз или войдите по телефону.')).toBeVisible()
        expect(evidence.requests.filter(url => forbidden.test(url))).toEqual([])
      } else {
        await page.waitForLoadState('networkidle')
        expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBe('test-ios-session')
        expect(evidence.requests.filter(url => forbidden.test(url))).toEqual([])
      }
      expect(evidence.errors).toEqual([])
    })
  }
}

for (const timezoneId of ['UTC', 'Europe/Moscow']) {
  test.describe(`batch A drawer ${timezoneId}`, () => {
    test.use({ timezoneId })
    test('00:15 and 23:45 stay in the selected local day', async ({ page }) => {
      const evidence = await fixture(page)
      await page.clock.setFixedTime(new Date('2026-09-11T12:00:00Z'))
      const offset = timezoneId === 'UTC' ? 'Z' : '+03:00'
      const bookings = [
        { id: 1, service_name: 'Midnight local', start_time: `2026-09-11T00:15:00${offset}`, end_time: `2026-09-11T00:45:00${offset}`, status: 'confirmed' },
        { id: 2, service_name: 'Late local', start_time: `2026-09-11T23:45:00${offset}`, end_time: `2026-09-12T00:00:00${offset}`, status: 'confirmed' },
        { id: 3, service_name: 'Adjacent local', start_time: `2026-09-12T00:15:00${offset}`, end_time: `2026-09-12T00:45:00${offset}`, status: 'confirmed' },
      ]
      await page.route('**/api/master/bookings/detailed', route => route.fulfill({ json: bookings }))
      await page.goto('/master?tab=schedule')
      await page.getByRole('button', { name: 'Настроить день', exact: true }).nth(4).click()
      const drawer = page.getByText('Локальные правки только на эту дату · правило недели не меняется').locator('../../..')
      await expect(drawer.getByText('Midnight local', { exact: true })).toBeVisible()
      await expect(drawer.getByText('Late local', { exact: true })).toBeVisible()
      await expect(drawer.getByText('Adjacent local', { exact: true })).toHaveCount(0)
      expect(evidence.errors).toEqual([])
    })
  })
}

for (const input of ['100', '100.5', '100,5', '100.50', '100,50', '0']) {
  test(`batch A service decimal ${input} and clear description survive refetch`, async ({ page }) => {
    const evidence = await serviceEditorFixture(page)
    evidence.state.services[0].description = 'Old description'
    if (input === '0') evidence.state.services[0].price = 0
    await page.goto('/master?tab=services')
    const editor = await openServiceEditor(page)
    await editor.getByPlaceholder('Описание услуги').fill('')
    if (input !== '0') await editor.getByPlaceholder('0', { exact: true }).fill(input)
    await expect(editor.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled()
    await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(editor).toHaveCount(0)
    expect(evidence.state.services[0]).toMatchObject({ price: Number(input.replace(',', '.')), description: '', category_id: null })
    const reopened = await openServiceEditor(page)
    await expect(reopened.getByPlaceholder('Описание услуги')).toHaveValue('')
    await expect(reopened.getByPlaceholder('0', { exact: true })).toHaveValue(String(Number(input.replace(',', '.'))))
    expect(evidence.errors).toEqual([])
  })
}

test('batch A service rejects malformed decimal and safely displays structured errors', async ({ page }) => {
  const evidence = await serviceEditorFixture(page)
  await page.route('**/api/master/services/9', route => route.fulfill({ status: 422, json: { detail: [{ loc: ['body', 'price'], msg: 'private validation internals', input: 'private input' }] } }))
  await page.goto('/master?tab=services')
  const editor = await openServiceEditor(page)
  await editor.getByPlaceholder('0', { exact: true }).fill('100,5,2')
  await expect(editor.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled()
  await editor.getByPlaceholder('0', { exact: true }).fill('100,50')
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(editor.getByText('Проверьте поля: Цена.', { exact: true })).toBeVisible()
  await expect(editor.getByText(/private|\[object Object\]/)).toHaveCount(0)
  expect(evidence.errors).toEqual([])
})

for (const path of ['/master', '/master?tab=tariff', '/pricing', '/master/subscription/plans', '/payment/success', '/payment/failed']) {
  test(`integration demo ${path}: readonly cabinet never opens purchase UI`, async ({ page }) => {
    const evidence = await fixture(page, { origin: null })
    await page.route('**/api/auth/users/me', route => route.fulfill({
      json: { ...user(null, 'Paid'), is_demo_session: true },
    }))
    await page.goto(path)
    await expect(page.getByText('Демо-режим', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Продлить|Улучшить тариф|Оплатить|Купить/ })).toHaveCount(0)
    await expect(page.locator('[data-testid="subscription-modal"]')).toHaveCount(0)
    expect(evidence.requests.filter(url => /payment\/init|payments\/.*init/.test(url))).toEqual([])
    expect(evidence.errors).toEqual([])
  })
}

for (const plan of ['Free', 'Paid', 'AlwaysFree']) {
  test(`stabilization ios_app ${plan}: settings never mount domain editor/payment controls`, async ({ page }) => {
    const evidence = await fixture(page, { plan })
    await page.route('**/api/master/settings', route => route.fulfill({ json: {
      user: user('ios_app', plan), master: {
        domain: 'fixture', city: 'Москва', timezone: 'Europe/Moscow', can_work_independently: true,
        bio: 'Fixture', auto_confirm_bookings: false, payment_on_visit: true, payment_advance: true,
      },
    } }))
    await page.goto('/master?tab=settings&section=public-page')
    await expect(page.getByText('Ссылка на страницу записи', { exact: true })).toBeVisible()
    await expect(page.getByTestId('settings-master-domain-input')).toHaveCount(0)
    await expect(page.getByTestId('settings-save-domain-inline')).toHaveCount(0)
    await page.getByRole('button', { name: 'Редактировать настройки', exact: true }).click()
    await expect(page.getByText('Способы оплаты', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/Оплата при визите|Предоплата|оплата через систему DeDato/)).toHaveCount(0)
    const saved = page.waitForRequest(request =>
      new URL(request.url()).pathname === '/api/master/profile' && request.method() === 'PUT')
    await page.getByTestId('settings-save').click()
    const body = (await saved).postData() || ''
    expect(body).toContain('name="timezone"')
    expect(body).not.toMatch(/payment_on_visit|payment_advance|prepayment|robokassa/i)
    await expect(page.getByTestId('settings-edit')).toBeVisible()
    expect(evidence.requests.filter(url => /payment-settings|ios-web\/domain/.test(url))).toEqual([])
    expect(evidence.errors).toEqual([])
  })
}

test('stabilization ordinary web retains payment settings and green information text', async ({ page }) => {
  const evidence = await fixture(page, { origin: null })
  await page.goto('/master?tab=settings')
  await page.getByRole('button', { name: 'Редактировать настройки', exact: true }).click()
  await expect(page.getByText('Онлайн оплата через систему DeDato', { exact: true })).toBeVisible()
  const info = page.getByText('Предоплата и её контроль осуществляются мастером вне платформы', { exact: true })
  await expect(info).toBeVisible()
  await expect(info.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')).toHaveClass(/bg-\[#E8F5E9\]/)
  expect(evidence.requests.some(url => url.includes('payment-settings'))).toBe(true)
  expect(evidence.errors).toEqual([])
})

for (const kind of ['category', 'service', 'failure']) {
  test(`stabilization web delete ${kind}: no React hook crash, refetch without reload`, async ({ page }) => {
    const evidence = await fixture(page)
    let categories = [{ id: 8, name: 'Category X' }]
    let services: any[] = [{ id: 9, category_id: 8, name: 'Preserved service', price: 100, duration: 30 }]
    const deletions: string[] = []
    await page.route(/\/api\/master\/(categories|services)(\/\d+)?$/, async route => {
      const path = new URL(route.request().url()).pathname
      if (route.request().method() === 'DELETE') {
        deletions.push(path)
        if (kind === 'failure') return route.fulfill({ status: 500, json: { detail: 'Local failure' } })
        if (path.includes('/categories/')) { categories = []; services = services.map(s => ({ ...s, category_id: null })) }
        else services = []
        return route.fulfill({ json: { message: 'OK' } })
      }
      return route.fulfill({ json: path.endsWith('categories') ? categories : services })
    })
    await page.goto('/master?tab=services')
    await expect(page.getByText('Preserved service', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Удалить', exact: true }).nth(kind === 'service' ? 1 : 0).click()
    expect(evidence.errors).toEqual([])
    const modal = page.getByRole('heading', { name: kind === 'service' ? 'Удалить услугу' : 'Удалить категорию', exact: true }).locator('..')
    await modal.getByRole('button', { name: 'Удалить', exact: true }).click()
    if (kind === 'failure') {
      await expect(page.getByRole('alert')).toHaveText('Не удалось удалить. Попробуйте ещё раз.')
      await modal.getByRole('button', { name: 'Отмена', exact: true }).click()
    } else if (kind === 'category') {
      await expect(page.getByRole('heading', { name: 'Без категории', exact: true })).toBeVisible()
      await expect(page.getByText('Preserved service', { exact: true })).toBeVisible()
    } else await expect(page.getByText('Preserved service', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Мои услуги', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Создать услугу', exact: true })).toBeEnabled()
    expect(deletions).toHaveLength(1)
    expect(evidence.errors).toEqual([])
  })
}

async function serviceEditorFixture(page: Page, categoryId: number | null = null, empty = false) {
  const evidence = await fixture(page, { origin: null })
  const state = {
    categories: empty ? [] : [{ id: 8, name: 'Category A' }],
    services: empty ? [] as any[] : [{ id: 9, category_id: categoryId, name: 'Preserved service', price: 100, duration: 30, description: '' }],
    writes: [] as { method: string, path: string, body: any }[],
    failSave: false,
  }
  await page.route(/\/api\/master\/(categories|services)(\/\d+)?$/, async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const isCategory = path.includes('/categories')
    if (method === 'GET') return route.fulfill({ json: isCategory ? state.categories : state.services })
    const body = method === 'DELETE' ? null : route.request().postDataJSON()
    state.writes.push({ method, path, body })
    if (method === 'PUT') {
      if (state.failSave) return route.fulfill({ status: 500, json: { detail: 'Local save failure' } })
      // Match the existing API: null preserves the current category, not a clear command.
      state.services = state.services.map(s => ({ ...s, ...body, category_id: body.category_id ?? s.category_id }))
      return route.fulfill({ json: state.services[0] })
    }
    if (method === 'DELETE' && isCategory) {
      state.categories = []
      state.services = state.services.map(s => ({ ...s, category_id: null }))
      return route.fulfill({ json: { message: 'OK' } })
    }
    if (method === 'POST' && isCategory) {
      const category = { id: 8, ...body }
      state.categories.push(category)
      return route.fulfill({ json: category })
    }
    if (method === 'POST' && !isCategory) {
      const service = { id: 9, ...body }
      state.services.push(service)
      return route.fulfill({ json: service })
    }
    return route.fulfill({ status: 405, json: {} })
  })
  return { ...evidence, state }
}

async function openServiceEditor(page: Page) {
  await page.getByRole('heading', { level: 4 }).first().locator('..')
    .getByRole('button', { name: 'Редактировать', exact: true }).click()
  const editor = page.getByRole('heading', { name: 'Изменить услугу', exact: true }).locator('..')
  // Wait for the edit fixture to populate before clearing an initially empty input.
  await expect(editor.getByPlaceholder('Введите название услуги')).not.toHaveValue('')
  return editor
}

test('integration ordinary web can edit a preserved service without assigning a new category', async ({ page }) => {
  const evidence = await serviceEditorFixture(page)
  await page.goto('/master?tab=services')
  await expect(page.getByRole('heading', { name: 'Без категории', exact: true })).toBeVisible()
  const editor = await openServiceEditor(page)
  await expect(editor.locator('select').first()).toHaveValue('')
  await expect(editor.locator('select option:checked').first()).toHaveText('Без категории')
  await editor.getByPlaceholder('Введите название услуги').fill('Updated preserved service')
  await expect(editor.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled()
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Updated preserved service', { exact: true })).toBeVisible()
  expect(evidence.state.writes).toEqual([expect.objectContaining({
    method: 'PUT', path: '/api/master/services/9',
    body: expect.objectContaining({ name: 'Updated preserved service', category_id: null }),
  })])
  await expect(page.getByRole('heading', { name: 'Без категории', exact: true })).toBeVisible()
  expect(evidence.errors).toEqual([])
})

for (const categoryId of [null, 8]) {
  test(`null-category ordinary fields edit retains category ${categoryId}`, async ({ page }) => {
    const evidence = await serviceEditorFixture(page, categoryId)
    await page.goto('/master?tab=services')
    const editor = await openServiceEditor(page)
    await editor.getByPlaceholder('0', { exact: true }).fill('250')
    await editor.locator('select').nth(1).selectOption('60')
    await editor.getByPlaceholder('Описание услуги').fill('Updated description')
    await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(editor).toHaveCount(0)
    expect(evidence.state.services).toEqual([expect.objectContaining({ price: 250, duration: 60, description: 'Updated description', category_id: categoryId })])
    expect(evidence.state.writes[0].body.category_id).toBe(categoryId)
    await expect(page.getByText('Preserved service', { exact: true })).toBeVisible()
    expect(evidence.errors).toEqual([])
  })
}

for (const assign of [true, false]) {
  test(`null-category optional assignment, keep assignment=${assign}`, async ({ page }) => {
    const evidence = await serviceEditorFixture(page)
    await page.goto('/master?tab=services')
    const editor = await openServiceEditor(page)
    await editor.locator('select').first().selectOption('8')
    if (!assign) await editor.locator('select').first().selectOption('')
    await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(editor).toHaveCount(0)
    expect(evidence.state.writes[0].body.category_id).toBe(assign ? 8 : null)
    expect(evidence.state.services[0].category_id).toBe(assign ? 8 : null)
    await expect(page.getByText('Preserved service', { exact: true })).toBeVisible()
    expect(evidence.errors).toEqual([])
  })
}

for (const field of ['name', 'price']) {
  test(`null-category required ${field} validation remains enforced`, async ({ page }) => {
    const evidence = await serviceEditorFixture(page)
    await page.goto('/master?tab=services')
    const editor = await openServiceEditor(page)
    await editor.getByPlaceholder(field === 'name' ? 'Введите название услуги' : '0', { exact: true }).fill('')
    await expect(editor.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled()
    expect(evidence.state.writes).toEqual([])
  })
}

test('null-category backend failure leaves editor usable, retry preserves service', async ({ page }) => {
  const evidence = await serviceEditorFixture(page)
  evidence.state.failSave = true
  await page.goto('/master?tab=services')
  const editor = await openServiceEditor(page)
  await editor.getByPlaceholder('Введите название услуги').fill('Retry service')
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect.poll(() => evidence.state.writes.length).toBe(1)
  await expect(editor.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled()
  expect(evidence.state.services).toEqual([expect.objectContaining({ name: 'Preserved service', category_id: null })])
  evidence.state.failSave = false
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(page.getByText('Retry service', { exact: true })).toBeVisible()
  expect(evidence.state.services).toHaveLength(1)
  expect(evidence.state.services[0].category_id).toBeNull()
  expect(evidence.errors).toEqual([])
})

test('null-category complete create category/service, delete category, edit preserved service', async ({ page }) => {
  const evidence = await serviceEditorFixture(page, null, true)
  await page.goto('/master?tab=services')
  // Creation still requires a category.
  await page.getByRole('button', { name: 'Создать услугу', exact: true }).click()
  let editor = page.getByRole('heading', { name: 'Создать услугу', exact: true }).locator('..')
  await editor.getByPlaceholder('Введите название услуги').fill('Created service')
  await editor.getByPlaceholder('0', { exact: true }).fill('100')
  await expect(editor.getByRole('button', { name: 'Создать', exact: true }).last()).toBeDisabled()
  await expect(editor.locator('select').first()).toHaveAttribute('required', '')
  await editor.getByRole('button', { name: 'Отмена', exact: true }).click()
  await page.getByRole('button', { name: 'Создать категорию', exact: true }).click()
  const categoryEditor = page.getByRole('heading', { name: 'Создать категорию', exact: true }).locator('..')
  await categoryEditor.getByPlaceholder('Введите название категории').fill('Category A')
  await categoryEditor.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(categoryEditor).toHaveCount(0)
  await page.getByRole('button', { name: 'Создать услугу', exact: true }).click()
  editor = page.getByRole('heading', { name: 'Создать услугу', exact: true }).locator('..')
  await editor.getByPlaceholder('Введите название услуги').fill('Created service')
  await editor.getByPlaceholder('0', { exact: true }).fill('100')
  await editor.getByRole('button', { name: 'Создать', exact: true }).last().click()
  await expect(page.getByText('Created service', { exact: true })).toBeVisible()
  expect(evidence.state.services[0].category_id).toBe(8)
  await page.getByRole('button', { name: 'Удалить', exact: true }).first().click()
  const confirmation = page.getByRole('heading', { name: 'Удалить категорию', exact: true }).locator('..')
  await confirmation.getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Без категории', exact: true })).toBeVisible()
  expect(evidence.state.categories).toEqual([])
  editor = await openServiceEditor(page)
  await editor.getByPlaceholder('Введите название услуги').fill('Edited after category deletion')
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Edited after category deletion', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Без категории', exact: true })).toBeVisible()
  expect(evidence.state.services).toEqual([expect.objectContaining({ id: 9, category_id: null })])
  expect(evidence.state.writes.map(w => w.method)).toEqual(['POST', 'POST', 'DELETE', 'PUT'])
  expect(evidence.state.writes[3].body.category_id).toBeNull()
  expect(evidence.errors).toEqual([])
})

test('stabilization pending first load survives settings/request race without tab roundtrip', async ({ page }) => {
  const evidence = await fixture(page, { origin: null })
  const held: (() => Promise<void>)[] = []
  let filteredCalls = 0
  await page.route('**/api/master/past-appointments?*', async route => {
    const url = new URL(route.request().url())
    const status = url.searchParams.get('status')
    const payload = { appointments: status === 'created' ? [{
      id: 99, date: '2026-01-01', time: '10:00', status: 'created',
      client_name: 'Pending fixture client', service_name: 'Pending fixture service',
      start_time: '2026-01-01T10:00:00', end_time: '2026-01-01T11:00:00',
    }] : [], total: status === 'created' ? 19 : 0, pages: 1 }
    const fulfill = () => route.fulfill({ json: payload })
    if (status && ++filteredCalls <= 3) { held.push(fulfill); return }
    await fulfill()
  })
  await page.goto('/master')
  await expect.poll(() => filteredCalls).toBeGreaterThan(3)
  // The first requests captured master=null; complete them last.
  await Promise.all(held.map(fulfill => fulfill()))
  await page.waitForLoadState('networkidle')
  await page.getByRole('tab', { name: /Ожидают/ }).filter({ visible: true }).first().click()
  await expect(page.getByText('Pending fixture client', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  expect(evidence.errors).toEqual([])
})

for (const timezoneId of ['UTC', 'Europe/Moscow']) {
  test.describe(`stabilization browser date ${timezoneId}`, () => {
    test.use({ timezoneId })
    test('Friday selection sends only Friday; no past Sunday, error dates localized', async ({ page }) => {
      const evidence = await fixture(page)
      await page.clock.setFixedTime(new Date('2026-09-10T21:15:00Z'))
      const payloads: any[] = []
      await page.route('**/api/master/schedule/day', route => {
        payloads.push(route.request().postDataJSON())
        return route.fulfill({ status: 400, json: { detail: 'Дата 2026-09-06 уже прошла.' } })
      })
      await page.goto('/master?tab=schedule')
      const cell = page.locator('#schedule-table tbody tr').nth(16).locator('td').nth(5)
      await cell.click()
      await page.getByRole('button', { name: 'Установить рабочее время', exact: true }).click()
      await expect.poll(() => payloads.length).toBe(1)
      expect(payloads[0]).toEqual({ schedule_date: '2026-09-11', open_slots: [{ hour: 8, minute: 0 }] })
      await expect(page.getByText('Дата 06.09.2026 уже прошла.', { exact: true })).toBeVisible()
      expect(evidence.errors).toEqual([])
    })
  })
}
const user = (origin: string | null, plan = 'Free') => ({
  id: 1, role: 'master', full_name: 'Fixture Master', web_session_origin: origin,
  phone: '+79990000000', is_phone_verified: true,
  is_always_free: plan === 'AlwaysFree', subscription_plan: plan,
})

async function fixture(page: Page, { origin = 'ios_app' as string | null, plan = 'Free', token = true, authError = false, exchangeError = false } = {}) {
  const requests: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(({ token }) => {
    if (token && !localStorage.getItem('access_token')) localStorage.setItem('access_token', 'test-session-one')
  }, { token })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === 'mc.yandex.ru' && url.pathname.endsWith('tag.js')) return route.fulfill({ contentType: 'application/javascript', body: '/* Local analytics stub: no external network. */' })
    if (url.origin !== 'http://127.0.0.1:5197') return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    requests.push(url.pathname + url.search)
    if (url.pathname === '/api/auth/users/me') {
      if (authError) return route.abort()
      const currentOrigin = route.request().headers().authorization?.includes('test-ios-session') ? 'ios_app' : origin
      return route.fulfill({ json: user(currentOrigin, plan) })
    }
    if (url.pathname.endsWith('/web-handoff/exchange')) {
      return route.fulfill(exchangeError ? { status: 410, json: { detail: 'Expired' } } :
        { json: { access_token: 'test-ios-session', user: user('ios_app', plan), web_session_origin: 'ios_app', redirect_to: '/master?tab=schedule' } })
    }
    if (url.pathname === '/api/master/settings') return route.fulfill({ json: {
      user: user(origin, plan), master: { id: 1, domain: 'fixture', city: 'Москва', timezone: 'Europe/Moscow', bio: 'Fixture', address: 'Fixture', auto_confirm_bookings: false },
    } })
    if (url.pathname.includes('past-appointments')) return route.fulfill({ json: {
      appointments: [{ id: 1, date: '2026-01-01', time: '10:00', status: 'completed', client_name: 'Fixture Client', service_name: 'Fixture Service' }], pages: 1, total: 1,
    } })
    if (url.pathname.includes('schedule/weekly') || url.pathname.includes('schedule/monthly')) return route.fulfill({ json: { slots: [] } })
    if (url.pathname.includes('bookings/future')) return route.fulfill({ json: { bookings: [], total: 0 } })
    if (url.pathname.includes('dashboard/stats')) return route.fulfill({ json: { weeks_data: [], bookings_count: 0 } })
    if (url.pathname.includes('pricing-catalog')) return route.fulfill({ json: { plans: [{ id: 1, name: 'Free', price: 0, duration: 1, service_functions: [] }], service_functions: [] } })
    if (/services|categories|conflicts|rules|detailed|favorites|cities/.test(url.pathname)) return route.fulfill({ json: [] })
    return route.fulfill({ json: {} })
  })
  return { requests, errors }
}

async function openProbe(page: Page) {
  await page.goto('/e2e/fixtures/iosHardeningHarness.html')
}

for (const width of [375, 430, 768, 820, 1024, 1180]) {
  for (const plan of ['Free', 'Paid', 'AlwaysFree']) {
    test(`ios_app ${plan} at ${width}px: four-tab shell, past bookings read-only, no commerce APIs`, async ({ page }) => {
      const evidence = await fixture(page, { plan })
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/master?tab=schedule')
      const nav = width < 1024 ? page.getByTestId('ios-app-web-editor-nav') : page.getByRole('complementary', { name: 'Навигация кабинета' })
      await expect(nav).toBeVisible()
      for (const label of ['Дашборд', 'Расписание', 'Услуги', 'Настройки']) await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible()
      await expect(nav.getByRole('button')).toHaveCount(4)
      await page.getByRole('tab', { name: 'Прошедшие записи', exact: true }).click()
      await expect(page.getByText('Fixture Client')).toBeVisible()
      await expect(page.getByText('Изменить статус', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0)
      await expect(page.locator(commerceLinks)).toHaveCount(0)
      expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
      expect(evidence.requests.filter((url) => url.includes('/accounting/'))).toEqual([])
      expect(evidence.errors).toEqual([])
      if (plan === 'Free' && [375, 820].includes(width)) {
        await page.screenshot({ path: test.info().outputPath('ios-editor.png'), fullPage: true })
      }
    })
  }
}

for (const path of ['/about', '/privacy-policy', '/user-agreement', '/personal-data-consent', '/account-deletion']) {
  test(`trusted iOS public/legal ${path} has no commerce links`, async ({ page }) => {
    const evidence = await fixture(page)
    await page.goto(path)
    await expect(page.locator('main, article').first()).toBeVisible()
    await expect(page.locator(commerceLinks)).toHaveCount(0)
    expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
  })
  test(`ordinary public ${path} retains pricing link`, async ({ page }) => {
    await fixture(page, { token: false, origin: null })
    await page.goto(path)
    await expect(page.locator('a[href="/pricing"]').first()).toBeVisible()
  })
}

test('native legal flag protects existing ordinary browser session and survives public navigation', async ({ page }) => {
  await fixture(page, { origin: null })
  await page.goto('/privacy-policy?context=ios_app')
  await expect(page.locator('main, article').first()).toBeVisible()
  await expect(page.locator(commerceLinks)).toHaveCount(0)
  await page.goto('/about')
  await expect(page.locator(commerceLinks)).toHaveCount(0)
  await page.goto('/master')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
})

for (const path of ['/pricing', '/master/tariff', '/master/subscription/plans', '/payment/success', '/payment/failed', '/master?tab=accounting', '/master?tab=loyalty', '/master?tab=clients', '/master?tab=stats', '/master?tab=restrictions', '/master?tab=salon-work', '/master?tab=invitations']) {
  test(`ios_app forbidden route ${path} never mounts commerce`, async ({ page }) => {
    const evidence = await fixture(page)
    await page.goto(path)
    await expect(page.getByRole('complementary', { name: 'Навигация кабинета' })).toBeVisible()
    await expect(page.locator(commerceLinks)).toHaveCount(0)
    expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
  })
}

test('expired handoff keeps old ordinary session isolated, including reload/direct cabinet', async ({ page }) => {
  const evidence = await fixture(page, { origin: null, exchangeError: true })
  await page.goto('/auth/mobile-handoff?code=test-one-time-code')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
  await expect(page).not.toHaveURL(/code=/)
  await expect(page.getByText('Перейти в кабинет')).toHaveCount(0)
  await page.goto('/master')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
  expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
})

test('successful handoff works under React StrictMode', async ({ page }) => {
  await fixture(page, { origin: null })
  await page.goto('/auth/mobile-handoff?code=test-one-time-code')
  await expect(page.getByRole('complementary', { name: 'Навигация кабинета' })).toBeVisible()
  await expect(page).toHaveURL(/tab=schedule/)
})

for (const authError of [false, true]) {
  test(`accidental pricing hook mount with iOS/error=${authError} never fetches catalog`, async ({ page }) => {
    const evidence = await fixture(page, { authError })
    await openProbe(page)
    await expect(page.getByTestId('state')).toHaveText(authError ? 'AUTH_ERROR' : 'AUTHENTICATED_IOS_APP')
    expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
    await expect(page.getByTestId('plans')).toHaveText('0')
  })
}

test('ordinary anonymous hook works; iOS transition aborts pending catalog and hides stale data', async ({ page }) => {
  await fixture(page, { token: false, origin: null })
  await openProbe(page)
  await expect(page.getByTestId('plans')).toHaveText('1')
  await page.getByRole('button', { name: 'iOS login' }).click()
  await expect(page.getByTestId('plans')).toHaveText('0')
  await expect(page.getByTestId('state')).toHaveText('AUTHENTICATED_IOS_APP')
})

for (const plan of ['Free', 'Paid', 'AlwaysFree']) {
  test(`${plan}: every approved editor tab keeps the same non-commerce API surface`, async ({ page }) => {
    const evidence = await fixture(page, { plan })
    for (const tab of ['dashboard', 'schedule', 'services', 'settings']) {
      await page.goto('/master?tab=' + tab)
      await expect(page.getByRole('complementary', { name: 'Навигация кабинета' })).toBeVisible()
      await expect(page.locator('main')).toBeVisible()
      await expect(page.locator(commerceLinks)).toHaveCount(0)
      await expect(page.getByText('Тариф заморожен', { exact: true })).toHaveCount(0)
    }
    expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
    expect(evidence.errors).toEqual([])
    await test.info().attach('operational-api-matrix', {
      body: JSON.stringify([...new Set(evidence.requests)].sort(), null, 2),
      contentType: 'application/json',
    })
  })
}

test('real storage events synchronize ordinary/iOS replacement and logout across tabs', async ({ page, context }) => {
  await fixture(page, { origin: null })
  await openProbe(page)
  await expect(page.getByTestId('state')).toHaveText('AUTHENTICATED_ORDINARY')
  const other = await context.newPage()
  await fixture(other, { token: false, origin: null })
  await other.goto('/about')
  await other.evaluate(() => localStorage.setItem('access_token', 'test-ios-session'))
  await expect(page.getByTestId('state')).toHaveText('AUTHENTICATED_IOS_APP')
  await expect(page.getByTestId('plans')).toHaveText('0')
  await other.evaluate(() => localStorage.setItem('access_token', 'test-new-ordinary'))
  await expect(page.getByTestId('state')).toHaveText('AUTHENTICATED_ORDINARY')
  await expect(page.getByTestId('plans')).toHaveText('1')
  await other.evaluate(() => localStorage.removeItem('access_token'))
  await expect(page.getByTestId('state')).toHaveText('ANONYMOUS_CONFIRMED')
})

test('catalog AbortController cancels a genuinely pending request on iOS transition', async ({ page }) => {
  await fixture(page, { token: false, origin: null })
  await page.addInitScript(() => {
    const original = window.fetch
    ;(window as any).__catalogSignals = []
    window.fetch = (input, init) => {
      if (String(input).includes('pricing-catalog')) (window as any).__catalogSignals.push(init?.signal)
      return original(input, init)
    }
  })
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/subscription-plans/pricing-catalog?*', async (route) => {
    await pending
    await route.fulfill({ json: { plans: [{ name: 'Free' }] } }).catch(() => {})
  })
  await openProbe(page)
  await expect.poll(() => page.evaluate(() => (window as any).__catalogSignals.length)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'iOS login' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__catalogSignals.every((signal: AbortSignal) => signal.aborted))).toBe(true)
  release()
  await expect(page.getByTestId('plans')).toHaveText('0')
})

test('late ordinary bootstrap cannot enable mounted catalog after newer iOS login', async ({ page }) => {
  const evidence = await fixture(page, { origin: null })
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/auth/users/me', async (route) => {
    await pending
    await route.fulfill({ json: user(null) }).catch(() => {})
  })
  await openProbe(page)
  await expect(page.getByTestId('state')).toHaveText('LOADING')
  await page.getByRole('button', { name: 'iOS login' }).click()
  release()
  await expect(page.getByTestId('state')).toHaveText('AUTHENTICATED_IOS_APP')
  await expect(page.getByTestId('plans')).toHaveText('0')
  expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
})

test('network-failed handoff never opens the existing ordinary cabinet', async ({ page }) => {
  const evidence = await fixture(page, { origin: null })
  await page.route('**/api/auth/web-handoff/exchange', (route) => route.abort())
  await page.goto('/auth/mobile-handoff?code=test-one-time-code')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
  await expect(page.locator('a')).toHaveCount(0)
  await page.goto('/pricing')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
  expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
})

test('existing token auth failure denies the actual direct Pricing route', async ({ page }) => {
  const evidence = await fixture(page, { authError: true })
  await page.goto('/pricing')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
  expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
})

test('ordinary login still resolves profile and opens its normal master cabinet', async ({ page }) => {
  await fixture(page, { token: false, origin: null })
  await page.route('**/api/auth/login', (route) => route.fulfill({ json: {
    access_token: 'test-ordinary-login', refresh_token: 'test-refresh', token_type: 'bearer',
  } }))
  await page.goto('/about')
  await page.getByTestId('header-login').first().click()
  const modal = page.getByTestId('auth-modal')
  await modal.locator('input[name="phone"]').fill('+79990000000')
  await modal.locator('input[name="password"]').fill('testpassword')
  await page.getByTestId('auth-login-submit').click()
  await expect(modal).not.toBeVisible()
  await expect(page).toHaveURL(/\/master/)
  await expect(page.getByRole('complementary', { name: 'Навигация кабинета' })).toBeVisible()
  await expect(page.getByText('Мой тариф', { exact: true }).first()).toBeVisible()
})

test('ordinary web past accounting operation remains available', async ({ page }) => {
  await fixture(page, { origin: null, plan: 'Paid' })
  await page.goto('/master?tab=schedule')
  await page.getByRole('tab', { name: 'Прошедшие записи', exact: true }).click()
  await expect(page.getByText('Изменить статус', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible()
})

async function captureAnalytics(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).__analyticsCalls = []
    ;(window as any).ym = (...args: unknown[]) => (window as any).__analyticsCalls.push(args)
  })
}

async function analyticsCalls(page: Page): Promise<any[][]> {
  return page.evaluate(() => (window as any).__analyticsCalls)
}

for (const query of [
  '',
  '?code=SYNTHETIC_HANDOFF_TICKET',
  '?source=ios&code=SYNTHETIC_HANDOFF_TICKET',
  '?%63ode=SYNTHETIC%5FHANDOFF%5FTICKET#access_token=SYNTHETIC_FRAGMENT',
]) {
  test(`analytics sanitizes handoff before lazy module loads: ${query || 'no code'}`, async ({ page }) => {
    await fixture(page, { origin: null, exchangeError: true })
    await captureAnalytics(page)
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    let moduleRequested = false
    await page.route('**/src/pages/MobileHandoff.jsx', async (route) => {
      moduleRequested = true
      await pending
      await route.continue()
    })
    try {
      await page.goto('/auth/mobile-handoff' + query, { waitUntil: 'domcontentloaded' })
      await expect.poll(() => moduleRequested).toBe(true)
      await expect.poll(async () => (await analyticsCalls(page)).filter((a) => a[1] === 'hit').length).toBeGreaterThan(0)
      // The URL is still untouched: sanitization cannot be credited to replaceState.
      expect(new URL(page.url()).search).toBe(new URL('https://example.com/' + query).search)
      await expect(page.getByTestId('isolated-session-error')).toHaveCount(0)
      const before = await analyticsCalls(page)
      expect(before.filter((a) => a[1] === 'hit').map((a) => a[2])).toEqual(['/auth/mobile-handoff'])
      expect(JSON.stringify(before)).not.toMatch(/SYNTHETIC|code=|%63ode=|access_token=/i)
      await test.info().attach('safe-lazy-order-evidence', {
        body: JSON.stringify({ moduleDelayed: true, pageviewBeforeCleanup: true, routes: before.filter((a) => a[1] === 'hit').map((a) => a[2]), sensitivePayload: false }),
        contentType: 'application/json',
      })
    } finally {
      release()
    }
    await expect(page.getByTestId('isolated-session-error')).toBeVisible()
    await expect(page).not.toHaveURL(/code=/)
    // SPA navigation/re-render must not revive the ticket in any analytics call.
    for (const path of ['/about', '/auth/mobile-handoff?code=SYNTHETIC_SECOND_TICKET']) {
      await page.evaluate((path) => {
        history.pushState({}, '', path)
        dispatchEvent(new PopStateEvent('popstate'))
      }, path)
      if (path === '/about') await expect(page.locator('main')).toBeVisible()
      else await expect(page.getByTestId('isolated-session-error')).toBeVisible()
    }
    expect(JSON.stringify(await analyticsCalls(page))).not.toMatch(/SYNTHETIC|code=|access_token=/i)
  })
}

for (const outcome of [400, 410, 500, 'network'] as const) {
  test(`analytics and console keep failed handoff ${outcome} credential-free`, async ({ page }) => {
    await fixture(page, { origin: null })
    await captureAnalytics(page)
    const consoleMessages: string[] = []
    page.on('console', (message) => consoleMessages.push(message.text()))
    await page.route('**/api/auth/web-handoff/exchange', (route) => outcome === 'network'
      ? route.abort()
      : route.fulfill({ status: outcome, json: { detail: 'SYNTHETIC_HANDOFF_TICKET must not be echoed' } }))
    await page.goto('/auth/mobile-handoff?code=SYNTHETIC_HANDOFF_TICKET')
    await expect(page.getByTestId('isolated-session-error')).toBeVisible()
    await expect.poll(async () => (await analyticsCalls(page)).filter((a) => a[1] === 'hit').length).toBeGreaterThan(0)
    expect(JSON.stringify(await analyticsCalls(page))).not.toMatch(/SYNTHETIC|code=/i)
    expect(consoleMessages.join('\n')).not.toContain('SYNTHETIC_HANDOFF_TICKET')
    await expect(page.locator('body')).not.toContainText('SYNTHETIC_HANDOFF_TICKET')
    await expect(page.locator('a')).toHaveCount(0)
  })
}

test('ordinary analytics keeps safe query dimensions and anchors after navigation', async ({ page }) => {
  await fixture(page, { token: false, origin: null })
  await captureAnalytics(page)
  await page.goto('/about?utm_source=mail#features')
  await expect.poll(async () => (await analyticsCalls(page)).filter((a) => a[1] === 'hit').map((a) => a[2]))
    .toContain('/about?utm_source=mail#features')
  await page.evaluate(() => {
    history.pushState({}, '', '/pricing?subscription_type=master&utm_source=mail#plans')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect.poll(async () => (await analyticsCalls(page)).filter((a) => a[1] === 'hit').map((a) => a[2]))
    .toContain('/pricing?subscription_type=master&utm_source=mail#plans')
})
