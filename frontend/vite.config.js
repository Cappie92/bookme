import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      shared: path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React и связанные библиотеки
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // UI библиотеки
          'ui-vendor': ['@headlessui/react', '@heroicons/react', 'framer-motion'],
          // Редактор и его зависимости
          'editor': [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extension-color',
            '@tiptap/extension-highlight',
            '@tiptap/extension-image',
            '@tiptap/extension-link',
            '@tiptap/extension-placeholder',
            '@tiptap/extension-text-align',
            '@tiptap/extension-text-style',
            '@tiptap/extension-typography',
            '@tiptap/extension-underline'
          ],
          // Утилиты для работы с данными
          'data-vendor': ['axios', '@tanstack/react-query', 'zustand', 'swr'],
          // Утилиты для работы с датами
          'date-vendor': ['date-fns'],
          // Библиотека графиков
          'charts-vendor': ['recharts'],
        }
      }
    },
    chunkSizeWarningLimit: 600, // Увеличим лимит до 600 KB
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      host: 'localhost',
      protocol: 'ws',
      clientPort: 5173
    },
    strictPort: true,
    allowedHosts: [
      'dedato.ru',
      'www.dedato.ru',
      'localhost',
      '127.0.0.1'
    ],
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    proxy: {
      '/auth': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
      '/salon': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
      '/client': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        bypass(req) {
          if (req.headers.accept?.includes('text/html')) return '/index.html'
        }
      },
      '/admin': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
      '/bookings': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
      // Фото/логотипы: в БД пути вида uploads/...; в UI — /uploads/... на origin Vite → без прокси файл не отдаётся с uvicorn
      '/uploads': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
      '/moderator': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
      '/blog': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
      '/balance': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
      '/subscriptions': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
      '/loyalty': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      },
    },
  },
})
