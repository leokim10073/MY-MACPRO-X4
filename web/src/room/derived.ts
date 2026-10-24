// Values the room screen derives from RoomState. Pure, so the reducer stays as it is.
import type { Id, Member, TranscriptLine } from '../../../shared/schema'
import type { RoomState } from './state'

/** Everyone still in the room; member_left removes people who tapped Leave. */
export function peopleCount(state: RoomState): number {
  return state.members.length
}

export function isMe(member: Member, self: Member): boolean {
  return member.id === self.id
}

/** Up to two letters for an avatar tile, e.g. "Mary Jane" → "MJ". Emoji stay whole. */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0].toUpperCase())
  return letters.length > 0 ? letters.join('') : '?'
}

export function latestLine(state: RoomState): TranscriptLine | undefined {
  return state.lines.reduce<TranscriptLine | undefined>(
    (latest, l) => (latest === undefined || l.seq > latest.seq ? l : latest),
    undefined,
  )
}

/** Speaker first, then me, then everyone else in join order. */
export function orderMembersForStage(members: Member[], self: Member, speakerId: Id | null): Member[] {
  const speaker = members.find((m) => m.id === speakerId)
  const first = [speaker, members.find((m) => isMe(m, self))].filter(
    (m, i, list): m is Member => m !== undefined && list.indexOf(m) === i,
  )
  return [...first, ...members.filter((m) => !first.includes(m))]
}
