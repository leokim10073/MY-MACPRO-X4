// THROWAWAY spike for voice/stage2-options.md section 7 (T1–T5). Not production code: it has no
// tests and cuts corners on purpose. Delete the whole voice/spike folder once the results are in
// the doc.
//
// One phone joins a LiveKit room with Krisp (optionally BVC) on its mic and runs up to two Ink
// turn-detection connections side by side:
//   filtered lane: Krisp processedTrack → loudness gate → Ink   (what Approach 1 would ship)
//   raw lane:      the untouched mic                     → Ink   (baseline to compare against)
// Everything interesting is written to the on-page log so it can be copied into the doc.
import { KrispNoiseFilter, isKrispNoiseFilterSupported, type KrispNoiseFilterProcessor } from '@livekit/krisp-noise-filter'
import { LocalAudioTrack, Room, RoomEvent, Track, type Participant } from 'livekit-client'
import { Chunker } from '../src/audio/chunker'
import { PCM_CAPTURE_PROCESSOR, pcmCaptureWorkletUrl } from '../src/audio/pcmCaptureWorklet'
import { Resampler } from '../src/audio/resampler'
import { CARTESIA_VERSION, CARTESIA_WS_BASE, STT_CHUNK_MS, STT_ENCODING, STT_MODEL, STT_SAMPLE_RATE } from '../src/config'

const CHUNK_SAMPLES = (STT_SAMPLE_RATE * STT_CHUNK_MS) / 1000
/** The gate looks this many chunks ahead, so a word's first syllable isn't cut while it opens. */
const GATE_LOOKAHEAD = 2
/** The gate stays open this many chunks after the last loud one, so word endings aren't cut. */
const GATE_HANG = 5
/** Audio held while Ink is connecting. Older chunks are dropped (and counted). */
const MAX_QUEUED_CHUNKS = 30

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

const logLines: string[] = []

function log(tag: string, msg: string): void {
  const now = new Date()
  const stamp = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0')
  const line = `${stamp} [${tag}] ${msg}`
  logLines.push(line)
  const el = $('log')
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20
  el.textContent += line + '\n'
  if (atBottom) el.scrollTop = el.scrollHeight
}

const errText = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err))

// Krisp only reports whether BVC actually turned on through its own console logging.
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = console[level].bind(console)
  console[level] = (...args: unknown[]) => {
    original(...args)
    const text = args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : '')).join(' ')
    if (/krisp|bvc|noise ?filter/i.test(text)) log('krisp', `${level}: ${text.slice(0, 300)}`)
  }
}

window.addEventListener('error', (e) => log('page', `error: ${e.message}`))
window.addEventListener('unhandledrejection', (e) => log('page', `unhandled: ${errText(e.reason)}`))

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const settings = {
  gateDb: -55,
  turnStart: 0.8,
  ttl: 60,
  reconnect: true,
}

function bindRange(id: string, onChange: (v: number) => void, format: (v: number) => string): void {
  const input = $<HTMLInputElement>(id)
  const show = () => ($(`${id}-value`).textContent = format(Number(input.value)))
  input.addEventListener('input', () => {
    show()
    onChange(Number(input.value))
  })
  show()
}

bindRange('gate', (v) => (settings.gateDb = v), (v) => `${v} dBFS`)
bindRange(
  'start',
  (v) => {
    settings.turnStart = v
    for (const lane of lanes) lane.sendConfig()
  },
  (v) => v.toFixed(2),
)

// ---------------------------------------------------------------------------
// One Ink lane
// ---------------------------------------------------------------------------

interface InkToken {
  token: string
  expiresAt: number
}

