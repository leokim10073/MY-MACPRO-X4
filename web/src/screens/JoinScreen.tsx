import { useRef, useState, type FormEvent } from 'react'
import '../theme/tokens.css'
import './join.css'
import Avatar, { AVATAR_CHOICES } from '../components/art/Avatar'
import RoomScene from '../components/art/RoomScene'
import WindowLogo from '../components/art/WindowLogo'
import HowItWorks from '../components/HowItWorks'

// Checked against the backend: speech goes from the phone to speech-to-text and only text is
// stored; burn deletes transcripts, stories, recaps (and the narrated recap audio). Nicknames
// and the room record stay, so this says "the conversation", not "the room".
export const AI_NOTICE =
  "AI processes the conversation to create transcripts and catch-ups. Your voice becomes text as you talk; the recording isn't saved. The host can delete the conversation anytime."

interface Props {
  inviteToken?: string
  onCreate(name: string): void
  onJoin(token: string, name: string): void
  error?: { kind: string; message: string } | null
  pending?: boolean
  /** Where "Try the offline demo" goes; set only when running on the real backend. */
  offlineDemoHref?: string
}

export default function JoinScreen({ inviteToken, onCreate, onJoin, error, pending = false, offlineDemoHref }: Props) {
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  // After leaving, the invite link is often still in the URL; let people start their own room instead.
  const [createInstead, setCreateInstead] = useState(false)
  // The chosen avatar lives in memory on this phone only (no avatar field exists in the shared schema yet).
  const [avatarId, setAvatarId] = useState(AVATAR_CHOICES[0].id)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const howButton = useRef<HTMLButtonElement>(null)

  const joining = !!inviteToken && !createInstead
  const trimmed = name.trim()
  const avatar = AVATAR_CHOICES.find((a) => a.id === avatarId) ?? AVATAR_CHOICES[0]
  const showMissingName = touched && !trimmed && !pending

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!trimmed) return
    if (joining) onJoin(inviteToken, trimmed)
    else onCreate(trimmed)
  }

  function closeHow() {
    setHowOpen(false)
    howButton.current?.focus()
  }

  return (
    <main className="gw-join">
      <div className="gw-join__shell">
        <header className="gw-join__top">
          <div className="gw-brand">
            <WindowLogo size={40} />
            <span className="gw-wordmark">Gossip Window</span>
          </div>
          <button
            type="button"
            ref={howButton}
            className="gw-how-link"
            aria-expanded={howOpen}
            aria-controls="how-it-works"
            onClick={() => (howOpen ? closeHow() : setHowOpen(true))}
          >
            How it works
          </button>
        </header>

        {howOpen && <HowItWorks id="how-it-works" onClose={closeHow} />}

        <div className="gw-join__grid">
          <section className="gw-hero">
            <p className="gw-eyebrow">The group chat, out loud</p>
            <h1 className="gw-headline">Your friends brought the tea</h1>
            <p className="gw-lede">Jump into the voice room. Arriving late? AI catches you up.</p>
            <div className="gw-scene">
              <RoomScene className="gw-scene__art" />
            </div>
          </section>

          <section className="gw-console" aria-labelledby="console-title">
            <span className="gw-tab" aria-hidden="true">
              Room lobby
            </span>
            <div className="gw-card">
              <div className="gw-card__head">
                <h2 id="console-title" className="gw-card__title">
                  {joining ? "You've got an invite" : 'Your room starts with you'}
                </h2>
                {/* Real facts only: this is an invite link. The room's name, who's in it and how
                    many can't be known before joining, so none of that is shown. */}
                {joining && <span className="gw-pill">Invite link</span>}
              </div>
              <p className="gw-card__sub">
                {joining ? 'Pick a nickname to hop in.' : 'Pick a nickname, then share the invite link.'}
              </p>

              {/* A new room: you, plus open seats for the friends you'll invite. */}
              {!joining && (
                <div className="gw-lobby" aria-hidden="true">
                  <span key={avatar.id} className={pending ? 'gw-seat gw-seat--me is-entering' : 'gw-seat gw-seat--me'}>
                    <Avatar look={avatar} size={36} />
                  </span>
                  {[1, 2, 3].map((n) => (
                    <span key={n} className="gw-seat gw-seat--empty" />
                  ))}
                  <span className="gw-pill gw-pill--end">New room</span>
                </div>
              )}

              <form className="gw-form" noValidate onSubmit={submit}>
                <div className="gw-field-row">
                  <button
                    type="button"
                    className={pending ? 'gw-avatar-button is-entering' : 'gw-avatar-button'}
                    aria-label={`Avatar: ${avatar.label}. Change avatar`}
                    aria-expanded={pickerOpen}
                    aria-controls="avatar-picker"
                    onClick={() => setPickerOpen((open) => !open)}
                  >
                    <Avatar key={avatar.id} look={avatar} size={52} className="gw-avatar-button__art" />
                    <span className="gw-avatar-button__edit" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 16 16">
                        <path d="M3 11.5 L11 3.5 l1.8 1.8 L4.8 13.3 H3z" fill="currentColor" />
                      </svg>
                    </span>
                  </button>
                  <div className="gw-field">
                    <label htmlFor="nickname" className="gw-label">
                      Nickname
                    </label>
                    <input
                      id="nickname"
                      className="gw-input"
                      type="text"
                      autoComplete="off"
                      maxLength={30}
                      value={name}
                      placeholder="Leo"
                      aria-invalid={showMissingName || undefined}
                      aria-describedby={showMissingName ? 'nickname-error disclosure' : 'disclosure'}
                      onChange={(e) => {
                        setName(e.target.value)
                        setTouched(true)
                      }}
                      onBlur={() => setTouched(true)}
                    />
                  </div>
                </div>

                {pickerOpen && (
                  <fieldset id="avatar-picker" className="gw-picker">
                    <legend className="gw-picker__legend">Choose your avatar (optional)</legend>
                    <div className="gw-picker__options">
                      {AVATAR_CHOICES.map((a) => (
                        <label key={a.id} className="gw-picker__option">
                          <input
                            type="radio"
                            name="avatar"
                            value={a.id}
                            checked={a.id === avatarId}
                            onChange={() => setAvatarId(a.id)}
                            aria-label={a.label}
                          />
                          <Avatar look={a} size={44} />
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {showMissingName && (
                  <p id="nickname-error" className="gw-field-error">
                    Add a nickname so friends know who's talking.
                  </p>
                )}

                <p id="disclosure" className="gw-disclosure">
                  {AI_NOTICE}
                </p>

                {error && (
                  <p role="alert" className="gw-error">
                    {error.message}
                    {error.kind === 'unreachable' && offlineDemoHref && (
                      <>
                        {' '}
                        <a href={offlineDemoHref}>Try the offline demo</a>
                      </>
                    )}
                  </p>
                )}

                <button type="submit" className="gw-cta" disabled={!trimmed || pending} aria-busy={pending || undefined}>
                  {pending ? (
                    joining ? 'Joining…' : 'Starting…'
                  ) : joining ? (
                    <>
                      Join the room <span aria-hidden="true">→</span>
                    </>
                  ) : (
                    'Start the party'
                  )}
                </button>

                {joining && (
                  <button type="button" className="gw-text-button" onClick={() => setCreateInstead(true)}>
                    Create a new room instead
                  </button>
                )}
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
