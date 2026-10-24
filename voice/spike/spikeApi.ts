// THROWAWAY spike (voice/stage2-options.md section 7). Dev-only endpoints for the stage 2 test
// page: a LiveKit room token and a Cartesia STT token with a chosen lifetime. No auth, one shared
// room. Delete with the rest of voice/spike once the results are written down.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AccessToken } from 'livekit-server-sdk'
import type { Plugin } from 'vite'
import { mintSttToken } from '../src/server/cartesia'

const ROOM = 'voice-spike'

export function spikeApi(env: Record<string, string>): Plugin {
  async function handle(req: IncomingMessage, res: ServerResponse, path: string) {
    if (req.method === 'POST' && path === '/livekit-token') {
      const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env
      if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        return send(res, 500, { error: 'LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET missing from voice/.env' })
      }
      const { name } = (await readJson(req)) as { name?: unknown }
      const display = typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : 'anon'
      const identity = `spike_${Math.random().toString(36).slice(2, 10)}`
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name: display, ttl: '1h' })
      at.addGrant({ room: ROOM, roomJoin: true, canPublish: true, canSubscribe: true })
      return send(res, 200, { url: LIVEKIT_URL, token: await at.toJwt(), identity })
    }

    if (req.method === 'POST' && path === '/stt-token') {
      if (!env.CARTESIA_API_KEY) return send(res, 500, { error: 'CARTESIA_API_KEY missing from voice/.env' })
      const { ttl } = (await readJson(req)) as { ttl?: unknown }
      const ttlSeconds = Math.min(3600, Math.max(10, Math.round(Number(ttl) || 60)))
      return send(res, 200, await mintSttToken(env.CARTESIA_API_KEY, { ttlSeconds }))
    }

    send(res, 404, { error: 'Not found' })
  }

  return {
    name: 'voice-spike-api',
    configureServer(server) {
      server.middlewares.use('/api/spike', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        handle(req, res, url.pathname).catch((err: unknown) => {
          console.error('[voice-spike-api]', err instanceof Error ? err.message : 'error')
          if (!res.headersSent) send(res, 502, { error: err instanceof Error ? err.message : 'Upstream error' })
        })
      })
    },
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 10_000) throw new Error('Body too large')
  }
  return raw ? JSON.parse(raw) : {}
}
