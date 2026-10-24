import { useLayoutEffect, useRef } from 'react'
import type { TranscriptLine } from '../../../shared/schema'

interface Props {
  lines: TranscriptLine[]
  fromSeq: number
}

const NEAR_BOTTOM_PX = 40

export default function Transcript({ lines, fromSeq }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const visible = lines.filter((l) => l.seq > fromSeq)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [visible.length])

  function onScroll() {
    const el = ref.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
  }

  return (
    <div className="transcript" ref={ref} onScroll={onScroll} aria-live="polite">
      {visible.length === 0 ? (
        <p className="transcript-empty">Waiting for someone to speak…</p>
      ) : (
        <ol>
          {visible.map((l) => (
            <li key={l.id}>
              <span className="speaker">{l.speakerName}</span>
              <span className="text">{l.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
