import type { Id, Person, Story } from '../../../shared/schema'
import { RECALL_CHIP_TIMEOUT_MS } from '../../../shared/schema'

interface Props {
  person: Person
  chips: Story[]
  focusStoryId: Id | undefined
  onChip(id: Id): void
  onDismiss(): void
}

export default function RecallPopup({ person, chips, focusStoryId, onChip, onDismiss }: Props) {
  return (
    <section
      className="recall-popup"
      aria-label="Mentioned again"
      style={{ animationDuration: `${RECALL_CHIP_TIMEOUT_MS}ms` }}
    >
      <div className="recall-head">
        <strong className="recall-name">{person.name}</strong>
        <button type="button" className="recall-dismiss" aria-label="Dismiss" onClick={onDismiss}>
          ×
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
    </section>
  )
}
