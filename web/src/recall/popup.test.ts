import { describe, expect, it } from 'vitest'
import type { DemoFixture, Member } from '../../../shared/schema'
import expectedJson from '../../../shared/fixtures/kevin.expected.json'
import { initialPopupState, popupReducer, visibleChips } from './popup'
import type { PopupContext, PopupInput, PopupState } from './popup'

const fixture = expectedJson as DemoFixture
const [r1, r2, r3] = fixture.recalls
const taylor = fixture.members.find((m) => m.id === 'm_taylor') as Member
const alex = fixture.members.find((m) => m.id === 'm_alex') as Member

const ctx: PopupContext = {
  self: taylor,
  stories: fixture.storyState.stories,
  people: fixture.storyState.people,
  focusedBypassesCooldown: false,
}
const run = (inputs: PopupInput[], c: PopupContext = ctx, from: PopupState = initialPopupState) =>
  inputs.reduce((s, i) => popupReducer(s, i, c), from)
const recallAt = (recall: typeof r1, now: number): PopupInput => ({ type: 'recall', recall, now })
const closedKevin = () => run([recallAt(r1, 0), { type: 'tick', now: 6000 }])

describe('popupReducer', () => {
  it('r1 shows Kevin with Cake, Airport, Landlord and no focus', () => {
    const s = run([recallAt(r1, 0)])
    expect(s.visible?.personId).toBe('p_kevin')
    expect(visibleChips(s.visible!, ctx.stories).map((c) => c.keyword)).toEqual(['Cake', 'Airport', 'Landlord'])
    expect(s.visible?.focusStoryId).toBeUndefined()
    expect(s.visible?.expiresAt).toBe(6000)
  })

  it('r2 while visible updates in place with focus s_cake and expiresAt 11000', () => {
    const s = run([recallAt(r1, 0), recallAt(r2, 5000)])
    expect(s.visible?.recallId).toBe('r2')
    expect(s.visible?.focusStoryId).toBe('s_cake')
    expect(s.visible?.expiresAt).toBe(11000)
  })

  it('r3 while visible moves focus to s_airport, expiresAt 14000', () => {
    const s = run([recallAt(r1, 0), recallAt(r2, 5000), recallAt(r3, 8000)])
    expect(s.visible?.focusStoryId).toBe('s_airport')
    expect(s.visible?.expiresAt).toBe(14000)
  })

  it('an unfocused recall for a visible person does not change expiresAt', () => {
    const s = run([recallAt(r1, 0), recallAt(r1, 4000)])
    expect(s.visible?.expiresAt).toBe(6000)
    const f = run([recallAt(r2, 0), recallAt(r1, 4000)])
    expect(f.visible?.focusStoryId).toBe('s_cake')
    expect(f.visible?.expiresAt).toBe(6000)
  })

  it('the pop-up closes at tick 14000', () => {
    const open = run([recallAt(r1, 0), recallAt(r2, 5000), recallAt(r3, 8000)])
    expect(run([{ type: 'tick', now: 13999 }], ctx, open).visible).not.toBeNull()
    const s = run([{ type: 'tick', now: 14000 }], ctx, open)
    expect(s.visible).toBeNull()
    expect(s.closedAt.p_kevin).toBe(14000)
  })

  it('dismiss and chip_tapped close the pop-up; otherwise no-op', () => {
    for (const type of ['dismiss', 'chip_tapped'] as const) {
      const s = run([recallAt(r1, 0), { type, now: 1000 }])
      expect(s.visible).toBeNull()
      expect(s.closedAt.p_kevin).toBe(1000)
    }
    expect(run([{ type: 'dismiss', now: 5 }])).toEqual(initialPopupState)
  })

  it('a recall for Kevin at 20000 is dropped (cooldown from close)', () => {
    const closed = run([recallAt(r1, 0), recallAt(r2, 5000), recallAt(r3, 8000), { type: 'tick', now: 14000 }])
    expect(run([recallAt(r1, 20000)], ctx, closed).visible).toBeNull()
  })

  it('the same recall at 29001 shows', () => {
    const closed = run([recallAt(r1, 0), recallAt(r2, 5000), recallAt(r3, 8000), { type: 'tick', now: 14000 }])
    expect(run([recallAt(r1, 28999)], ctx, closed).visible).toBeNull()
    expect(run([recallAt(r1, 29001)], ctx, closed).visible?.personId).toBe('p_kevin')
  })

  it('with focusedBypassesCooldown, a focused recall at 20000 shows', () => {
    const closed = run([recallAt(r1, 0), recallAt(r2, 5000), recallAt(r3, 8000), { type: 'tick', now: 14000 }])
    const bypass = { ...ctx, focusedBypassesCooldown: true }
    expect(run([recallAt(r3, 20000)], bypass, closed).visible?.focusStoryId).toBe('s_airport')
    expect(run([recallAt(r1, 20000)], bypass, closed).visible).toBeNull()
  })

  it('Alex (joinedAtSeq 0) never sees a pop-up', () => {
    const s = run([recallAt(r1, 0), recallAt(r2, 5000), recallAt(r3, 8000)], { ...ctx, self: alex })
    expect(s).toEqual(initialPopupState)
  })

  it('a recall with confidence 0.6 is dropped', () => {
    expect(run([recallAt({ ...r1, confidence: 0.6 }, 0)])).toEqual(initialPopupState)
  })

  it('a recall before its stories is pending, then shown on the tick after the stories arrive', () => {
    const empty = { ...ctx, stories: [], people: [] }
    const pending = run([recallAt(r1, 0)], empty)
    expect(pending.visible).toBeNull()
    expect(pending.pending).toEqual([{ recall: r1, receivedAt: 0 }])
    const s = run([{ type: 'tick', now: 3000 }], ctx, pending)
    expect(s.pending).toEqual([])
    expect(s.visible?.expiresAt).toBe(9000)
  })

  it('a known person with one unknown story shows now with only the known chip; the rest appear in place later', () => {
    const partial = { ...ctx, stories: ctx.stories.filter((x) => x.id === 's_cake') }
    const s = run([recallAt(r1, 0)], partial)
    expect(s.visible?.personId).toBe('p_kevin')
    expect(s.pending).toEqual([])
    expect(visibleChips(s.visible!, partial.stories).map((c) => c.id)).toEqual(['s_cake'])
    expect(visibleChips(s.visible!, ctx.stories).map((c) => c.id)).toEqual(['s_cake', 's_airport', 's_landlord'])
  })

  it('a recall whose stories are all known but not missed is dropped, not pending', () => {
    const none = { ...ctx, self: { ...taylor, joinedAtSeq: 99 } }
    expect(run([recallAt(r1, 0)], none)).toEqual(initialPopupState)
  })

  it('a recall from before the join (seq 10 for joinedAtSeq 16) is dropped', () => {
    expect(run([recallAt({ ...r1, seq: 10 }, 0)])).toEqual(initialPopupState)
    expect(run([recallAt({ ...r1, seq: 16 }, 0)])).toEqual(initialPopupState)
  })

  it('a pending recall is dropped after 6000 ms', () => {
    const empty = { ...ctx, stories: [], people: [] }
    const pending = run([recallAt(r1, 0)], empty)
    const s = run([{ type: 'tick', now: 6000 }], ctx, pending)
    expect(s.pending).toEqual([])
    expect(s.visible).toBeNull()
  })

  it('shows a different person and records closedAt for the old one', () => {
    const other = { ...r1, id: 'rx', personId: 'p_other' }
    const c = { ...ctx, people: [...ctx.people, { ...ctx.people[0], id: 'p_other' }] }
    const s = run([recallAt(r1, 0), recallAt(other, 1000)], c)
    expect(s.visible?.personId).toBe('p_other')
    expect(s.closedAt.p_kevin).toBe(1000)
  })

  it('does not mutate the previous state', () => {
    const before = closedKevin()
    const copy = JSON.parse(JSON.stringify(before))
    run([recallAt(r1, 29001)], ctx, before)
    expect(before).toEqual(copy)
  })
})

describe('visibleChips', () => {
  it('leaves out unknown story ids', () => {
    const chips = visibleChips(
      { recallId: 'r1', personId: 'p_kevin', storyIds: ['s_landlord', 'nope', 's_cake'], expiresAt: 1 },
      ctx.stories,
    )
    expect(chips.map((c) => c.id)).toEqual(['s_landlord', 's_cake'])
  })
})
