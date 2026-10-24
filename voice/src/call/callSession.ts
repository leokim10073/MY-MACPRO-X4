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
import { TrackSource } from '../audio/trackSource'
import type { CallToken } from '../server/livekit'
import { decodeLive, encodeLive, LIVE_TOPIC, type LiveText } from './liveText'
import { loadNoiseFilter } from './noiseFilter'

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
  /** What a friend is saying right now. */
  onLive(id: Id, live: LiveText): void
}

/** What OpenMic needs from a call. CallSession is the real one; tests use a fake. */
export interface CallLike {
  /**
   * Must be called from a user gesture (iOS). The token may still be on its way: audio is
   * started inside the tap first, then the token is awaited.
   */
  join(token: Promise<CallToken>, events: CallEvents): Promise<NoiseFilterKind>
  /** 16 kHz PCM16 frames of the published mic. */
  onFrame(listener: (frame: Int16Array) => void): () => void
  setMuted(muted: boolean): Promise<void>
  /** Shows what I'm saying on everyone else's phone. Dropped if not connected. */
  sendLive(live: LiveText): void
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
  private readonly sinks = document.createElement('div')
  private source: TrackSource | null = null
  private readonly frameListeners = new Set<(frame: Int16Array) => void>()
  private kind: NoiseFilterKind = 'browser'
  private wakeLock: WakeLockSentinel | null = null
  private recovering: Promise<void> | null = null
  private needsTap = false
  private readonly onVisibility = () => {
    if (document.visibilityState !== 'visible' || !this.room || this.leaving) return
    void this.keepAwake()
    void this.recover()
  }
  private readonly onTrackEnded = () => void this.recover()

  constructor(private readonly opts: { krispDebugLogs?: boolean; onBufferDrop?: () => void } = {}) {
    this.sinks.hidden = true
  }

