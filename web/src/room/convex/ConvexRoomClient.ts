// Talks to the real backend (backend/convex). Subscribes to the room's
// append-only event log and hands each RoomEvent to listeners in eventSeq order,
// so the reducer sees exactly what it sees from the mock. `follow` does the
// dedupe, ordering, gap and window checks; this class owns the subscription.
import { ConvexClient } from 'convex/browser'
import type { RoomEvent } from '../../../../shared/schema'
import type { ConnectionStatus, JoinResult, RoomClient } from '../RoomClient'
import { backendApi as api } from './backendApi'
import { callBackend } from './callBackend'
import { follow, type FollowerState } from './logFollower'

type Convex = Pick<ConvexClient, 'onUpdate' | 'mutation' | 'close'> &
  Partial<Pick<ConvexClient, 'subscribeToConnectionState'>>
interface Joined extends Omit<JoinResult, 'self'> {
  member: JoinResult['self']
  sessionToken: string
}

/** A phone hidden longer than this may have had its socket suspended, so it resubscribes on return. */
const RESUBSCRIBE_AFTER_HIDDEN_MS = 30_000

export class ConvexRoomClient implements RoomClient {
  private readonly convex: Convex
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

  /** Pass the deployment URL (VITE_CONVEX_URL), or a client for tests. */
  constructor(urlOrClient: string | Convex) {
    this.convex = typeof urlOrClient === 'string' ? new ConvexClient(urlOrClient) : urlOrClient
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

  async createRoom(name: string): Promise<JoinResult> {
    return this.start(await callBackend(() => this.convex.mutation(api.rooms.create, { name })))
  }

  async joinRoom(inviteToken: string, name: string): Promise<JoinResult> {
    return this.start(await callBackend(() => this.convex.mutation(api.rooms.join, { inviteToken, name })))
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

  dispose(): void {
    this.stopSubscription()
    this.stopConnectionState?.()
    this.stopConnectionState = null
    this.stopVisibility()
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
    return { room: joined.room, self: joined.member }
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
    if (hiddenAt === null || this.burned || this.status === 'lost') return
    if (Date.now() - hiddenAt > RESUBSCRIBE_AFTER_HIDDEN_MS) this.subscribeFrom(this.follower.lastEventSeq)
  }

  private stopVisibility(): void {
    if (!this.listeningForVisibility) return
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.listeningForVisibility = false
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
