// Talks to the real backend (backend/convex). Subscribes to the room's
// append-only event log and hands each RoomEvent to listeners in eventSeq order,
// so the reducer sees exactly what it sees from the mock. `follow` does the
// dedupe, ordering, gap and window checks; this class owns the subscription.
import { ConvexClient } from 'convex/browser'
import type { RoomEvent } from '../../../../shared/schema'
import type { ConnectionStatus, JoinResult, RoomClient, VoiceTransport } from '../RoomClient'
import { backendApi as api } from './backendApi'
import { callBackend } from './callBackend'
import { follow, type FollowerState } from './logFollower'

type Convex = Pick<ConvexClient, 'onUpdate' | 'mutation' | 'action' | 'close'> &
  Partial<Pick<ConvexClient, 'subscribeToConnectionState'>>
interface Joined extends Omit<JoinResult, 'self'> {
  member: JoinResult['self']
  sessionToken: string
}

/** A phone hidden longer than this may have had its socket suspended, so it resubscribes on return. */
const RESUBSCRIBE_AFTER_HIDDEN_MS = 30_000

/** How often this phone says it still has the room open. The backend shows it offline after 2.5 missed beats. */
export const PRESENCE_INTERVAL_MS = 15_000

export class ConvexRoomClient implements RoomClient {
  private readonly convex: Convex
  /** The deployment URL, for the sendBeacon disconnect when the tab closes. Unknown when a test passes a client. */
  private readonly url: string | null
  private listeners: Array<(event: RoomEvent) => void> = []
  private session: { roomId: string; sessionToken: string } | null = null
  private follower: FollowerState = { lastEventSeq: 0, dropped: 0 }
  private burned = false

  /** Bumped on every (re)subscribe and stop, so callbacks from an old subscription are ignored. */
  private generation = 0
  private stopEvents: (() => void) | null = null
  private subscribedFrom = 0

  private status: ConnectionStatus = 'connecting'
  private connectionListeners: Array<(status: ConnectionStatus) => void> = []
  private stopConnectionState: (() => void) | null = null
  private hiddenAt: number | null = null
  private listeningForVisibility = false

  private presenceListeners: Array<(offlineMemberIds: string[]) => void> = []
  /** Bumped on every presence start and stop, so a heartbeat that resolves after a stop is ignored. */
  private presenceGeneration = 0
  private presenceTimer: ReturnType<typeof setInterval> | null = null
  private beat: (() => Promise<void>) | null = null
  private roomToken: string | null = null
  private presenceToken: string | null = null
  private stopPresenceList: (() => void) | null = null

  /** Pass the deployment URL (VITE_CONVEX_URL), or a client for tests. */
  constructor(urlOrClient: string | Convex) {
    this.convex = typeof urlOrClient === 'string' ? new ConvexClient(urlOrClient) : urlOrClient
    this.url = typeof urlOrClient === 'string' ? urlOrClient : null
    this.stopConnectionState =
      this.convex.subscribeToConnectionState?.((state) => {
        if (!state.hasEverConnected) this.setStatus('connecting')
        else this.setStatus(state.isWebSocketConnected ? 'online' : 'reconnecting')
      }) ?? null
  }

