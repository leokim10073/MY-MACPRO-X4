import type { Id, Person, Story } from '../../../shared/schema'
import { RECALL_CHIP_TIMEOUT_MS } from '../../../shared/schema'

interface Props {
  person: Person
  chips: Story[]
  focusStoryId: Id | undefined
  onChip(id: Id): void
  onDismiss(): void
  /** One-time nudge on the first pop-up, for people who've never seen the app. */
  hint?: boolean
}

export default function RecallPopup({ person, chips, focusStoryId, onChip, onDismiss, hint = false }: Props) {
  return (
    <section
      className="recall-popup"
      aria-label="Mentioned again"
      style={{ animationDuration: `${RECALL_CHIP_TIMEOUT_MS}ms` }}
    >
      <div className="recall-head">
        <span className="recall-label">Quick context</span>
        <strong className="recall-name">{person.name}</strong>
        <button type="button" className="recall-dismiss" aria-label="Dismiss" onClick={onDismiss}>
          {/* Restarts with the pop-up: a new focus remounts it with a fresh timeout. */}
          <svg className="recall-countdown" viewBox="0 0 36 36" aria-hidden="true">
            <circle className="recall-countdown-track" cx="18" cy="18" r="15" />
            <circle
              className="recall-countdown-ring"
              cx="18"
              cy="18"
              r="15"
              pathLength={100}
              style={{ animationDuration: `${RECALL_CHIP_TIMEOUT_MS}ms` }}
            />
          </svg>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="recall-chips">
        {chips.map((s) => (
          <button
            key={s.id}
            type="button"
            className="recall-chip"
            aria-current={s.id === focusStoryId ? 'true' : undefined}
            onClick={() => onChip(s.id)}
          >
            {s.keyword}
          </button>
        ))}
      </div>
      {hint && <p className="recall-hint">Tap a word to see the story</p>}
    </section>
  )
}
