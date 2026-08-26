import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AppleSubscriptionDeletionWarning from '../components/AppleSubscriptionDeletionWarning'
import {
  APPLE_SUBSCRIPTION_MANAGEMENT_URL,
  checkAppleSubscriptionBeforeAccountDeletion,
  hasActiveAppleSubscription,
} from './accountDeletionApple'

describe('Apple subscription account-deletion guard', () => {
  it('warns only for an active Apple subscription', async () => {
    const apple = { billing_provider: 'apple', status: 'active', is_active: true }
    expect(hasActiveAppleSubscription(apple)).toBe(true)
    await expect(checkAppleSubscriptionBeforeAccountDeletion(async () => apple)).resolves.toBe(
      'warn_active_apple'
    )
    expect(hasActiveAppleSubscription({ ...apple, billing_provider: 'robokassa' })).toBe(false)
    expect(hasActiveAppleSubscription({ ...apple, status: 'expired', is_active: false })).toBe(false)
  })

  it('does not block deletion when the status check fails', async () => {
    await expect(
      checkAppleSubscriptionBeforeAccountDeletion(async () => {
        throw new Error('offline')
      })
    ).resolves.toBe('continue_deletion')
  })

  it('renders management, immediate continuation and factual warning', () => {
    const html = renderToStaticMarkup(
      React.createElement(AppleSubscriptionDeletionWarning, {
        onCancel: vi.fn(),
        onContinueDeletion: vi.fn(),
      })
    )
    expect(html).toContain('Удаление аккаунта DeDato не отменяет Apple auto-renewal')
    expect(html).toContain(`href="${APPLE_SUBSCRIPTION_MANAGEMENT_URL}"`)
    expect(html).toContain('Manage Subscription')
    expect(html).toContain('Продолжить удаление аккаунта')
  })

  it('is wired into both web deletion settings flows', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const client = readFileSync(path.join(here, '../pages/ClientProfile.jsx'), 'utf8')
    const master = readFileSync(path.join(here, '../components/MasterSettings.jsx'), 'utf8')
    for (const source of [client, master]) {
      expect(source).toContain('checkAppleSubscriptionBeforeAccountDeletion')
      expect(source).toContain('AppleSubscriptionDeletionWarning')
    }
  })
})
