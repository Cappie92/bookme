import { describe, expect, it } from 'vitest'
import {
  buildMasterScheduleOverview,
  groupMaterializedScheduleByDate,
  hasSavedScheduleTemplate,
} from './masterScheduleOverview'

describe('masterScheduleOverview', () => {
  it('groups contiguous materialized slots per date', () => {
    const rows = groupMaterializedScheduleByDate({
      '2026-11-17_9_0': true,
      '2026-11-17_9_30': true,
      '2026-11-17_10_0': true,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].detail).toBe('09:00 – 10:30')
  })

  it('honors MasterDashboard weekly slot objects with is_working', () => {
    const dashboardShape = {
      '2026-11-16_10_0': {
        is_working: true,
        work_type: 'regular',
        has_conflict: false,
        conflict_type: null,
      },
      '2026-11-16_10_30': {
        is_working: true,
        work_type: 'regular',
        has_conflict: false,
        conflict_type: null,
      },
      '2026-11-16_11_0': {
        is_working: false,
        work_type: 'off',
        has_conflict: false,
        conflict_type: null,
      },
      '2026-11-16_0_0': { is_working: false },
      '2026-11-16_23_30': { is_working: false },
    }
    const rows = groupMaterializedScheduleByDate(dashboardShape)
    expect(rows).toHaveLength(1)
    expect(rows[0].detail).toBe('10:00 – 11:00')
    expect(rows[0].date).toBe('2026-11-16')
  })

  it('keeps separate intervals when working slots are not contiguous', () => {
    const rows = groupMaterializedScheduleByDate({
      '2026-11-18_10_0': { is_working: true },
      '2026-11-18_10_30': { is_working: true },
      '2026-11-18_14_0': { is_working: true },
      '2026-11-18_14_30': { is_working: true },
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.detail).sort()).toEqual(['10:00 – 11:00', '14:00 – 15:00'])
  })

  it('shows rules plus materialized preview without all-day false positives', () => {
    const view = buildMasterScheduleOverview({
      scheduleRules: {
        has_settings: true,
        fixed_schedule: {
          type: 'weekdays',
          weekdays: {
            1: { enabled: true, start: '10:00', end: '20:00' },
          },
        },
      },
      scheduleRulesLoading: false,
      scheduleRulesError: '',
      materializedSchedule: {
        '2026-11-16_10_0': { is_working: true, work_type: 'regular', has_conflict: false },
        '2026-11-16_10_30': { is_working: true, work_type: 'regular', has_conflict: false },
        '2026-11-17_10_0': { is_working: false },
      },
    })
    expect(view.status).toBe('rules')
    expect(view.materializedPreview).toHaveLength(1)
    expect(view.materializedPreview[0].detail).toBe('10:00 – 11:00')
  })

  it('does not claim empty when materialized slots exist without rules', () => {
    const view = buildMasterScheduleOverview({
      scheduleRules: null,
      scheduleRulesLoading: false,
      scheduleRulesError: '',
      materializedSchedule: { '2026-11-17_11_0': true, '2026-11-17_11_30': true },
    })
    expect(view.status).toBe('materialized_only')
    expect(view.headline).toContain('календаре')
  })

  it('reports error separately from empty', () => {
    const view = buildMasterScheduleOverview({
      scheduleRules: null,
      scheduleRulesLoading: false,
      scheduleRulesError: 'network',
      materializedSchedule: {},
    })
    expect(view.status).toBe('error')
  })

  it('detects saved template from API rules', () => {
    expect(hasSavedScheduleTemplate({
      has_settings: true,
      fixed_schedule: { type: 'weekdays', weekdays: { '1': { start: '09:00', end: '18:00' } } },
    })).toBe(true)
  })
})