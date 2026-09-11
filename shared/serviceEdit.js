/** RU decimal input. Reject partial/malformed input instead of parseFloat truncation. */
export function parseServicePrice(value) {
  const text = String(value ?? '').trim()
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return null
  const price = Number(text.replace(',', '.'))
  return Number.isFinite(price) && price >= 0 ? price : null
}

/** Validation metadata only: never echo server input, stacks or arbitrary objects. */
export function serviceEditError(error) {
  const detail = error?.response?.data?.detail ?? error?.detail
  const labels = { name: 'Название', price: 'Цена', duration: 'Длительность', category_id: 'Категория', description: 'Описание' }
  const rows = Array.isArray(detail) ? detail : detail && typeof detail === 'object' ? [detail] : []
  const fields = []
  rows.forEach(row => {
    if (!Array.isArray(row?.loc)) return
    row.loc.forEach(key => {
      if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(labels, key) && !fields.includes(labels[key])) fields.push(labels[key])
    })
  })
  if (fields.length) return `Проверьте поля: ${fields.join(', ')}.`
  if (typeof detail === 'string') {
    if (detail.includes('уже существует') || detail.includes('already exists')) return 'Услуга с таким названием уже существует.'
    if (detail.includes('категори') || detail.includes('Invalid category')) return 'Выбранная категория не найдена. Выберите другую категорию.'
  }
  return 'Не удалось сохранить услугу. Проверьте данные и повторите попытку.'
}
