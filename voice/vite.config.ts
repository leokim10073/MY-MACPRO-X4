/// <reference types="vitest/config" />
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig, loadEnv } from 'vite'
import { voiceDevApi } from './devApi'

function livekitConfig(env: Record<string, string>) {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret } = env
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : undefined
}

export default defineConfig(({ mode }) => {
  // Read server-side only; no VITE_ prefix, so the key is never bundled into the page.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // HTTPS so phones on the same Wi-Fi are allowed to use the microphone.
    plugins: [basicSsl(), voiceDevApi({ cartesiaKey: env.CARTESIA_API_KEY, livekit: livekitConfig(env) })],
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
