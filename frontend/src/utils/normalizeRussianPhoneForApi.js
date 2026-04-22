/**
 * Канонический российский мобильный номер для API: убираем пробелы, (), -;
 * 8XXXXXXXXXXX (11) → +7XXXXXXXXXX; 10 цифр → +7…; +7XXXXXXXXXX без изменений.
 * Прочие строки возвращаем как есть (после удаления указанных символов), чтобы не ломать нестандартные случаи.
 */
export function normalizeRussianPhoneForApi(phone) {
  if (phone == null || phone === '') return ''
  const s = String(phone)
    .replace(/[\s()\-]/g, '')
    .replace(/\u00A0/g, '')
    .trim()

  if (/^\+7\d{10}$/.test(s)) return s

  const digits = s.replace(/\D/g, '')

  if (digits.length === 11 && digits[0] === '8') {
    return '+7' + digits.slice(1)
  }
  if (digits.length === 11 && digits[0] === '7') {
    return '+7' + digits.slice(1)
  }
  if (digits.length === 10) {
    return '+7' + digits
  }

  if (s.startsWith('+7')) {
    const tail = digits.startsWith('7') ? digits.slice(1) : digits
    if (tail.length === 10) return '+7' + tail
  }

  return s
}