async function fetchSttToken(): Promise<InkToken> {
  const res = await fetch('/api/spike/stt-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: settings.ttl }),
  })
  const body = (await res.json()) as InkToken & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Token request failed (${res.status})`)
  return body
}

function rmsDb(samples: Int16Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  const rms = Math.sqrt(sum / samples.length) / 32768
  return rms > 0 ? 20 * Math.log10(rms) : -120
}

class InkLane {
  readonly lines: string[] = []
  private socket: WebSocket | null = null
  private token: InkToken | null = null
  private connectedAt = 0
  private stopped = false
  private queue: Int16Array<ArrayBuffer>[] = []
  private turnOpen = false
  private lastUpdate = ''

  // Audio graph
  private source: MediaStreamAudioSourceNode | null = null
  private node: AudioWorkletNode | null = null
  private sink: GainNode | null = null
  private readonly chunker = new Chunker(CHUNK_SAMPLES, (c) => this.onChunk(c))
  private resampler: Resampler

  // Gate
  private readonly pending: { chunk: Int16Array<ArrayBuffer>; open: boolean }[] = []
  private chunkIndex = 0
  private openUntil = -1
  db = -120
  gated = false

  // Stats
  private stats = { connects: 0, sent: 0, gatedChunks: 0, dropped: 0, longestS: 0, samplesWindow: 0, windowStart: performance.now() }
  private lastExpiryNote = 0
  calibrating: number[] | null = null

  private readonly el: HTMLElement

  constructor(
    readonly name: string,
    private readonly ctx: AudioContext,
    private track: MediaStreamTrack,
    private readonly useGate: boolean,
  ) {
    this.resampler = new Resampler(ctx.sampleRate, STT_SAMPLE_RATE)
    this.el = document.createElement('div')
    this.el.className = 'lane'
    this.el.innerHTML = `<h3></h3><div class="meter"><div class="level"></div><div class="gate"></div></div>
      <div class="stats"></div><div class="preview"></div><ol></ol>`
    this.el.querySelector('h3')!.textContent = name
    $('lanes').append(this.el)
    this.wire()
    void this.connect()
  }

  /** Points the lane at a new mic track (after Krisp restarts or the mic is re-acquired). */
  retarget(track: MediaStreamTrack): void {
    if (track === this.track) return
    log(this.name, `audio source changed (track ${track.id.slice(0, 8)})`)
    this.unwire()
    this.track = track
    this.resampler = new Resampler(this.ctx.sampleRate, STT_SAMPLE_RATE)
    this.wire()
  }

  private wire(): void {
    this.source = this.ctx.createMediaStreamSource(new MediaStream([this.track]))
    this.node = new AudioWorkletNode(this.ctx, PCM_CAPTURE_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1 })
    this.sink = this.ctx.createGain()
    this.sink.gain.value = 0
    this.source.connect(this.node).connect(this.sink).connect(this.ctx.destination)
    this.node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      const frame = this.resampler.process(ev.data)
      this.stats.samplesWindow += frame.length
      if (frame.length) this.chunker.push(frame)
    }
    this.track.addEventListener('ended', () => log(this.name, 'source track ended'))
  }

  private unwire(): void {
    if (this.node) this.node.port.onmessage = null
    this.source?.disconnect()
    this.node?.disconnect()
    this.sink?.disconnect()
    this.source = this.node = this.sink = null
  }

  private onChunk(chunk: Int16Array<ArrayBuffer>): void {
    this.db = rmsDb(chunk)
    this.calibrating?.push(this.db)
    if (!this.useGate) {
      this.gated = false
      this.send(chunk)
      return
    }
    const loud = this.db >= settings.gateDb
    if (loud) {
      this.openUntil = this.chunkIndex + GATE_HANG
      for (const p of this.pending) p.open = true
    }
    this.pending.push({ chunk, open: loud || this.chunkIndex <= this.openUntil })
    this.chunkIndex++
    if (this.pending.length <= GATE_LOOKAHEAD) return
    const out = this.pending.shift()!
    this.gated = !out.open
    if (this.gated) this.stats.gatedChunks++
    // Ink needs a continuous stream, so blocked audio becomes silence instead of a gap.
    this.send(out.open ? out.chunk : new Int16Array(out.chunk.length))
  }

  private send(chunk: Int16Array<ArrayBuffer>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(chunk)
      this.stats.sent++
      return
    }
    this.queue.push(chunk)
    if (this.queue.length > MAX_QUEUED_CHUNKS) {
      this.queue.shift()
      this.stats.dropped++
    }
  }

  sendConfig(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    // Start must stay above eager_end (0.6 by default), which the slider's minimum guarantees.
    this.socket.send(JSON.stringify({ type: 'config', turn: { start_threshold: settings.turnStart } }))
    log(this.name, `config start_threshold=${settings.turnStart.toFixed(2)}`)
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    try {
      this.token = await fetchSttToken()
    } catch (err) {
      log(this.name, `token failed: ${errText(err)}; retrying in 3 s`)
      setTimeout(() => void this.connect(), 3000)
      return
    }
    const params = new URLSearchParams({
      model: STT_MODEL,
      encoding: STT_ENCODING,
      sample_rate: String(STT_SAMPLE_RATE),
      cartesia_version: CARTESIA_VERSION,
      access_token: this.token.token,
      turn_start_threshold: settings.turnStart.toFixed(2),
    })
    const socket = new WebSocket(`${CARTESIA_WS_BASE}/stt/turns/websocket?${params}`)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    const openedAt = performance.now()
    socket.onopen = () => {
      this.connectedAt = Date.now()
      this.stats.connects++
      log(this.name, `ink open #${this.stats.connects} in ${Math.round(performance.now() - openedAt)} ms, token expires in ${Math.round((this.token!.expiresAt - Date.now()) / 1000)} s, flushing ${this.queue.length} queued chunks`)
      for (const c of this.queue.splice(0)) socket.send(c)
    }
    socket.onmessage = (ev) => this.onMessage(ev)
    socket.onerror = () => log(this.name, 'ink socket error')
    socket.onclose = (ev) => this.onClose(socket, ev)
  }

  private onMessage(ev: MessageEvent): void {
    if (typeof ev.data !== 'string') return
    let msg: { type?: string; transcript?: string; text?: string; [k: string]: unknown }
    try {
      msg = JSON.parse(ev.data)
    } catch {
      log(this.name, `non-JSON message: ${ev.data.slice(0, 120)}`)
      return
    }
    const text = msg.transcript ?? msg.text ?? ''
    switch (msg.type) {
      case 'turn.start':
        this.turnOpen = true
        this.lastUpdate = ''
        log(this.name, `turn.start (gate ${this.gated ? 'closed' : 'open'}, ${this.db.toFixed(0)} dB)`)
        break
      case 'turn.update':
        this.lastUpdate = text
        this.el.querySelector('.preview')!.textContent = text
        break
      case 'turn.eager_end':
      case 'turn.resume':
        log(this.name, msg.type)
        break
      case 'turn.end':
        this.turnOpen = false
        this.el.querySelector('.preview')!.textContent = ''
        this.addLine(text)
        log(this.name, `turn.end (${text.split(/\s+/).filter(Boolean).length} words)`)
        break
      case 'error':
        log(this.name, `ink error ${JSON.stringify(msg).slice(0, 300)}`)
        break
      default:
        log(this.name, `${msg.type ?? 'message'} ${ev.data.slice(0, 160)}`)
    }
  }

  private onClose(socket: WebSocket, ev: CloseEvent): void {
    if (socket !== this.socket) return
    this.socket = null
    const ageS = this.connectedAt ? Math.round((Date.now() - this.connectedAt) / 1000) : 0
    this.stats.longestS = Math.max(this.stats.longestS, ageS)
    const pastExpiry = this.token ? Math.round((Date.now() - this.token.expiresAt) / 1000) : NaN
    log(this.name, `ink closed code=${ev.code} reason="${ev.reason}" after ${ageS} s; ${pastExpiry >= 0 ? `${pastExpiry} s AFTER` : `${-pastExpiry} s before`} token expiry`)
    this.connectedAt = 0
    if (this.turnOpen && this.lastUpdate) this.addLine(`${this.lastUpdate} [cut by disconnect]`)
    this.turnOpen = false
    if (!this.stopped && settings.reconnect) setTimeout(() => void this.connect(), 500)
  }

  private addLine(text: string): void {
    if (!text.trim()) return
    this.lines.push(text)
    const li = document.createElement('li')
    li.textContent = text
    const list = this.el.querySelector('ol')!
    list.append(li)
    list.scrollTop = list.scrollHeight
  }

  /** Called every second to refresh the on-screen numbers and note T3/T5 facts. */
  tick(): void {
    const level = Math.max(0, Math.min(1, (this.db + 90) / 70))
    ;(this.el.querySelector('.level') as HTMLElement).style.width = `${level * 100}%`
    ;(this.el.querySelector('.gate') as HTMLElement).style.left = `${((settings.gateDb + 90) / 70) * 100}%`
    ;(this.el.querySelector('.gate') as HTMLElement).hidden = !this.useGate
    this.el.classList.toggle('gated', this.gated)

    const now = Date.now()
    const ageS = this.connectedAt ? Math.round((now - this.connectedAt) / 1000) : 0
    const toExpiry = this.token ? Math.round((this.token.expiresAt - now) / 1000) : 0
    this.el.querySelector('.stats')!.textContent =
      `${this.socket?.readyState === WebSocket.OPEN ? 'open' : 'not connected'} ${ageS} s · token ${toExpiry >= 0 ? `expires in ${toExpiry}` : `expired ${-toExpiry}`} s\n` +
      `connects ${this.stats.connects} · longest ${Math.max(this.stats.longestS, ageS)} s\n` +
      `sent ${this.stats.sent} · gated ${this.stats.gatedChunks} · dropped ${this.stats.dropped} · ${this.db.toFixed(0)} dB`

    if (this.connectedAt && toExpiry < 0 && now - this.lastExpiryNote > 30_000) {
      this.lastExpiryNote = now
      log(this.name, `T3: connection still open ${-toExpiry} s after its token expired (age ${ageS} s)`)
    }

    const windowMs = performance.now() - this.stats.windowStart
    if (windowMs >= 10_000) {
      const ratio = this.stats.samplesWindow / ((STT_SAMPLE_RATE * windowMs) / 1000)
      if (ratio < 0.95 && document.visibilityState === 'visible') log(this.name, `T5: audio arriving at ${(ratio * 100).toFixed(0)}% of real time`)
      this.stats.samplesWindow = 0
      this.stats.windowStart = performance.now()
    }
  }

  stop(): void {
    this.stopped = true
    this.unwire()
    const s = this.socket
    this.socket = null
    if (s?.readyState === WebSocket.OPEN) s.send(JSON.stringify({ type: 'close' }))
    setTimeout(() => s?.close(), 1500)
    this.queue = []
    this.pending.length = 0
    this.el.remove()
  }
}

