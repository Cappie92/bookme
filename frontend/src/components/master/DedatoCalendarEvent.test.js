/**
 * @vitest-environment happy-dom
 */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { mountDom } from '../../test/domHarness'
import DedatoCalendarEvent from './DedatoCalendarEvent'

describe('DedatoCalendarEvent Grid', () => {
  it('compact variant renders icon and time only', async () => {
    const ui = mountDom()
    await ui.render(
      createElement(DedatoCalendarEvent, {
        density: 'Grid',
        gridVariant: 'compact',
        source: 'online',
        time: '11:00–11:30',
        title: 'Стрижка',
        as: 'div',
      }),
    )
    expect(ui.container.textContent).toContain('11:00–11:30')
    expect(ui.container.textContent).not.toContain('Стрижка')
    await ui.unmount()
  })

  it('standard variant renders time and title', async () => {
    const ui = mountDom()
    await ui.render(
      createElement(DedatoCalendarEvent, {
        density: 'Grid',
        gridVariant: 'standard',
        source: 'manual',
        time: '10:00–11:00',
        title: 'Маникюр',
        as: 'div',
      }),
    )
    expect(ui.container.textContent).toContain('10:00–11:00')
    expect(ui.container.textContent).toContain('Маникюр')
    await ui.unmount()
  })
})