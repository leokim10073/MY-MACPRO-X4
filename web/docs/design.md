# Web Frontend Design

Status: **approved 2026-10-23.** All four open issues were decided as recommended. The three "my call" choices were kept. Schema proposals P1–P4 are going to the team; until they're agreed, extra fields live in `web/src/types.ts`.
Plan that implements it: [plan-phase1.md](plan-phase1.md).

## Intent

The phone web app is the only thing a latecomer touches. It has to get them from "who's Kevin?" to speaking up without anyone stopping the story. Success means a stranger joins late on a phone, hears or reads the recap, taps a keyword when Kevin comes up, and joins in, with nobody explaining anything ([web/README.md](../README.md)).

## Goals, non-goals, anti-goals

- **Goals (Phase 1, by the Sat noon checkpoint):** replayed transcript → recall pop-up → story card on a real phone, driven by a mock that replays the Kevin fixtures. Also covers Join, Room, Recap and Burned.
- **Non-goals for Phase 1:** real microphones, the Convex client, recap audio, the relation tree, the demo page and the Devpost page.
- **Anti-goals:**
  - conversation text in `localStorage`, `sessionStorage` or IndexedDB
  - a pop-up that can't be used while holding push-to-talk
  - pop-ups for stories the person already heard
  - any UI that reads data from somewhere other than the reducer's state

## Constraints (decided by the team)

- **Stack:** Vite + React + TypeScript, mobile-first, with Convex as the backend.
- **Shared types:** import directly from `../shared/schema.ts`. Never edit that file; changes go in as proposals (see the end of this doc).
- **Data layer:**
  - A `RoomClient` interface sends out `RoomEvent`s.
  - One pure reducer `(state, event) => state` builds room state.
  - The UI reads only that state, plus the pop-up state (below), which is derived from it.
- **Mock:** `MockRoomClient` replays `kevin.replay.json` with data from `kevin.expected.json`. The replay speed is configurable.
- **Testing:** the reducer is built test-first (TDD) against the fixtures.

## Approaches

The data-layer shape was decided by the team (interface + reducer). The only open "how" choice is the Convex adapter. It's issue 4 below; I recommend option (a).

## Architecture

```
RoomClient (Mock | Convex later) ──RoomEvent──▶ roomReducer ──RoomState──▶ screens
                                                     │
                       recall events + RoomState ──▶ popupReducer (pure, time passed in) ──▶ RecallPopup
```

- **`RoomState`:**
  - `members`
  - `lines`: sorted by seq, de-duplicated by id
  - `storyState`: kept only if `uptoSeq` is higher, same rule as the backend
  - `recalls`
  - `recaps`: keyed by id, so a later `recap_ready` that adds `audioUrl` replaces the earlier one
  - `status`
  - After `room_burned`, everything is cleared and only `status: "burned"` is left.
- **Who I am** (`self: Member` and `room: Room`) comes from the `join`/`create` result. It is not part of the reducer state, because no `RoomEvent` carries it.
- **Pop-up logic** is a second pure reducer, `popupReducer`, that takes `now` as an input. Cooldown, fading and waiting for stories can then be tested without real timers. A 250 ms tick in the UI drives it.
- **Screens** are switched from state, with no router:
  - no `self` → Join
  - `status === "burned"` → Burned
  - otherwise Room, with overlays for the recap banner, recall pop-up and story card sheet

### Mock replay (my calls, marked)

- `buildReplayTimeline(script, fixture, options)` is a pure function. It returns `{ atMs, event }[]`, and `MockRoomClient` only schedules it.
- **Members:** Alex, Sam and Jamie join at time 0. Taylor joins after line 16 with `joinedAtSeq: 16`, then `recap_ready` follows.
- **Lines:** line N gets id `lN`, seq N, the speaker's member id and the script's cumulative `delayMs`.
- **Recalls:** r1, r2 and r3 come `recallLatencyMs` (default 800) after lines 17, 19 and 20.
- **Story snapshots** *(my call)*: the fixture has only the final snapshot, so earlier ones are derived from it.
  - They go out after lines 7, 12, 16 and 21, each `snapshotLatencyMs` (default 1500) after its line.
  - Each snapshot includes the stories with `lastSeq <= N`.
  - `currentTopic` and `openQuestions` are filled only in the final one.
  - The final snapshot equals the fixture's `storyState` exactly.
