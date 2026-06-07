export const BIRTH_DATE_PLACEHOLDER = 'ДД.ММ.ГГГГ';
export const BIRTH_DATE_HELPER = 'Например: 11.11.1991';

const DISPLAY_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

export function digitsOnlyFromBirthInput(text: string): string {
  return text.replace(/\D/g, '').slice(0, 8);
}

/** Нормализует ввод/вставку в отображение ДД.ММ.ГГГГ (поддерживает ISO и цифры). */
export function formatBirthDateInput(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const fromIso = isoToBirthDateDisplay(trimmed);
    if (fromIso) return fromIso;
  }
  if (DISPLAY_RE.test(trimmed)) return trimmed;
  return formatBirthDateDigits(trimmed);
}

/** «11111991» → «11.11.1991» */
export function formatBirthDateDigits(digits: string): string {
  const d = digitsOnlyFromBirthInput(digits);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

export function isoToBirthDateDisplay(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = iso.trim();
  if (DISPLAY_RE.test(s)) return s;
  const ymd = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

export function birthDateDisplayToIso(display: string): string | null {
  return parseBirthDateForApi(display);
}

/** Конвертация UI → API `YYYY-MM-DD`. */
export function parseBirthDateForApi(display: string): string | null {
  const normalized = formatBirthDateInput(display);
  const m = normalized.match(DISPLAY_RE);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function validateBirthDateDisplay(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return null;
  if (!DISPLAY_RE.test(formatBirthDateInput(trimmed))) {
    return 'Введите дату в формате ДД.ММ.ГГГГ';
  }
  const iso = parseBirthDateForApi(trimmed);
  if (!iso) return 'Введите дату в формате ДД.ММ.ГГГГ';

  const [y, mo, d] = iso.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return 'Введите дату в формате ДД.ММ.ГГГГ';
  }

  const minYear = 1900;
  const maxYear = new Date().getFullYear();
  if (y < minYear || y > maxYear) {
    return `Год должен быть от ${minYear} до ${maxYear}`;
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (dt.getTime() > today.getTime()) {
    return 'Дата рождения не может быть в будущем';
  }

  return null;
}

export function dateToBirthDateDisplay(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear());
  return `${d}.${m}.${y}`;
}