  async join(tokenPromise: Promise<CallToken>, events: CallEvents): Promise<NoiseFilterKind> {
    // iOS only lets audio start inside the user's tap, so the context is created and resumed
    // before the first await.
    const ctx = new AudioContext()
    this.ctx = ctx
    const resumed = ctx.resume()
    this.events = events
    this.leaving = false

    const [token, stream, filter] = await Promise.all([
      tokenPromise,
      navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS }),
      loadNoiseFilter({ debugLogs: this.opts.krispDebugLogs, onBufferDrop: this.opts.onBufferDrop }).catch(
        () => ({ kind: 'browser', processor: null }) as const,
      ),
    ])
    this.raw = stream.getAudioTracks()[0]
    await resumed

    const room = new Room({ webAudioMix: { audioContext: ctx } })
    this.room = room
    this.watch(room)
    await room.connect(token.url, token.token)

    const published = new LocalAudioTrack(this.raw.clone(), undefined, true, ctx)
    this.published = published
    await room.localParticipant.publishTrack(published, { source: Track.Source.Microphone })

    // Krisp goes on after publishing, the order the stage 2 spike verified. Ink gets the same cleaned
    // audio friends hear. If Krisp fails, both get the browser-filtered mic.
    let kind = filter.kind
    if (filter.processor) {
      try {
        await published.setProcessor(filter.processor)
      } catch {
        kind = 'browser'
      }
    }
    if (kind === 'krisp' && !filter.processor?.processedTrack) kind = 'browser'
    this.kind = kind

    this.source = new TrackSource(ctx)
    this.source.onFrame((frame) => {
      for (const l of this.frameListeners) l(frame)
    })
    await this.source.attach(this.inkTrack())
    this.watchTracks()
    document.body.append(this.sinks)
    document.addEventListener('visibilitychange', this.onVisibility)
    void this.keepAwake()
    this.updateNeedsTap()
    this.emitParticipants()
    return kind
  }

  onFrame(listener: (frame: Int16Array) => void): () => void {
    this.frameListeners.add(listener)
    return () => this.frameListeners.delete(listener)
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.published) return
    if (muted) await this.published.mute()
    else await this.published.unmute()
    this.emitParticipants()
  }

  sendLive(live: LiveText): void {
    const local = this.room?.localParticipant
    if (!local || this.leaving) return
    // Reliable, so updates arrive in order and the final one isn't lost.
    local.publishData(encodeLive(live), { reliable: true, topic: LIVE_TOPIC }).catch(() => {})
  }

  setRemoteVolume(volume: number): void {
    this.remoteVolume = volume
    for (const p of this.room?.remoteParticipants.values() ?? []) p.setVolume(volume)
  }

  /** From a tap: restarts audio, and the mic too if the system stopped it. */
  async resume(): Promise<void> {
    await this.ctx?.resume().catch(() => {})
    await this.room?.startAudio().catch(() => {})
    await this.recover()
    this.updateNeedsTap()
  }

  async leave(): Promise<void> {
    this.leaving = true
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.unwatchTracks()
    void this.wakeLock?.release().catch(() => {})
    this.wakeLock = null
    this.source?.detach()
    this.source = null
    await this.room?.disconnect().catch(() => {})
    this.published?.stop()
    this.raw?.stop()
    this.sinks.replaceChildren()
    this.sinks.remove()
    await this.ctx?.close().catch(() => {})
    this.room = this.published = this.raw = this.ctx = null
    this.speaking.clear()
    this.needsTap = false
  }

  /** Ink gets what friends hear: Krisp's output when it runs, else the published mic. */
  private inkTrack(): MediaStreamTrack {
    const published = this.published!
    return (this.kind === 'krisp' && published.getProcessor()?.processedTrack) || published.mediaStreamTrack
  }

  private watchTracks(): void {
    this.raw?.addEventListener('ended', this.onTrackEnded)
    this.published?.mediaStreamTrack.addEventListener('ended', this.onTrackEnded)
  }

  private unwatchTracks(): void {
    this.raw?.removeEventListener('ended', this.onTrackEnded)
    this.published?.mediaStreamTrack.removeEventListener('ended', this.onTrackEnded)
  }

  /** The screen staying on keeps iOS from pausing the mic. Not every browser has it. */
  private async keepAwake(): Promise<void> {
    if (this.wakeLock && !this.wakeLock.released) return
    try {
      this.wakeLock = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      // Denied, or the page isn't visible. The test page asks to keep the screen on.
    }
  }

  /**
   * After a lock screen, app switch or phone call (design 6.8): resumes the audio context, and
   * if the system stopped the mic, gets a new one and swaps it in under the same published track.
   * LiveKit restarts Krisp on the new track and keeps the mute state.
   */
  private recover(): Promise<void> {
    if (!this.recovering) {
      this.recovering = this.doRecover().finally(() => {
        this.recovering = null
      })
    }
    return this.recovering
  }

  private async doRecover(): Promise<void> {
    const ctx = this.ctx
    const published = this.published
    if (!ctx || !published || this.leaving) return
    if (ctx.state !== 'running') await ctx.resume().catch(() => {})
    const micEnded =
      this.raw?.readyState === 'ended' ||
      published.mediaStreamTrack.readyState === 'ended' ||
      this.inkTrack().readyState === 'ended'
    if (micEnded) {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS })
      } catch {
        // iOS may only allow this from a tap: ask for one, and resume() tries again.
        this.setNeedsTap(true)
        return
      }
      if (this.leaving || this.published !== published) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      this.unwatchTracks()
      this.raw?.stop()
      this.raw = stream.getAudioTracks()[0]
      const old = published.mediaStreamTrack
      await published.replaceTrack(this.raw.clone(), true)
      // We provided it, so LiveKit leaves stopping the old one to us.
      old.stop()
      this.watchTracks()
      await this.source?.attach(this.inkTrack())
      this.events?.onMicRestarted()
    }
    this.updateNeedsTap()
  }

  private updateNeedsTap(): void {
    const blocked = this.ctx?.state !== 'running' || this.room?.canPlaybackAudio === false
    this.setNeedsTap(!!this.room && blocked)
  }

  private setNeedsTap(needed: boolean): void {
    if (needed === this.needsTap) return
    this.needsTap = needed
    this.events?.onNeedsTap(needed)
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
    room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (topic !== LIVE_TOPIC || !participant) return
      const live = decodeLive(payload)
      if (live) this.events?.onLive(participant.identity, live)
    })
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => this.updateNeedsTap())
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
