// Pure: turns the scripted Kevin conversation into timed RoomEvents.
import type {
  DemoFixture,
  Member,
  ReplayScript,
  RoomEvent,
  StoryState,
  TranscriptLine,
} from '../../../../shared/schema'

export interface TimelineOptions {
  speed?: number
  recallLatencyMs?: number
  recapLatencyMs?: number
  snapshotLatencyMs?: number
  snapshotAfterLines?: number[]
  pauseAfterJoinMs?: number
  self?: { name: string; mode: 'host' | 'latecomer' }
}
export interface TimedEvent {
  atMs: number
  event: RoomEvent
}

export function snapshotAt(fixture: DemoFixture, uptoSeq: number): StoryState {
  const full = fixture.storyState
  const stories = full.stories.filter((s) => s.lastSeq <= uptoSeq)
  const ids = new Set(stories.map((s) => s.id))
  const people = full.people
    .filter((p) => p.storyIds.some((id) => ids.has(id)))
    .map((p) => ({ ...p, storyIds: p.storyIds.filter((id) => ids.has(id)) }))
  const complete = uptoSeq >= full.uptoSeq
  return {
    roomId: fixture.roomId,
    uptoSeq,
    people,
    stories,
    currentTopic: complete ? full.currentTopic : '',
    openQuestions: complete ? full.openQuestions : [],
    updatedAt: 0,
  }
}

export function buildReplayTimeline(
  script: ReplayScript,
  fixture: DemoFixture,
  opts: TimelineOptions = {},
): TimedEvent[] {
  const speed = opts.speed ?? 1
  const recallLatencyMs = opts.recallLatencyMs ?? 800
  const recapLatencyMs = opts.recapLatencyMs ?? 1500
  const snapshotLatencyMs = opts.snapshotLatencyMs ?? 1500
  const snapshotAfterLines = opts.snapshotAfterLines ?? [7, 12, 16, 21]
  const pause = opts.pauseAfterJoinMs ?? 0
  const roomId = fixture.roomId

  // Unscaled times, in generation order.
  const items: TimedEvent[] = []
  const add = (atMs: number, event: RoomEvent) => items.push({ atMs, event })

  const lineTimes: number[] = []
  let t = 0
  for (const l of script.lines) {
    t += l.delayMs
    lineTimes.push(t)
  }
  const lineTime = (seq: number) => lineTimes[seq - 1]

  for (const m of fixture.members) {
    if (m.joinedAtSeq === 0) add(0, { type: 'member_joined', member: m })
  }
  if (opts.self?.mode === 'host') add(0, { type: 'member_joined', member: selfMember(roomId, opts.self.name, 0) })

  script.lines.forEach((l, i) => {
    const line: TranscriptLine = {
      id: `l${i + 1}`,
      roomId,
      speakerId: fixture.members.find((m) => m.name === l.speakerName)!.id,
      speakerName: l.speakerName,
      text: l.text,
      seq: i + 1,
      at: lineTimes[i],
    }
    add(lineTimes[i], { type: 'line_added', line })
  })

  let joinMs = -1
  const late = script.lateJoiner
  if (late) {
    joinMs = lineTime(late.afterLine)
    const taylor = fixture.members.find((m) => m.name === late.name)
    if (taylor) add(joinMs, { type: 'member_joined', member: taylor })
    if (opts.self?.mode === 'latecomer') {
      add(joinMs, { type: 'member_joined', member: selfMember(roomId, opts.self.name, late.afterLine) })
    }
  }

  for (const n of snapshotAfterLines) {
    add(lineTime(n) + snapshotLatencyMs, { type: 'story_state_updated', storyState: snapshotAt(fixture, n) })
  }
  for (const recall of fixture.recalls) {
    add(lineTime(recall.seq) + recallLatencyMs, { type: 'recall', recall })
  }
  if (late) add(joinMs + recapLatencyMs, { type: 'recap_ready', recap: fixture.recap })

  // Pause after the late join, then latecomer shift, then speed scaling.
  const shiftBase = opts.self?.mode === 'latecomer' ? joinMs + 0 : 0
  const out = items.map(({ atMs, event }) => {
    let ms = late && atMs > joinMs ? atMs + pause : atMs
    if (opts.self?.mode === 'latecomer') ms = ms <= joinMs ? 0 : ms - shiftBase
    return { atMs: ms / speed, event }
  })
  // Array.prototype.sort is stable.
  return out.sort((a, b) => a.atMs - b.atMs)
}

function selfMember(roomId: string, name: string, joinedAtSeq: number): Member {
  return { id: 'm_self', roomId, name, joinedAt: 0, joinedAtSeq }
}
