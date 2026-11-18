/** Keep day aside selection in sync with reloaded calendar rows. */
export function syncMasterDaySelection(prev, rows, blockRows) {
  if (!prev) return null
  if (prev.kind === 'booking') {
    const hit = rows.find((item) => item.id === prev.data.id)
    return hit ? { kind: 'booking', data: hit } : null
  }
  const hit = (blockRows || []).find((item) => item.id === prev.data.id)
  return hit ? { kind: 'block', data: hit } : null
}