// Web-local typed references to the backend functions the app calls, so the web
// build never imports backend/convex/_generated. live.test.ts checks these
// against a real backend.
import { makeFunctionReference } from 'convex/server'
import type { Member, Room, RoomEvent } from '../../../../shared/schema'

interface Joined {
  room: Room
  member: Member
  sessionToken: string
}

export const backendApi = {
  rooms: {
    create: makeFunctionReference<'mutation', { name: string }, Joined>('rooms:create'),
    join: makeFunctionReference<'mutation', { inviteToken: string; name: string }, Joined>('rooms:join'),
    burn: makeFunctionReference<'mutation', { roomId?: string; sessionToken: string }, null>('rooms:burn'),
    leave: makeFunctionReference<'mutation', { sessionToken: string }, null>('rooms:leave'),
  },
  events: {
    listAfter: makeFunctionReference<
      'query',
      { roomId: string; sessionToken: string; afterEventSeq: number },
      { status: 'active' | 'burned'; events: Array<{ eventSeq: number; event: RoomEvent }> }
    >('events:listAfter'),
  },
  lines: {
    add: makeFunctionReference<
      'mutation',
      { sessionToken: string; text: string; at: number },
      { lineId: string; seq: number } | null
    >('lines:add'),
  },
  replay: {
    start: makeFunctionReference<
      'mutation',
      { sessionToken: string; script?: string },
      { lines: number; durationMs: number }
    >('replay:start'),
  },
  voice: {
    sttToken: makeFunctionReference<'action', { sessionToken: string }, { token: string; expiresAt: number }>(
      'voice:sttToken',
    ),
  },
}
