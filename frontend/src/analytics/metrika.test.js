import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  METRIKA_TAG_URL,
  __resetMetrikaForTests,
  ensureYmStub,
  metrikaGoal,
  metrikaInitOnce,
  metrikaPageView,
  resolveMetrikaCounterId,
} from './metrika'

describe('resolveMetrikaCounterId', () => {
  it('returns default counter when env is missing', () => {
    expect(resolveMetrikaCounterId({})).toBe(108773879)
  })

  it('reads VITE_YANDEX_METRIKA_ID from env', () => {
    expect(resolveMetrikaCounterId({ VITE_YANDEX_METRIKA_ID: '12345678' })).toBe(12345678)
  })

  it('returns null when counter id explicitly disabled', () => {
    expect(resolveMetrikaCounterId({ VITE_YANDEX_METRIKA_ID: '' })).toBeNull()
    expect(resolveMetrikaCounterId({ VITE_YANDEX_METRIKA_ID: '0' })).toBeNull()
    expect(resolveMetrikaCounterId({ VITE_YANDEX_METRIKA_ID: 'false' })).toBeNull()
  })

  it('returns null for invalid env value', () => {
    expect(resolveMetrikaCounterId({ VITE_YANDEX_METRIKA_ID: 'abc' })).toBeNull()
  })
})

describe('ensureYmStub', () => {
  it('creates queue stub before tag.js loads', () => {
    const win = {}
    ensureYmStub(win)
    expect(typeof win.ym).toBe('function')
    win.ym(108773879, 'init', { defer: true })
    expect(win.ym.a).toEqual([[108773879, 'init', { defer: true }]])
  })

  it('does not replace existing ym function', () => {
    const existing = vi.fn()
    const win = { ym: existing }
    ensureYmStub(win)
    expect(win.ym).toBe(existing)
  })
})

describe('metrikaInitOnce', () => {
  afterEach(() => {
    __resetMetrikaForTests()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('does not inject tag.js when counter id is disabled', async () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', '0')

    const appendChild = vi.fn()
    global.window = {
      ym: undefined,
      location: { href: 'https://dedato.ru/' },
    }
    global.document = {
      referrer: '',
      scripts: [],
      head: { appendChild },
      title: 'DeDato',
    }

    await metrikaInitOnce()

    expect(appendChild).not.toHaveBeenCalled()
    expect(typeof global.window.ym).toBe('undefined')
  })

  it('loads standard tag.js without ?id= and queues init via ym stub', async () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', '108773879')

    const appendChild = vi.fn((node) => {
      expect(node.src).toBe(METRIKA_TAG_URL)
      expect(node.src).not.toContain('?id=')
      node.onload?.()
    })

    global.window = {
      location: { href: 'https://dedato.ru/', pathname: '/', search: '', hash: '' },
    }
    global.document = {
      referrer: 'https://google.com/',
      scripts: [],
      createElement: (tag) => ({ tag, async: false, src: '', onload: null, onerror: null }),
      head: { appendChild },
      title: 'DeDato',
    }

    await metrikaInitOnce()

    expect(typeof global.window.ym).toBe('function')
    expect(global.window.ym.a?.[0]?.[0]).toBe(108773879)
    expect(global.window.ym.a?.[0]?.[1]).toBe('init')
    expect(global.window.ym.a?.[0]?.[2]).toMatchObject({
      defer: true,
      clickmap: true,
      webvisor: true,
    })
    expect(appendChild).toHaveBeenCalledTimes(1)
  })

  it('reuses existing tag.js script tag', async () => {
    global.window = { location: { href: 'https://dedato.ru/' } }
    global.document = {
      referrer: '',
      scripts: [{ src: METRIKA_TAG_URL }],
      head: { appendChild: vi.fn() },
      title: 'DeDato',
    }

    await metrikaInitOnce()

    expect(global.document.head.appendChild).not.toHaveBeenCalled()
    expect(typeof global.window.ym).toBe('function')
  })
})

describe('metrikaGoal and metrikaPageView', () => {
  afterEach(() => {
    __resetMetrikaForTests()
    vi.unstubAllEnvs()
  })

  it('no-ops when counter id disabled', () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', '')

    const ym = vi.fn()
    global.window = {
      ym,
      location: { pathname: '/', search: '', hash: '' },
    }
    global.document = { referrer: '', title: 'DeDato' }

    metrikaGoal('landing_hero_register')
    metrikaPageView()

    expect(ym).not.toHaveBeenCalled()
  })

  it('forwards reachGoal and hit when ym stub exists', () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', '108773879')

    const ym = vi.fn()
    global.window = {
      ym,
      location: { pathname: '/pricing', search: '?x=1', hash: '' },
    }
    global.document = { referrer: '', title: 'Pricing' }

    metrikaGoal('pricing_cta_register', { audience: 'master' })
    metrikaPageView()

    expect(ym).toHaveBeenCalledWith(108773879, 'reachGoal', 'pricing_cta_register', {
      audience: 'master',
    })
    expect(ym).toHaveBeenCalledWith(108773879, 'hit', '/pricing?x=1', { title: 'Pricing' })
  })

  it('queues early pageview via ym stub before tag.js is ready', () => {
    vi.stubEnv('VITE_YANDEX_METRIKA_ID', '108773879')

    global.window = {
      location: { pathname: '/pricing', search: '?x=1', hash: '' },
    }
    global.document = { referrer: '', title: 'Pricing' }

    metrikaPageView()

    expect(typeof global.window.ym).toBe('function')
    expect(global.window.ym.a).toEqual([
      [108773879, 'hit', '/pricing?x=1', { title: 'Pricing' }],
    ])
  })
})
