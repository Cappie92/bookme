/** Summarize master schedule rules + materialized weekly slots for the «Расписание» tab. */

const WEEKDAY_NAMES = [
  '',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
]

function pad2(n) {
  return String(n).padStart(2, '0')
}

function slotKeyParts(key) {
  const m = /^(\d{4}-\d{2}-\d{2})_(\d+)_(\d+)$/.exec(key)
  if (!m) return null
  return { date: m[1], hour: Number(m[2]), minute: Number(m[3]) }
}

function minutesFromParts(hour, minute) {
  return hour * 60 + minute
}

/** API weekly slots and legacy boolean-only maps from older callers. */
function isMaterializedWorkingSlot(value) {
  if (value === true) return true
  if (value === false || value == null) return false
  if (typeof value === 'object') return value.is_working === true
  return false
}

function formatRangeLabel(startMin, endMin) {
  const sh = Math.floor(startMin / 60)
  const sm = startMin % 60
  const endExclusive = endMin
  const eh = Math.floor(endExclusive / 60)
  const em = endExclusive % 60
  return `${pad2(sh)}:${pad2(sm)} – ${pad2(eh)}:${pad2(em)}`
}

/** Group materialized true slots into contiguous 30-min intervals per date. */
export function groupMaterializedScheduleByDate(scheduleMap) {
  if (!scheduleMap || typeof scheduleMap !== 'object') return []
  const byDate = {}
  for (const [key, slot] of Object.entries(scheduleMap)) {
    if (!isMaterializedWorkingSlot(slot)) continue
    const parts = slotKeyParts(key)
    if (!parts) continue
    if (!byDate[parts.date]) byDate[parts.date] = []
    byDate[parts.date].push(minutesFromParts(parts.hour, parts.minute))
  }

  const rows = []
  for (const date of Object.keys(byDate).sort()) {
    const mins = [...new Set(byDate[date])].sort((a, b) => a - b)
    const intervals = []
    let start = null
    let prev = null
    for (const m of mins) {
      if (start == null) {
        start = m
        prev = m
        continue
      }
      if (m === prev + 30) {
        prev = m
        continue
      }
      intervals.push(formatRangeLabel(start, prev + 30))
      start = m
      prev = m
    }
    if (start != null) {
      intervals.push(formatRangeLabel(start, prev + 30))
    }
    const d = new Date(`${date}T12:00:00`)
    const weekday = d.toLocaleDateString('ru-RU', { weekday: 'long' })
    const label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    for (const range of intervals) {
      rows.push({
        kind: 'materialized',
        title: `${weekday}, ${label}`,
        detail: range,
        date,
      })
    }
  }
  return rows
}

function normalizeWeekdayRules(fixed) {
  const weekdays = fixed.weekdays || fixed.weekdayTimes || {}
  const rows = []
  for (let id = 1; id <= 7; id += 1) {
    const entry = weekdays[String(id)] || weekdays[id]
    if (!entry) continue
    const enabled = entry.enabled !== false
    const open = entry.open || entry.start
    const close = entry.close || entry.end
    rows.push({
      kind: 'rule',
      title: WEEKDAY_NAMES[id],
      detail: enabled && open && close ? `${open} – ${close}` : 'Выходной',
      enabled,
    })
  }
  return rows
}

function normalizeFixedSchedule(fixed) {
  if (!fixed || typeof fixed !== 'object') return { type: null, rows: [], meta: [] }
  const type = fixed.type || fixed.schedule_type
  const meta = []

  if (type === 'weekdays') {
    return { type: 'weekdays', rows: normalizeWeekdayRules(fixed), meta }
  }
  if (type === 'monthdays') {
    const days = fixed.monthdays || {}
    const rows = Object.entries(days).map(([day, times]) => ({
      kind: 'rule',
      title: `${day} число месяца`,
      detail: times?.start && times?.end ? `${times.start} – ${times.end}` : '—',
      enabled: true,
    }))
    return { type: 'monthdays', rows, meta }
  }
  if (type === 'shift' || type === 'shift_schedule') {
    const cfg = fixed.shiftConfig || fixed
    const rows = []
    if (cfg.workDays != null) rows.push({ kind: 'rule', title: 'Рабочих дней подряд', detail: String(cfg.workDays), enabled: true })
    if (cfg.restDays != null) rows.push({ kind: 'rule', title: 'Выходных дней подряд', detail: String(cfg.restDays), enabled: true })
    if (cfg.startDate) rows.push({ kind: 'rule', title: 'Дата начала цикла', detail: String(cfg.startDate), enabled: true })
    return { type: 'shift', rows, meta }
  }
  return { type: type || 'unknown', rows: [], meta }
}

export function buildMasterScheduleOverview({
  scheduleRules,
  scheduleRulesLoading,
  scheduleRulesError,
  materializedSchedule,
}) {
  if (scheduleRulesLoading) {
    return { status: 'loading', headline: 'Загрузка расписания…', rows: [], meta: [] }
  }
  if (scheduleRulesError) {
    return {
      status: 'error',
      headline: 'Не удалось загрузить правила расписания',
      body: scheduleRulesError,
      rows: [],
      meta: [],
    }
  }

  const hasSettings = Boolean(scheduleRules?.has_settings && scheduleRules?.fixed_schedule)
  const materialized = groupMaterializedScheduleByDate(materializedSchedule)
  const hasMaterialized = materialized.length > 0

  if (hasSettings) {
    const parsed = normalizeFixedSchedule(scheduleRules.fixed_schedule)
    const meta = [...parsed.meta]
    if (scheduleRules.valid_until) {
      meta.push({ label: 'Действует до', value: scheduleRules.valid_until })
    }
    if (scheduleRules.created_at) {
      meta.push({
        label: 'Создано',
        value: new Date(scheduleRules.created_at).toLocaleDateString('ru-RU'),
      })
    }
    if (scheduleRules.updated_at) {
      meta.push({
        label: 'Обновлено',
        value: new Date(scheduleRules.updated_at).toLocaleDateString('ru-RU'),
      })
    }
    return {
      status: 'rules',
      headline: 'Сохранённый шаблон графика',
      body: parsed.type === 'weekdays'
        ? 'Повторяющееся правило по дням недели; на календаре показаны материализованные интервалы.'
        : 'Правило из настроек мастера; даты на календаре могут отличаться от шаблона.',
      rows: parsed.rows,
      meta,
      hasMaterialized,
      materializedPreview: hasMaterialized
        ? materialized.slice(0, 14)
        : [],
    }
  }

  if (hasMaterialized) {
    return {
      status: 'materialized_only',
      headline: 'Рабочие интервалы на календаре',
      body: 'Сохранённого шаблона нет; ниже — фактические рабочие слоты из текущих данных (неделя/дни могут меняться).',
      rows: materialized,
      meta: [],
    }
  }

  return {
    status: 'empty',
    headline: 'Расписание ещё не настроено',
    body: 'Создайте график или отметьте рабочие слоты в режиме «Неделя». Записи и личные дела можно создавать из шапки в любой день.',
    rows: [],
    meta: [],
  }
}

export function hasSavedScheduleTemplate(scheduleRules) {
  return Boolean(scheduleRules?.has_settings && scheduleRules?.fixed_schedule)
}