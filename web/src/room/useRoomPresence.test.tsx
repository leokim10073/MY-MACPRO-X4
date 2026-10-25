import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Member, RoomEvent } from '../../../shared/schema'
import type { JoinResult, RoomClient } from './RoomClient'
import { useRoom } from './useRoom'

const member = (id: string, name: string): Member => ({ id, roomId: 'r1', name, joinedAtSeq: 0, joinedAt: 0 })
const alex = member('m1', 'Alex')
const sam = member('m2', 'Sam')
const kevin = member('m3', 'Kevin') // a replay speaker: never sends a heartbeat

function fakeClient() {
  let emit: (e: RoomEvent) => void = () => {}
  let presence: (ids: string[]) => void = () => {}
  const joined: JoinResult = {
    room: { id: 'r1', hostMemberId: 'm1', status: 'active', inviteToken: 'i', createdAt: 0, expiresAt: 1 },
    self: alex,
  }
  const client: RoomClient = {
    subscribe: (l) => {
      emit = l
      return () => {}
    },
    onPresenceChange: (l) => {
      presence = l
      return () => {}
    },
    createRoom: async () => joined,
    joinRoom: async () => joined,
    burn: async () => {},
    addLine: async () => {},
    dispose: () => {},
  }
  return { client, emit: (e: RoomEvent) => emit(e), setOffline: (ids: string[]) => presence(ids) }
}

describe('useRoom presence', () => {
  it('drops members whose phones went offline, but never yourself or members with no heartbeat', async () => {
    const { client, emit, setOffline } = fakeClient()
    const { result } = renderHook(() => useRoom(client))
    await act(() => result.current.create('Alex'))
    act(() => {
      for (const m of [alex, sam, kevin]) emit({ type: 'member_joined', member: m })
    })
    expect(result.current.state.members.map((m) => m.name)).toEqual(['Alex', 'Sam', 'Kevin'])

    act(() => setOffline(['m2', 'm1']))
    expect(result.current.state.members.map((m) => m.name)).toEqual(['Alex', 'Kevin'])

    act(() => setOffline([]))
    expect(result.current.state.members.map((m) => m.name)).toEqual(['Alex', 'Sam', 'Kevin'])
  })
})
