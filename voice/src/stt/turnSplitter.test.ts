import { describe, expect, it } from 'vitest'
import { remainderAfter, TurnSplitter } from './turnSplitter'

describe('remainderAfter', () => {
  it('matching prefix', () => {
    expect(remainderAfter('So Kevin walks', 'So Kevin walks into the kitchen')).toBe('into the kitchen')
  })

  it('case and punctuation are ignored', () => {
    expect(remainderAfter('so, kevin', 'So Kevin walks.')).toBe('walks.')
  })

  it('Ink added a word in front', () => {
    expect(remainderAfter('So Kevin walks', 'Oh so Kevin walks in')).toBe('in')
  })

  it('revised words fall back to the word count', () => {
    expect(remainderAfter('So Calvin walks', 'So Kevin walks in')).toBe('in')
  })

  it('nothing sent yet returns the whole text', () => {
    expect(remainderAfter('', '  So  Kevin ')).toBe('So Kevin')
  })
})

function setup() {
  let t = 0
  const sp = new TurnSplitter(() => t)
  return { sp, at: (v: number) => (t = v) }
}

describe('TurnSplitter', () => {
  it("split sends the update so far with the turn's at", () => {
    const { sp, at } = setup()
    sp.start(1000)
    sp.update('So Kevin walks')
    at(5000)
    expect(sp.split()).toEqual({ text: 'So Kevin walks', at: 1000 })
    expect(sp.open).toBe(true)
  })

  it("second split sends only the new words with the first split's time", () => {
    const { sp, at } = setup()
    sp.start(1000)
    sp.update('So Kevin walks')
    at(5000)
    sp.split()
    sp.update('So Kevin walks into the kitchen')
    at(8000)
    expect(sp.split()).toEqual({ text: 'into the kitchen', at: 5000 })
  })

  it('split within 1.5 s returns null', () => {
    const { sp, at } = setup()
    sp.start(1000)
    sp.update('So Kevin')
    at(5000)
    sp.split()
    sp.update('So Kevin walks in')
    at(6400)
    expect(sp.split()).toBeNull()
    at(6500)
    expect(sp.split()).toEqual({ text: 'walks in', at: 5000 })
  })

  it('split with an empty update returns null', () => {
    const { sp, at } = setup()
    expect(sp.split()).toBeNull() // no turn
    sp.start(1000)
    at(5000)
    expect(sp.split()).toBeNull()
    sp.update('  ')
    expect(sp.split()).toBeNull()
  })

  it('end returns only the unsent rest', () => {
    const { sp, at } = setup()
    sp.start(1000)
    sp.update('So Kevin walks into the kitchen')
    at(5000)
    sp.split()
    expect(sp.end('So Kevin walks into the kitchen and eats the whole cake.')).toEqual({
      text: 'and eats the whole cake.',
      at: 5000,
    })
    expect(sp.open).toBe(false)
  })

  it('end without a split returns the whole turn', () => {
    const { sp } = setup()
    sp.start(1000)
    expect(sp.end('Hi there.')).toEqual({ text: 'Hi there.', at: 1000 })
  })

  it('end with nothing new returns null', () => {
    const { sp, at } = setup()
    sp.start(1000)
    sp.update('So Kevin walks')
    at(5000)
    sp.split()
    expect(sp.end('So Kevin walks.')).toBeNull()
    expect(sp.open).toBe(false)
  })
})
