/**
 * @vitest-environment happy-dom
 */
import { StrictMode, createElement, act, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AVAILABILITY_LOAD_ERROR,
  publicAvailabilityIdentity,
  startAvailabilityRequest,
  useGuardedAvailability,
  visibleAvailability,
} from './availabilityRequest'
import { loadGuardedAvailableSlots, loadGuardedDateAvailability } from '../../pages/clientRescheduleAvailability'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { requests } = vi.hoisted(() => ({ requests: [] }))

vi.mock('../../utils/api', () => ({
  apiGet: vi.fn(() => Promise.resolve({})),
  apiRequest: vi.fn((path, options) => {
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    requests.push({ path, options, resolve, reject })
    return promise
  }),
}))

import RepeatBookingModal from '../../modals/RepeatBookingModal'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function slot(day) {
  return [{ start_time: `${day}T10:00:00` }]
}

function FirstCommitProbe({ identityKey, fetcher, onPaint }) {
  const result = useGuardedAvailability({ enabled: true, identityKey, fetcher })
  const ref = useRef(null)
  useLayoutEffect(() => {
    onPaint({
      loading: ref.current.getAttribute('data-loading'),
      slots: ref.current.getAttribute('data-slots'),
      error: ref.current.getAttribute('data-error'),
    })
  })
  return createElement('output', {
    ref,
    'data-loading': String(result.loading),
    'data-error': result.error || '',
    'data-slots': result.slots.map((item) => item.start_time).join(','),
  })
}

function Harness({ identityKey, fetcher, enabled = true }) {
  const result = useGuardedAvailability({ enabled, identityKey, fetcher })
  return createElement('output', {
    'data-testid': 'availability',
    'data-loading': String(result.loading),
    'data-error': result.error || '',
    'data-slots': result.slots.map((item) => item.start_time).join(','),
  })
}

function mountHarness() {
  const jobs = []
  const fetcher = () => {
    const job = deferred()
    jobs.push(job)
    return job.promise
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = (props) => {
    act(() => {
      root.render(createElement(Harness, { fetcher, ...props }))
    })
  }
  return {
    jobs,
    render,
    read() {
      const node = container.querySelector('[data-testid="availability"]')
      return {
        loading: node.getAttribute('data-loading'),
        error: node.getAttribute('data-error'),
        slots: node.getAttribute('data-slots'),
      }
    },
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

async function fulfill(job, value) {
  await act(async () => {
    job.resolve(value)
    await job.promise
  })
}

async function fail(job) {
  await act(async () => {
    job.reject(new Error('stale'))
    try {
      await job.promise
    } catch {
      /* ожидаемый отказ устаревшего запроса */
    }
  })
}

const serviceA = publicAvailabilityIdentity({
  slug: 'anna',
  serviceId: 1,
  from: '2026-10-31',
  to: '2026-11-14',
})
const serviceB = publicAvailabilityIdentity({
  slug: 'anna',
  serviceId: 2,
  from: '2026-10-31',
  to: '2026-11-14',
})
const serviceAWider = publicAvailabilityIdentity({
  slug: 'anna',
  serviceId: 1,
  from: '2026-11-01',
  to: '2026-11-20',
})

function RescheduleHarness({ bookingId, date, fetcher }) {
  const store = useRef(0)
  const bookingRef = useRef(bookingId)
  bookingRef.current = bookingId
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const request = startAvailabilityRequest(store)
    loadGuardedAvailableSlots({
      bookingId,
      dateOnly: date,
      request,
      isBookingCurrent: (id) => bookingRef.current === id,
      fetcher,
      onStart: () => {
        setLoading(true)
        setSlots([])
      },
      onSlots: (next) => setSlots(next),
      onSettled: () => setLoading(false),
    })
    return () => request.invalidate()
  }, [bookingId, date, fetcher])
  return createElement('output', {
    'data-testid': 'reschedule',
    'data-loading': String(loading),
    'data-slots': slots.map((item) => item.start_time).join(','),
  })
}

function MonthHarness({ bookingId, datesKey, fetcher }) {
  const store = useRef(0)
  const bookingRef = useRef(bookingId)
  bookingRef.current = bookingId
  const [dates, setDates] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const request = startAvailabilityRequest(store)
    loadGuardedDateAvailability({
      bookingId,
      dateStrs: datesKey ? datesKey.split(',') : [],
      request,
      isBookingCurrent: (id) => bookingRef.current === id,
      fetcher,
      onStart: () => setLoading(true),
      onAvailability: (availability) => {
        setDates(Object.entries(availability).filter(([, ok]) => ok).map(([day]) => day).join(','))
      },
      onSettled: () => setLoading(false),
    })
    return () => request.invalidate()
  }, [bookingId, datesKey, fetcher])
  return createElement('output', {
    'data-testid': 'month',
    'data-loading': String(loading),
    'data-dates': dates,
  })
}