- **Speed:** every delay is divided by `speed`. Other knobs: `pauseAfterJoinMs` (issue 2) and `snapshotAfterLines` (issue 3).
- **Your own phone in the mock** *(my call)*: you become an extra member `m_self` with the nickname you typed.
  - **Create room:** you are the host and present from the start (`joinedAtSeq: 0`). The replay runs from line 1, and you should see no pop-ups.
  - **Join room:** you are a latecomer (`joinedAtSeq: 16`). Lines 1–16 arrive instantly, then the recap, then lines 17–21 in real time.
  - These two modes show "only what you missed" side by side.
- URL options: `?speed=2&pauseAfterJoin=15000&room=demo`.

### Screens (Phase 1)

1. **Join:**
   - nickname field, plus Create or Join; a `?room=` link goes straight to Join
   - the AI notice is always visible above the button: "An AI listens to this room and turns what's said into a transcript, stories and catch-ups. Only text is kept, never audio. The host can delete the room at any time."
2. **Room:**
   - the transcript
   - a **Listening** indicator, shown whenever the room is active
   - a hold-to-talk button in the thumb zone. In Phase 1 it only shows a "talking" state; voice wires the mic to it later.
   - *My call:* a latecomer sees only the lines said after they joined. The recap covers the rest, which keeps the "you can't scroll back a conversation" pitch honest. This could easily go the other way.
3. **Recap banner:**
   - "Catching you up…" until a matching recap arrives, then the text right away
   - dismissable
   - plays audio when `audioUrl` exists (Phase 2)
4. **Recall pop-up:**
   - placed above the push-to-talk button and away from it
   - the person's name, then one chip per known story in `storyIds` order, with `focusStoryId` highlighted
5. **Story card:** a bottom sheet showing:
   - the summary
   - reactions, as "Name: 'quote'"
   - "came up around line N", worded relative to the person's join
   - the open question
   - speculation, under a "Guess" label
6. **Burned:** "This room has ended." Every piece of state is cleared, including the pop-up and the open card.

### Push-to-talk and the pop-up together

The push-to-talk button uses pointer events with `setPointerCapture(pointerId)`, `touch-action: none` and no text selection or callout. A second finger tapping a chip doesn't end the press. The pop-up never covers the button.

### Privacy guard

- An ESLint `no-restricted-globals` rule bans `localStorage`, `sessionStorage` and `indexedDB` in `src/`.
- A test spies on `Storage.prototype.setItem` and `indexedDB.open` during a full mock replay and expects zero calls.

## Open issues

### 1. Cooldown vs demo — NEEDS DECISION

**Timing at speed 1:** r1 arrives at about 45.5 s, r2 at 50.5 s (+5 s) and r3 at 53.5 s (+8 s). `RECALL_CHIP_TIMEOUT_MS` is 6 s and `RECALL_COOLDOWN_MS` is 15 s.

**Checked against schema.ts:** the schema says "After a pop-up for a person, don't show another for the same person until this has passed." The proposal has two halves, and they fare differently:

- **(i) Update in place while the pop-up is visible.**
  - r2 arrives while r1's pop-up is still up, so the highlight moves to Cake and the fade timer restarts.
  - r3 arrives while that pop-up is up, so the highlight moves to Airport and the timer restarts again.
  - This fits the schema: it updates the same pop-up instead of "showing another." It needs no schema change and covers all three demo recalls.
  - An unfocused recall arriving while the pop-up is visible doesn't restart the timer. Otherwise, repeated "he"s would keep it up forever.
- **(ii) Focused recalls skip the cooldown.** This one does contradict the schema comment, and the demo doesn't need it.

**Recommendation:**
- Do (i). Start the cooldown when the pop-up closes (it fades, is dismissed or a chip is tapped), not when it opens.
- Keep (ii) as a flag, `focusedBypassesCooldown`, off by default. If you want it on, the schema comment has to change first (proposal P1).

### 2. Recap overlaps pop-ups — NEEDS DECISION

**Options:**
- **(a) Layer the pop-up on top of the recap.** The recap is a compact banner at the top; the pop-up sits low, above the push-to-talk button. Both can be on screen at once.
- **(b) Stretch the replay delays.**
- **(c) Queue pop-ups until the recap ends.** I rejected this: a 14-second-old pop-up misses the "right when an old story comes up" moment.

**Recommendation:** (a) for the product, because in a live room the friends keep talking and nobody can stretch them. Also add `pauseAfterJoinMs` to the mock (default 0) as a demo-tuning knob.

**For the stage:** script a roughly 20-second gap before "after the cake thing…", so the Cake highlight lands after the recap ends.

### 3. Recall references unknown storyIds — NEEDS DECISION (small)

