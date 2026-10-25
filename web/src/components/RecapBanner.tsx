import type { Recap } from '../../../shared/schema'

interface Props {
  recap: Recap | undefined
  isLatecomer: boolean
  onDismiss: () => void
  collapsed?: boolean
  onExpand?: () => void
  /** The narrated recap started or stopped playing (the call lowers friends' voices meanwhile). */
  onPlayingChange?: (playing: boolean) => void
}

export default function RecapBanner({ recap, isLatecomer, onDismiss, collapsed, onExpand, onPlayingChange }: Props) {
  if (!isLatecomer) return null

  if (collapsed) {
    return (
      <button type="button" className="recap-toggle" onClick={onExpand}>
        Catch me up
      </button>
    )
  }

  return (
    <section className="recap-banner" aria-label="Catch-up">
      <div className="recap-head">
        <div>
          <h2>Just joined?</h2>
          <p className="recap-sub">Get the story so far.</p>
        </div>
        <button type="button" className="recap-dismiss gw-btn gw-btn--quiet" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {recap ? (
        <>
          {recap.audioUrl && (
            // Phones may block autoplay; the controls let the latecomer start it with a tap.
            <audio
              className="recap-audio"
              src={recap.audioUrl}
              controls
              autoPlay
              preload="auto"
              onPlay={() => onPlayingChange?.(true)}
              onPause={() => onPlayingChange?.(false)}
              onEnded={() => onPlayingChange?.(false)}
            />
          )}
          <p className="recap-text">{recap.text}</p>
        </>
      ) : (
        <p className="recap-text recap-loading" aria-live="polite">Catching you up…</p>
      )}
    </section>
  )
}
