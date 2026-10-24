import type { Recap } from '../../../shared/schema'

interface Props {
  recap: Recap | undefined
  isLatecomer: boolean
  onDismiss: () => void
  collapsed?: boolean
  onExpand?: () => void
}

export default function RecapBanner({ recap, isLatecomer, onDismiss, collapsed, onExpand }: Props) {
  if (!isLatecomer) return null

  if (collapsed) {
    return (
      <button type="button" className="recap-toggle" onClick={onExpand}>
        Catch-up (tap to show)
      </button>
    )
  }

  return (
    <section className="recap-banner" aria-label="Catch-up">
      <div className="recap-head">
        <h2>While you were away</h2>
        <button type="button" className="recap-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {recap ? (
        <>
          {recap.audioUrl && (
            // Phones may block autoplay; the controls let the latecomer start it with a tap.
            <audio className="recap-audio" src={recap.audioUrl} controls autoPlay preload="auto" />
          )}
          <p className="recap-text">{recap.text}</p>
        </>
      ) : (
        <p className="recap-text recap-loading" aria-live="polite">Catching you up…</p>
      )}
    </section>
  )
}
