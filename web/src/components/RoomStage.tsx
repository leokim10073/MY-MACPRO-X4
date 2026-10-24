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
        <div className="stage-avatars" role="group" aria-label="People in the room">
          {ordered.map((m) => {
            const me = isMe(m, self)
            const talking = m.id === speaker?.id
            const host = m.id === hostId
            const label = `${m.name}${me ? ' (you)' : ''}${host ? ', host' : ''}${talking ? ', speaking' : ''}`
            return (
              <span
                key={m.id}
                role="img"
                aria-label={label}
                className={['avatar', me && 'me', talking && 'speaking'].filter(Boolean).join(' ')}
              >
                <Avatar look={lookOf(m.id)} size={34} />
                {host && (
                  <span className="avatar-host" aria-hidden="true">
                    Host
                  </span>
                )}
                {me && <span className="avatar-you" aria-hidden="true">You</span>}
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
