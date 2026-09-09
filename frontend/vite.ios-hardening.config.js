import { mergeConfig } from 'vite'
import base from './vite.config'

// Local fixture gate has no live backend or HMR socket.
export default mergeConfig(base, { server: { host: '127.0.0.1', port: 5197, hmr: false } })