// ---------------------------------------------------------------------------
// Call
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null
let room: Room | null = null
let rawTrack: MediaStreamTrack | null = null
let lkTrack: LocalAudioTrack | null = null
let krisp: KrispNoiseFilterProcessor | null = null
let lanes: InkLane[] = []
let ticker: ReturnType<typeof setInterval> | null = null
let wakeLock: { release(): Promise<void> } | null = null
let leaving = false
let bufferDrops = 0

$('join').addEventListener('click', () => void join())
$('leave').addEventListener('click', () => void leave())
$('copy').addEventListener('click', () => void copyLog())
$('calibrate').addEventListener('click', () => void calibrate())
$('resume').addEventListener('click', () => void resumeAudio())

async function join(): Promise<void> {
  const name = $<HTMLInputElement>('name').value.trim()
  if (!name) {
    $('join-error').textContent = 'Enter a name.'
    return
  }
  $('join-error').textContent = ''
  settings.ttl = Number($<HTMLInputElement>('ttl').value) || 60
  settings.reconnect = $<HTMLInputElement>('reconnect').checked
  leaving = false

  // iOS only lets audio start inside the tap, so the context is created before any await.
  ctx = new AudioContext()
  const resumed = ctx.resume()
  ctx.addEventListener('statechange', () => log('audio', `AudioContext ${ctx?.state}`))

  try {
    log('env', `${navigator.userAgent}`)
    log('env', `krisp supported=${isKrispNoiseFilterSupported()} crossOriginIsolated=${window.crossOriginIsolated} sampleRate=${ctx.sampleRate}`)
    const res = await fetch('/api/spike/livekit-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const lk = (await res.json()) as { url: string; token: string; error?: string }
    if (!res.ok) throw new Error(lk.error ?? `LiveKit token failed (${res.status})`)

    await resumed
    const workletUrl = pcmCaptureWorkletUrl()
    try {
      await ctx.audioWorklet.addModule(workletUrl)
    } finally {
      URL.revokeObjectURL(workletUrl)
    }

    room = new Room({ webAudioMix: { audioContext: ctx } })
    watchRoom(room)
    await room.connect(lk.url, lk.token)
    log('livekit', `connected to ${room.name} as ${room.localParticipant.identity}`)

    await startMic()
  } catch (err) {
    log('join', `failed: ${errText(err)}`)
    $('join-error').textContent = errText(err)
    await leave()
    return
  }

  $('setup').hidden = true
  $('call').hidden = false
  ticker = setInterval(tick, 1000)
  await keepScreenOn()
  watchLifecycle()
  watchPerformance()
}

/** Gets the mic, publishes it with Krisp, and starts the lanes. Also used to recover after iOS stops the mic. */
async function startMic(): Promise<void> {
  if (!ctx || !room) return
  const t = performance.now()
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  })
  rawTrack = stream.getAudioTracks()[0]
  log('mic', `got mic in ${Math.round(performance.now() - t)} ms: ${rawTrack.label || 'unnamed'} ${JSON.stringify(rawTrack.getSettings())}`)
  for (const ev of ['ended', 'mute', 'unmute'] as const) rawTrack.addEventListener(ev, () => log('mic', `raw track ${ev}`))

  lkTrack = new LocalAudioTrack(rawTrack.clone(), undefined, true, ctx)
  const useBVC = $<HTMLInputElement>('bvc').checked
  const quality = $<HTMLSelectElement>('quality').value as 'low' | 'medium' | 'high'
  const order = $<HTMLSelectElement>('order').value
  krisp = isKrispNoiseFilterSupported()
    ? KrispNoiseFilter({ useBVC, quality, debugLogs: true, onBufferDrop: () => log('T5', `krisp buffer drop #${++bufferDrops}`) })
    : null
  if (!krisp) log('T1', 'Krisp is not supported in this browser; filtered lane uses the raw mic')

  const attach = async (when: string) => {
    if (!krisp || !lkTrack) return
    const t0 = performance.now()
    try {
      await lkTrack.setProcessor(krisp)
      log('T1', `setProcessor ${when} publishing took ${Math.round(performance.now() - t0)} ms (useBVC=${useBVC}, quality=${quality}); processedTrack=${krisp.processedTrack ? 'present' : 'MISSING'} enabled=${krisp.isEnabled()}`)
    } catch (err) {
      log('T1', `setProcessor ${when} publishing FAILED: ${errText(err)}`)
    }
  }
  if (order === 'before') await attach('before')
  await room.localParticipant.publishTrack(lkTrack, { source: Track.Source.Microphone })
  log('livekit', 'microphone published')
  if (order === 'after') await attach('after')
  log('T1', `after publish: processedTrack=${krisp?.processedTrack ? 'present' : 'MISSING'} enabled=${krisp?.isEnabled() ?? false}`)

  const filteredSource = krisp?.processedTrack ?? rawTrack.clone()
  if (!krisp?.processedTrack) log('T1', 'filtered lane falls back to the raw mic (no processedTrack)')
  lanes.push(new InkLane(krisp?.processedTrack ? `Filtered: Krisp${useBVC ? ' + BVC' : ''} + gate` : 'Filtered: raw mic + gate (no Krisp)', ctx, filteredSource, true))
  if ($<HTMLInputElement>('compare').checked) lanes.push(new InkLane('Raw mic (no Krisp, no gate)', ctx, rawTrack, false))

  // T1: confirm audio really flows through the processed track, not just that the object exists.
  setTimeout(() => {
    const filtered = lanes[0]
    if (filtered) log('T1', `filtered lane level after 3 s: ${filtered.db.toFixed(0)} dB (${filtered.db > -100 ? 'audio is flowing' : 'SILENT: processedTrack carries no audio'})`)
  }, 3000)
}

