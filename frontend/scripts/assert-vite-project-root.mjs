/**
 * Защита от случайного `npm run dev` из backup-копии репозитория.
 * Vite в ответах отдаёт абсолютные пути к исходникам — если cwd был backup, в curl виден backup.
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const cwd = path.resolve(process.cwd())

const forbidden = 'DeDato-old-pre-rewrite-backup'
if (cwd.includes(forbidden) || frontendRoot.includes(forbidden)) {
  console.error('[vite-root] Остановка: похоже, это backup-копия, а не текущий DeDato.')
  console.error('[vite-root] cwd:          ', cwd)
  console.error('[vite-root] frontendRoot:', frontendRoot)
  console.error('[vite-root] Запустите из: /Users/s.devyatov/DeDato/frontend')
  process.exit(1)
}

if (cwd !== frontendRoot) {
  console.warn('[vite-root] Рекомендуется запускать из каталога frontend.')
  console.warn('[vite-root] cwd:          ', cwd)
  console.warn('[vite-root] frontendRoot:', frontendRoot)
}

console.info('[vite-root] Vite project root:', frontendRoot)
