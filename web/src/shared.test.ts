import { describe, expect, it } from 'vitest'
import { missedStory, RECALL_COOLDOWN_MS } from '../../shared/schema'
import type { DemoFixture, ReplayScript } from '../../shared/schema'
import replayJson from '../../shared/fixtures/kevin.replay.json'
import expectedJson from '../../shared/fixtures/kevin.expected.json'

const replay = replayJson as ReplayScript
const expected = expectedJson as DemoFixture

describe('shared schema import', () => {
  it('exposes the recall cooldown constant', () => {
    expect(RECALL_COOLDOWN_MS).toBe(15000)
  })

  it('loads the replay fixture', () => {
    expect(replay.lines.length).toBe(21)
    expect(replay.lateJoiner?.afterLine).toBe(16)
  })

  it('missedStory is true for the late joiner and false for the original member', () => {
    const taylor = expected.members.find((m) => m.id === 'm_taylor')!
    const alex = expected.members.find((m) => m.id === 'm_alex')!
    const cake = expected.storyState.stories.find((s) => s.id === 's_cake')!
    expect(missedStory(taylor, cake)).toBe(true)
    expect(missedStory(alex, cake)).toBe(false)
  })
})
