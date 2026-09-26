/**
 * E2E may only target loopback. Production and staging origins fail fast.
 */
const BLOCKED_HOST_RE = /(^|\.)dedato\.ru$/i

export function assertLocalHttpUrl(raw: string, label: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`${label} is not a valid URL: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must be http(s): ${raw}`)
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const isLoopback =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'
  if (BLOCKED_HOST_RE.test(host) || !isLoopback) {
    throw new Error(
      `E2E refused non-local ${label}: ${raw}. ` +
        'Set E2E_BASE_URL=http://localhost:5173 and E2E_BACKEND_URL=http://localhost:8000. ' +
        'Production and staging are forbidden.'
    )
  }
  return url
}

export function resolveE2eBaseURL(): string {
  const raw = process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'
  return assertLocalHttpUrl(raw, 'E2E_BASE_URL').origin
}

export function resolveE2eBackendURL(): string {
  const raw = process.env.E2E_BACKEND_URL ?? 'http://localhost:8000'
  return assertLocalHttpUrl(raw, 'E2E_BACKEND_URL').origin
}

export function localAppOrigins(baseURL: string): Set<string> {
  const url = assertLocalHttpUrl(baseURL, 'E2E_BASE_URL')
  const hosts =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      ? ['localhost', '127.0.0.1']
      : [url.hostname]
  const origins = new Set<string>()
  const port = url.port ? `:${url.port}` : ''
  for (const host of hosts) {
    origins.add(`${url.protocol}//${host}${port}`)
  }
  return origins
}
