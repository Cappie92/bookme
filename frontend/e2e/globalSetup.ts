/**
 * Preflight guard: ensures baseURL serves the Vite React app (HTML), not a JSON stub.
 * Fails fast with a clear message if baseURL is wrong or Vite dev server is not running.
 */
async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'

  let res: Response
  try {
    res = await fetch(baseURL, { method: 'GET', redirect: 'follow' })
  } catch (e) {
    throw new Error(
      `E2E preflight failed: cannot reach ${baseURL}. ` +
      `Запустите Vite dev server: cd frontend && npm run dev -- --port 5173 --strictPort\n` +
      `Затем: E2E_BASE_URL=http://localhost:5173 npx playwright test --project=chromium`
    )
  }

  const text = await res.text()
  if (text.includes('please use Vite dev server') || (res.headers.get('content-type')?.includes('application/json') && text.includes('vite_url'))) {
    throw new Error(
      `E2E preflight failed: ${baseURL} возвращает JSON-заглушку вместо React-приложения.\n` +
      `Запустите Vite dev server на 5173: cd frontend && npm run dev -- --port 5173 --strictPort\n` +
      `Затем: E2E_BASE_URL=http://localhost:5173 npx playwright test --project=chromium`
    )
  }

  if (!text.includes('<!DOCTYPE html>') && !text.includes('<html')) {
    throw new Error(
      `E2E preflight failed: ${baseURL} не возвращает HTML. ` +
      `Убедитесь, что Vite dev server запущен на 5173.`
    )
  }
}

export default globalSetup
