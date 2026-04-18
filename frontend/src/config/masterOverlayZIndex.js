/**
 * Слои fixed-оверлеев мастерского mobile web (Tailwind arbitrary z-index).
 * Header глобальный: z-50. Нижняя навигация мастера: z-40.
 * Базовые модалки кабинета держим выше header, ниже полноэкранного меню.
 */
export const MASTER_OVERLAY_Z = {
  bottomNav: 40,
  /** Простые модалки / бэкдропы разделов */
  base: 55,
  /** Список всех записей (портал в document.body; выше header z-50 и графиков, ниже листа детали z-70) */
  allBookingsListModal: 68,
  /** Вложенные панели поверх base и списка записей (фильтры / вложенные модалки) */
  nested: 69,
  /** Деталь записи (dashboard / все записи) */
  bookingDetail: 70,
  /** Лист причины отмены поверх детали */
  bookingCancel: 80,
  /** Расписание: поверх sticky-хрома календаря */
  scheduleDetail: 85,
  scheduleCancel: 90,
  /** Полноэкранное меню разделов */
  fullscreenMenu: 100,
}

/** @param {keyof typeof MASTER_OVERLAY_Z} key */
export function masterZClass(key) {
  return `z-[${MASTER_OVERLAY_Z[key]}]`
}
