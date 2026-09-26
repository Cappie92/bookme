/**
 * Preflight: loopback-only baseURL, Vite must serve the SPA HTML.
 * If a local backend with DEV_E2E is up, reset+seed E2E users so live specs are repeatable.
 */
import { resolveE2eBackendURL, resolveE2eBaseURL } from './localGuard'

async function globalSetup() {
  const baseURL = resolveE2eBaseURL()
  const backendURL = resolveE2eBackendURL()

  let res: Response
  try {
    res = await fetch(baseURL, { method: 'GET', redirect: 'follow' })
  } catch {
    throw new Error(
      `E2E preflight failed: cannot reach ${baseURL}. ` +
        'Start Vite: cd frontend && npm run dev -- --port 5173 --strictPort --host 127.0.0.1\n' +
        'Live specs also need: DEV_E2E=true ZVONOK_MODE=stub ROBOKASSA_MODE=stub backend on :8000'
    )
  }

  const text = await res.text()
  if (text.includes('please use Vite dev server') || (res.headers.get('content-type')?.includes('application/json') && text.includes('vite_url'))) {
    throw new Error(
      `E2E preflight failed: ${baseURL} returns a JSON stub instead of the React app.\n` +
        'Start Vite on 5173: cd frontend && npm run dev -- --port 5173 --strictPort --host 127.0.0.1'
    )
  }

  if (!text.includes('<!DOCTYPE html>') && !text.includes('<html')) {
    throw new Error(
      `E2E preflight failed: ${baseURL} did not return HTML. Start the Vite dev server on 5173.`
    )
  }

  try {
    const seedRes = await fetch(`${backendURL}/api/dev/e2e/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    })
    if (seedRes.ok) return
    const detail = await seedRes.text().catch(() => '')
    if (seedRes.status === 404) {
      // DEV_E2E router not mounted — mocked specs can still run; live specs will fail with a clear login error.
      return
    }
    throw new Error(
      `E2E seed failed (${seedRes.status}) at ${backendURL}/api/dev/e2e/seed. ${detail.slice(0, 300)}`
    )
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('E2E seed failed')) throw e
    // Backend down: mocked API specs still run.
  }
}

export default globalSetup
