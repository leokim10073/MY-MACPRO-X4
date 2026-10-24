// Voice test page: wires MicSource + PushToTalk to the dev API so two phones can talk into one
// room before the real backend exists. Plain DOM on purpose; web owns the real UI.
import type { Member, TranscriptLine } from '../../../shared/schema'
import fixture from '../../../shared/fixtures/kevin.expected.json'
import { MicSource } from '../audio/micSource'
import { RECAP_OPENER_TEXT } from '../config'
import { CallSession, type CallParticipant } from '../call/callSession'
import { OpenMic, type OpenMicState } from '../stt/openMic'
import type { CallToken } from '../server/livekit'
import { buildKeyterms } from '../stt/keyterms'
import { PushToTalk } from '../stt/pushToTalk'
import { TokenSource, fetchTokenFrom } from '../stt/tokenSource'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

let me: Member | null = null
let members: Member[] = []
let lastSeq = 0
let ptt: PushToTalk | null = null
let tokens: TokenSource | null = null
let poll: ReturnType<typeof setInterval> | null = null

const api = (path: string, init: RequestInit = {}) =>
  fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(me ? { 'x-member-id': me.id } : {}), ...init.headers },
  })

$('join-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  $('join-error').textContent = ''
  const res = await api('/join', { method: 'POST', body: JSON.stringify({ name: $<HTMLInputElement>('name').value }) })
  if (!res.ok) {
    $('join-error').textContent = 'Could not join.'
    return
  }
  me = (await res.json()) as Member
  enterRoom(me)
})

function enterRoom(self: Member) {
  $('join').hidden = true
  $('room').hidden = false
  $('me').textContent = `You are ${self.name}`

  tokens = new TokenSource(fetchTokenFrom('/api/stt-token', { method: 'POST', headers: { 'x-member-id': self.id } }))
  tokens.prefetch()

  const t = tokens
  ptt = new PushToTalk({
    roomId: self.roomId,
    speakerId: self.id,
    mic: new MicSource(),
    getToken: () => t.get(),
    sendLine: async (line) => {
      const res = await api('/lines', { method: 'POST', body: JSON.stringify(line) })
      if (!res.ok) throw new Error(`Send failed (${res.status})`)
    },
    keyterms: () => buildKeyterms(members, fixture.storyState.people),
  })
  ptt.subscribe(render)
  render()
  bindButton(ptt)
  bindModes()

  poll = setInterval(refresh, 700)
  void refresh()
}

function bindButton(p: PushToTalk) {
  const btn = $<HTMLButtonElement>('ptt')
  let activeId: number | null = null
  btn.addEventListener('pointerdown', (e) => {
    if (activeId !== null) return
    activeId = e.pointerId
    btn.setPointerCapture(e.pointerId)
    btn.setAttribute('aria-pressed', 'true')
    btn.textContent = 'Talking…'
    p.press(true)
  })
  const release = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return
    activeId = null
    btn.setAttribute('aria-pressed', 'false')
    btn.textContent = 'Hold to talk'
    p.press(false)
  }
  btn.addEventListener('pointerup', release)
  btn.addEventListener('pointercancel', release)
  btn.addEventListener('contextmenu', (e) => e.preventDefault())
}

// --- Call mode -----------------------------------------------------------------------------

let openMic: OpenMic | null = null
let unsubscribeCall: (() => void) | null = null
/** What Krisp's debug log said about background voice cancellation. Test page only. */
let bvc: 'unknown' | 'on' | 'blocked' = 'unknown'
let krispBufferDrops = 0

function bindModes() {
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) {
    radio.addEventListener('change', () => {
      const isCall = radio.value === 'call' && radio.checked
      $('ptt').hidden = isCall
      $('call').hidden = !isCall
    })
  }
}

