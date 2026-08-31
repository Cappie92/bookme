import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const INDEXABLE_LEGAL_ROUTES = [
  'privacy-policy',
  'user-agreement',
  'personal-data-consent',
  'account-deletion',
]

const BOT_NAMES = ['robots', 'googlebot', 'bingbot', 'yandex']

export function makeLegalIndexableHtml(source) {
  let html = source

  for (const bot of BOT_NAMES) {
    const pattern = new RegExp(
      `(<meta\\s+name=["']${bot}["']\\s+content=["'])[^"']*(["']\\s*/?>)`,
      'gi'
    )
    html = html.replace(pattern, '$1index, follow$2')
  }

  for (const bot of BOT_NAMES) {
    const tag = html.match(new RegExp(`<meta\\s+name=["']${bot}["'][^>]*>`, 'i'))?.[0]
    if (!tag || /noindex|nofollow/i.test(tag) || !/content=["']index, follow["']/i.test(tag)) {
      throw new Error(`Legal entrypoint has invalid ${bot} robots meta`)
    }
  }

  return html
}

export async function createLegalEntrypoints(distDir) {
  const source = await readFile(path.join(distDir, 'index.html'), 'utf8')
  const legalHtml = makeLegalIndexableHtml(source)

  await Promise.all(
    INDEXABLE_LEGAL_ROUTES.map(async (route) => {
      const routeDir = path.join(distDir, route)
      await mkdir(routeDir, { recursive: true })
      await writeFile(path.join(routeDir, 'index.html'), legalHtml)
    })
  )
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedAsScript) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  await createLegalEntrypoints(path.resolve(scriptDir, '../dist'))
}
