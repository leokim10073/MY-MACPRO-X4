import type { Recap } from '../../../shared/schema'

interface Props {
  recap: Recap | undefined
  isLatecomer: boolean
  onDismiss: () => void
}

export default function RecapBanner({ recap, isLatecomer, onDismiss }: Props) {
  if (!isLatecomer) return null

  // Audio playback (recap.audioUrl) comes in Phase 2.
  return (
    <section className="recap-banner" aria-label="Catch-up">
      <div className="recap-head">
        <h2>While you were away</h2>
        <button type="button" className="recap-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {recap ? (
        <p className="recap-text">{recap.text}</p>
      ) : (
        <p className="recap-text recap-loading">Catching you up…</p>
      )}
    </section>
  )
}
