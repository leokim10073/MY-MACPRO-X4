import { describe, expect, it } from 'vitest'
import { buildKeyterms } from './keyterms'

describe('buildKeyterms', () => {
  it('puts members first, then people and aliases, without duplicates or blanks', () => {
    const terms = buildKeyterms(
      [{ name: 'Alex' }, { name: 'Sam' }, { name: '  ' }],
      [
        { name: 'Kevin', aliases: ['Roommate Kevin', "Alex's old roommate"] },
        { name: 'alex', aliases: [] },
      ],
    )
    expect(terms).toEqual(['Alex', 'Sam', 'Kevin', 'Roommate Kevin', "Alex's old roommate"])
  })

  it('stops at 100 terms', () => {
    const members = Array.from({ length: 150 }, (_, i) => ({ name: `M${i}` }))
    const terms = buildKeyterms(members)
    expect(terms).toHaveLength(100)
    expect(terms[0]).toBe('M0')
  })

  it('stops before going over 1200 characters in total', () => {
    const members = Array.from({ length: 30 }, (_, i) => ({ name: `${i}`.padEnd(50, 'x') }))
    const terms = buildKeyterms(members)
    expect(terms).toHaveLength(24)
    expect(terms.join('').length).toBeLessThanOrEqual(1200)
  })
})
