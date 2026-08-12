import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const consumers = [
  '../components/booking/MasterBookingModule.jsx',
  '../components/booking/SalonBookingModule.jsx',
  '../components/booking/BranchBookingModule.jsx',
]

describe('tracked public booking consumers', () => {
  for (const relativePath of consumers) {
    it(`${relativePath} uses pending verification before success`, () => {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
      expect(source).toContain('isPendingPublicBooking(result)')
      expect(source).toContain('requestPublicBookingVerification(result)')
      expect(source).toContain('confirmPublicBookingVerification(')
      expect(source).toContain('cancelPublicBookingVerification(')
      expect(source).not.toContain('/bookings/verify-phone-cjm')
    })
  }
})
