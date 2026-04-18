/**
 * Расчёт динамики (изменения) для статистики.
 * Корректно обрабатывает случай previous=0 (математически % не определён).
 */
export interface ChangeResult {
  percent: number | null;
  absoluteDelta: number;
  label: string | null;
}

export function calcChange(current: number, previous: number): ChangeResult {
  const cur = current ?? 0;
  const prev = previous ?? 0;
  const delta = cur - prev;

  if (prev === 0 && cur === 0) {
    return { percent: 0, absoluteDelta: 0, label: null };
  }
  if (prev === 0 && cur > 0) {
    return { percent: null, absoluteDelta: delta, label: 'рост от нулевой базы' };
  }
  if (prev > 0 && cur === 0) {
    return { percent: -100, absoluteDelta: delta, label: null };
  }
  const pct = Math.round((delta / prev) * 100);
  return { percent: pct, absoluteDelta: delta, label: null };
}
