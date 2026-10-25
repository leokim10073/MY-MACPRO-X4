import { useEffect, useRef, useState } from 'react'
import { readInviteToken } from './config'
import { AVATAR_CHOICES } from './components/art/Avatar'
import WindowLogo from './components/art/WindowLogo'
import type { RoomClient } from './room/RoomClient'
import { inviteUrl, type ClientKind } from './room/createRoomClient'
import { useClosing } from './room/useClosing'
import { useRoom } from './room/useRoom'
import BurnedScreen from './screens/BurnedScreen'
import JoinScreen from './screens/JoinScreen'
import RoomScreen from './screens/RoomScreen'

interface Props {
  client: RoomClient
  kind: ClientKind
  search?: string
  /** Makes a fresh client after Leave. Without it, the Leave button isn't offered. */
  makeClient?: () => RoomClient
}

// Leaving disposes this phone's client and remounts everything under a new key,
// so the reducer, pop-up and recap state all start clean on a fresh client.
export default function App({ client, kind, search = window.location.search, makeClient }: Props) {
  const [session, setSession] = useState<{ key: number; client: RoomClient; search: string; autoCreate?: string }>({
    key: 0,
    client,
    search,
  })

  // Disposes this client and starts a fresh session. 'new-room' creates a room for `name` on mount;
  // both modes drop only `room` from the URL, so the old invite can't be reused.
  function restart(mode: 'new-room' | 'home', name?: string) {
    if (!makeClient) return
    session.client.dispose()
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.replaceState(window.history.state, '', url)
    const params = new URLSearchParams(session.search)
    params.delete('room')
    const rest = params.toString()
    setSession({
      key: session.key + 1,
      client: makeClient(),
      search: rest ? `?${rest}` : '',
      autoCreate: mode === 'new-room' ? name : undefined,
    })
  }

  function leave() {
    if (!makeClient) return
    // Tell the backend first (so other phones' people count drops), then close this client.
    // The screen resets at once; a failed leave call only means the count stays high.
    const old = session.client
    if (old.leave) {
      void old
        .leave()
        .catch(() => {})
        .finally(() => old.dispose())
    } else {
      old.dispose()
    }
    setSession({ key: session.key + 1, client: makeClient(), search: session.search })
  }

  return (
    <RoomSession
      key={session.key}
      client={session.client}
      kind={kind}
      search={session.search}
      autoCreate={session.autoCreate}
      onLeave={makeClient ? leave : undefined}
      onRestart={makeClient ? restart : undefined}
    />
  )
}

interface SessionProps {
  client: RoomClient
  kind: ClientKind
  search: string
  /** Nickname to create a room with once on mount (Start a new room). */
  autoCreate?: string
  onLeave?: () => void
  onRestart?: (mode: 'new-room' | 'home', name?: string) => void
}

function RoomSession({ client, kind, search, autoCreate, onLeave, onRestart }: SessionProps) {
  const { state, self, room, pending, error, connection, burnConfirmed, create, join, burn, addLine, startReplay } =
    useRoom(client)
  // The frozen copy of the last live room lives in memory only, and is dropped when the closing ends.
  const { closing, frozen, done } = useClosing(state, room?.id ?? null, burnConfirmed)
  const params = new URLSearchParams(search)
  // The avatar picked on Join, kept in memory on this phone only (never sent, never stored). A new session re-picks.
  const [avatarId, setAvatarId] = useState(AVATAR_CHOICES[0].id)
  // Start a new room: create once on mount. The ref survives StrictMode's second effect run.
  const autoCreated = useRef(false)
  useEffect(() => {
    if (autoCreate === undefined || autoCreated.current) return
    autoCreated.current = true
    void create(autoCreate)
  }, [autoCreate, create])

  if (!self) {
    // Creating the new room: show nothing from the Join form until it answers (or fails).
    if (autoCreate !== undefined && !error) {
      return (
        <main className="burned" aria-busy="true">
          <div className="burned-top" aria-hidden="true">
            <WindowLogo size={32} />
            <span className="burned-brand">Gossip Window</span>
          </div>
          <p role="status" className="sr-only">
            Creating room…
          </p>
        </main>
      )
    }
    return (
      <JoinScreen
        inviteToken={readInviteToken(search)}
        onCreate={(name) => void create(name)}
        onJoin={(token, name) => void join(token, name)}
        error={error}
        pending={pending === 'create' || pending === 'join'}
        offlineDemoHref={kind === 'convex' ? '?client=mock' : undefined}
        onAvatarChange={setAvatarId}
      />
    )
  }
  const playing = closing !== null && !done && frozen !== null
  if (!playing && (done || state.status === 'burned')) {
    return (
      <BurnedScreen
        onNewRoom={onRestart && (() => onRestart('new-room', self.name))}
        onHome={onRestart && (() => onRestart('home'))}
        isHost={room?.hostMemberId === self.id}
      />
    )
  }
  const invite =
    kind === 'convex' && room
      ? inviteUrl(window.location.origin, window.location.pathname, kind, room.inviteToken)
      : undefined
  return (
    <RoomScreen
      state={playing ? frozen : state}
      self={self}
      room={room!}
      onBurn={() => void burn()}
      inviteUrl={invite}
      connection={connection}
      onRejoin={() => window.location.reload()}
      pending={pending}
      error={error}
      showTypeLine={params.get('type') === '1'}
      onAddLine={addLine}
      showReplay={params.get('replay') === '1' && !!startReplay}
      onStartReplay={startReplay}
      voice={client.voice}
      onLeave={onLeave}
      // People go straight into the room after joining (no entry step).
      closing={playing ? closing : null}
      selfAvatar={AVATAR_CHOICES.find((a) => a.id === avatarId)}
    />
  )
}
