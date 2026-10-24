# Join screen: "The Tea Party Lobby"

Branch `web/join-tea-party`, cut from `main` at `db2badb`. This redesign changes the visuals only: Join keeps the same props and the same behavior.
Screenshots are in [screenshots/join-tea-party/](screenshots/join-tea-party/).

## What was checked

### Room data before joining
- **What the backend allows:**
  - Every room read needs a `sessionToken`, which you only get by joining.
  - `rooms.join({ inviteToken, name })` is the only function that accepts an invite token.
  - Rooms have no name or title field.
  - The mock ignores the token entirely.
- **Result:** with either client, the app can't know a room's name, its members, their avatars or the member count before joining.
- **What the invited variant shows:** only what's real, namely that this is an invite link. No room title, avatar strip or "N here" pill, and no live activity of any kind.
- **What the create variant shows:** your own avatar plus three empty guest seats, which is true of any new room.

**Proposal for the backend owner: a `rooms.preview` query.**

```ts
// Public query, keyed by the unguessable invite token (the same secret that already allows joining).
rooms.preview({ inviteToken }) → {
  status: 'active' | 'burned' | 'not_found',
  memberCount: number,            // people with a session token, i.e. real phones
  members: { name: string; avatar?: AvatarId }[],
  title?: string,                 // only if rooms get an optional host-set title
}
```

- **Invite link expiry:** return `not_found` for an unknown token or an expired room, so the Join screen can say "This invite has ended" before anyone types.
- **Replay speakers:** count only members who have a session token, so scripted voices aren't shown as people who are present.

### Disclosure accuracy
The brief's wording, "Text is kept; audio isn't", is not accurate for this backend:

- **Voice audio is never stored by us.** The phone streams microphone audio straight to Cartesia speech-to-text using a 120-second token. The backend only ever receives text lines.
- **Some audio is stored, though.** The AI-narrated recap is an MP3 kept in Convex file storage until the room is burned.
- **Burn removes the conversation.** It deletes transcript lines, recalls, story states, the event log, recaps, and the recap audio.
- **Burn does not remove names.** The room record and members' nicknames are kept; only the session tokens are cleared.

The user approved this wording, which is now used on the screen:

> AI processes the conversation to create transcripts and catch-ups. Your voice becomes text as you talk; the recording isn't saved. The host can delete the conversation anytime.

"The recording isn't saved" means Gossip Window stores no recording of anyone's voice. To make the brief's line literally true, the backend would need to:
- stop storing the recap MP3 (stream it instead), and
- delete nicknames on burn.

### Avatar choice
- **Where it lives:** `shared/schema.ts` has no avatar field, so the chosen avatar is kept in React state on this phone only, never in browser storage.
- **Where it shows:** on the Join card, in the avatar button and the create variant's seat.
- **Why it's optional:** the first avatar is preselected and the picker never blocks joining.

**Proposal for the team: a schema change.**

```ts
// shared/schema.ts
export type AvatarId = 'sunny' | 'mint' | 'coral' | 'lilac' | 'peach' | 'pink'
export interface Member { /* … */ avatar?: AvatarId }
```

1. **Backend:** `rooms.create({ name, avatar? })` and `rooms.join({ inviteToken, name, avatar? })` validate `avatar` against the list and store it on the member. It then appears in `member_joined`.
2. **Web:** RoomStage and the avatar row render `member.avatar` when it's present, and fall back to initials otherwise.
3. **Privacy:** an avatar is a preset ID, not an upload, so there's nothing to moderate or delete beyond the member row.

## Design tokens
All colors, type, radii, spacing, shadows and motion live in [web/src/theme/tokens.css](../src/theme/tokens.css), prefixed `--gw-`. Other screens can adopt them later; none were restyled.

**Contrast ratios (WCAG AA, measured):**

| Pair | Ratio |
|---|---|
| White on violet | 6.25:1 |
| Ink on surfaces | 13.6–14.7:1 |
| Ink on accents | 6.5:1 (coral) to 11.2:1 (lavender) |
| Muted ink | 8.3–9:1 |
| Disabled label | 7.1:1 |
| Danger | 7.7:1 |

## Behavior kept
All of these behave exactly as before:
- **Create or join:** creating a room, or joining from an invite link, including "Create a new room instead".
- **Pending:** the button is disabled while the call runs. The label is now "Joining…" (join) or "Starting…" (create), replacing "Connecting…".
- **Errors:** the 10 s timeout, and the "Can't reach the server." message with its "Try the offline demo" link on Convex.
- **Clients:** both the mock and Convex.
- **Voice:** Join never touched audio. Push-to-talk and the recap audio are set up on the room screen, and that is unchanged.

## Motion and access
**Motion:**
- The card settles in over 460 ms.
- The chosen avatar pops, and the selected picker option scales up.
- The button presses down into its shadow.
- Your avatar hops while "Joining…" shows.
- With `prefers-reduced-motion`, all animations and transitions are off, and nothing moves on press.

**Access:**
- Visible focus rings on every control.
- The picker is a real radio group.
- Illustrations are `aria-hidden`.
- The nickname error is linked with `aria-describedby`.
- "How it works" opens in place: focus goes to its heading, and Escape closes it and returns focus to the trigger.

**Fonts:** Fredoka and DM Sans load from Google Fonts with `display=swap`, with rounded and system fallbacks.

## Phone layout
| Viewport | Button bottom edge |
|---|---|
| 375×812, invited | 759 px |
| 375×812, create | 756 px |
| 375×568, invited | 527 px |
| 375×568, create | 524 px |

On heights of 640 px or less, the illustration, eyebrow and subline are hidden and the headline drops to one line, so the nickname field and the button come first.