// Krisp only reports BVC in its debug log, so the test page reads that line. Production doesn't.
for (const level of ['info', 'log'] as const) {
  const original = console[level].bind(console)
  console[level] = (...args: unknown[]) => {
    const text = args.map(String).join(' ')
    // Krisp logs "blocked" while creating the filter, before it reports ready. Ready without
    // that line means BVC was allowed.
    if (text.includes('is blocked for BVC')) bvc = 'blocked'
    else if (text.includes('"isReady":true') && bvc === 'unknown') bvc = 'on'
    if (text.includes('KrispSDK')) renderCall()
    original(...args)
  }
}

$('join-call').addEventListener('click', () => {
  if (!me || !tokens) return
  const self = me
  const t = tokens
  if (!openMic) {
    openMic = new OpenMic({
      roomId: self.roomId,
      speakerId: self.id,
      getSttToken: () => t.get(),
      getCallToken: async () => {
        const res = await api('/livekit-token', { method: 'POST' })
        const body = (await res.json()) as CallToken & { error?: string }
        if (!res.ok) throw new Error(body.error ?? `Call token failed (${res.status})`)
        return body
      },
      sendLine: async (line) => {
        const res = await api('/lines', { method: 'POST', body: JSON.stringify(line) })
        if (!res.ok) throw new Error(`Send failed (${res.status})`)
      },
      keyterms: () => buildKeyterms(members, fixture.storyState.people),
      createCall: () =>
        new CallSession({
          krispDebugLogs: true,
          onBufferDrop: () => {
            krispBufferDrops++
            renderCall()
          },
        }),
    })
    unsubscribeCall = openMic.subscribe(renderCall)
  }
  bvc = 'unknown'
  krispBufferDrops = 0
  // No await before join: iOS needs audio started inside this tap.
  void openMic.join()
})

// On change, not input: every new value is a message to Ink.
$('start-threshold').addEventListener('change', (e) => {
  const value = Number((e.target as HTMLInputElement).value)
  $('start-threshold-value').textContent = value.toFixed(2)
  openMic?.setStartThreshold(value)
})

$('tap-resume').addEventListener('click', () => void openMic?.resume())

$('leave-call').addEventListener('click', () => void openMic?.leave())

$('mute').addEventListener('click', () => {
  if (openMic) void openMic.setMuted(!openMic.getState().muted)
})

function renderCall() {
  if (!openMic) return
  const s = openMic.getState()
  const inCall = s.status === 'in_call' || s.status === 'reconnecting'
  $('join-call').hidden = inCall || s.status === 'joining'
  $('leave-call').hidden = !inCall
  $('mute').hidden = !inCall
  $('keep-on').hidden = !inCall
  $('tap-resume').hidden = !s.needsTap
  $('mute').textContent = s.muted ? 'Unmute' : 'Mute'
  $('mute').setAttribute('aria-pressed', String(s.muted))
  $('call-sending').classList.toggle('on', s.isListening)
  $('call-status').textContent = s.status.replace('_', ' ')
  $('call-preview').textContent = s.preview
  $('call-error').textContent = s.error ?? ''
  $('call-noise').textContent = s.noiseFilter
    ? `Noise filter: ${s.noiseFilter}${s.noiseFilter === 'krisp' ? ` · BVC: ${bvc}` : ''} · Ink connections: ${s.debug.inkConnects}`
    : ''
  const d = s.debug
  $('call-gate').textContent = inCall
    ? `Gate: ${d.gateDb.toFixed(0)} dB · speech: ${d.speechDb === null ? 'learning' : `${d.speechDb.toFixed(0)} dB`}` +
      ` · level: ${d.levelDb.toFixed(0)} dB · Krisp buffer drops: ${krispBufferDrops}`
    : ''
  renderPeople(s.participants)
  renderLive(s.live, s.participants)
  $('call-failed').replaceChildren(
    ...s.failed.map((f) => {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.textContent = `Not sent: "${f.line.text}" — tap to retry`
      btn.onclick = () => f.retry()
      li.append(btn)
      return li
    }),
  )
}

