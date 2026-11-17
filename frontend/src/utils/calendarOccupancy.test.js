import { describe, expect, it } from 'vitest'
import {
  annotateManualStartOptions,
  isManualStartOccupied,
} from './calendarOccupancy'

describe('calendarOccupancy', () => {
  const bookings = [{
    id: 9,
    status: 'awaiting_confirmation',
    start_time: '2026-11-04T16:00:00',
    end_time: '2026-11-04T17:00:00',
  }]

  it('detects overlap when short service grows into existing booking', () => {
    const slot = [{
      id: 11,
      status: 'confirmed',
      start_time: '2026-11-04T16:00:00',
      end_time: '2026-11-04T16:30:00',
    }]
    expect(isManualStartOccupied({
      dateStr: '2026-11-04',
      startTime: '15:30',
      durationMinutes: 30,
      bookings: slot,
      blocks: [],
      editing: false,
      event: null,
    })).toBe(false)
    expect(isManualStartOccupied({
      dateStr: '2026-11-04',
      startTime: '15:30',
      durationMinutes: 120,
      bookings: slot,
      blocks: [],
      editing: false,
      event: null,
    })).toBe(true)
  })

  it('blocks manual starts overlapping on-grid booking', () => {
    expect(isManualStartOccupied({
      dateStr: '2026-11-04',
      startTime: '16:00',
      durationMinutes: 60,
      bookings,
      blocks: [],
      editing: false,
      event: null,
    })).toBe(true)
    expect(isManualStartOccupied({
      dateStr: '2026-11-04',
      startTime: '17:00',
      durationMinutes: 60,
      bookings,
      blocks: [],
      editing: false,
      event: null,
    })).toBe(false)
  })

  it('marks occupied grid starts disabled', () => {
    const options = annotateManualStartOptions({
      dateStr: '2026-11-04',
      durationMinutes: 60,
      bookings,
      blocks: [],
      editing: false,
      event: null,
    })
    expect(options.find((row) => row.value === '16:00')?.disabled).toBe(true)
    expect(options.find((row) => row.value === '17:00')?.disabled).toBe(false)
  })

  it('does not exempt original grid start from overlap when editing', () => {
    const editingEvent = {
      id: 42,
      source: 'manual',
      start_time: '2026-11-04T17:00:00',
      end_time: '2026-11-04T18:00:00',
    }
    const options = annotateManualStartOptions({
      dateStr: '2026-11-04',
      durationMinutes: 60,
      bookings,
      blocks: [],
      editing: true,
      event: editingEvent,
    })
    expect(options.find((row) => row.value === '16:00')?.busy).toBe(true)
    expect(options.find((row) => row.value === '17:00')?.busy).toBe(false)
  })

  it('does not inject off-grid legacy start options', () => {
    const options = annotateManualStartOptions({
      dateStr: '2026-11-04',
      durationMinutes: 30,
      bookings,
      blocks: [],
      editing: true,
      event: {
        id: 9,
        start_time: '2026-11-04T16:23:46.313500',
        end_time: '2026-11-04T16:53:46.313500',
      },
    })
    expect(options.some((row) => row.value === '16:23')).toBe(false)
    expect(options).toHaveLength(48)
  })
})