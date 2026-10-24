import { useEffect, useRef, useState } from 'react'
import LastSipCup from './art/LastSipCup'

interface Props {
  pending: boolean
  onBurn: () => void
  onKeep: () => void
}

// Asks before ending the room (Last Sip): a sheet on phones, a card on wider screens.
// Keep chatting gets focus, so a stray Enter keeps the room.
// While the burn is in flight the Burn button is disabled, so a double tap calls onBurn once.
export default function BurnConfirm({ pending, onBurn, onKeep }: Props) {
  const keep = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  // Latch: once onBurn has fired, further taps do nothing, even before the parent re-renders with pending.
  // Re-armed if the burn finishes (pending true -> false) while the sheet is still open, e.g. after a failure.
  const [latched, setLatched] = useState(false)
  const [wasPending, setWasPending] = useState(pending)
  if (wasPending !== pending) {
    setWasPending(pending)
    if (wasPending && !pending) setLatched(false)
  }
  function burn() {
    if (latched) return
    setLatched(true)
    onBurn()
  }
  useEffect(() => keep.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onKeep()
      if (e.key !== 'Tab') return
      // aria-modal: keep Tab inside the sheet, cycling over its enabled buttons.
      const buttons = Array.from(sheet.current?.querySelectorAll('button:not(:disabled)') ?? []) as HTMLElement[]
      if (buttons.length === 0) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      const active = document.activeElement
      const inside = !!active && !!sheet.current?.contains(active)
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onKeep])

  return (
    <div className="burn-scrim gw-scrim" onClick={onKeep}>
      <div
        ref={sheet}
        className="burn-sheet gw-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="burn-title"
        onClick={(e) => e.stopPropagation()}
      >
        <LastSipCup size={112} mood={pending ? 'pending' : 'waiting'} className="burn-sheet-cup" />
        <h2 id="burn-title">Ready for the last sip?</h2>
        <p>
          End this room for everyone and permanently delete its conversation, transcript, and AI catch-ups. This can't
          be undone.
        </p>
        <div className="burn-sheet-actions gw-dialog-actions">
          <button type="button" ref={keep} className="burn-keep gw-btn gw-btn--quiet" onClick={onKeep}>
            Keep chatting
          </button>
          <button type="button" className="burn-go gw-btn gw-btn--peach" onClick={burn} disabled={pending}>
            {pending ? 'Ending room…' : 'End & delete room'}
          </button>
        </div>
      </div>
    </div>
  )
}