function renderLive(live: OpenMicState['live'], people: readonly CallParticipant[]) {
  $('call-live').replaceChildren(
    ...Object.entries(live).map(([id, l]) => {
      const li = document.createElement('li')
      const who = document.createElement('b')
      who.textContent = people.find((p) => p.id === id)?.name ?? id
      li.append(who, document.createTextNode(l.text + (l.final ? '' : ' …')))
      return li
    }),
  )
}

function renderPeople(list: readonly CallParticipant[]) {
  $('people').replaceChildren(
    ...list.map((p) => {
      const li = document.createElement('li')
      li.textContent = `${p.name}${p.id === me?.id ? ' (me)' : ''}${p.muted ? ' · muted' : ''}`
      li.classList.toggle('speaking', p.speaking)
      return li
    }),
  )
}

function render() {
  if (!ptt) return
  const s = ptt.getState()
  $('sending').classList.toggle('on', s.isListening)
  $('preview').textContent = s.preview
  $('error').textContent = s.error ?? ''
  $('status').textContent = `status: ${s.status} · sending lines: ${s.sending}`
  $('keyterms').textContent = `Keyterms: ${buildKeyterms(members, fixture.storyState.people).join(', ')}`
  const failed = $('failed')
  failed.replaceChildren(
    ...s.failed.map((f) => {
      const li = document.createElement('li')
      const b = document.createElement('button')
      b.textContent = `Not sent: "${f.line.text}" — tap to retry`
      b.onclick = () => f.retry()
      li.append(b)
      return li
    }),
  )
}

async function refresh() {
  const res = await api(`/lines?after=${lastSeq}`).catch(() => null)
  if (!res) return
  if (res.status === 403) return burned()
  if (!res.ok) return
  const body = (await res.json()) as { members: Member[]; lines: TranscriptLine[] }
  members = body.members
  const list = $('transcript')
  for (const line of body.lines) {
    const li = document.createElement('li')
    const who = document.createElement('b')
    who.textContent = line.speakerName
    li.append(who, document.createTextNode(line.text))
    list.append(li)
    lastSeq = line.seq
    openMic?.noteLine(line)
  }
  if (body.lines.length) list.scrollTop = list.scrollHeight
}

function burned() {
  openMic?.stop()
  unsubscribeCall?.()
  openMic = null
  unsubscribeCall = null
  ptt?.stop()
  tokens?.dispose()
  if (poll) clearInterval(poll)
  ptt = null
  tokens = null
  me = null
  members = []
  lastSeq = 0
  $('transcript').replaceChildren()
  $('room').hidden = true
  $('join').hidden = false
  $('join-error').textContent = 'This room has ended.'
}

$('burn').addEventListener('click', async () => {
  await api('/burn', { method: 'POST' })
  burned()
})

// Recap playback: the opener plays at once while the real recap is generated.
$('play-recap').addEventListener('click', async () => {
  const status = $('recap-status')
  const audio = new Audio()
  // Unlocks playback inside the tap on iOS.
  audio.play().catch(() => {})
  const started = performance.now()
  status.textContent = 'Generating…'
  const opener = tts(RECAP_OPENER_TEXT)
  const recap = tts(fixture.recap.text)
  // Friends' voices are lowered while the recap plays in this headset. It's never published.
  openMic?.duck(true)
  try {
    await playUrl(audio, await opener)
    const url = await recap
    status.textContent = `Recap ready after ${Math.round(performance.now() - started)} ms`
    await playUrl(audio, url)
    status.textContent += ' · done'
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : 'Playback failed'
  } finally {
    openMic?.duck(false)
  }
})

async function tts(text: string): Promise<string> {
  const res = await api('/tts', { method: 'POST', body: JSON.stringify({ text }) })
  if (!res.ok) throw new Error(`TTS failed (${res.status})`)
  return URL.createObjectURL(await res.blob())
}

function playUrl(audio: HTMLAudioElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    audio.src = url
    audio.onended = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
    audio.onerror = () => reject(new Error('Audio error'))
    audio.play().catch(reject)
  })
}