function stopMic(): void {
  for (const lane of lanes) lane.stop()
  lanes = []
  if (lkTrack && room) void room.localParticipant.unpublishTrack(lkTrack, true).catch(() => {})
  lkTrack?.stop()
  rawTrack?.stop()
  lkTrack = null
  rawTrack = null
  krisp = null
}

async function leave(): Promise<void> {
  leaving = true
  if (ticker) clearInterval(ticker)
  ticker = null
  stopMic()
  await room?.disconnect().catch(() => {})
  room = null
  $('remote').replaceChildren()
  await ctx?.close().catch(() => {})
  ctx = null
  await wakeLock?.release().catch(() => {})
  wakeLock = null
  $('setup').hidden = false
  $('call').hidden = true
  log('call', 'left')
}

function watchRoom(r: Room): void {
  r.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    if (track.kind !== Track.Kind.Audio) return
    $('remote').append(track.attach())
    log('livekit', `hearing ${participant.name ?? participant.identity}`)
  })
  r.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()))
  r.on(RoomEvent.ParticipantConnected, (p) => {
    log('livekit', `${p.name ?? p.identity} joined`)
    renderPeople([])
  })
  r.on(RoomEvent.ParticipantDisconnected, (p) => {
    log('livekit', `${p.name ?? p.identity} left`)
    renderPeople([])
  })
  r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => renderPeople(speakers))
  r.on(RoomEvent.Reconnecting, () => log('livekit', 'reconnecting'))
  r.on(RoomEvent.Reconnected, () => log('livekit', 'reconnected'))
  r.on(RoomEvent.Disconnected, (reason) => log('livekit', `disconnected (reason ${reason ?? 'unknown'})`))
  r.on(RoomEvent.MediaDevicesError, (e) => log('livekit', `media devices error: ${errText(e)}`))
  r.on(RoomEvent.LocalAudioSilenceDetected, () => log('livekit', 'published mic is silent'))
}

