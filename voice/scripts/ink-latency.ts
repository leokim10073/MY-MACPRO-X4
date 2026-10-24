// Measures Ink end to end with the real PttSession code, without a microphone.
// Sonic reads the first lines of the Kevin script; the audio is streamed to Ink at real-time
// pace like a held button, then released. Prints what Ink heard and how long each step took.
//
//   npm run ink:latency            (first 4 lines)
//   npm run ink:latency -- 8       (first 8 lines)
import replay from '../../shared/fixtures/kevin.replay.json'
import fixture from '../../shared/fixtures/kevin.expected.json'
import { CARTESIA_API_BASE, CARTESIA_VERSION, NARRATOR_VOICE_ID, STT_CHUNK_MS, STT_SAMPLE_RATE, TAIL_MS, TTS_MODEL } from '../src/config'
import { mintSttToken } from '../src/server/cartesia'
import { buildSttUrl } from '../src/stt/ink'
import { buildKeyterms } from '../src/stt/keyterms'
import { PttSession } from '../src/stt/pttSession'
import type { SocketLike } from '../src/stt/socket'

const apiKey = process.env.CARTESIA_API_KEY
if (!apiKey) throw new Error('Set CARTESIA_API_KEY in voice/.env')

const count = Number(process.argv[2] ?? 4)
const keyterms = buildKeyterms(
  replay.speakers.map((name) => ({ name })),
  fixture.storyState.people,
)

async function speakPcm(text: string): Promise<Int16Array> {
  const res = await fetch(`${CARTESIA_API_BASE}/tts/bytes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Cartesia-Version': CARTESIA_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_id: TTS_MODEL,
      transcript: text,
      voice: { id: NARRATOR_VOICE_ID },
      language: 'en',
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: STT_SAMPLE_RATE },
    }),
  })
  if (!res.ok) throw new Error(`TTS failed (${res.status}): ${await res.text()}`)
  const buf = await res.arrayBuffer()
  return new Int16Array(buf, 0, Math.floor(buf.byteLength / 2))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function run() {
  const { token } = await mintSttToken(apiKey!, { ttlSeconds: 600 })
  console.log(`Keyterms: ${keyterms.join(', ')}\n`)
  const rows: { line: string; heard: string; connectMs: number; releaseToTextMs: number; complete: boolean }[] = []

  for (const line of replay.lines.slice(0, count)) {
    const pcm = await speakPcm(line.text)
    const pressedAt = performance.now()
    let openedAt = 0
    const session = new PttSession(async () => {
      const ws = new WebSocket(buildSttUrl(token, keyterms)) as unknown as SocketLike & WebSocket
      ws.addEventListener('open', () => (openedAt = performance.now()))
      return ws
    })

    // Stream like a held button: one chunk every 100 ms, plus the release tail of silence.
    const chunk = (STT_SAMPLE_RATE * STT_CHUNK_MS) / 1000
    const withTail = new Int16Array(pcm.length + (STT_SAMPLE_RATE * TAIL_MS) / 1000)
    withTail.set(pcm)
    for (let i = 0; i < withTail.length; i += chunk) {
      session.push(withTail.subarray(i, i + chunk))
      await sleep(STT_CHUNK_MS)
    }

    const releasedAt = performance.now()
    const result = await session.stop()
    rows.push({
      line: line.text,
      heard: result.text,
      connectMs: Math.round(openedAt - pressedAt),
      releaseToTextMs: Math.round(performance.now() - releasedAt),
      complete: result.complete,
    })
    const r = rows.at(-1)!
    console.log(`said : ${r.line}\nheard: ${r.heard}\n       connect ${r.connectMs} ms · release→text ${r.releaseToTextMs} ms${r.complete ? '' : ' · INCOMPLETE ' + (result.error ?? '')}\n`)
  }

  const avg = (k: 'connectMs' | 'releaseToTextMs') => Math.round(rows.reduce((s, r) => s + r[k], 0) / rows.length)
  console.log(`Average: connect ${avg('connectMs')} ms · release→text ${avg('releaseToTextMs')} ms over ${rows.length} lines`)
  // Give background closes a moment to finish before exiting.
  await sleep(500)
}

run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
