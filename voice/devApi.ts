// Dev-only stand-in for the backend, served by the voice test page's Vite server. It lets two
// phones share one room before Convex is ready. Everything is kept in memory and is gone when
// the server stops. Never deploy this: it has no real auth and one shared room.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { Member, NewTranscriptLine, TranscriptLine } from '../shared/schema'
import { countWords, mintSttToken, synthesizeSpeech } from './src/server/cartesia'
import { endCall, mintCallToken, type LiveKitConfig } from './src/server/livekit'

const ROOM_ID = 'dev-room'
const MAX_LINES = 500
const MAX_TTS_WORDS = 80
const TOKENS_PER_MINUTE = 30

export interface DevApiEnv {
  cartesiaKey?: string
  /** Set when LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are all in voice/.env. */
  livekit?: LiveKitConfig
}

export function voiceDevApi({ cartesiaKey: apiKey, livekit }: DevApiEnv): Plugin {
  let members: Member[] = []
  let lines: TranscriptLine[] = []
  let tokenRequests: { memberId: string; at: number }[] = []

  const memberFrom = (req: IncomingMessage) => members.find((m) => m.id === req.headers['x-member-id'])

  async function handle(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams) {
    if (req.method === 'POST' && path === '/join') {
      const { name } = (await readJson(req)) as { name?: unknown }
      if (typeof name !== 'string' || !name.trim()) return send(res, 400, { error: 'Name required' })
      const member: Member = {
        id: `m_${Math.random().toString(36).slice(2, 10)}`,
        roomId: ROOM_ID,
        name: name.trim().slice(0, 40),
        joinedAtSeq: lines.length ? lines[lines.length - 1].seq : 0,
        joinedAt: Date.now(),
      }
      members.push(member)
      return send(res, 200, member)
    }

    const me = memberFrom(req)
    if (!me) return send(res, 403, { error: 'Not a member of this room' })

    if (req.method === 'POST' && path === '/stt-token') {
      if (!apiKey) return send(res, 500, { error: 'CARTESIA_API_KEY missing from voice/.env' })
      const now = Date.now()
      tokenRequests = tokenRequests.filter((r) => now - r.at < 60_000)
      if (tokenRequests.filter((r) => r.memberId === me.id).length >= TOKENS_PER_MINUTE) {
        return send(res, 429, { error: 'Too many token requests' })
      }
      tokenRequests.push({ memberId: me.id, at: now })
      return send(res, 200, await mintSttToken(apiKey))
    }

    if (req.method === 'POST' && path === '/livekit-token') {
      if (!livekit) return send(res, 500, { error: 'LIVEKIT_URL, LIVEKIT_API_KEY or LIVEKIT_API_SECRET missing from voice/.env' })
      return send(res, 200, await mintCallToken(livekit, { roomId: ROOM_ID, memberId: me.id, name: me.name }))
    }

    if (req.method === 'POST' && path === '/lines') {
      const body = (await readJson(req)) as Partial<NewTranscriptLine>
      if (body.speakerId !== me.id || typeof body.text !== 'string' || typeof body.at !== 'number') {
        return send(res, 400, { error: 'Bad line' })
      }
      const seq = (lines.at(-1)?.seq ?? 0) + 1
      lines.push({ id: `l${seq}`, roomId: ROOM_ID, speakerId: me.id, speakerName: me.name, text: body.text, seq, at: body.at })
      if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES)
      return send(res, 200, { seq })
    }

    if (req.method === 'GET' && path === '/lines') {
      const after = Number(query.get('after') ?? 0)
      return send(res, 200, { members, lines: lines.filter((l) => l.seq > after) })
    }

    if (req.method === 'POST' && path === '/tts') {
      if (!apiKey) return send(res, 500, { error: 'CARTESIA_API_KEY missing from voice/.env' })
      const { text } = (await readJson(req)) as { text?: unknown }
      if (typeof text !== 'string' || !text.trim() || countWords(text) > MAX_TTS_WORDS) {
        return send(res, 400, { error: `Text must be 1-${MAX_TTS_WORDS} words` })
      }
      const mp3 = await synthesizeSpeech(apiKey, text)
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' })
      return res.end(mp3)
    }

    if (req.method === 'POST' && path === '/burn') {
      members = []
      lines = []
      tokenRequests = []
      if (livekit) await endCall(livekit, ROOM_ID)
      return send(res, 200, { burned: true })
    }

    send(res, 404, { error: 'Not found' })
  }

  return {
    name: 'voice-dev-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        handle(req, res, url.pathname, url.searchParams).catch((err: unknown) => {
          // Only the error message is logged, never request bodies or transcript text.
          console.error('[voice-dev-api]', err instanceof Error ? err.message : 'error')
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
