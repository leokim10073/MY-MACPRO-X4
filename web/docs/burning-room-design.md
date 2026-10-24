# Burning Room: design

> **Superseded (visuals).** The flow, timing and privacy rules below still hold. The charcoal/ember look, the `--br-*` palette, the canvas burn and the Shhh entry ritual were replaced by the Tea Party "Last Sip" design on branch `chore/gossip-window-tea-party-cohesion`: all colours now come from `src/theme/tokens.css` (lavender `#e4dbff`, peach `#ffc49b`, mint `#8ee3c8`), and no `--br-*` tokens remain.

**Status:** draft for approval. Branch `web/burning-room` (worktree `.claude/worktrees/burning-room`), cut from `main` at `db2badb`.
**Approved look:** the [Burning Room canvas](https://claude.ai/artifact/Gryennh4tbW6BmZurr935a), with its storyboard and tap-through prototype. This doc covers how to build that into the real web app.

## Intent

Gossip Window rooms are temporary: when the conversation is over, the host burns the room and everything said in it is deleted. Today that moment is a plain swap to "This room has ended."

The Burning Room makes it **a secret with a fuse**:
- people enter with a quiet "Shhh. Keep it in the room."
- the room stays calm while they talk
- the one big visual moment is reserved for the end, a short, shared burn that turns the conversation into embers and ash

The burn must feel deliberate and unmistakable, and it must never claim more than the system actually did.

## Goals

1. **Entry ritual:** after joining, a Shhh moment with the room's real rules and an "Enter room" button available immediately.
2. **Shhh badge** in the room header. Tapping it shows one line: "This room stays private until the host burns it."
3. **Host-only "Burn room…"** control, separate from Leave and from push-to-talk, with a confirmation sheet.
4. **The burn:** about 3 seconds, played on every phone, only after the server has confirmed the burn, over a frozen copy of the room as it was.
5. **Clean slate:** "Room burned." and "Conversation deleted.", plus "Start a new room" and "Back home".
6. **Accessible:**
   - reduced motion gets a short fade with the same end state
   - readable contrast
   - visible focus
   - 44 px targets
   - the burn surface never covers controls or status

## Non-goals

- Restyling the room. The current room look stays; only the pieces above are added.
- Any countdown, timer pill or elapsed time.
- A "deletion in progress" state, because today's backend deletes everything in the same step that ends the room.
- A WebGL shader. The approved canvas dissolve is ported instead.
- Sound or haptics.
- Any backend or `shared/schema.ts` change.

## Anti-goals (a failure even if it "works")

- **A false claim:** the animation, or "Conversation deleted.", appearing before the server has confirmed the burn.
- **Copying conversation text** into any new place: a canvas, an image, storage or logs.
- **Hidden controls:** the burn covering push-to-talk, Leave or the status line, or input still accepted after closing begins.
- **Overclaiming:** wording that implies screenshots, recordings or memories are erased.

## Constraints from today's code

- **What the burn actually does:** `rooms.burn` (backend, host only) marks the room burned and deletes its content in one mutation. Every phone learns about it from `events.listAfter` returning `status: "burned"`, which `ConvexRoomClient` turns into a `room_burned` event. `MockRoomClient.burn()` emits `room_burned` directly. So **`room_burned` already means "burned and deleted"**, and it is the one trigger for the animation.
- **The reducer wipes the room:** `roomReducer` resets the state to `{ ...initialRoomState, status: "burned" }` on `room_burned`, and `App` (`RoomSession`) switches to `BurnedScreen` at once. **Nothing is left to burn** unless the app keeps a frozen copy (see Approaches).
- **Push-to-talk stops when the room screen goes away:** `useVoice` stops the mic when its `transport` prop goes away or the screen unmounts.
- **No clock or seed from the server:** `room_burned` carries only `roomId`. Each phone times its burn from when *it* received the event.
- **The room's 12-hour cleanup** (`burnExpired` cron) burns abandoned rooms through the same path. It is never mentioned in the UI.
- **The Leave work** (merged from `web/room-ui`) added Leave with its own confirmation, and kept Burn as a red two-tap button in the header. This design replaces the two-tap with the confirmation sheet.

## Approaches

**What the burn plays over** (chosen in conversation):

- **A. Neutral card shapes.** Swap the conversation for blank outlines and burn those. Most private, but the real words vanish the instant the burn starts.
- **B. Freeze the last screen (chosen).** Keep the room exactly as it was, frozen with input closed, for about 3 s while it burns. Then clear it. It matches the approved prototype and works best in the demo. The cost: text people were already looking at stays on their own screen for about 3 s after the server deleted it. It is never written anywhere new, and is dropped from memory when the burn ends.
- **Rejected: burn before the server confirms.** This breaks the anti-goal of claiming what hasn't happened.

**How it's drawn:** port the approved canvas dissolve.
- It's a noise-shaped burn edge on a 3 px grid, upscaled with smoothing, with a blurred glow band and a char band, plus 40–80 ember and ash particles.
- It needs no new dependency, and it's been checked in a browser.
- **The source to port** is in [burning-room-prototype/](burning-room-prototype/): `BurnLayer.dc.html` holds the noise field, palette, smoothing, glow, particles, timing curve and reduced-motion fade. `Room.dc.html` holds the icon SVG, the ignition overlay and the sheet markup, and `Main.dc.html` holds the prototype's state machine. These are design-canvas files, not app code: copy the logic and the numbers, not the template syntax.
- The brief's WebGL shader is left out. It would add a dependency, phone-GPU risk and testing cost for a small visual gain.

## The design

### Flow and states

The app-level states for one phone:

```
join screen ──join/create──▶ entry ritual ──Enter room──▶ live
live ──host: Burn room…──▶ confirming ──Keep talking──▶ live
confirming ──Burn room──▶ requesting ──server error──▶ live + error message (nothing animates)
requesting ──rooms.burn succeeded, or room_burned──▶ closing
live ──room_burned (another host, or the 12 h cleanup)──▶ closing
entry ritual ──room_burned──▶ closing (the ritual is dismissed; the room behind it burns)
closing (≈2.9 s, frozen room) ──▶ burned (clean slate)
burned ──Start a new room / Back home──▶ join screen (fresh session)
```

- **Closing starts only on a server confirmation.** On the host's phone that's whichever comes first: `rooms.burn` returning OK, or `room_burned` arriving. On every other phone it's `room_burned`. Both mean the same thing: the backend's `burnRoom` marks the room burned, deletes its content and clears every member token in one mutation, so once the call returns OK the room is already gone on the server.
- **One closing per phone:** whichever signal arrives second is ignored.
- **If the call fails:** the sheet closes, the room stays live, the error shows, and nothing animates.
- **While waiting:** the sheet shows "Burning…" and input stays enabled. There's no extra waiting state: the call either resolves or fails through the existing 10 s timeout (`callBackend`).

### Entry ritual

- **When:** shown once per session, right after joining or creating, before the room is usable. It's an overlay over a darkened room. It lives in memory only; a reload shows it again. Leave starts a new session, so it shows again then too.
- **Content:**
  - The Shhh icon: a warm-ivory line drawing of a finger held to the lips, with a small ember-orange fingertip.
  - The heading "Shhh. Keep it in the room."
  - The rules, exactly:
    1. This room stays private until the host burns it.
    2. When it burns, the transcript, stories and catch-ups are deleted for everyone.
    3. Only text is kept while it's open, never audio.
    4. Burning can't reach screenshots, recordings or memories.
  - An "Enter room" button, active immediately.
- **Motion:** the finger drifts up about 2 px and the ring contracts slightly, on a 2.6 s loop. With reduced motion, show it still. After Enter, the icon shrinks toward the header badge (about 250 ms; with reduced motion, an instant swap).
- **While it shows:** the room renders live behind it. `RoomScreen` is mounted, and lines, recap and pop-ups keep arriving, but push-to-talk is not usable until Enter. A burn during the ritual dismisses it and burns the room behind it.
- **Recap audio:** unlocking it on iPhones is out of scope. `RecapBanner`'s `<audio autoPlay>` is unchanged; see `demo-runbook.md`.
- **The Join screen's AI notice stays as it is.** The ritual is in addition to the consent notice, not a replacement.

### Header: Shhh badge and Burn control

- **Shhh badge:** a 44 px button with the Shhh icon, placed before the "Gossip Window" title.
  - Tapping it toggles one line under the header: "This room stays private until the host burns it."
  - Its `aria-label` is "About this room", and `aria-expanded` reflects the toggle.
- **"Burn room…" button:** host only. It replaces `BurnButton`'s two taps and sits where Burn sits now. It stays visually separate from Leave, with the divider kept.
  - Style: an ember outline (#FF762E border, warm text), with the small ember icon.
- **Confirmation sheet:** a bottom sheet over a scrim, with `role="dialog"` and focus moved into it.
  - Title: "Burn this room for everyone?"
  - Body: "This ends the conversation for everyone and deletes its transcript, stories and catch-ups. People may still remember what was said."
  - Buttons: "Keep talking" (secondary) and "Burn room" (ember fill, dark text).
  - While waiting for the server, "Burn room" becomes "Burning…" and is disabled.
  - Escape and the scrim count as Keep talking.
  - *My call:* no press-and-hold option. The brief allows one, but the tap path plus the sheet is enough, and simpler.
- **Leave stays as merged:** the button and its confirmation are unchanged.

### Closing: the burn (about 2.9 s, timed from receiving `room_burned`)

| Time | What happens |
|---|---|
| 0 | Input closes: push-to-talk becomes a disabled "Room closed"; the typed-line box, replay button, pop-up, story card and recap toggle stop responding; the mic stops (pass no `transport` to `useVoice`); the listening dot stops. The speaker stage clears its "speaking" state: `RoomStage` gets `speaker={null}` and keeps showing "last spoke". No waveform is added. |
| 0–600 ms | Over the board: the Shhh icon returns with "That's between us." (`role="status"`). One ember drops from the fingertip to the bottom edge of the board. |
| 560 ms | The burn starts at the bottom middle, already glowing where the ember lands. |
| 560–2560 ms | The burn edge climbs the board: a gold-to-orange glow band, a char band behind it, and charcoal behind that. Content disappears as the edge passes; small patches linger, then break up. Embers and ash rise from the edge (at most 70 particles). |
| 2560–2900 ms | The last particles fade; the board holds still on charcoal. |
| 2900 ms | The frozen copy is dropped and the clean-slate screen appears. |

- **The burn surface** ("the board") is the conversation area: from the recap banner down to the end of the transcript, plus the pop-up and story-card slot.
  - It is **not** the header, connection or error banners, or the push-to-talk area. Those stay visible and unburned.
  - This needs a wrapper element around those regions in `RoomScreen`. The canvas sits over the wrapper, absolutely positioned, with `pointer-events: none`.
- **Seed:** a hash of the room id, so every phone draws the same burn pattern.
- **Reduced motion** (`prefers-reduced-motion: reduce`):
  - no ember, particles or burn edge
  - the board fades to charcoal over about 300 ms
  - "That's between us." still shows
  - the clean slate arrives at the same 2.9 s
- **No canvas** (`getContext` returns null, as in jsdom): skip drawing. The timeline still runs, so tests are deterministic.
- **Late arrival:** a phone that receives `room_burned` while hidden or asleep plays the same closing when it next renders. Its clock starts from receipt, so it may run late; that's acceptable.
- **No frozen copy:** a phone with no frozen copy goes straight to the clean slate. That only happens if `room_burned` arrives before the room ever rendered. The entry ritual does not count, because the room renders behind it.

### Clean slate

`BurnedScreen` is rewritten:
- "Room burned."
- "Conversation deleted."
- the small line "Deleted from Gossip Window. Screenshots or recordings people made aren't affected."
- "Start a new room" (primary)
- "Back home" (secondary)

**"Deleted" is honest here,** because `room_burned` only arrives after the backend's delete has committed. If the backend ever splits closing from deleting, this screen needs a pending variant. That's out of scope now.

**Both buttons start a fresh session** (dispose the client, make a new one; the same mechanism as Leave), and both first remove `?room=` from the URL with `history.replaceState`, so nothing points back at the burned room:
- **"Start a new room"** creates a room straight away with the same nickname (`create(self.name)` on the fresh client), so the host lands in the new room's entry ritual. If that call fails, they land on the Join screen with the error.
- **"Back home"** shows the Join screen, which then reads "Create room" because the invite token is gone.
- `JoinScreen` itself is unchanged. Other sessions are redesigning it, so this avoids conflicts.

*My call:* there is no separate home page, so "Back home" is the Join screen.

### State and privacy

- **The frozen copy:**
  - `RoomSession` keeps the last *active* `RoomState`, plus the latest props needed to render the room, in a ref, updated whenever the state is active.
  - On `room_burned` it renders `RoomScreen` from that copy, with `closing` set.
  - At 2.9 s it drops the copy, so the conversation is out of memory, and shows the clean slate.
  - The reducer is unchanged.
- **Leave, unmount or session reset during closing:** clear the timers and drop the copy.
- **No new copies of text:** nothing is written to storage, logs or the canvas. The canvas paints over the existing screen; it never draws text or reads the page. The existing ESLint storage ban and `privacy.test.tsx` must keep passing, and a new test checks that no conversation text remains in the page after closing.

### Visual tokens

These are the burn piece's own colours, defined once as CSS custom properties on a `.burning-room` scope (or `:root`):
- charcoal `#111114`
- ivory `#F5EFE7`
- ember `#FF762E`
- gold `#FFE6AF`
- cooling red `#AD3527`
- char `#241C1A`
- ash `#8D8580`

They're used only by the new pieces (ritual, badge line, sheet, ignition overlay, canvas, clean slate). The rest of the room keeps its current styles. New CSS is appended to `styles.css` under its own comment block.

### New and changed files

| File | Change |
|---|---|
| `src/components/ShhhIcon.tsx` | new: SVG icon, `animated` prop |
| `src/components/EntryRitual.tsx` | new |
| `src/components/ShhhBadge.tsx` | new: badge button plus the one-line note |
| `src/components/BurnConfirm.tsx` | new: sheet; replaces `BurnButton.tsx`, which is deleted |
| `src/components/BurnIgnition.tsx` | new: "That's between us." plus ember drop |
| `src/components/BurnOverlay.tsx` | new: canvas port of the approved `BurnLayer` (props: `startAt`, `durationMs`, `seed`, `reducedMotion`) |
| `src/room/closing.ts` | new: pure timeline (`closingPhase(elapsedMs) → 'ignite' \| 'burning' \| 'settle' \| 'done'`) and `seedFromRoomId` |
| `src/room/useClosing.ts` | new: keeps the frozen copy, runs the timers, exposes `{ phase, frozen, startedAt }` |
| `src/screens/RoomScreen.tsx` | header badge and Burn control, board wrapper, `closing`/`entered` props, input disabled while closing |
| `src/screens/BurnedScreen.tsx` | rewritten |
| `src/App.tsx` | entry-ritual flag, closing via `useClosing`, restart for the clean-slate buttons |
| `src/styles.css` | appended burn section |
| Tests that click "Burn room" / "Tap again to burn" (`privacy`, `BurnRoom`, `LeaveRoom`) | updated to the sheet flow |

### Testing

- **Pure unit tests:**
  - `closingPhase` at every boundary (0, 599, 600, 2559, 2560, 2899, 2900)
  - `seedFromRoomId` gives the same value for the same id
- **Component tests:**
  - EntryRitual shows the rules and Enter
  - the badge toggles its line
  - BurnConfirm: Keep talking closes it; Burn room calls `onBurn` once; it shows "Burning…" while pending; Escape closes it
  - BurnedScreen: text and both buttons
- **App-level tests** with fake timers and the mock client:
  - **Live burn:** burn emits `room_burned`; the frozen room is still on screen with "Room closed" and "That's between us."; at 2.9 s "Room burned." shows and no Kevin text is left in the page.
  - **Failed burn:** a rejecting fake client shows the error, no closing, and the room stays live.
  - **Non-host:** a `room_burned` event without any tap plays the same closing. This needs a fake client, because in the mock only the host's phone receives `room_burned`.
  - **Host, call returns first:** a fake client whose `burn()` resolves before any event starts closing once. A later `room_burned` doesn't restart it.
  - **Burn during the entry ritual:** the ritual closes and the room behind it burns.
  - **Leave during closing:** clears everything.
  - **Privacy:** still writes nothing to storage.
- **Mic:** test that `useVoice`'s controller stops when closing begins. This needs a fake client with `voice`, because `MockRoomClient` has none.
- **Manual, in the browser:** with the mock at 375×812 and 375×568, run a full burn and a reduced-motion burn (emulated), confirm push-to-talk stays visible and unburned, and do a quick run against Convex if a deployment is available.

## Left to the builder

- Exact CSS for the badge line, sheet and ritual, within the tokens above.
- The icon-to-badge shrink animation.
- Particle tuning within the 40–80 range.
- The internal structure of `useClosing`.
- Whether `BurnOverlay` keeps the 3 px grid on very small boards.
- How `useClosing` makes sure only one signal starts the closing, for example a guard on its `startedAt`.

## Decisions made in conversation

- Keep the current room look and add only the Burning Room pieces.
- No timer pill, countdown or elapsed time, and no mention of the 12-hour cleanup in the UI.
- The Shhh badge line reads "This room stays private until the host burns it."
- No "deletion in progress" state.
- The animation plays only after the server confirms the burn.
- The burn plays over a frozen copy of the last screen (option B).
- The approved prototype's look and timing, with the soft edge and the burn starting as the ember lands.

## Calls I made (check these)

1. No press-and-hold to burn: the tap-and-confirm sheet only.
2. The confirmation sheet replaces the two-tap red Burn button.
3. "Back home" goes to the Join screen in create mode, since there's no home page.
4. The entry ritual shows once per session, in memory only, including after Leave.
5. The burn surface covers the recap banner, speaker stage, transcript and pop-up or card. It does not cover the header, banners or push-to-talk.
6. On the host's phone, a successful `rooms.burn` call starts the burn even if `room_burned` hasn't arrived yet. The server has already burned and deleted the room by then.
7. A burn during the entry ritual dismisses the ritual and burns the room behind it.
8. "Start a new room" creates a new room straight away with the same nickname. "Back home" shows the Join screen. Both clear `?room=` from the URL.
9. iPhone recap-audio unlock stays out of scope.
