// The live call between friends (LiveKit). Each phone publishes its own mic and plays everyone
// else's. The same mic audio is handed out as 16 kHz PCM frames for Ink. Nothing is recorded.
import {
  LocalAudioTrack,
  type Participant,
  type RemoteParticipant,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client'
import type { Id } from '../../../shared/schema'
import { STT_SAMPLE_RATE } from '../config'
import { PCM_CAPTURE_PROCESSOR, pcmCaptureWorkletUrl } from '../audio/pcmCaptureWorklet'
import { Resampler } from '../audio/resampler'
import type { CallToken } from '../server/livekit'

/** Which noise filtering really runs on the published mic. */
export type NoiseFilterKind = 'krisp' | 'browser'

export interface CallParticipant {
  /** Member.id, used as the LiveKit identity. */
  id: Id
  name: string
  speaking: boolean
  muted: boolean
}

export interface CallEvents {
  /** Everyone in the call, self first. */
  onParticipants(list: CallParticipant[]): void
  /** Someone else just started speaking. */
  onRemoteSpeakingStarted(id: Id): void
  /** LiveKit is retrying the connection on its own. */
  onReconnecting(reconnecting: boolean): void
  /** The call ended without us leaving, and LiveKit gave up. */
  onDropped(message: string): void
  /** The mic was re-acquired after the system stopped it. */
  onMicRestarted(): void
  /** The browser blocked audio until the user taps. */
  onNeedsTap(needed: boolean): void
}

/** What OpenMic needs from a call. CallSession is the real one; tests use a fake. */
export interface CallLike {
  /** Must be called from a user gesture (iOS). */
  join(token: CallToken, events: CallEvents): Promise<NoiseFilterKind>
  /** 16 kHz PCM16 frames of the published mic. */
  onFrame(listener: (frame: Int16Array) => void): () => void
  setMuted(muted: boolean): Promise<void>
  /** Volume of every friend, 0..1. */
  setRemoteVolume(volume: number): void
  resume(): Promise<void>
  leave(): Promise<void>
}

export interface ParticipantLike {
  identity: string
  name?: string
  isSpeaking: boolean
  isMicrophoneEnabled: boolean
}

export function toParticipants(local: ParticipantLike, remotes: readonly ParticipantLike[]): CallParticipant[] {
  return [local, ...remotes].map((p) => ({
    id: p.identity,
    name: p.name || p.identity,
    speaking: p.isSpeaking,
    muted: !p.isMicrophoneEnabled,
  }))
}

/** Remote ids in `now` that weren't speaking before. */
export function newSpeakers(before: ReadonlySet<Id>, now: readonly Id[], selfId: Id): Id[] {
  return now.filter((id) => id !== selfId && !before.has(id))
}

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
}

export class CallSession implements CallLike {
  private ctx: AudioContext | null = null
  private room: Room | null = null
  private raw: MediaStreamTrack | null = null
  private published: LocalAudioTrack | null = null
  private events: CallEvents | null = null
  private speaking = new Set<Id>()
  private remoteVolume = 1
  private leaving = false
  private readonly listeners = new Set<(frame: Int16Array) => void>()
  private readonly sinks = document.createElement('div')
  private disconnectCapture: (() => void) | null = null

  constructor() {
    this.sinks.hidden = true
  }

  async join(token: CallToken, events: CallEvents): Promise<NoiseFilterKind> {
    // iOS only lets audio start inside the user's tap, so the context is created and resumed
    // before the first await.
    const ctx = new AudioContext()
    this.ctx = ctx
    const resumed = ctx.resume()
    this.events = events
    this.leaving = false

    const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS })
    this.raw = stream.getAudioTracks()[0]
    await resumed

    const room = new Room({ webAudioMix: { audioContext: ctx } })
    this.room = room
    this.watch(room)
    await room.connect(token.url, token.token)

    const published = new LocalAudioTrack(this.raw.clone(), undefined, true, ctx)
    this.published = published
    await room.localParticipant.publishTrack(published, { source: Track.Source.Microphone })
    await this.capture(published.mediaStreamTrack)
    document.body.append(this.sinks)
    this.emitParticipants()
    return 'browser'
  }

  onFrame(listener: (frame: Int16Array) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.published) return
    if (muted) await this.published.mute()
    else await this.published.unmute()
    this.emitParticipants()
  }

  setRemoteVolume(volume: number): void {
    this.remoteVolume = volume
    for (const p of this.room?.remoteParticipants.values() ?? []) p.setVolume(volume)
  }

  async resume(): Promise<void> {
    await this.ctx?.resume()
    await this.room?.startAudio()
  }

  async leave(): Promise<void> {
    this.leaving = true
    this.disconnectCapture?.()
    this.disconnectCapture = null
    await this.room?.disconnect().catch(() => {})
    this.published?.stop()
    this.raw?.stop()
    this.sinks.replaceChildren()
    this.sinks.remove()
    await this.ctx?.close().catch(() => {})
    this.room = this.published = this.raw = this.ctx = null
    this.speaking.clear()
  }

  // Replaced by TrackSource in Task 4 of voice/stage2-plan.md.
  private async capture(track: MediaStreamTrack): Promise<void> {
    const ctx = this.ctx!
    const url = pcmCaptureWorkletUrl()
    try {
      await ctx.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    const resampler = new Resampler(ctx.sampleRate, STT_SAMPLE_RATE)
    const source = ctx.createMediaStreamSource(new MediaStream([track]))
    const node = new AudioWorkletNode(ctx, PCM_CAPTURE_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1 })
    const mute = ctx.createGain()
    mute.gain.value = 0
    source.connect(node).connect(mute).connect(ctx.destination)
    node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      const frame = resampler.process(ev.data)
      if (frame.length) for (const l of this.listeners) l(frame)
    }
    this.disconnectCapture = () => {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      mute.disconnect()
    }
  }

  private watch(room: Room): void {
    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind !== Track.Kind.Audio) return
      ;(participant as RemoteParticipant).setVolume(this.remoteVolume)
      this.sinks.append(track.attach())
    })
    room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()))
    for (const ev of [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
    ] as const) {
      room.on(ev, () => this.emitParticipants())
    }
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const ids = speakers.map((s) => s.identity)
      for (const id of newSpeakers(this.speaking, ids, room.localParticipant.identity)) {
        this.events?.onRemoteSpeakingStarted(id)
      }
      this.speaking = new Set(ids)
      this.emitParticipants()
    })
    room.on(RoomEvent.Reconnecting, () => this.events?.onReconnecting(true))
    room.on(RoomEvent.Reconnected, () => this.events?.onReconnecting(false))
    room.on(RoomEvent.Disconnected, () => {
      if (!this.leaving) this.events?.onDropped('The call was disconnected.')
    })
  }

  private emitParticipants(): void {
    const room = this.room
    if (!room || !this.events) return
    this.events.onParticipants(toParticipants(room.localParticipant, [...room.remoteParticipants.values()]))
  }
}