  subscribe(listener: (event: RoomEvent) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  onConnectionChange(listener: (status: ConnectionStatus) => void): () => void {
    this.connectionListeners.push(listener)
    listener(this.status)
    return () => {
      this.connectionListeners = this.connectionListeners.filter((l) => l !== listener)
    }
  }

  onPresenceChange(listener: (offlineMemberIds: string[]) => void): () => void {
    this.presenceListeners.push(listener)
    this.startPresence()
    return () => {
      this.presenceListeners = this.presenceListeners.filter((l) => l !== listener)
      if (this.presenceListeners.length === 0) this.stopPresence()
    }
  }

  async createRoom(name: string): Promise<JoinResult> {
    return this.start(await callBackend(() => this.convex.mutation(api.rooms.create, { name })))
  }

  async joinRoom(inviteToken: string, name: string): Promise<JoinResult> {
    return this.start(await callBackend(() => this.convex.mutation(api.rooms.join, { inviteToken, name })))
  }

  /** Push-to-talk's way in. Lines go through addLine, so voice gets the same timeout and burn guard as typed lines. */
  readonly voice: VoiceTransport = {
    // Rejects before a join so push-to-talk's retries surface the mistake; after a burn addLine is a no-op.
    addLine: async (text, at) => {
      this.requireSession()
      await this.addLine(text, at)
    },
    sttToken: () => {
      const { sessionToken } = this.requireSession()
      return callBackend(() => this.convex.action(api.voice.sttToken, { sessionToken }))
    },
    callToken: () => {
      const { sessionToken } = this.requireSession()
      return callBackend(() => this.convex.action(api.call.callToken, { sessionToken }))
    },
  }

  /** The event log reports the burn back, which ends the room on this phone and every other one. */
  async burn(): Promise<void> {
    const session = this.session
    if (!session) return
    await callBackend(() =>
      this.convex.mutation(api.rooms.burn, { roomId: session.roomId, sessionToken: session.sessionToken }),
    )
  }

  async addLine(text: string, at: number): Promise<void> {
    const session = this.session
    if (!session || this.burned) return
    await callBackend(() => this.convex.mutation(api.lines.add, { sessionToken: session.sessionToken, text, at }))
  }

  async startReplay(): Promise<void> {
    const session = this.session
    if (!session || this.burned) return
    await callBackend(() => this.convex.mutation(api.replay.start, { sessionToken: session.sessionToken }))
  }

  /** Leave (not burn): the backend drops this member and tells the other phones. */
  async leave(): Promise<void> {
    const session = this.session
    if (!session || this.burned) return
    this.stopPresence()
    await callBackend(() => this.convex.mutation(api.rooms.leave, { sessionToken: session.sessionToken }))
  }

  dispose(): void {
    this.stopSubscription()
    this.stopConnectionState?.()
    this.stopConnectionState = null
    this.stopVisibility()
    this.stopPresence()
    this.listeners = []
    this.connectionListeners = []
    void this.convex.close()
  }

  private start(joined: Joined): JoinResult {
    if (this.session) throw new Error('ConvexRoomClient: already in a room')
    this.session = { roomId: joined.room.id, sessionToken: joined.sessionToken }
    this.subscribeFrom(0)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange)
      this.listeningForVisibility = true
    }
    this.startPresence()
    return { room: joined.room, self: joined.member }
  }

  private requireSession() {
    if (!this.session) throw new Error('ConvexRoomClient: not in a room')
    return this.session
  }

  private subscribeFrom(afterEventSeq: number): void {
    if (!this.session) return
    this.stopSubscription()
    const generation = this.generation
    const current = () => generation === this.generation
    this.subscribedFrom = afterEventSeq
    this.stopEvents = this.convex.onUpdate(
      api.events.listAfter,
      { ...this.session, afterEventSeq },
      (log) => {
        if (current()) this.onLog(log)
      },
      // Never log the error: it can carry payload text.
      () => {
        if (!current()) return
        this.setStatus('lost')
        this.stopSubscription()
      },
    )
  }

  private stopSubscription(): void {
    this.generation += 1
    this.stopEvents?.()
    this.stopEvents = null
  }

  private onLog(log: { status: 'active' | 'burned'; events: unknown[] }): void {
    if (this.burned || !this.session) return
    if (!this.convex.subscribeToConnectionState) this.setStatus('online')
    const out = follow(this.follower, log)
    if (out.kind === 'burned') {
      const roomId = this.session.roomId
      this.burned = true
      this.stopSubscription()
      this.stopConnectionState?.()
      this.stopConnectionState = null
      this.stopVisibility()
      this.stopPresence()
      this.emit({ type: 'room_burned', roomId })
      return
    }
    this.follower = out.next
    for (const event of out.events) this.emit(event)
    if (out.resubscribeFrom === undefined) return
    // Loop guard: a fresh subscription from the seq this one started at runs the identical query.
    // (A server ignoring afterEventSeq costs one resubscribe per new event; this guard stops it looping.)
    if (out.resubscribeFrom !== this.subscribedFrom) {
      this.subscribeFrom(out.resubscribeFrom)
    } else if (out.kind === 'gap') {
      // R4/R5: the gap survives a resubscribe (or is on the first one), so rows are really missing.
      this.setStatus('lost')
      this.stopSubscription()
    }
    // A guarded window result (nothing new in an oversized update) is harmless: keep listening.
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now()
      return
    }
    const hiddenAt = this.hiddenAt
    this.hiddenAt = null
    // Timers may have been paused while hidden: say "still here" right away.
    void this.beat?.()
    if (hiddenAt === null || this.burned || this.status === 'lost') return
    if (Date.now() - hiddenAt > RESUBSCRIBE_AFTER_HIDDEN_MS) this.subscribeFrom(this.follower.lastEventSeq)
  }

  private stopVisibility(): void {
    if (!this.listeningForVisibility) return
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.listeningForVisibility = false
  }

  /**
   * Heartbeats while someone listens and this phone is in a room. Not stopped when the page is hidden:
   * a phone in a pocket on the call is still in the room. A missed beat only shows it offline for a while.
   */
  private startPresence(): void {
    if (this.presenceTimer !== null || this.presenceListeners.length === 0 || !this.session || this.burned) return
    const generation = ++this.presenceGeneration
    const sessionId = crypto.randomUUID()
    this.beat = async () => {
      const session = this.session
      if (!session || generation !== this.presenceGeneration) return
      try {
        const tokens = await this.convex.mutation(api.presence.heartbeat, {
          sessionToken: session.sessionToken,
          sessionId,
          interval: PRESENCE_INTERVAL_MS,
        })
        if (generation !== this.presenceGeneration) return
        this.presenceToken = tokens.presenceToken
        if (tokens.roomToken !== this.roomToken) this.watchPresence(tokens.roomToken)
      } catch {
        // Never log the error: it can carry payload text.
      }
    }
    void this.beat()
    this.presenceTimer = setInterval(() => void this.beat?.(), PRESENCE_INTERVAL_MS)
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide)
  }

  private watchPresence(roomToken: string): void {
    this.stopPresenceList?.()
    this.roomToken = roomToken
    this.stopPresenceList = this.convex.onUpdate(
      api.presence.list,
      { roomToken },
      (people) => {
        const offline = people.filter((p) => !p.online).map((p) => p.memberId)
        for (const l of [...this.presenceListeners]) l(offline)
      },
      () => {},
    )
  }

  private stopPresence(): void {
    this.presenceGeneration += 1
    if (this.presenceTimer !== null) clearInterval(this.presenceTimer)
    this.presenceTimer = null
    this.beat = null
    this.stopPresenceList?.()
    this.stopPresenceList = null
    this.roomToken = null
    this.presenceToken = null
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide)
  }

  /** The tab is closing: tell the backend now, so the other phones don't wait for the timeout. */
  private readonly onPageHide = (): void => {
    if (!this.url || !this.presenceToken || typeof navigator === 'undefined' || !navigator.sendBeacon) return
    const body = JSON.stringify({ path: 'presence:disconnect', args: { presenceToken: this.presenceToken } })
    navigator.sendBeacon(`${this.url}/api/mutation`, new Blob([body], { type: 'application/json' }))
  }

  /** Emits only real changes. `lost` is sticky, and nothing is emitted after a burn. */
  private setStatus(status: ConnectionStatus): void {
    if (this.burned || this.status === 'lost' || status === this.status) return
    this.status = status
    for (const l of [...this.connectionListeners]) l(status)
  }

  private emit(event: RoomEvent): void {
    for (const l of [...this.listeners]) l(event)
  }
}
