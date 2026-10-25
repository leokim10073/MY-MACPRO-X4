import type { Id, Member, Recall, Story, StoryState } from '../../../shared/schema'
import { missedStory } from '../../../shared/schema'

/** A friend's words right now, or the newest line: one caption under the board instead of a transcript. */
export interface Caption {
  name: string
  text: string
  live: boolean
}

interface Props {
  storyState: StoryState | null
  recalls: Recall[]
  self: Member
  /** Seq of the newest line, to tell which people were just mentioned again. */
  latestSeq: number
  caption: Caption | null
  onOpenStory(storyId: Id): void
}

/** A person counts as "just mentioned" if a recall for them came from one of the last few lines. */
const RECENT_LINES = 3

// Everyone's shared view of the conversation: who is being talked about, their stories in short,
// and what the group is on now. Stories stay here after their card is closed.
export default function RecallBoard({ storyState, recalls, self, latestSeq, caption, onOpenStory }: Props) {
  const stories = storyState?.stories ?? []
  const people = storyState?.people ?? []
  const late = self.joinedAtSeq > 0

  // Each story is listed once, under its main subject.
  const byPerson = new Map<Id, Story[]>()
  for (const s of stories) {
    const main = s.personIds[0]
    if (main) byPerson.set(main, [...(byPerson.get(main) ?? []), s])
  }
  const lastRecall = (id: Id) => Math.max(0, ...recalls.filter((r) => r.personId === id).map((r) => r.seq))
  const activity = (id: Id) => Math.max(lastRecall(id), ...(byPerson.get(id) ?? []).map((s) => s.lastSeq))
  const shown = people
    .filter((p) => byPerson.has(p.id))
    .sort((a, b) => activity(b.id) - activity(a.id))
  const nameOf = (id: Id) => people.find((p) => p.id === id)?.name

  return (
    <div className="recall-board">
      <div className="recall-board-scroll">
        {storyState?.currentTopic && (
          <p className="recall-board-now">
            <span className="recall-board-now-label">Now</span> {storyState.currentTopic}
          </p>
        )}
        {shown.length === 0 ? (
          <p className="recall-board-empty">Stories will show up here as people tell them.</p>
        ) : (
          <ul className="recall-board-people" aria-label="People and their stories">
            {shown.map((p) => (
              <li key={p.id} className="recall-person">
                <div className="recall-person-head">
                  <strong className="recall-person-name">{p.name}</strong>
                  {lastRecall(p.id) > 0 && latestSeq - lastRecall(p.id) < RECENT_LINES && (
                    <span className="recall-person-badge">Mentioned again</span>
                  )}
                </div>
                <ul className="recall-person-stories">
                  {byPerson.get(p.id)!.map((s) => {
                    const others = s.personIds.slice(1).map(nameOf).filter(Boolean)
                    return (
                      <li key={s.id}>
                        <button type="button" className="recall-story" onClick={() => onOpenStory(s.id)}>
                          <span className="recall-story-top">
                            <span className="recall-story-keyword">{s.keyword}</span>
                            {late && missedStory(self, s) && <span className="recall-story-missed">Before you joined</span>}
                          </span>
                          <span className="recall-story-summary">
                            {s.summary}
                            {others.length > 0 && <span className="recall-story-with"> With {others.join(', ')}.</span>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
      {caption && (
        <p className={caption.live ? 'recall-caption is-live' : 'recall-caption'} aria-live="off">
          <span className="recall-caption-name">{caption.name}</span> {caption.text}
        </p>
      )}
    </div>
  )
}
