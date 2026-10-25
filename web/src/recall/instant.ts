// Instant recall: while a friend in the call is still speaking, match their live text against the
// people and stories the AI already knows, so the pop-up shows mid-sentence. No AI call, and live
// text never leaves this phone. The AI's recall for the same line still arrives after the sentence
// and catches what words alone can't ("he just texted"); the pop-up rules merge the two.
import type { Id, Recall, StoryState } from '../../../shared/schema'

export interface Mention {
  personId: Id
  matchedText: string
  focusStoryId?: Id
  confidence: number
}

// Same scores as the AI's fixed rules (ai/src/detectRecalls.ts scoreRecall).
const NAME_CONFIDENCE = 0.95
const KEYWORD_CONFIDENCE = 0.9

/** A story keyword alone triggers a pop-up only if it's this long: "Airport" yes, "Cake" no. */
export const KEYWORD_ONLY_MIN_LENGTH = 6

/** Lowercase words separated by single spaces, so " term " matches whole words only. */
function words(text: string): string {
  return ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
}

function has(haystack: string, term: string): boolean {
  const t = words(term)
  return t.trim().length > 0 && haystack.includes(t)
}

/** Original spelling of a matched term in the text, for the pop-up's matchedText. */
function spelled(text: string, term: string): string {
  const i = text.toLowerCase().indexOf(term.toLowerCase())
  return i >= 0 ? text.slice(i, i + term.length) : term
}

export function findMentions(text: string, storyState: StoryState | null): Mention[] {
  if (!storyState || !text.trim()) return []
  const said = words(text)
  // People in the room are never recalled, same as the AI.
  const people = storyState.people.filter((p) => !p.memberId)

  // Names and aliases that point at exactly one person.
  const owners = new Map<string, Set<Id>>()
  for (const p of people) {
    for (const term of [p.name, ...p.aliases]) {
      const key = words(term).trim()
      if (key.length < 2) continue
      owners.set(key, (owners.get(key) ?? new Set()).add(p.id))
    }
  }

  const found = new Map<Id, Mention>()
  for (const [term, ids] of owners) {
    if (ids.size !== 1 || !said.includes(` ${term} `)) continue
    const personId = [...ids][0]
    if (found.has(personId)) continue
    const person = people.find((p) => p.id === personId)!
    const focus = storyState.stories.filter(
      (s) => person.storyIds.includes(s.id) && has(said, s.keyword),
    )
    found.set(personId, {
      personId,
      matchedText: spelled(text, term),
      ...(focus.length === 1 ? { focusStoryId: focus[0].id } : {}),
      confidence: NAME_CONFIDENCE,
    })
  }

  // A distinctive story keyword on its own ("the airport thing").
  for (const story of storyState.stories) {
    if (story.keyword.length < KEYWORD_ONLY_MIN_LENGTH || !has(said, story.keyword)) continue
    const personId = story.personIds[0]
    if (!personId || found.has(personId) || !people.some((p) => p.id === personId)) continue
    const sameKeyword = storyState.stories.filter((s) => words(s.keyword) === words(story.keyword))
    if (sameKeyword.length !== 1) continue
    found.set(personId, {
      personId,
      matchedText: spelled(text, story.keyword),
      focusStoryId: story.id,
      confidence: KEYWORD_CONFIDENCE,
    })
  }
  return [...found.values()]
}

/**
 * A recall for the line being spoken right now (it has no line id yet). Its seq is the next
 * line's, so the pop-up rules treat it as said after the latecomer joined. The id is stable for
 * one speaker's turn, so the same mention isn't fed twice.
 */
export function mentionToRecall(
  m: Mention,
  at: { roomId: Id; speakerId: Id; latestSeq: number; storyState: StoryState },
): Recall {
  const firstSeq = new Map(at.storyState.stories.map((s) => [s.id, s.firstSeq]))
  const person = at.storyState.people.find((p) => p.id === m.personId)
  const storyIds = (person?.storyIds ?? [])
    .filter((id) => firstSeq.has(id))
    .sort((a, b) => firstSeq.get(a)! - firstSeq.get(b)!)
  return {
    id: `instant:${at.speakerId}:${at.latestSeq}:${m.personId}`,
    roomId: at.roomId,
    lineId: '',
    seq: at.latestSeq + 1,
    personId: m.personId,
    storyIds,
    ...(m.focusStoryId ? { focusStoryId: m.focusStoryId } : {}),
    matchedText: m.matchedText,
    confidence: m.confidence,
  }
}
