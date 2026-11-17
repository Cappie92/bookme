// Programmatic Vite startup: OS-assigned port, matching HMR, local-only proxy.
import fs from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.env.DEDATO_ROOT
const state = process.env.DEDATO_STATE
const { createServer, loadConfigFromFile } = await import(pathToFileURL(path.join(root, 'frontend/node_modules/vite/dist/node/index.js')))
const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, path.join(root, 'frontend/vite.config.js'))
let server
const httpServer = createHttpServer((req, res) => {
  if (server) server.middlewares(req, res)
  else { res.writeHead(503); res.end('Starting') }
})
await new Promise((resolve, reject) => {
  httpServer.once('error', reject)
  httpServer.listen(0, '127.0.0.1', resolve)
})
const port = httpServer.address().port
server = await createServer({
  ...loaded.config,
  root: path.join(root, 'frontend'),
  configFile: false,
  envDir: path.join(state, 'empty-env'),
  cacheDir: path.join(state, 'vite-cache'),
  clearScreen: false,
  server: {
    ...loaded.config.server,
    host: '127.0.0.1', port, strictPort: true, open: false, middlewareMode: true,
    allowedHosts: ['127.0.0.1', 'localhost'],
    hmr: { server: httpServer, host: '127.0.0.1', protocol: 'ws', clientPort: port },
  },
  plugins: [...loaded.config.plugins, {
    name: 'dedato-local-identity',
    configureServer(server) {
      server.middlewares.use('/__dedato_local', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ run_id: process.env.DEDATO_RUN_ID }))
      })
    },
  }],
})
const url = `http://127.0.0.1:${port}`
const target = path.join(state, 'frontend.json')
fs.writeFileSync(target + '.tmp', JSON.stringify({ url, run_id: process.env.DEDATO_RUN_ID }), { mode: 0o600 })
fs.renameSync(target + '.tmp', target)
console.log(`Dedato local frontend: ${url}`)
let closing = false
async function stop() {
  if (closing) return
  closing = true
  httpServer.close()
  await server.close()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
// The supervisor owns stdin. If it dies, this child must not survive it.
process.stdin.resume()
process.stdin.on('end', stop)
