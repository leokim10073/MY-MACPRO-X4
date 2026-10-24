// Runs the scripted Kevin conversation with timers, so the app works with no backend.
import type { DemoFixture, Member, Room, ReplayScript, RoomEvent } from '../../../../shared/schema'
import replayJson from '../../../../shared/fixtures/kevin.replay.json'
import expectedJson from '../../../../shared/fixtures/kevin.expected.json'
import type { JoinResult, RoomClient } from '../RoomClient'
import { buildReplayTimeline, type TimelineOptions } from './timeline'

const script = replayJson as ReplayScript
const fixture = expectedJson as DemoFixture
const ROOM_TTL_MS = 6 * 60 * 60 * 1000

export class MockRoomClient implements RoomClient {
  private listeners: Array<(event: RoomEvent) => void> = []
  private timers: ReturnType<typeof setTimeout>[] = []
  private started = false
  private roomId = fixture.roomId
  private readonly opts: Omit<TimelineOptions, 'self'>

  // Extra keys such as inviteToken (from readMockOptions) are ignored: opts is passed
  // to buildReplayTimeline, which only reads the keys it knows.
  constructor(opts: Omit<TimelineOptions, 'self'> = {}) {
    this.opts = opts
  }

  subscribe(listener: (event: RoomEvent) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  createRoom(name: string): Promise<JoinResult> {
    return this.start(name, 'host')
  }

  joinRoom(_inviteToken: string, name: string): Promise<JoinResult> {
    return this.start(name, 'latecomer')
  }

  async burn(): Promise<void> {
    this.clearTimers()
    this.emit({ type: 'room_burned', roomId: this.roomId })
  }

  dispose(): void {
    this.clearTimers()
    this.listeners = []
  }

  private start(name: string, mode: 'host' | 'latecomer'): Promise<JoinResult> {
    if (this.started) return Promise.reject(new Error('MockRoomClient: room already started'))
    this.started = true
    const timeline = buildReplayTimeline(script, fixture, { ...this.opts, self: { name, mode } })
    let self: Member | undefined
    for (const { event } of timeline) {
      if (event.type === 'member_joined' && event.member.id === 'm_self') self = event.member
    }
    for (const { atMs, event } of timeline) {
      this.timers.push(setTimeout(() => this.emit(event), atMs))
    }
    const createdAt = Date.now()
    const room: Room = {
      id: fixture.roomId,
      hostMemberId: mode === 'host' ? 'm_self' : 'm_alex',
      status: 'active',
      inviteToken: 'demo',
      createdAt,
      expiresAt: createdAt + ROOM_TTL_MS,
    }
    return Promise.resolve({ room, self: self! })
  }

  private emit(event: RoomEvent): void {
    for (const l of [...this.listeners]) l(event)
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout)
    this.timers = []
  }
}
