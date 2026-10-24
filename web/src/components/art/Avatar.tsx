// One original cartoon avatar, varied by color, expression and accessory.
// Bold ink outline, rounded shapes, a soft inner shade and a highlight (2.5D vector-cartoon style).
import { useId } from 'react'

export type Expression = 'laugh' | 'surprise' | 'curious' | 'smile' | 'wink'
export type Accessory = 'none' | 'bow' | 'glasses' | 'beanie' | 'headphones' | 'sprout'

export interface AvatarLook {
  color: string
  expression: Expression
  accessory: Accessory
}

const INK = 'var(--gw-color-ink)'

function Face({ expression }: { expression: Expression }) {
  switch (expression) {
    case 'laugh':
      return (
        <g>
          <path d="M33 50 q5 -7 10 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M57 50 q5 -7 10 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M36 60 q14 20 28 0 z" fill={INK} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M43 67 q7 6 14 0 q-7 -4 -14 0z" fill="var(--gw-color-pink)" />
        </g>
      )
    case 'surprise':
      return (
        <g>
          <circle cx="39" cy="50" r="6" fill="var(--gw-color-white)" stroke={INK} strokeWidth="3" />
          <circle cx="61" cy="50" r="6" fill="var(--gw-color-white)" stroke={INK} strokeWidth="3" />
          <circle cx="40" cy="51" r="2.6" fill={INK} />
          <circle cx="62" cy="51" r="2.6" fill={INK} />
          <path d="M33 40 q5 -4 10 -2 M57 38 q5 -2 10 2" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="50" cy="67" rx="5" ry="6.5" fill={INK} />
        </g>
      )
    case 'curious':
      return (
        <g>
          <circle cx="39" cy="51" r="3.4" fill={INK} />
          <circle cx="61" cy="50" r="3.4" fill={INK} />
          <path d="M33 43 q5 -2 10 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M56 38 q6 -5 11 -1" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M44 66 q7 3 13 -2" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )
    case 'wink':
      return (
        <g>
          <circle cx="39" cy="51" r="3.4" fill={INK} />
          <path d="M56 51 q5 -5 10 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M39 62 q11 10 22 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )
    case 'smile':
      return (
        <g>
          <circle cx="39" cy="51" r="3.4" fill={INK} />
          <circle cx="61" cy="51" r="3.4" fill={INK} />
          <path d="M39 62 q11 10 22 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )
  }
}

function Accessory({ accessory, color }: { accessory: Accessory; color: string }) {
  switch (accessory) {
    case 'bow':
      return (
        <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M64 20 l-10 -9 v18 z" fill="var(--gw-color-coral)" />
          <path d="M64 20 l10 -9 v18 z" fill="var(--gw-color-coral)" />
          <circle cx="64" cy="20" r="4" fill="var(--gw-color-coral)" />
        </g>
      )
    case 'glasses':
      return (
        <g fill="color-mix(in srgb, var(--gw-color-white) 35%, transparent)" stroke={INK} strokeWidth="3">
          <circle cx="39" cy="50" r="9" />
          <circle cx="61" cy="50" r="9" />
          <path d="M48 50 h4" />
        </g>
      )
    case 'beanie':
      return (
        <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M20 34 q30 -36 60 0 z" fill="var(--gw-color-yellow)" />
          <rect x="17" y="30" width="66" height="10" rx="5" fill="var(--gw-color-coral)" />
          <circle cx="50" cy="8" r="5" fill="var(--gw-color-coral)" />
        </g>
      )
    case 'headphones':
      return (
        <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M16 52 q0 -38 34 -38 q34 0 34 38" fill="none" strokeWidth="4" />
          <rect x="9" y="46" width="12" height="20" rx="5" fill="var(--gw-color-violet)" />
          <rect x="79" y="46" width="12" height="20" rx="5" fill="var(--gw-color-violet)" />
        </g>
      )
    case 'sprout':
      return (
        <g stroke={INK} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
          <path d="M50 17 v-8" fill="none" />
          <path d="M50 10 q-12 -8 -16 2 q10 4 16 -2z" fill="var(--gw-color-mint)" />
          <path d="M50 10 q12 -8 16 2 q-10 4 -16 -2z" fill={color} />
        </g>
      )
    case 'none':
      return null
  }
}

interface Props {
  look: AvatarLook
  size?: number
  className?: string
}

/** Decorative unless the parent gives it a label. */
export default function Avatar({ look, size = 48, className }: Props) {
  const clip = useId()
  const tilt = look.expression === 'curious' ? -7 : 0
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      style={{ overflow: 'visible' }}
    >
      <g transform={`rotate(${tilt} 50 56)`}>
        <defs>
          <clipPath id={clip}>
            <circle cx="50" cy="56" r="36" />
          </clipPath>
        </defs>
        <circle cx="50" cy="56" r="36" fill={look.color} />
        <g clipPath={`url(#${clip})`}>
          <ellipse cx="62" cy="88" rx="44" ry="24" fill="color-mix(in srgb, var(--gw-color-ink) 14%, transparent)" />
          <ellipse cx="36" cy="34" rx="12" ry="7" fill="color-mix(in srgb, var(--gw-color-white) 55%, transparent)" transform="rotate(-25 36 34)" />
        </g>
        <circle cx="50" cy="56" r="36" fill="none" stroke={INK} strokeWidth="4" />
        <ellipse cx="29" cy="62" rx="5.5" ry="3.5" fill="var(--gw-color-pink)" opacity="0.85" />
        <ellipse cx="71" cy="62" rx="5.5" ry="3.5" fill="var(--gw-color-pink)" opacity="0.85" />
        <Face expression={look.expression} />
        <Accessory accessory={look.accessory} color={look.color} />
      </g>
    </svg>
  )
}

/** The avatars a person can pick on the Join screen. Kept in memory on this phone only. */
export const AVATAR_CHOICES: Array<AvatarLook & { id: string; label: string }> = [
  { id: 'sunny', label: 'Sunny, laughing, with a bow', color: 'var(--gw-color-yellow)', expression: 'laugh', accessory: 'bow' },
  { id: 'mint', label: 'Mint, curious, with glasses', color: 'var(--gw-color-mint)', expression: 'curious', accessory: 'glasses' },
  { id: 'coral', label: 'Coral, surprised, in a beanie', color: 'var(--gw-color-coral)', expression: 'surprise', accessory: 'beanie' },
  { id: 'lilac', label: 'Lilac, smiling, with headphones', color: 'var(--gw-color-lilac)', expression: 'smile', accessory: 'headphones' },
  { id: 'peach', label: 'Peach, winking, with a sprout', color: 'var(--gw-color-peach)', expression: 'wink', accessory: 'sprout' },
  { id: 'pink', label: 'Pink, smiling', color: 'var(--gw-color-pink)', expression: 'smile', accessory: 'none' },
]
