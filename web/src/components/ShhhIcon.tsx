interface Props {
  size: number
  /** Finger drifts up and the ring contracts on a slow loop. Off under prefers-reduced-motion. */
  animated?: boolean
}

export default function ShhhIcon({ size, animated = false }: Props) {
  return (
    <svg
      className={animated ? 'shhh-icon shhh-icon-animated' : 'shhh-icon'}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke="var(--br-ivory)"
      strokeWidth={size > 60 ? 1.6 : 2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle className="shhh-ring" cx="32" cy="32" r="29.5" strokeOpacity="0.5" />
      <path d="M17 39 Q24.5 34.5 32 37.5 Q39.5 34.5 47 39" />
      <path d="M17 39 Q32 49 47 39" />
      <g className="shhh-finger">
        <path d="M28 52 V20.5 a4 4 0 0 1 8 0 V52" fill="var(--br-charcoal)" />
        <path d="M29.4 18.8 a2.8 2.8 0 0 1 5.2 0" stroke="var(--br-ember)" strokeWidth="3" />
      </g>
    </svg>
  )
}
