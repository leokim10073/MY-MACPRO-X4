import { useEffect, useRef } from 'react'

interface Props {
  pending: boolean
  onBurn: () => void
  onKeep: () => void
}

// Bottom sheet that asks before burning. Keep talking gets focus, so a stray Enter keeps the room.
// While the burn is in flight the Burn button is disabled, so a double tap calls onBurn once.
export default function BurnConfirm({ pending, onBurn, onKeep }: Props) {
  const keep = useRef<HTMLButtonElement>(null)
  useEffect(() => keep.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onKeep()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onKeep])

  return (
    <div className="burn-scrim" onClick={onKeep}>
      <div
        className="burn-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="burn-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="burn-title">Burn this room for everyone?</h2>
        <p>
          This ends the conversation for everyone and deletes its transcript, stories and catch-ups. People may still
          remember what was said.
        </p>
        <div className="burn-sheet-actions">
          <button type="button" ref={keep} className="burn-keep" onClick={onKeep}>
            Keep talking
          </button>
          <button type="button" className="burn-go" onClick={onBurn} disabled={pending}>
            {pending ? 'Burning…' : 'Burn room'}
          </button>
        </div>
      </div>
    </div>
  )
}