function renderPeople(speakers: Participant[]): void {
  if (!room) return
  const speaking = new Set(speakers.map((s) => s.identity))
  const everyone = [room.localParticipant as Participant, ...room.remoteParticipants.values()]
  $('people').replaceChildren(
    ...everyone.map((p) => {
      const span = document.createElement('span')
      span.textContent = p === room!.localParticipant ? `${p.name ?? 'me'} (me)` : (p.name ?? p.identity)
      span.classList.toggle('speaking', speaking.has(p.identity))
      return span
    }),
  )
}

function tick(): void {
  // Krisp may swap its processed track when it restarts; keep the filtered lane on the live one.
  if (krisp?.processedTrack) lanes[0]?.retarget(krisp.processedTrack)
  for (const lane of lanes) lane.tick()
}

// ---------------------------------------------------------------------------
// T2: calibration
// ---------------------------------------------------------------------------

async function calibrate(): Promise<void> {
  const lane = lanes[0]
  if (!lane) return
  const btn = $<HTMLButtonElement>('calibrate')
  btn.disabled = true
  btn.textContent = 'Talk now…'
  lane.calibrating = []
  await new Promise((r) => setTimeout(r, 4000))
  const values = lane.calibrating.filter((v) => v > -100).sort((a, b) => b - a)
  lane.calibrating = null
  btn.disabled = false
  btn.textContent = 'Calibrate (talk 4 s)'
  if (values.length < 10) {
    log('T2', 'calibration failed: too little audio')
    return
  }
  // The loudest third is the user's own speech; the gate sits 15 dB under its median.
  const speech = values.slice(0, Math.ceil(values.length / 3))
  const speechDb = speech[Math.floor(speech.length / 2)]
  const gate = Math.round(Math.max(-90, Math.min(-20, speechDb - 15)))
  settings.gateDb = gate
  const input = $<HTMLInputElement>('gate')
  input.value = String(gate)
  input.dispatchEvent(new Event('input'))
  log('T2', `calibrated: speech ≈ ${speechDb.toFixed(0)} dB, quietest ${values.at(-1)!.toFixed(0)} dB → gate ${gate} dB`)
}

