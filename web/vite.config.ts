/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    // Serve this app (".") plus the shared contract; nothing else in the repo is exposed on the LAN.
    fs: { allow: ['.', '../shared'] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
  },
})
