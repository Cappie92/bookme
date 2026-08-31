import { describe, expect, it } from 'vitest'

import { getPlanFeatures } from './subscriptionFeatures.js'

describe('subscription plan features', () => {
  it('uses the canonical 20-booking fallback for Free without an explicit limit', () => {
    const features = getPlanFeatures({ name: 'Free', features: {}, limits: {} })

    expect(features[0]).toEqual({
      available: true,
      text: '20 активных записей',
    })
  })
})
