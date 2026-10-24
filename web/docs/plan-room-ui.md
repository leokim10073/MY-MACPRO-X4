# Room UI plan: speaker view, my name, people count, leave

**Status:** approved 2026-10-24. This session covers U1–U5 plus U5b. U6 (merging web/phase2) is done later and separately. Leave and Burn must look clearly different: Burn is red, destructive, set apart, and keeps its two-tap confirm. The backend leave proposal goes to the team; only the web side of Leave is built here. Branch `web/room-ui` (worktree `.claude/worktrees/room-ui`), cut from `web/phase2` at `1c95a4f`.

**Off limits** (the Phase 2 agent owns these):
- `web/src/room/convex/`
- client selection logic (`createRoomClient`)
- connection status and the event parser
- the reducer's existing logic
- `shared/`
- `backend/`

## Tasks

### U1: Derived values as pure functions
- **File:** `web/src/room/derived.ts`, with tests.
- **Functions:**
  - `peopleCount(state): number`: the number of `state.members`.
  - `isMe(member, self): boolean`
  - `initials(name): string`: "Leo" → "L", "Mary Jane" → "MJ", emoji-safe, at most 2 characters.
  - `latestLine(state): TranscriptLine | undefined`
  - `orderMembersForStage(members, self, speakerId)`: the speaker first, then me, then the others in join order.
- **Done when:** each function has tests for an empty room, a single member and an unusual name, and the existing reducer tests still pass unchanged.

### U2: The "speaking now" signal, replaceable later
- **File:** `web/src/room/speaking.ts`.
- **Interface:** `SpeakingSignal = { speakerId: Id | null }`.
- **Default implementation:** `useLineSpeaking(state, holdMs = 3000)`. It records *when this phone received* the newest line and reports that line's speaker for 3 s. It uses arrival time, not `line.at`: `at` is script time in the mock and server or client time on Convex, so it isn't comparable to this phone's clock.
- **Later:** a push-to-talk source (`usePttSpeaking`) can replace it without touching the UI, because RoomScreen only reads a `SpeakingSignal`.
- **Done when:** fake-timer tests show:
  - a new line highlights its speaker
  - the highlight clears at 3 s
  - a second line within 3 s moves the highlight and restarts the timer
  - lines that arrive before I joined, or in the first catch-up burst, don't flash speakers

### U3: `RoomStage` component
- **File:** `web/src/components/RoomStage.tsx`, with tests.
- **Big tile:** the speaker now. When nobody is speaking it shows the last speaker, dimmed, as "last spoke".
- **Avatar row:** one small initials tile per member, horizontally scrollable. The speaker's tile gets a ring.
- **Me:** marked with a "You" badge on my tile and "You're Leo" in the stage header.
- **People count:** "5 in the room".
- **Compact mode:** shows only the avatar row with the speaking ring, about 48 px tall. It turns on when a story card is open, or when the screen height is under 700 px.
- **Accessibility:** tiles have `aria-label="Sam, speaking"` / `"Leo (you)"`.
- **Done when:** tests cover the big tile, the "You" badge and label, the count, compact mode, and a 12-member room scrolling instead of wrapping.

### U4: Put the stage into RoomScreen without covering anything
- **Placement:**
  - It's a normal-flow row between `room-banner` and `room-transcript`, with `flex: none`.
  - It is never an overlay.
  - The pop-up, story card and hold-to-talk stay in `room-dock`, and the recap stays in `room-banner`.
- **Height budget:** full stage at most 112 px, compact at most 48 px.
- **Done when:**
  - A structural test shows the stage isn't inside `room-dock` or `room-banner`.
  - Checked in the browser with the mock at 375×812 and 375×568 (iPhone SE) with the recap open, a pop-up showing, and a story card open. Hold-to-talk stays fully on screen and the transcript keeps at least 3 lines.

### U5: Leave room
- **Button:** a "Leave" button for every member, in the header. It's a small text button; the host still has Burn next to it.
- **Confirmation:** tapping it opens a small inline confirmation:
  - "Leave this room? You can rejoin with the invite link, and you'll get a new catch-up."
  - Two buttons: [Leave] [Stay].
  - **Host variant:** "You're the host. If you leave, nobody can burn this room until it expires." The host can still leave.
- **What leaving does:**
  - It calls `client.dispose()`. It never calls `burn`.
  - It returns to the Join screen with fresh state: a new client from a factory, and `App`'s room UI remounted under a new `key`, so the reducer, pop-up, recap and dismissed flags all reset.
- **Factory:** `main.tsx` passes `makeClient: () => createRoomClient(search, env).client` instead of a built client. That's a one-line change at the call site; the selection logic isn't touched.
- **Join screen:** when the URL still has `?room=`, it also offers "Create a new room instead".
- **Done when:** tests show, with both the mock and a fake Convex client:
  - Leave → confirm → `dispose` called once, `burn` never called, the Join screen shows, and nothing from the old room remains in the DOM.
  - Stay cancels.
  - Rejoining works and starts from an empty state.
  - `privacy.test.tsx` still passes.

