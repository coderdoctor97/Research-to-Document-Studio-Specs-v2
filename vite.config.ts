import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    // The sandbox preview proxies the app under a dynamic e2b.app host.
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    css: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
