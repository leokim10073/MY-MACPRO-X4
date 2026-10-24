// Talks to the real backend (backend/convex). Subscribes to the room's
// append-only event log and hands each RoomEvent to listeners in eventSeq order,
// so the reducer sees exactly what it sees from the mock.
import { ConvexClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import type { api as backendApi } from '../../../../backend/convex/_generated/api'
import type { Id as ConvexId } from '../../../../backend/convex/_generated/dataModel'
import type { RoomEvent } from '../../../../shared/schema'
import type { JoinResult, RoomClient } from '../RoomClient'

// Typed references without bundling the backend's generated JS into the web app.
const api = anyApi as unknown as typeof backendApi

type Convex = Pick<ConvexClient, 'onUpdate' | 'mutation' | 'close'>
interface Joined extends Omit<JoinResult, 'self'> {
  member: JoinResult['self']
  sessionToken: string
}
interface EventLog {
  status: 'active' | 'burned'
  events: Array<{ eventSeq: number; event: RoomEvent }>
}

export class ConvexRoomClient implements RoomClient {
  private readonly convex: Convex
  private listeners: Array<(event: RoomEvent) => void> = []
  private session: { roomId: ConvexId<'rooms'>; sessionToken: string } | null = null
  private stopEvents: (() => void) | null = null
  private lastEventSeq = 0
  private burned = false

  /** Pass the deployment URL (VITE_CONVEX_URL), or a client for tests. */
  constructor(urlOrClient: string | Convex) {
    this.convex = typeof urlOrClient === 'string' ? new ConvexClient(urlOrClient) : urlOrClient
  }

  subscribe(listener: (event: RoomEvent) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  async createRoom(name: string): Promise<JoinResult> {
    return this.start(await this.convex.mutation(api.rooms.create, { name }))
  }

  async joinRoom(inviteToken: string, name: string): Promise<JoinResult> {
    return this.start(await this.convex.mutation(api.rooms.join, { inviteToken, name }))
  }

  /** The event log reports the burn back, which ends the room on this phone and every other one. */
  async burn(): Promise<void> {
    if (!this.session) return
    await this.convex.mutation(api.rooms.burn, {
      roomId: this.session.roomId,
      sessionToken: this.session.sessionToken,
    })
  }

  dispose(): void {
    this.stopEvents?.()
    this.stopEvents = null
    this.listeners = []
    void this.convex.close()
  }

  private start(joined: Joined): JoinResult {
    if (this.session) throw new Error('ConvexRoomClient: already in a room')
    const session = { roomId: joined.room.id as ConvexId<'rooms'>, sessionToken: joined.sessionToken }
    this.session = session
    this.stopEvents = this.convex.onUpdate(
      api.events.listAfter,
      { ...session, afterEventSeq: 0 },
      (log) => this.apply(log),
      (error) => console.error('Room event subscription failed', error),
    )
    return { room: joined.room, self: joined.member }
  }

  private apply(log: EventLog): void {
    if (this.burned || !this.session) return
    if (log.status === 'burned') {
      this.burned = true
      this.stopEvents?.()
      this.stopEvents = null
      this.emit({ type: 'room_burned', roomId: this.session.roomId })
      return
    }
    // Each update carries the whole log; pass on only what this phone hasn't seen.
    for (const { eventSeq, event } of log.events) {
      if (eventSeq <= this.lastEventSeq) continue
      this.lastEventSeq = eventSeq
      this.emit(event)
    }
  }

  private emit(event: RoomEvent): void {
    for (const l of [...this.listeners]) l(event)
  }
}
