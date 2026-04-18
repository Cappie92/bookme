import { File, Paths } from 'expo-file-system'

/**
 * Записывает .ics в кэш через новый API (Paths + File).
 * В SDK 54 legacy cacheDirectory/documentDirectory на Android могут быть пустыми;
 * Paths.cache и File работают корректно.
 * @returns URI файла для expo-sharing
 */
function icsCacheFileKey(booking: { id: number; public_reference?: string | null } | number): string {
  if (typeof booking === 'number') return String(booking)
  const pr = booking.public_reference?.trim()
  if (pr) return pr.replace(/[^A-Z0-9-]/gi, '_')
  return String(booking.id)
}

export function writeIcsToCacheAndGetUri(
  booking: { id: number; public_reference?: string | null } | number,
  icsContent: string
): string {
  const key = icsCacheFileKey(booking)
  const file = new File(Paths.cache, `booking-${key}.ics`)
  file.create({ overwrite: true })
  file.write(icsContent)
  return file.uri
}

export type ShareErrorAlert = { title: string; message: string }

/**
 * Классифицирует ошибку shareAsync и возвращает заголовок/текст для Alert.
 * cancel/dismiss — пользователь закрыл chooser; no_app — нет приложения; other — прочая ошибка.
 */
export function getShareErrorAlert(error: unknown, filePath: string): ShareErrorAlert {
  const msg = String((error as { message?: string })?.message ?? '')
  const code = String((error as { code?: string })?.code ?? '')
  const lower = `${msg} ${code}`.toLowerCase()
  if (
    lower.includes('cancel') ||
    lower.includes('dismiss') ||
    lower.includes('cancelled') ||
    code === 'E_SHARE_CANCELLED' ||
    code === 'ERR_SHARE_CANCELLED'
  ) {
    return {
      title: 'Файл сохранён',
      message: 'Вы закрыли окно выбора приложения. Файл .ics сохранён в кэше.',
    }
  }
  if (
    lower.includes('no activity') ||
    lower.includes('no application') ||
    lower.includes('no app') ||
    lower.includes('resolveactivity') ||
    lower.includes('intent')
  ) {
    return {
      title: 'Файл сохранён',
      message:
        'На устройстве не найдено подходящее приложение для открытия .ics. Файл сохранён в кэше приложения.',
    }
  }
  return {
    title: 'Файл сохранён',
    message: `Поделиться не удалось. Файл сохранён: ${filePath}`,
  }
}
