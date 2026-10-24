import { useEffect, useId, useRef } from 'react'
import type { Member, Person, Story } from '../../../shared/schema'

interface Props {
  story: Story
  people: Person[]
  self: Member
  onClose(): void
}

export default function StoryCard({ story, people, self, onClose }: Props) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const names = story.personIds
    .map((id) => people.find((p) => p.id === id)?.name)
    .filter((n): n is string => Boolean(n))
  const cameUpBefore = story.firstSeq <= self.joinedAtSeq

  return (
    <section
      className="story-card"
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <h2 ref={headingRef} tabIndex={-1} className="story-title">
        <span id={headingId}>{story.keyword}</span>
        {names.length > 0 && <span className="story-about">About {names.join(', ')}</span>}
      </h2>
      <p className="story-summary">{story.summary}</p>
      {story.reactions.length > 0 && (
        <section aria-label="How friends reacted">
          <h3>How friends reacted</h3>
          <ul className="story-list">
            {story.reactions.map((r, i) => (
              <li key={i}>{`${r.memberName}: "${r.quote}"`}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="story-when">
        {cameUpBefore ? 'Came up before you joined' : 'Came up after you joined'}
      </p>
      {story.openQuestion && (
        <section aria-label="Still open">
          <h3>Still open</h3>
          <p>{story.openQuestion}</p>
        </section>
      )}
      {story.speculation.length > 0 && (
        <section className="story-guesses" data-kind="guess" aria-label="Guesses">
          <h3 className="story-guess-label">Guess</h3>
          <ul className="story-list">
            {story.speculation.map((s, i) => (
              <li key={i}>{`${s.memberName}: ${s.text}`}</li>
            ))}
          </ul>
        </section>
      )}
      <button type="button" className="story-close" onClick={onClose}>
        Close
      </button>
    </section>
  )
}
