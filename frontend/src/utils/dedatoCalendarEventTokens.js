/** Figma DeDato v1 / CalendarEvent (121:883, 252:1987) — web token mapping. */

export function bookingEventSource(booking) {
  return booking?.source === 'manual' ? 'manual' : 'online'
}

export function blockEventSource() {
  return 'personal'
}

export function gridEventSurface(source, selected = false) {
  const selectedMark = selected
    ? 'shadow-[inset_0_0_0_2px_var(--dedato-action-primary,#4caf50)]'
    : ''
  const map = {
    online: `border border-[var(--dedato-event-online,#0f6d69)] bg-[var(--dedato-event-onlineBg,#eaf7f5)] ${selectedMark}`,
    manual: `border border-[var(--dedato-event-manual,#1d4ed8)] bg-[var(--dedato-event-manualBg,#eff6ff)] ${selectedMark}`,
    personal: `border border-[var(--dedato-event-personal,#404040)] bg-[var(--dedato-event-personalBg,#f3f4f6)] ${selectedMark}`,
  }
  return map[source] || map.online
}

export function sourceLabelColor(source) {
  if (source === 'manual') return 'text-[var(--dedato-event-manual,#1d4ed8)]'
  if (source === 'personal') return 'text-[var(--dedato-event-personal,#404040)]'
  return 'text-[var(--dedato-event-online,#0f6d69)]'
}