`shouldShowRecall` returns false when none of the recall's stories are known yet, so without handling, the pop-up is silently dropped.

**Recommendation:**
- Render chips live from the current state, and leave out any `storyId` that isn't known yet.
- If a recall has passed the confidence check but its person or stories aren't known, hold it as pending for up to 6 s (`RECALL_PENDING_MS`, web-only). Check it again on every `story_state_updated`; show it if it then passes, and drop it once the 6 s are up.
- A chip whose story arrives while the pop-up is visible appears in place.
- Order guarantees in approach 4(a) make this rare.

### 4. Convex adapter — NEEDS DECISION (with the backend owner)

**(a) Append-only `events` table (recommended):**
- One row per `RoomEvent`, with a per-room `eventSeq`.
- `ConvexRoomClient` uses `ConvexClient` from `convex/browser`. Its `onUpdate`, rather than the React `useQuery` hook, fits a plain interface.
- It subscribes to `events.listAfter({ roomId, sessionToken, afterEventSeq: 0 })` and passes each row with a higher `eventSeq` than the last one it applied to the reducer.

**(b) Normal state queries, diffed into events:**
- More Convex-idiomatic, and the backend is simpler.
- But the client re-derives events from several queries that update in any order.
- Recalls are transient and need their own table anyway, `room_burned` becomes "status changed", and the diff logic is a second source of truth the reducer tests don't cover.

**Why (a):**
- It maps one-to-one to `RoomEvent`.
- It keeps server order: a story snapshot written before a recall arrives before it.
- The mock and the real client then have the same shape, so the reducer tests cover production.
- **Cost:** the backend writes each change twice, once to the state tables and once to the event log, in the same mutation.

**What I need from the backend owner:**
1. An `events` table: `{ roomId, eventSeq, event }`, where `event` is exactly a `RoomEvent`, written in the same mutation as the state change it describes.
2. `events.listAfter({ roomId, sessionToken, afterEventSeq })` returning `{ status, events }`, with a membership check on the server. If the room is burned, it returns `{ status: "burned", events: [] }` so the client can send itself `room_burned` even after the rows are deleted.
3. `rooms.create({ name })` and `rooms.join({ inviteToken, name })`, both returning `{ room, member, sessionToken }`; plus `rooms.burn({ roomId, sessionToken })`, host only.
4. A rule for which recap is whose. Proposal P2 below, or the documented rule "`Recap.uptoSeq` equals the joiner's `joinedAtSeq`".
5. Where `convex/` lives, so web can import `convex/_generated/api`, and the deployment URL as `VITE_CONVEX_URL`.

**Team timing risk:** the team's Sat noon checkpoint says "replay → **AI** → pop-up." My Phase 1 reaches the pop-up on the mock. Real AI needs `ConvexRoomClient`, which is about half a day of work once items 1–3 exist. The backend should start the events table on Friday night.

## Schema change proposals (not applied)

- **P1. Doc only, `RECALL_COOLDOWN_MS` comment.** Proposed text: "Measured from when the pop-up closes. A recall for a person whose pop-up is visible updates it in place." Only needed if the cooldown rule in issue 1 is adopted. If (ii) is enabled, also add: "Recalls with focusStoryId skip the cooldown."
- **P2. `Recap.forMemberId?: Id`.** `recap_ready` reaches every phone, but nothing says whose recap it is. Phase 1 matches on `recap.uptoSeq === self.joinedAtSeq && self.joinedAtSeq > 0`, which breaks if the backend computes the recap at a slightly later seq. This field is optional and doesn't break anything.
- **P3. `RoomEventEnvelope = { eventSeq: number; event: RoomEvent }`.** Only if 4(a) is chosen: both backend and web use it.
- **P4 (optional, low). `Recall.personName?: string`.** The pop-up could show the name even when the person isn't in the phone's `StoryState` yet. Issue 3's pending window already covers this.

## Known risks for later phases

- **Phones need HTTPS for the microphone** (`getUserMedia` only works on secure pages). LAN dev needs `@vitejs/plugin-basic-ssl` or a deploy.
- **Phones block audio that isn't started by a tap.** The recap arrives seconds after Join, so the audio has to be unlocked during the Join tap (Phase 2).
- **Venue Wi-Fi may block phone-to-laptop traffic.** Since the mock needs no backend, Phase 1 can be tested from a static deploy. Your call whether to deploy.

## Left to the builder

Visual styling, copy other than the AI notice, the component breakdown within a screen, and the exact animation for fading.
