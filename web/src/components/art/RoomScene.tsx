// A miniature social room seen through a thick window frame. Purely decorative (aria-hidden):
// it illustrates the idea and never shows real or fake room activity.
import Avatar from './Avatar'
import { TeacupShape } from './Teacup'

const INK = 'var(--gw-color-ink)'

function Star({ x, y, s = 1, fill = 'var(--gw-color-yellow)' }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -12 q2.5 9.5 12 12 q-9.5 2.5 -12 12 q-2.5 -9.5 -12 -12 q9.5 -2.5 12 -12z"
      fill={fill}
      stroke={INK}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
  )
}

function Bubble({ x, y, w, text, tail = 'left' }: { x: number; y: number; w: number; text: string; tail?: 'left' | 'right' }) {
  const tx = tail === 'left' ? x + 16 : x + w - 16
  return (
    <g>
      <path
        d={`M${tx - 7} ${y + 34} l${tail === 'left' ? -6 : 6} 12 l${tail === 'left' ? 14 : -14} -12z`}
        fill="var(--gw-color-card)"
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect x={x} y={y} width={w} height="36" rx="18" fill="var(--gw-color-card)" stroke={INK} strokeWidth="3" />
      <path d={`M${tx - 6} ${y + 33} h12`} stroke="var(--gw-color-card)" strokeWidth="4" />
      <text
        x={x + w / 2}
        y={y + 24}
        textAnchor="middle"
        fontFamily="var(--gw-font-display)"
        fontWeight="600"
        fontSize="17"
        fill={INK}
      >
        {text}
      </text>
    </g>
  )
}

/** Wide scene, 600×320. The phone layout shows a shallow middle band of it. */
export default function RoomScene({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 320"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* window frame and room */}
      <rect x="6" y="6" width="588" height="308" rx="34" fill="var(--gw-color-lavender)" stroke={INK} strokeWidth="5" />
      <rect x="26" y="26" width="548" height="268" rx="20" fill="var(--gw-color-room)" stroke={INK} strokeWidth="4" />
      {/* wall stripes and floor rug */}
      <path d="M26 200 h548" stroke={INK} strokeWidth="3" opacity="0.18" />
      <ellipse cx="300" cy="262" rx="230" ry="30" fill="var(--gw-color-mint)" stroke={INK} strokeWidth="3.5" />
      {/* curtains */}
      <path d="M28 30 q60 10 70 120 q-30 -6 -70 -2z" fill="var(--gw-color-coral)" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M572 30 q-60 10 -70 120 q30 -6 70 -2z" fill="var(--gw-color-coral)" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />

      <Star x={150} y={60} s={1} />
      <Star x={455} y={52} s={0.8} fill="var(--gw-color-pink)" />
      <Star x={300} y={40} s={0.6} />
      <Star x={520} y={190} s={0.7} fill="var(--gw-color-mint)" />

      {/* friends reacting */}
      <g transform="translate(46 150)">
        <Avatar look={{ color: 'var(--gw-color-yellow)', expression: 'laugh', accessory: 'bow' }} size={104} />
      </g>
      <g transform="translate(146 128)">
        <Avatar look={{ color: 'var(--gw-color-coral)', expression: 'surprise', accessory: 'beanie' }} size={96} />
      </g>
      <g transform="translate(386 132)">
        <Avatar look={{ color: 'var(--gw-color-mint)', expression: 'curious', accessory: 'glasses' }} size={96} />
      </g>
      <g transform="translate(470 160)">
        <Avatar look={{ color: 'var(--gw-color-lilac)', expression: 'smile', accessory: 'headphones' }} size={92} />
      </g>

      {/* the tea, on a little table */}
      <rect x="262" y="214" width="80" height="16" rx="8" fill="var(--gw-color-yellow)" stroke={INK} strokeWidth="3.5" />
      <path d="M282 230 v26 M322 230 v26" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <g transform="translate(244 112)">
        <TeacupShape />
      </g>

      <Bubble x={64} y={86} w={86} text="no way" />
      <Bubble x={170} y={70} w={52} text="!!" />
      <Bubble x={410} y={76} w={110} text="wait, who?" tail="right" />
    </svg>
  )
}
