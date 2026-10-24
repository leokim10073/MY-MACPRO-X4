// Turns one raw Convex `events` row into a RoomEvent the reducer can trust.
// The backend stores `event` as v.any(), so every row is checked here.
// Reasons name the event type and field only; they never include field values,
// because values can be conversation text.
import type { RoomEvent } from '../../../../shared/schema'

export interface EventRow {
  eventSeq: number
  event: RoomEvent
}

export type ParsedRow =
  | { ok: true; row: EventRow }
  | { ok: false; eventSeq: number | null; reason: string }

type Obj = Record<string, unknown>
type Kind = 'string' | 'number' | 'array'

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function matches(v: unknown, kind: Kind): boolean {
  if (kind === 'string') return typeof v === 'string'
  if (kind === 'number') return typeof v === 'number' && Number.isFinite(v)
  return Array.isArray(v)
}

/** Payload key, then the fields the reducer reads from it. */
const PAYLOADS: Record<string, { key: string; fields: [string, Kind][] }> = {
  member_joined: {
    key: 'member',
    fields: [
      ['id', 'string'],
      ['joinedAtSeq', 'number'],
    ],
  },
  line_added: {
    key: 'line',
    fields: [
      ['id', 'string'],
      ['seq', 'number'],
      ['text', 'string'],
      ['speakerName', 'string'],
    ],
  },
  story_state_updated: {
    key: 'storyState',
    fields: [
      ['uptoSeq', 'number'],
      ['people', 'array'],
      ['stories', 'array'],
    ],
  },
  recall: {
    key: 'recall',
    fields: [
      ['id', 'string'],
      ['seq', 'number'],
      ['personId', 'string'],
      ['storyIds', 'array'],
      ['confidence', 'number'],
    ],
  },
  recap_ready: {
    key: 'recap',
    fields: [
      ['id', 'string'],
      ['uptoSeq', 'number'],
      ['text', 'string'],
    ],
  },
}

const KIND_LABEL: Record<Kind, string> = { string: 'a string', number: 'a number', array: 'an array' }

/** Returns a reason, or null when the event is well formed. */
function checkEvent(event: unknown): string | null {
  if (!isObj(event)) return 'event is not an object'
  const type = event.type
  if (typeof type !== 'string') return 'event.type is not a string'
  if (type === 'room_burned') {
    return typeof event.roomId === 'string' ? null : 'room_burned: roomId is not a string'
  }
  if (type === 'member_left') {
    return typeof event.memberId === 'string' ? null : 'member_left: memberId is not a string'
  }
  if (!Object.prototype.hasOwnProperty.call(PAYLOADS, type)) return 'unknown event type'
  const { key, fields } = PAYLOADS[type]
  const payload = event[key]
  if (!isObj(payload)) return `${type}: ${key} is not an object`
  for (const [field, kind] of fields) {
    if (!matches(payload[field], kind)) return `${type}: ${key}.${field} is not ${KIND_LABEL[kind]}`
  }
  return null
}

export function parseEventRow(raw: unknown): ParsedRow {
  if (!isObj(raw)) return { ok: false, eventSeq: null, reason: 'row is not an object' }
  const seq = raw.eventSeq
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) {
    return { ok: false, eventSeq: null, reason: 'eventSeq is not an integer >= 1' }
  }
  const problem = checkEvent(raw.event)
  if (problem) return { ok: false, eventSeq: seq, reason: problem }
  return { ok: true, row: { eventSeq: seq, event: raw.event as RoomEvent } }
}
