/**
 * @vitest-environment happy-dom
 */
import { createElement, act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { mountDom } from '../../test/domHarness'
import MasterScheduleTemplatePanel from './MasterScheduleTemplatePanel'

describe('MasterScheduleTemplatePanel', () => {
  it('shows create button when no template and hides legend copy', async () => {
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleTemplatePanel, {
      scheduleRules: null,
      scheduleRulesLoading: false,
      scheduleRulesError: '',
      materializedSchedule: {},
      masterTimezone: 'Europe/Moscow',
      onCreateSchedule: vi.fn(),
      onEditSchedule: vi.fn(),
      onOpenMonthly: vi.fn(),
      onOpenSlotManagement: vi.fn(),
    }))
    expect(ui.container.textContent).toContain('Создать расписание')
    expect(ui.container.textContent).not.toContain('Источник')
    expect(ui.container.textContent).not.toContain('Посмотреть расписание')
    expect(ui.container.textContent).not.toContain('режиме «День»')
    expect(ui.container.textContent).not.toContain('Примеры на календаре')
    expect(ui.container.querySelector('[data-testid="master-schedule-create-template"]')).toBeTruthy()
    await ui.unmount()
  })

  it('opens slot management from Ещё menu', async () => {
    const onOpenSlotManagement = vi.fn()
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleTemplatePanel, {
      scheduleRules: null,
      scheduleRulesLoading: false,
      scheduleRulesError: '',
      materializedSchedule: {},
      masterTimezone: 'Europe/Moscow',
      onCreateSchedule: vi.fn(),
      onEditSchedule: vi.fn(),
      onOpenMonthly: vi.fn(),
      onOpenSlotManagement,
    }))
    await act(async () => {
      ui.container.querySelector('[data-testid="master-schedule-more"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      ui.container.querySelector('[data-testid="master-slot-management"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOpenSlotManagement).toHaveBeenCalled()
    await ui.unmount()
  })
})