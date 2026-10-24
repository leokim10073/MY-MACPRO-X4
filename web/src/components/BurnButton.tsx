import { useEffect, useRef, useState } from 'react'

const CONFIRM_MS = 4000

// Two taps to burn: the first arms it, the second (within 4 s) fires.
export default function BurnButton({ onBurn }: { onBurn: () => void }) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  function tap() {
    clearTimeout(timer.current)
    if (armed) {
      setArmed(false)
      onBurn()
      return
    }
    setArmed(true)
    timer.current = setTimeout(() => setArmed(false), CONFIRM_MS)
  }

  return (
    <button type="button" className={armed ? 'burn burn-armed' : 'burn'} onClick={tap}>
      {armed ? 'Tap again to burn' : 'Burn room'}
    </button>
  )
}