describe('public availability races', () => {
  const mounted = []
  afterEach(() => {
    while (mounted.length) mounted.pop().unmount()
    requests.length = 0
  })

  it('A. keeps B when B resolves before A', async () => {
    const ui = mountHarness()
    mounted.push(ui)
    ui.render({ identityKey: serviceA })
    ui.render({ identityKey: serviceB })
    await fulfill(ui.jobs[1], slot('2026-11-03'))
    expect(ui.read()).toMatchObject({ slots: '2026-11-03T10:00:00', error: '', loading: 'false' })
    await fulfill(ui.jobs[0], slot('2026-11-02'))
    expect(ui.read()).toMatchObject({ slots: '2026-11-03T10:00:00', error: '', loading: 'false' })
  })

  it('B. ignores an older error after B has succeeded', async () => {
    const ui = mountHarness()
    mounted.push(ui)
    ui.render({ identityKey: serviceA })
    ui.render({ identityKey: serviceB })
    await fulfill(ui.jobs[1], slot('2026-11-03'))
    await fail(ui.jobs[0])
    expect(ui.read()).toMatchObject({ slots: '2026-11-03T10:00:00', error: '', loading: 'false' })
  })

  it('C. an older finally does not stop the loading state of B', async () => {
    const ui = mountHarness()
    mounted.push(ui)
    ui.render({ identityKey: serviceA })
    ui.render({ identityKey: serviceB })
    expect(ui.read().loading).toBe('true')
    await fulfill(ui.jobs[0], slot('2026-11-02'))
    expect(ui.read()).toMatchObject({ loading: 'true', slots: '', error: '' })
  })

  it('D. A then B then A applies only the last A', async () => {
    const ui = mountHarness()
    mounted.push(ui)
    ui.render({ identityKey: serviceA })
    ui.render({ identityKey: serviceB })
    ui.render({ identityKey: serviceA })
    await fulfill(ui.jobs[0], slot('2026-11-02'))
    await fulfill(ui.jobs[1], slot('2026-11-03'))
    expect(ui.read().slots).toBe('')
    await fulfill(ui.jobs[2], slot('2026-11-04'))
    expect(ui.read()).toMatchObject({ slots: '2026-11-04T10:00:00', error: '', loading: 'false' })
  })

  it('E. a new date range makes the previous response stale', async () => {
    const ui = mountHarness()
    mounted.push(ui)
    ui.render({ identityKey: serviceA })
    ui.render({ identityKey: serviceAWider })
    await fulfill(ui.jobs[1], slot('2026-11-05'))
    await fulfill(ui.jobs[0], slot('2026-11-02'))
    expect(ui.read()).toMatchObject({ slots: '2026-11-05T10:00:00', error: '', loading: 'false' })
  })

  it('F. unmount ignores a response that arrives later', async () => {
    const errors = []
    const original = console.error
    console.error = (...args) => errors.push(args.join(' '))
    const ui = mountHarness()
    ui.render({ identityKey: serviceA })
    const job = ui.jobs[0]
    ui.unmount()
    await act(async () => {
      job.resolve(slot('2026-11-02'))
      await job.promise
    })
    console.error = original
    expect(errors.filter((line) => /unmounted|not mounted/i.test(line))).toEqual([])
  })

  it('hides slots in the first commit when the service or master identity changes', async () => {
    const paints = []
    const jobs = []
    const fetcher = () => {
      const job = deferred()
      jobs.push(job)
      return job.promise
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const Probe = ({ identityKey, strict = false }) => {
      const node = createElement(FirstCommitProbe, {
        identityKey,
        fetcher,
        onPaint: (paint) => paints.push({ ...paint, started: jobs.length }),
      })
      return strict ? createElement(StrictMode, null, node) : node
    }
    const render = (identityKey, strict = false) => {
      act(() => {
        root.render(createElement(Probe, { identityKey, strict }))
      })
    }
    mounted.push({
      unmount() {
        act(() => root.unmount())
        container.remove()
      },
    })
    render(serviceA)
    await fulfill(jobs[0], slot('2026-11-02'))
    paints.length = 0
    const started = jobs.length
    render(serviceB)
    expect(paints[0]).toMatchObject({
      loading: 'true',
      slots: '',
      error: '',
      started,
    })
    expect(paints[0].slots).not.toContain('2026-11-02')
    paints.length = 0
    const otherMaster = publicAvailabilityIdentity({
      slug: 'boris',
      serviceId: 2,
      from: '2026-10-31',
      to: '2026-11-14',
    })
    const startedBeforeMaster = jobs.length
    render(otherMaster)
    expect(paints[0]).toMatchObject({
      loading: 'true',
      slots: '',
      error: '',
      started: startedBeforeMaster,
    })
    paints.length = 0
    render(serviceA, true)
    expect(paints[0]).toMatchObject({ loading: 'true', slots: '', error: '' })
    expect(paints[0].started).toBeLessThan(jobs.length)
    expect(visibleAvailability(
      { identityKey: serviceA, slots: slot('2026-11-02'), error: 'old', status: 'ready' },
      { enabled: true, identityKey: serviceB },
    )).toEqual({ slots: [], error: null, loading: true })
  })

  it('G/H. an empty result and a current error both leave loading', async () => {
    const ui = mountHarness()
    mounted.push(ui)
    ui.render({ identityKey: serviceA })
    await fulfill(ui.jobs[0], [])
    expect(ui.read()).toEqual({ loading: 'false', error: '', slots: '' })
    ui.render({ identityKey: serviceB })
    await fail(ui.jobs[1])
    expect(ui.read()).toEqual({ loading: 'false', error: AVAILABILITY_LOAD_ERROR, slots: '' })
  })

  it('uses the wizard identity of master, service and date range', () => {
    const wizard = readFileSync('src/components/booking/PublicBookingWizard.jsx', 'utf8')
    expect(wizard).toContain('useGuardedAvailability')
    expect(wizard).toContain('publicAvailabilityIdentity')
    expect(serviceA).toBe('anna:1:2026-10-31:2026-11-14')
    expect(serviceAWider).not.toBe(serviceA)
  })
})

describe('repeat booking and reschedule availability', () => {
  const mounted = []
  afterEach(() => {
    while (mounted.length) mounted.pop().unmount()
    requests.length = 0
  })

  function mount(Component, readTestId) {
    const jobs = []
    const fetcher = () => {
      const job = deferred()
      jobs.push(job)
      return job.promise
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const render = (props) => {
      act(() => {
        root.render(createElement(Component, { fetcher, ...props }))
      })
    }
    const ui = {
      jobs,
      render,
      read() {
        const node = container.querySelector(`[data-testid="${readTestId}"]`)
        return {
          loading: node.getAttribute('data-loading'),
          slots: node.getAttribute('data-slots'),
          dates: node.getAttribute('data-dates'),
        }
      },
      unmount() {
        act(() => root.unmount())
        container.remove()
      },
    }
    mounted.push(ui)
    return ui
  }

  it('J. reschedule keeps the latest booking and date', async () => {
    const ui = mount(RescheduleHarness, 'reschedule')
    ui.render({ bookingId: 11, date: '2026-11-02' })
    ui.render({ bookingId: 12, date: '2026-11-03' })
    await act(async () => {
      ui.jobs[1].resolve({
        ok: true,
        json: async () => ({ available_slots: slot('2026-11-03') }),
      })
      await ui.jobs[1].promise
    })
    expect(ui.read()).toMatchObject({ slots: '2026-11-03T10:00:00', loading: 'false' })
    await act(async () => {
      ui.jobs[0].resolve({
        ok: true,
        json: async () => ({ available_slots: slot('2026-11-02') }),
      })
      await ui.jobs[0].promise
    })
    expect(ui.read()).toMatchObject({ slots: '2026-11-03T10:00:00', loading: 'false' })
  })

  it('J. an older month map does not replace the current booking', async () => {
    const ui = mount(MonthHarness, 'month')
    ui.render({ bookingId: 11, datesKey: '2026-11-02' })
    ui.render({ bookingId: 12, datesKey: '2026-11-03' })
    await act(async () => {
      ui.jobs[1].resolve({
        ok: true,
        json: async () => ({ available_slots: slot('2026-11-03') }),
      })
      await ui.jobs[1].promise
    })
    await act(async () => {
      ui.jobs[0].resolve({
        ok: true,
        json: async () => ({ available_slots: slot('2026-11-02') }),
      })
      await ui.jobs[0].promise
    })
    expect(ui.read()).toMatchObject({ dates: '2026-11-03', loading: 'false' })
  })

  it('J. repeat booking ignores a stale public availability response', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const render = (booking) => {
      act(() => {
        root.render(createElement(RepeatBookingModal, {
          isOpen: true,
          onClose() {},
          booking,
        }))
      })
    }
    const unmount = () => {
      act(() => root.unmount())
      container.remove()
    }
    mounted.push({ unmount })

    const day = (offset) => {
      const date = new Date()
      date.setDate(date.getDate() + offset)
      return date.toISOString().split('T')[0]
    }
    const booking = (id) => ({
      id,
      master_id: 5,
      master_domain: 'anna',
      master_name: 'Анна',
      service_name: 'Стрижка',
      duration: 60,
      price: 1000,
      service_id: 2,
      client_name: 'Иван',
    })
    const profile = {
      services: [{ id: 2, name: 'Стрижка', duration: 60, price: 1000 }],
    }
    const take = (predicate) => {
      const index = requests.findIndex(predicate)
      expect(index).toBeGreaterThanOrEqual(0)
      return requests.splice(index, 1)[0]
    }

    render(booking(1))
    const profileA = take((item) => item.path.includes('/api/public/masters/anna') && !item.path.includes('availability'))
    await act(async () => {
      profileA.resolve(profile)
      await Promise.resolve()
    })
    const availabilityA = take((item) => item.path.includes('availability'))
    render(booking(2))
    const profileB = take((item) => item.path.includes('/api/public/masters/anna') && !item.path.includes('availability'))
    await act(async () => {
      profileB.resolve(profile)
      await Promise.resolve()
    })
    const availabilityB = take((item) => item.path.includes('availability'))
    await act(async () => {
      availabilityB.resolve({ slots: [{ start_time: `${day(2)}T10:00:00`, end_time: `${day(2)}T11:00:00` }] })
      await Promise.resolve()
    })
    expect(container.querySelector(`[data-testid="date-cell-${day(2)}"]`)).not.toBeNull()
    await act(async () => {
      availabilityA.resolve({ slots: [{ start_time: `${day(1)}T10:00:00`, end_time: `${day(1)}T11:00:00` }] })
      await Promise.resolve()
    })
    expect(container.querySelector(`[data-testid="date-cell-${day(2)}"]`)).not.toBeNull()
    expect(container.querySelector(`[data-testid="date-cell-${day(1)}"]`)).toBeNull()
    expect(container.textContent).not.toContain('Загрузка доступности дат...')
  })
})
