import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAuthSession } from './api'


function storage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: vi.fn((key) => values.delete(key)),
  }
}


describe('clearAuthSession', () => {
  beforeEach(() => {
    globalThis.localStorage = storage()
    globalThis.sessionStorage = storage()
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    }
    globalThis.window = {
      dispatchEvent: vi.fn(),
    }
  })

  it('removes access, refresh and cached auth before notifying AuthContext', () => {
    clearAuthSession('password_changed')

    expect(localStorage.removeItem).toHaveBeenCalledWith('access_token')
    expect(localStorage.removeItem).toHaveBeenCalledWith('refresh_token')
    expect(localStorage.removeItem).toHaveBeenCalledWith('user_role')
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('dedato_web_session_origin')
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'auth:logout',
        detail: { reason: 'password_changed' },
      })
    )
  })
})
