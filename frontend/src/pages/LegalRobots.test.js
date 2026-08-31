import { afterEach, describe, expect, it } from 'vitest'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createLegalEntrypoints,
  INDEXABLE_LEGAL_ROUTES,
  makeLegalIndexableHtml,
} from '../../scripts/create-legal-entrypoints.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '../..')
const initialHtml = readFileSync(path.join(frontendRoot, 'index.html'), 'utf8')
const nginxSource = readFileSync(path.join(frontendRoot, 'nginx.conf'), 'utf8')
const layoutSource = readFileSync(path.join(here, 'legal/LegalDocumentLayout.jsx'), 'utf8')
const pageFiles = [
  'PrivacyPolicyPage.jsx',
  'UserAgreement.jsx',
  'PersonalDataConsentPage.jsx',
  'AccountDeletionPage.jsx',
]
const tempDirs = []

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true })
})

describe('production legal robots', () => {
  it('sets index, follow in the hydrated Helmet metadata for every public legal page', () => {
    for (const file of pageFiles) {
      const source = readFileSync(path.join(here, file), 'utf8')
      expect(source).toMatch(/robots=["']index, follow["']/)
      expect(source).not.toMatch(/robots=["']noindex\s*,\s*nofollow["']/)
    }
  })

  it('keeps the default SPA and layout safety metadata non-indexable', () => {
    expect(initialHtml).toContain('content="noindex, nofollow"')
    expect(layoutSource).toContain("robots = 'noindex, nofollow'")
  })

  it('creates indexable initial HTML entrypoints for all four legal routes', async () => {
    const distDir = mkdtempSync(path.join(os.tmpdir(), 'dedato-legal-robots-'))
    tempDirs.push(distDir)
    writeFileSync(path.join(distDir, 'index.html'), initialHtml)

    await createLegalEntrypoints(distDir)

    for (const route of INDEXABLE_LEGAL_ROUTES) {
      const html = readFileSync(path.join(distDir, route, 'index.html'), 'utf8')
      expect(html).not.toMatch(/noindex|nofollow/i)
      for (const bot of ['robots', 'googlebot', 'bingbot', 'yandex']) {
        expect(html).toMatch(
          new RegExp(`<meta\\s+name=["']${bot}["']\\s+content=["']index, follow["']`, 'i')
        )
      }
    }
  })

  it('routes only the four public legal paths to their initial HTML entrypoints', () => {
    for (const route of INDEXABLE_LEGAL_ROUTES) expect(nginxSource).toContain(route)
    expect(nginxSource).toContain('try_files /$1/index.html =404;')
    expect(makeLegalIndexableHtml(initialHtml)).not.toMatch(/noindex|nofollow/i)
  })
})
