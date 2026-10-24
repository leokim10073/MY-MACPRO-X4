// Test-only support: the Kevin fixture as RoomEvents, and the state it must fold into.
import { expect } from 'vitest'
import type { DemoFixture, ReplayScript, RoomEvent, TranscriptLine } from '../../../shared/schema'
import replayJson from '../../../shared/fixtures/kevin.replay.json'
import expectedJson from '../../../shared/fixtures/kevin.expected.json'
import type { RoomState } from './state'

const replay = replayJson as ReplayScript
const fixture = expectedJson as DemoFixture

export function fixtureLines(): TranscriptLine[] {
  return replay.lines.map((l, i) => ({
    id: `l${i + 1}`,
    roomId: fixture.roomId,
    speakerId: fixture.members.find((m) => m.name === l.speakerName)!.id,
    speakerName: l.speakerName,
    text: l.text,
    seq: i + 1,
    at: 0,
  }))
}

export function fixtureEvents(): RoomEvent[] {
  return [
    ...fixture.members.map((member): RoomEvent => ({ type: 'member_joined', member })),
    ...fixtureLines().map((line): RoomEvent => ({ type: 'line_added', line })),
    { type: 'story_state_updated', storyState: fixture.storyState },
    ...fixture.recalls.map((recall): RoomEvent => ({ type: 'recall', recall })),
    { type: 'recap_ready', recap: fixture.recap },
  ]
}

export function expectFixtureState(state: RoomState): void {
  expect(state.status).toBe('active')
  expect(state.members).toEqual(fixture.members)
  expect(state.lines.map((l) => l.id)).toEqual(Array.from({ length: 21 }, (_, i) => `l${i + 1}`))
  expect(state.storyState).toEqual(fixture.storyState)
  expect(state.recalls).toEqual(fixture.recalls)
  expect(state.recaps).toEqual([fixture.recap])
}
