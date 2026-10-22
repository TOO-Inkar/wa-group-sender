import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Сборка кладётся в dist/; Docker-образ копирует её в статику Spring Boot (один адрес, cookie без CORS).
// При разработке /api проксируется на бэкенд: BACKEND_URL или локальный demo-экземпляр.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    proxy: { '/api': process.env.BACKEND_URL ?? 'http://127.0.0.1:18080' },
  },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
