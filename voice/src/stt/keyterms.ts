import type { Member, Person } from '../../../shared/schema'
import { KEYTERM_MAX_CHARS, KEYTERM_MAX_COUNT } from '../config'

/**
 * Words Ink should listen for: the friends in the room first, then the people the AI has
 * found in the conversation and their aliases. Duplicates (ignoring case) and blanks are
 * dropped, and the list is cut to Ink's limits, keeping the earlier, more important terms.
 */
export function buildKeyterms(
  members: readonly Pick<Member, 'name'>[],
  people: readonly Pick<Person, 'name' | 'aliases'>[] = [],
): string[] {
  const candidates = [...members.map((m) => m.name), ...people.flatMap((p) => [p.name, ...p.aliases])]
  const seen = new Set<string>()
  const out: string[] = []
  let chars = 0
  for (const raw of candidates) {
    const term = raw.trim()
    const key = term.toLowerCase()
    if (!term || seen.has(key)) continue
    if (out.length >= KEYTERM_MAX_COUNT || chars + term.length > KEYTERM_MAX_CHARS) break
    seen.add(key)
    out.push(term)
    chars += term.length
  }
  return out
}
