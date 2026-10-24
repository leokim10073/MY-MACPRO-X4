import { useRef, useState, type PointerEvent } from 'react'

interface Props {
  onPressChange(down: boolean): void
}

export default function PushToTalkButton({ onPressChange }: Props) {
  const [pressed, setPressed] = useState(false)
  const activeId = useRef<number | null>(null)

  function down(e: PointerEvent<HTMLButtonElement>) {
    if (activeId.current !== null) return
    activeId.current = e.pointerId
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setPressed(true)
    onPressChange(true)
  }

  function release(e: PointerEvent<HTMLButtonElement>) {
    if (activeId.current === null || e.pointerId !== activeId.current) return
    activeId.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    setPressed(false)
    onPressChange(false)
  }

  return (
    <button
      type="button"
      className="ptt"
      aria-pressed={pressed}
      onPointerDown={down}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {pressed ? 'Talking…' : 'Hold to talk'}
    </button>
  )
}
