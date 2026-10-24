/// <reference types="vitest/config" />
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig, loadEnv } from 'vite'
import { voiceDevApi } from './devApi'

export default defineConfig(({ mode }) => {
  // Read server-side only; no VITE_ prefix, so the key is never bundled into the page.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // HTTPS so phones on the same Wi-Fi are allowed to use the microphone.
    plugins: [basicSsl(), voiceDevApi(env.CARTESIA_API_KEY)],
    server: {
      host: true,
      port: 5174,
      fs: { allow: ['.', '../shared'] },
    },
    test: {
      environment: 'node',
    },
  }
})