// ---------------------------------------------------------------------------
// T4: screen, background and recovery
// ---------------------------------------------------------------------------

async function keepScreenOn(): Promise<void> {
  const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock
  if (!wl) {
    $('wake').textContent = '(Wake Lock not supported here.)'
    log('T4', 'Screen Wake Lock API not supported')
    return
  }
  try {
    wakeLock = await wl.request('screen')
    $('wake').textContent = '(Screen is being kept on.)'
    log('T4', 'wake lock acquired')
  } catch (err) {
    $('wake').textContent = '(Could not keep the screen on.)'
    log('T4', `wake lock failed: ${errText(err)}`)
  }
}

let lifecycleWatched = false
let hiddenAt = 0

function watchLifecycle(): void {
  if (lifecycleWatched) return
  lifecycleWatched = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      log('T4', 'page hidden')
    } else {
      log('T4', `page visible again after ${Math.round((Date.now() - hiddenAt) / 1000)} s`)
      void recover()
    }
  })
  window.addEventListener('pagehide', (e) => log('T4', `pagehide persisted=${e.persisted}`))
  window.addEventListener('pageshow', (e) => log('T4', `pageshow persisted=${e.persisted}`))
  document.addEventListener('freeze', () => log('T4', 'page frozen'))
  document.addEventListener('resume', () => log('T4', 'page resumed'))
  navigator.mediaDevices.addEventListener('devicechange', () => log('T4', 'audio devices changed'))
}

