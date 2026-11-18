/**
 * @vitest-environment happy-dom
 */
import { StrictMode, createElement, act, useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AVAILABILITY_LOAD_ERROR, onAvailabilityCommit } from './availabilityRequest'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ openAuthModal() {} }),
  AuthProvider: ({ children }) => children,
}))

import PublicBookingWizard from './PublicBookingWizard'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const profile = {
  master_timezone: 'Europe/Moscow',
  services: [
    { id: 1, name: 'Стрижка', price: 1000, duration: 30, category_name: 'Без категории' },
    { id: 2, name: 'Окрашивание', price: 2000, duration: 60, category_name: 'Без категории' },
  ],
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function windowDay(offset) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

function slot(day) {
  return {
    start_time: `${day}T10:00:00`,
    end_time: `${day}T10:30:00`,
  }
}

function availabilityResponse(slots, ok = true) {
  return {
    ok,
    json: async () => ({ slots }),
  }
}

function DomProbe({ onPaint, children }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    onPaint(ref.current.innerHTML)
  })
  return createElement('div', { ref }, children)
}

function click(node) {
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function firstCommitDuring(ui, run) {
  const commits = []
  const stop = onAvailabilityCommit((visible) => {
    commits.push({
      ...visible,
      started: ui.availabilityJobs.length,
      html: ui.container.innerHTML,
    })
  })
  try {
    run()
  } finally {
    stop()
  }
  return commits[0]
}

function mountWizard({ strict = false } = {}) {
  const availabilityJobs = []
  const bookingPosts = []
  const paints = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = vi.fn((url, options = {}) => {
    const href = String(url)
    if (href.includes('/availability')) {
      const job = deferred()
      availabilityJobs.push({ url: href, ...job })
      return job.promise
    }
    if (String(options.method || 'GET').toUpperCase() === 'POST' && href.includes('/bookings')) {
      bookingPosts.push({ url: href, body: options.body })
      return Promise.resolve({ ok: true, json: async () => ({ id: 1, public_reference: 'R' }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = (slug) => {
    const wizard = createElement(MemoryRouter, null, createElement(PublicBookingWizard, {
      slug,
      profile,
      currentUser: { id: 7, role: 'client' },
    }))
    const probe = createElement(DomProbe, {
      onPaint: (html) => paints.push({ html, started: availabilityJobs.length }),
    }, wizard)
    act(() => {
      root.render(strict ? createElement(StrictMode, null, probe) : probe)
    })
  }
  render('anna')
  return {
    container,
    paints,
    availabilityJobs,
    bookingPosts,
    render,
    unmount() {
      act(() => root.unmount())
      container.remove()
      globalThis.fetch = previousFetch
    },
  }
}

function chooseService(container, serviceId) {
  click(container.querySelector('[data-testid="service-picker-button"]'))
  const category = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Без категории'))
  expect(category).toBeTruthy()
  click(category)
  const option = container.querySelector(`[data-testid="service-option-${serviceId}"]`)
  expect(option).not.toBeNull()
  return option
}

async function resolveNextAvailability(ui, slots, ok = true) {
  const job = ui.availabilityJobs[ui.availabilityJobs.length - 1]
  await act(async () => {
    job.resolve(availabilityResponse(slots, ok))
    await job.promise
  })
}

describe('PublicBookingWizard availability identity', () => {
  const mounted = []
  afterEach(() => {
    while (mounted.length) mounted.pop().unmount()
  })

  it('keeps service B free of service A slots on the first commit and blocks the stale slot', async () => {
    const errors = []
    const warn = console.error
    console.error = (...args) => errors.push(args.map((item) => String(item)).join(' '))
    const ui = mountWizard()
    mounted.push(ui)
    const day = windowDay(1)
    const optionA = chooseService(ui.container, 1)
    click(optionA)
    await resolveNextAvailability(ui, [slot(day)])
    expect(ui.container.querySelector(`[data-testid="date-cell-${day}"]`)).not.toBeNull()
    click(ui.container.querySelector(`[data-testid="date-cell-${day}"]`))
    const slotButton = ui.container.querySelector(`[data-testid="slot-${day}T10-00-00"]`)
    expect(slotButton).not.toBeNull()
    click(slotButton)
    expect(ui.container.querySelector('[data-testid="cta-book"]')).not.toBeNull()

    const beforeMaster = ui.availabilityJobs.length
    const masterPaint = firstCommitDuring(ui, () => ui.render('boris'))
    expect(masterPaint.started).toBe(beforeMaster)
    expect(masterPaint.loading).toBe(true)
    expect(masterPaint.slots).toEqual([])
    expect(masterPaint.error).toBeNull()
    expect(masterPaint.html).toContain('Загрузка дат...')
    expect(masterPaint.html).not.toContain(`date-cell-${day}`)
    expect(masterPaint.html).not.toContain('cta-book')
    expect(masterPaint.html).not.toContain('public-booking-summary')
    expect(ui.availabilityJobs.length).toBeGreaterThan(beforeMaster)
    expect(ui.bookingPosts).toEqual([])
    expect(ui.container.querySelector('[data-testid="cta-book"]')).toBeNull()

    const started = ui.availabilityJobs.length
    const optionB = chooseService(ui.container, 2)
    const firstPaint = firstCommitDuring(ui, () => click(optionB))
    expect(firstPaint.started).toBe(started)
    expect(firstPaint.loading).toBe(true)
    expect(firstPaint.slots).toEqual([])
    expect(firstPaint.error).toBeNull()
    expect(firstPaint.html).toContain('Окрашивание — 2000 ₽, 60 мин')
    expect(firstPaint.html).toContain('Загрузка дат...')
    expect(firstPaint.html).not.toContain(`date-cell-${day}`)
    expect(firstPaint.html).not.toContain('cta-book')
    expect(firstPaint.html).not.toContain('public-booking-summary')
    expect(ui.availabilityJobs.length).toBeGreaterThan(started)
    expect(ui.bookingPosts).toEqual([])
    expect(ui.container.querySelector('[data-testid="cta-book"]')).toBeNull()
    console.error = warn
    expect(errors.filter((line) => /Maximum update depth|Cannot update depth|Cannot update a component|not wrapped in act|unmounted/i.test(line))).toEqual([])
  })

  it('hides the previous slots on the first commit in StrictMode', async () => {
    const ui = mountWizard({ strict: true })
    mounted.push(ui)
    const day = windowDay(1)
    const optionA = chooseService(ui.container, 1)
    click(optionA)
    await resolveNextAvailability(ui, [slot(day)])
    expect(ui.container.querySelector(`[data-testid="date-cell-${day}"]`)).not.toBeNull()
    ui.paints.length = 0
    const optionB = chooseService(ui.container, 2)
    const before = ui.availabilityJobs.length
    const firstPaint = firstCommitDuring(ui, () => click(optionB))
    expect(firstPaint.started).toBe(before)
    expect(firstPaint.loading).toBe(true)
    expect(firstPaint.slots).toEqual([])
    expect(firstPaint.html).toContain('Окрашивание — 2000 ₽, 60 мин')
    expect(firstPaint.html).toContain('Загрузка дат...')
    expect(firstPaint.html).not.toContain(`date-cell-${day}`)
    expect(firstPaint.html).not.toContain('cta-book')
  })

  it('shows an empty state and a fresh error without keeping the previous slots', async () => {
    const ui = mountWizard()
    mounted.push(ui)
    const optionA = chooseService(ui.container, 1)
    click(optionA)
    await resolveNextAvailability(ui, [])
    expect(ui.container.querySelector('[data-testid="date-empty-state"]')).not.toBeNull()
    expect(ui.container.textContent).not.toContain('Загрузка дат...')
    const optionB = chooseService(ui.container, 2)
    click(optionB)
    await resolveNextAvailability(ui, [], false)
    expect(ui.container.textContent).toContain(AVAILABILITY_LOAD_ERROR)
    expect(ui.container.textContent).not.toContain('Загрузка дат...')
    expect(ui.container.querySelector('[data-testid="cta-book"]')).toBeNull()
  })
})