### U5b: One-time hint on the first recall pop-up
- **What:** the first recall pop-up this phone shows in a room session carries the line "Tap a word to see the story" under the chips.
- **When it goes away:** after that pop-up closes or a chip is tapped, the hint never shows again in that session. It's kept in memory only, never in browser storage, so leaving or reloading resets it.
- **Done when:** tests show the hint on the first pop-up, not on the second, and gone after a chip tap.

### U6 (later, not in this session): Bring in `web/phase2` before merging
- **What:** after the Phase 2 agent commits Tasks 3–4, merge `web/phase2` into `web/room-ui` and resolve conflicts in the files listed below.
- **Done when:** the full suite, lint and build pass on the merged branch.

## Layout sketch (375 px wide)

```
┌───────────────────────────────────────┐
│ Gossip Window   ● Listening  Leave Burn│  room-header ("Burn" is host only)
│ (Reconnecting… strip, Phase 2 agent)   │  ← their ConnectionBanner row
│ Invite: https://…?client=convex&room=… │  host, Convex only
├───────────────────────────────────────┤
│ ▸ While you were away  …recap…  [x]   │  room-banner (≤30dvh, collapses)
├───────────────────────────────────────┤
│  ┌──────┐  Sam                        │  room-stage (≤112px, NEW)
│  │  S   │  speaking…   5 in the room  │   big tile + "You're Leo"
│  └──────┘  You're Leo                 │
│  (A) (J) (L·You) (T) (K)  →scroll     │   avatar row, ring on speaker
├───────────────────────────────────────┤
│ Alex  Anyway, he just texted…         │  room-transcript (flex, ≥3 lines)
│ Sam   After the cake thing? …         │
├───────────────────────────────────────┤
│ Kevin  [Cake] [Airport] [Landlord]  x │  room-dock: pop-up OR story card
│ ┌───────────────────────────────────┐ │
│ │           Hold to talk            │ │  hold-to-talk (never covered)
│ └───────────────────────────────────┘ │
└───────────────────────────────────────┘

Compact stage (story card open, or height < 700 px):
│ (S●) (A) (J) (L·You) (T)    5 here    │  ~48px
```

## Files changed and merge risk with `web/phase2`

| File | My change | Phase 2 agent's change | Risk |
|---|---|---|---|
| `web/src/screens/RoomScreen.tsx` | add `<RoomStage>` row, Leave button and confirm, new props `onLeave` and `speaking` | Task 3 adds the `ConnectionBanner` row and `connection`/`onRejoin` props; Task 4 adds the replay button and typed-line box | **High**. Same JSX and props block. Mitigation: my additions are separate rows and components, so it's a small mechanical merge. |
| `web/src/App.tsx` | session `key` plus a `makeClient` factory, pass `onLeave` | Task 3 passes `connection`/`onRejoin`; Task 4 passes the pending and error state | **High**, but a small file. Resolve by hand in U6. |
| `web/src/main.tsx` | pass `makeClient` instead of a client | Task 1 just rewrote it; possibly untouched after | **Medium**. One line. |
| `web/src/screens/JoinScreen.tsx` | "Create a new room instead" link | Task 4: pending state and `maxLength` | **Medium**. |
| `web/src/styles.css` | new `.room-stage`, `.avatar`, `.leave` rules, appended | Task 3: banner styles | **Low**. Append-only on both sides. |
| `web/src/room/useRoom.ts` | none (session reset is done by remounting) | Tasks 3 and 4 | **None**. |
| New: `room/derived.ts`, `room/speaking.ts`, `components/RoomStage.tsx`, `components/LeaveButton.tsx` + tests | new | n/a | **None**. |
| Tests that render `App` (`e2e`, `privacy`, `BurnRoom`, `JoinScreen`) | supply `makeClient` instead of `client` | Task 4 may edit `JoinScreen.test` | **Medium**. |

## Backend proposal: leaving a room

**Problem:** there is no `rooms.leave` and no `member_left` event, so other phones keep counting someone who left. Their tile stays and the people count is wrong. The leaver's session token also stays valid on the server until burn or expiry.

**Proposed** (needs a `shared/schema.ts` change, so the whole team decides):
1. **Schema:**
   - add `{ type: "member_left"; memberId: Id; at: Timestamp }` to `RoomEvent`
   - add optional `Member.leftAt?: Timestamp`
2. **Backend:** `rooms.leave({ sessionToken })`, a mutation that:
   - calls `requireMember`
   - patches the member with `leftAt: Date.now()` and `token: undefined`, so the token stops working
   - keeps the row, because transcript lines and reactions still point at it
   - appends `member_left`
   - **host leaving:** pass host to the earliest-joined remaining member with a token, and append `member_joined` for them with the updated role. Alternatively add a `host_changed` event. If nobody is left, burn the room. **Team decision needed.**
3. **Web, once agreed:** the reducer marks `leftAt` on `member_left`, and `peopleCount` counts only members without `leftAt`. Tiles of people who left disappear from the avatar row, but their name still shows on their transcript lines. `RoomClient` gains `leave()`, where Convex calls `rooms.leave` and then disposes, and the mock simply disposes. Until then, Leave only disconnects this phone.
4. **Optional, for the speaker view:** a real speaking signal. Add a `presence` table or query (`{ memberId, speaking: boolean, at }`), updated by push-to-talk press and release. It belongs outside the event log, because the log is append-only and would bloat with transient presses.
