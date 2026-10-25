import { useCallback, useLayoutEffect, useRef } from 'react'
import type { Id, Member } from '../../../shared/schema'
import { isMe, orderMembersForStage } from '../room/derived'
import Avatar, { AVATAR_CHOICES, type AvatarLook } from './art/Avatar'

interface Speaker {
  id: Id
  name: string
}

interface Props {
  members: Member[]
  self: Member
  /** Speaking right now, from a SpeakingSignal. */
  speaker: Speaker | null
  /** Who said the newest line, shown dimmed when nobody is speaking now. */
  lastSpeaker: Speaker | null
  /** Avatar row only, for when a story card needs the room. */
  compact?: boolean
  /** The avatar I picked on Join (this phone only). Without it I get the illustrated fallback too. */
  selfLook?: AvatarLook
  /** The room's host, marked with a small Host badge. */
  hostId?: Id
}

// Other people's picks aren't shared between phones, so everyone else gets a stable illustrated look picked
// from their id. Presentational only.
function lookFor(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_CHOICES[h % AVATAR_CHOICES.length]
}

// Instagram Live-style stage: a big tile for whoever is speaking, then a row of everyone.
export default function RoomStage({ members, self, speaker, lastSpeaker, compact = false, selfLook, hostId }: Props) {
  const lookOf = (id: Id) => (id === self.id && selfLook ? selfLook : lookFor(id))
  const ordered = orderMembersForStage(members, self, speaker?.id ?? null)
  const shown = speaker ?? lastSpeaker
  const count = members.length

  // When the row overflows, fade whichever edge still has people scrolled past it.
  // Written straight to data attributes so scrolling doesn't re-render the stage.
  const rowRef = useRef<HTMLDivElement>(null)
  const updateFade = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    el.toggleAttribute('data-fade-start', el.scrollLeft > 1)
    el.toggleAttribute('data-fade-end', el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])
  useLayoutEffect(() => {
    updateFade()
    const el = rowRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const resize = new ResizeObserver(updateFade)
    resize.observe(el)
    return () => resize.disconnect()
  }, [updateFade, count])

  return (
    <section className={compact ? 'room-stage compact' : 'room-stage'} aria-label="Who's here">
      {!compact && (
        <div className={speaker ? 'stage-speaker' : 'stage-speaker quiet'} data-testid="stage-speaker">
          <div className="stage-big-avatar" aria-hidden="true">
            {shown ? <Avatar look={lookOf(shown.id)} size={48} /> : <span className="stage-empty-seat" />}
          </div>
          <div className="stage-speaker-text">
            {shown ? (
              <>
                <strong>{shown.name}</strong>
                <span className="stage-status">{speaker ? 'speaking…' : 'last spoke'}</span>
              </>
            ) : (
              <span className="stage-status">Nobody has spoken yet</span>
            )}
          </div>
          <div className="stage-meta">
            <span>{count} in the room</span>
            <span>
              You're <strong>{self.name}</strong>
            </span>
          </div>
        </div>
      )}
      <div className="stage-row">
        <div
          ref={rowRef}
          className="stage-avatars"
          role="group"
          aria-label="People in the room"
          onScroll={updateFade}
        >
          {ordered.map((m) => {
            const me = isMe(m, self)
            const talking = m.id === speaker?.id
            const host = m.id === hostId
            const label = `${m.name}${host ? ', host' : ''}${me ? ', you' : ''}${talking ? ', speaking' : ''}`
            // One fixed-width slot per person: avatar, then their name, so look-alike avatars can be told apart.
            // The slot's label carries the full name; the visible name is hidden from screen readers.
            return (
              <span key={m.id} role="img" aria-label={label} title={m.name} className="stage-slot">
                <span className={['avatar', me && 'me', talking && 'speaking'].filter(Boolean).join(' ')}>
                  <Avatar look={lookOf(m.id)} size={34} />
                  {host && (
                    <span className="avatar-host" aria-hidden="true">
                      Host
                    </span>
                  )}
                </span>
                <span className={me ? 'stage-name me' : 'stage-name'} aria-hidden="true">
                  {me ? 'You' : m.name}
                </span>
              </span>
            )
          })}
        </div>
        {/* Shown in compact mode, and by CSS on short screens where the big tile is hidden. */}
        <span className="stage-count">{count} here</span>
      </div>
    </section>
  )
}
