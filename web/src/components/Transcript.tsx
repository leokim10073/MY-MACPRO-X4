import { useEffect, useLayoutEffect, useRef } from 'react'
import type { TranscriptLine } from '../../../shared/schema'

/** What a friend in the call is saying right now; replaced by their real line when it arrives. */
export interface LiveLine {
  id: string
  name: string
  text: string
}

interface Props {
  lines: TranscriptLine[]
  fromSeq: number
  live?: LiveLine[]
}

const NEAR_BOTTOM_PX = 40

export default function Transcript({ lines, fromSeq, live = [] }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const visible = lines.filter((l) => l.seq > fromSeq)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [visible.length, live.length])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function onScroll() {
    const el = ref.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
  }

  return (
    <div className="transcript" ref={ref} onScroll={onScroll} aria-live="polite">
      {visible.length === 0 && live.length === 0 ? (
        <p className="transcript-empty">Waiting for someone to speak…</p>
      ) : (
        <ol>
          {visible.map((l) => (
            <li key={l.id}>
              <span className="speaker">{l.speakerName}</span>
              <span className="text">{l.text}</span>
            </li>
          ))}
          {live.map((l) => (
            <li key={`live-${l.id}`} className="line-live" aria-live="off">
              <span className="speaker">{l.name}</span>
              <span className="text">{l.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
