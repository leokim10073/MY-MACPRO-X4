// Voice test page: wires MicSource + PushToTalk to the dev API so two phones can talk into one
// room before the real backend exists. Plain DOM on purpose; web owns the real UI.
import type { Member, TranscriptLine } from '../../../shared/schema'
import fixture from '../../../shared/fixtures/kevin.expected.json'
import { MicSource } from '../audio/micSource'
import { RECAP_OPENER_TEXT } from '../config'
import { CallSession, type CallParticipant } from '../call/callSession'
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

let call: CallSession | null = null

function bindModes() {
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) {
    radio.addEventListener('change', () => {
      const isCall = radio.value === 'call' && radio.checked
      $('ptt').hidden = isCall
      $('call').hidden = !isCall
    })
  }
}

$('join-call').addEventListener('click', () => {
  if (call || !me) return
  const session = new CallSession()
  call = session
  // No await before join: iOS needs the AudioContext started inside this tap.
  const joined = api('/livekit-token', { method: 'POST' }).then(async (res) => {
    const body = (await res.json()) as CallToken & { error?: string }
    if (!res.ok) throw new Error(body.error ?? `Call token failed (${res.status})`)
    return body
  })
  $('call-status').textContent = 'Joining…'
  void session
    .join(
      joined,
      {
        onParticipants: renderPeople,
        onRemoteSpeakingStarted: () => {},
        onReconnecting: (r) => ($('call-status').textContent = r ? 'Reconnecting…' : 'In call'),
        onDropped: (msg) => endCall(msg),
        onMicRestarted: () => {},
        onNeedsTap: () => {},
      },
    )
    .then(() => {
      $('call-status').textContent = 'In call'
      $('join-call').hidden = true
      $('leave-call').hidden = false
    })
    .catch((err: unknown) => endCall(err instanceof Error ? err.message : 'Could not join the call.'))
})

$('leave-call').addEventListener('click', () => endCall(''))

function endCall(message: string) {
  void call?.leave()
  call = null
  $('call-status').textContent = message
  $('join-call').hidden = false
  $('leave-call').hidden = true
  $('people').replaceChildren()
}

function renderPeople(list: CallParticipant[]) {
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
  }
  if (body.lines.length) list.scrollTop = list.scrollHeight
}

function burned() {
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
  try {
    await playUrl(audio, await opener)
    const url = await recap
    status.textContent = `Recap ready after ${Math.round(performance.now() - started)} ms`
    await playUrl(audio, url)
    status.textContent += ' · done'
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : 'Playback failed'
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