async function recover(): Promise<void> {
  if (leaving || !ctx || !room) return
  const state = {
    ctx: ctx.state,
    raw: rawTrack?.readyState,
    rawMuted: rawTrack?.muted,
    room: room.state,
    processed: krisp?.processedTrack?.readyState,
  }
  log('T4', `on return: ${JSON.stringify(state)}`)
  if (ctx.state !== 'running') await resumeAudio()
  if (room.state === 'disconnected') log('T4', 'LiveKit room is disconnected; leave and join again to continue')
  if (rawTrack?.readyState === 'ended' || krisp?.processedTrack?.readyState === 'ended') {
    log('T4', 'mic was stopped by the system; re-acquiring')
    const t = performance.now()
    stopMic()
    try {
      await startMic()
      log('T4', `mic recovered in ${Math.round(performance.now() - t)} ms`)
    } catch (err) {
      log('T4', `mic recovery failed: ${errText(err)}`)
    }
  }
  // The system releases the wake lock whenever the page is hidden, so ask again.
  wakeLock = null
  await keepScreenOn()
}

async function resumeAudio(): Promise<void> {
  if (!ctx) return
  try {
    await ctx.resume()
  } catch (err) {
    log('audio', `resume failed: ${errText(err)}`)
  }
  const running = ctx.state === 'running'
  $('resume').hidden = running
  log('audio', running ? 'AudioContext running' : 'AudioContext still suspended; tap the resume button')
}

// ---------------------------------------------------------------------------
// T5: performance
// ---------------------------------------------------------------------------

let perfWatched = false

function watchPerformance(): void {
  if (perfWatched) return
  perfWatched = true
  let expected = performance.now() + 500
  let worstLag = 0
  setInterval(() => {
    const now = performance.now()
    if (document.visibilityState === 'visible') worstLag = Math.max(worstLag, now - expected)
    expected = now + 500
  }, 500)
  setInterval(() => {
    if (!room) return
    log('T5', `worst main-thread lag in the last 30 s: ${Math.round(worstLag)} ms; krisp buffer drops so far: ${bufferDrops}`)
    worstLag = 0
  }, 30_000)

  const getBattery = (navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery
  if (!getBattery) {
    log('T5', 'Battery API not available (normal on iOS); check battery % by hand before and after')
    return
  }
  const report = async () => {
    const b = await getBattery.call(navigator)
    log('T5', `battery ${(b.level * 100).toFixed(0)}%${b.charging ? ' (charging, ignore)' : ''}`)
  }
  void report()
  setInterval(() => void (room && report()), 60_000)
}

// ---------------------------------------------------------------------------
// Copy results
// ---------------------------------------------------------------------------

async function copyLog(): Promise<void> {
  const parts = [logLines.join('\n')]
  for (const lane of lanes) parts.push(`\n== ${lane.name} ==\n${lane.lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`)
  try {
    await navigator.clipboard.writeText(parts.join('\n'))
    log('page', 'log copied')
  } catch (err) {
    log('page', `copy failed: ${errText(err)}`)
  }
}
