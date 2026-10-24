# Web Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone web app that replays the Kevin fixtures through a mock room client. It shows the transcript, recap, recall pop-up, story card and burn, ending at the Sat noon checkpoint (replayed transcript → recall pop-up on a real phone).

**Architecture:**
- `RoomClient` sends out `RoomEvent`s. `roomReducer` folds them into `RoomState`.
- A second pure reducer, `popupReducer`, decides what the pop-up shows, using `now` as an input.
- `MockRoomClient` schedules a pure `buildReplayTimeline(...)`. React screens read only state.

**Tech Stack:** Vite + React + TypeScript (latest at scaffold time), Vitest + @testing-library/react + jsdom, ESLint.

**Spec:** [design.md](design.md). Read it first; the issue numbers below refer to it.

## Global Constraints

- All app code goes in `web/`. Never edit `shared/schema.ts`; import from `../shared/schema` (use `import type` for types).
- Fixtures are imported from `../shared/fixtures/*.json` and cast to `ReplayScript` and `DemoFixture`.
- Never write conversation text to `localStorage`, `sessionStorage` or IndexedDB. This is enforced by ESLint `no-restricted-globals` and by a test.
- Use the schema's constants: `RECALL_MIN_CONFIDENCE` 0.7, `RECALL_CHIP_TIMEOUT_MS` 6000, `RECALL_COOLDOWN_MS` 15000. Web-only: `RECALL_PENDING_MS = 6000`.
- Mobile-first: design at 375 px wide, keep tap targets ≥ 44 px, and put push-to-talk in the bottom thumb zone.
- Exact AI notice copy: "An AI listens to this room and turns what's said into a transcript, stories and catch-ups. Only text is kept, never audio. The host can delete the room at any time."
- Commit after each task with a clear `[Web] ...` message. Never push.
- **Schema proposals P1–P4 are not agreed yet.** Any extra field or type the web app needs beyond `shared/schema.ts` lives in `web/src/types.ts`, so it's easy to switch over later. Phase 1 needs none of P1–P4.
- **Recap matching** happens only in `recapFor` (Task 2), using `uptoSeq === self.joinedAtSeq`. No other code decides whose recap a recap is.
- **Decided:**
  - a visible pop-up updates in place, and the cooldown starts when it closes
  - `focusedBypassesCooldown` defaults to `false`
  - the pop-up layers on top of the recap banner
  - pending recalls wait at most 6 s
  - Convex will use option (a), the events table (Phase 2)
- **Stop points:** stop and report to the user after Task 4 and after Task 9. Each report says what works, the test results and how to see it yourself.

## Review Focus

1. **Holding push-to-talk with one finger while tapping a chip with another** → push-to-talk stays pressed and the card opens. Test in Task 9.
2. **A recall for the same person while the pop-up is visible** → the pop-up updates in place; no second pop-up and no flicker. Test in Task 8.
3. **A recall that arrives before its stories** → it is held as pending, then shown, or dropped after 6 s. Test in Task 8.
4. **Burn while a story card and pop-up are open** → both disappear and no story text is left in the page. Test in Task 11.
5. **Duplicate or out-of-order `line_added`**, which a reconnecting Convex client will cause → no duplicate lines, and lines stay sorted by seq. Test in Task 2.

---

### Task 1: Scaffold web/ with shared imports

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`, `web/eslint.config.js`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles.css`, `web/src/test/setup.ts`
- Test: `web/src/shared.test.ts`

**Interfaces:**
- Modify: `.gitignore` (add `graphify-out/`)
- Create: `web/src/types.ts`, empty except for a comment saying web-only types go here until the schema proposals are agreed

- Produces:
  - `npm run dev`: Vite over **HTTPS** via `@vitejs/plugin-basic-ssl`, with `server.host: true` so a phone on the same network can reach it, and `server.fs.allow: ['..']`
  - `npm test` (Vitest, jsdom), `npm run build`, `npm run lint`
- `tsconfig` includes `src` and `../shared` and enables `resolveJsonModule`

- [ ] **Step 1:** Scaffold with `npm create vite@latest web -- --template react-ts`, keeping the existing `web/README.md` and `web/docs/`. Add vitest, @testing-library/react, @testing-library/user-event, jsdom and @vitejs/plugin-basic-ssl.
- [ ] **Step 2:** Write `shared.test.ts`, which:
  - imports `missedStory` and `RECALL_COOLDOWN_MS` from `../../shared/schema`, plus both fixtures
  - expects `RECALL_COOLDOWN_MS === 15000`
  - expects the replay fixture to have `lines.length === 21` and `lateJoiner.afterLine === 16`
  - expects `missedStory(taylor, cakeStory) === true` and `missedStory(alex, cakeStory) === false`
- [ ] **Step 3:** Run `npm test`. Expected: PASS. Then run `npm run build`. Expected: success.
- [ ] **Step 4:** Add an ESLint `no-restricted-globals` rule for `localStorage`, `sessionStorage` and `indexedDB` in `src/**`, with a message pointing at the privacy rule. `npm run lint` passes.
- [ ] **Step 5:** Run `npm run dev`. It prints an `https://<LAN IP>:5173` URL. Opening it on a phone shows a self-signed certificate warning; accept it once and the placeholder app loads. **Done when** the dev server serves HTTPS on the LAN address, which you can check with `curl -k https://<LAN IP>:5173` from this machine.
- [ ] **Step 6:** Commit with `[Web] Scaffold Vite app with shared schema imports`.

### Task 2: roomReducer (TDD)

**Files:**
- Create: `web/src/room/state.ts`
- Test: `web/src/room/state.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RoomState {
  status: "active" | "burned";
  members: Member[];          // in join order, upserted by id
  lines: TranscriptLine[];    // sorted by seq, unique by id
  storyState: StoryState | null;
  recalls: Recall[];          // unique by id, in arrival order
  recaps: Recap[];            // unique by id; a later event with the same id replaces the earlier one
}
export const initialRoomState: RoomState;
export function roomReducer(state: RoomState, event: RoomEvent): RoomState;
// Selectors used by the UI:
export function storiesById(state: RoomState): Map<Id, Story>;
export function personById(state: RoomState, id: Id): Person | undefined;
export function recapFor(state: RoomState, self: Member): Recap | undefined; // uptoSeq === self.joinedAtSeq && joinedAtSeq > 0
```

- [ ] **Step 1: Write the failing tests.** Build an event list by hand from the fixtures:
  - 4 × `member_joined`
  - 21 × `line_added` (ids `lN`, seq N)
  - one `story_state_updated` with `fixture.storyState`
  - 3 × `recall`
  - 1 × `recap_ready`

  Fold them with `roomReducer`, then check:
  - `folds the fixture into the expected state`: members equal `fixture.members`, `storyState` deep-equals `fixture.storyState`, recalls equal `fixture.recalls`, recaps equal `[fixture.recap]`, and lines map to `l1…l21`
  - `ignores a story snapshot with an older or equal uptoSeq`: send `uptoSeq` 21, then 16; the 21 snapshot stays
  - `deduplicates and sorts lines`: send l3, l1, l3, l2; the result ids are `[l1, l2, l3]`
  - `replaces a recap with the same id`: a second `recap_ready` with `audioUrl` makes `recaps[0].audioUrl` defined
  - `room_burned clears everything`: the state equals `{ ...initialRoomState, status: "burned" }`, and later events are ignored
  - `recapFor`: Taylor gets `recap_16` and Alex gets `undefined`
- [ ] **Step 2:** Run `npx vitest run src/room/state.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `state.ts`. Return new objects; never mutate.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `[Web] Room reducer built from RoomEvents`.

### Task 3: Replay timeline (TDD)

**Files:**
- Create: `web/src/room/mock/timeline.ts`
- Test: `web/src/room/mock/timeline.test.ts`

**Interfaces:**
- Consumes: `ReplayScript`, `DemoFixture` and `RoomEvent` from the schema
- Produces:

```ts
export interface TimelineOptions {
  speed?: number;               // default 1; every atMs is divided by it
  recallLatencyMs?: number;     // default 800
  recapLatencyMs?: number;      // default 1500
  snapshotLatencyMs?: number;   // default 1500
  snapshotAfterLines?: number[];// default [7, 12, 16, 21]
  pauseAfterJoinMs?: number;    // default 0; added to every event after the late join
  self?: { name: string; mode: "host" | "latecomer" }; // adds member m_self
}
export interface TimedEvent { atMs: number; event: RoomEvent }
export function buildReplayTimeline(script: ReplayScript, fixture: DemoFixture, opts?: TimelineOptions): TimedEvent[];
export function snapshotAt(fixture: DemoFixture, uptoSeq: number): StoryState;
```

- **Timing rules:**
  - line N goes out at the cumulative `delayMs` (l16 = 39 500 ms and l17 = 45 500 ms at speed 1)
  - Taylor's `member_joined` goes out at l16's time, with `recap_ready` `recapLatencyMs` later
  - recalls come `recallLatencyMs` after lines 17, 19 and 20
  - snapshots come `snapshotLatencyMs` after the lines in `snapshotAfterLines`
- **The `latecomer` self:** adds `m_self` with `joinedAtSeq: 16` at the same moment Taylor joins. Every event at or before that moment gets `atMs: 0`, and later ones shift so they start from it.
- **The output is sorted by `atMs`.** When two events have the same time, they keep the order they were generated in.

- [ ] **Step 1: Write the failing tests:**
  - `with no options, folding the timeline through roomReducer equals the fixture`: reuse the assertions from Task 2
  - `line 17 is at 45500 ms and r1 at 46300 ms`
  - `speed 2 halves every atMs`
  - `snapshotAt(fixture, 7)` has only `s_cake`, Kevin's `storyIds` is `[s_cake]` and `currentTopic` is `""`; `snapshotAt(fixture, 21)` deep-equals `fixture.storyState`
  - `latecomer self`: all events up to the join are at 0, `m_self.joinedAtSeq === 16`, and l17 is at 6000 ms
  - `host self`: `m_self.joinedAtSeq === 0` at time 0
  - `pauseAfterJoinMs: 15000` moves l17 by 15 000 ms
- [ ] **Step 2:** Run `npx vitest run src/room/mock/timeline.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `timeline.ts`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit with `[Web] Pure replay timeline from Kevin fixtures`.

### Task 4: RoomClient interface, MockRoomClient and URL options

**Files:**
- Create: `web/src/room/RoomClient.ts`, `web/src/room/mock/MockRoomClient.ts`, `web/src/config.ts`
- Test: `web/src/room/mock/MockRoomClient.test.ts`, `web/src/config.test.ts`

**Interfaces:**
- Consumes: `buildReplayTimeline` and `TimelineOptions` from Task 3
- Produces:

```ts
export interface JoinResult { room: Room; self: Member }
export interface RoomClient {
  subscribe(listener: (event: RoomEvent) => void): () => void;
  createRoom(name: string): Promise<JoinResult>;           // mock: self mode "host", room.hostMemberId = self.id
  joinRoom(inviteToken: string, name: string): Promise<JoinResult>; // mock: self mode "latecomer"
  burn(): Promise<void>;                                   // mock: cancels timers and emits room_burned
  dispose(): void;                                         // cancels timers and drops listeners
}
export class MockRoomClient implements RoomClient { constructor(opts?: Omit<TimelineOptions, "self">) }
export function readMockOptions(search: string): Omit<TimelineOptions, "self"> & { inviteToken?: string };
// Reads ?speed= ?pauseAfterJoin= ?room=. Ignores values that aren't numbers or are ≤ 0.
```

- [ ] **Step 1: Write the failing tests** with `vi.useFakeTimers()`:
  - `joinRoom` emits nothing until timers run
  - advancing 0 ms delivers lines 1–16 and m_self, Taylor and the recap (after `recapLatencyMs`)
  - advancing to the end delivers 21 lines
  - `burn()` emits `room_burned` and no events come after it
  - `dispose()` stops all events
  - `readMockOptions("?speed=2&pauseAfterJoin=15000&room=demo")` returns `{ speed: 2, pauseAfterJoinMs: 15000, inviteToken: "demo" }`, and `?speed=abc` is ignored
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the code with one `setTimeout` per `TimedEvent`, keeping the handles so `burn` and `dispose` can clear them.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit with `[Web] RoomClient interface and MockRoomClient`.

### Task 5: useRoom hook, App shell and Join screen

**Files:**
- Create: `web/src/room/useRoom.ts`, `web/src/screens/JoinScreen.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/screens/JoinScreen.test.tsx`

**Interfaces:**
- Consumes: `RoomClient`, `roomReducer`, `readMockOptions`
- Produces:

```ts
export function useRoom(client: RoomClient): {
  state: RoomState; self: Member | null; room: Room | null;
  create(name: string): Promise<void>; join(token: string, name: string): Promise<void>; burn(): Promise<void>;
};
```

- `useRoom` subscribes in an effect *before* calling create or join, and holds state with `useReducer(roomReducer, initialRoomState)`.
- `App` picks the screen: Join when there's no `self`, Burned when `status === "burned"`, otherwise Room.

- [ ] **Step 1: Write the failing tests:**
  - the AI notice text (exact copy from Global Constraints) is visible before typing anything
  - Join is disabled while the nickname is blank or only spaces
  - with `?room=demo`, the primary button reads "Join room"; without it, "Create room"
  - submitting calls `joinRoom("demo", "Leo")`, checked with a mocked client
- [ ] **Step 2:** Run the tests. Expected: FAIL. Implement the code. Run them again. Expected: PASS.
- [ ] **Step 3:** Commit with `[Web] Join screen with AI notice`.

### Task 6: Room screen (transcript, listening indicator, push-to-talk)

**Files:**
- Create: `web/src/screens/RoomScreen.tsx`, `web/src/components/Transcript.tsx`, `web/src/components/ListeningIndicator.tsx`, `web/src/components/PushToTalkButton.tsx`
- Test: `web/src/screens/RoomScreen.test.tsx`

**Interfaces:**
- `<PushToTalkButton onPressChange={(down: boolean) => void} />` uses `onPointerDown` with `setPointerCapture`, and `onPointerUp`/`onPointerCancel` checked against the same `pointerId`. Its CSS sets `touch-action: none`, `user-select: none` and `-webkit-touch-callout: none`.
- `<Transcript lines={TranscriptLine[]} fromSeq={number} />` shows only lines with `seq > fromSeq` (design: a latecomer sees lines from their join on). It auto-scrolls to the newest line unless the user has scrolled up.

- [ ] **Step 1: Write the failing tests:**
  - with the folded fixture state and `self` = latecomer, the transcript shows l17–l21 and not l1
  - the "Listening" indicator is visible while active
  - after pointerdown on push-to-talk, it shows `aria-pressed="true"`; after pointerup with the same `pointerId`, `"false"`; a pointerup with a different `pointerId` leaves it `"true"`
- [ ] **Step 2:** Run the tests, implement, and run them again until they pass. Then check the screen at 375 px in the browser pane.
- [ ] **Step 3:** Commit with `[Web] Room screen with transcript and push-to-talk`.

### Task 7: Recap banner

**Files:**
- Create: `web/src/components/RecapBanner.tsx`
- Test: `web/src/components/RecapBanner.test.tsx`

**Interfaces:** `<RecapBanner recap={Recap | undefined} isLatecomer={boolean} onDismiss={() => void} />`

- [ ] **Step 1: Write the failing tests:**
  - a latecomer with no recap sees "Catching you up…"
  - with `fixture.recap`, the text appears right away
  - a non-latecomer sees nothing
  - Dismiss calls `onDismiss`
- [ ] **Step 2:** Run the tests, implement, and run them again until they pass. Keep the banner compact at the top so it never covers the pop-up area (issue 2a).
- [ ] **Step 3:** Commit with `[Web] Late-join recap banner`.

### Task 8: popupReducer (TDD, issues 1 and 3)

**Files:**
- Create: `web/src/recall/popup.ts`
- Test: `web/src/recall/popup.test.ts`

**Interfaces:**

```ts
export interface VisiblePopup { recallId: Id; personId: Id; storyIds: Id[]; focusStoryId?: Id; expiresAt: number }
export interface PopupState { visible: VisiblePopup | null; closedAt: Record<Id, number>; pending: { recall: Recall; receivedAt: number }[] }
export interface PopupContext { self: Member; stories: Story[]; people: Person[]; focusedBypassesCooldown: boolean }
export type PopupInput =
  | { type: "recall"; recall: Recall; now: number }
  | { type: "tick"; now: number }              // also re-checks pending against ctx
  | { type: "dismiss"; now: number }
  | { type: "chip_tapped"; now: number };
export const initialPopupState: PopupState;
export function popupReducer(state: PopupState, input: PopupInput, ctx: PopupContext): PopupState;
export function visibleChips(p: VisiblePopup, stories: Story[]): Story[]; // in storyIds order, unknown ids left out
```

- **Rules:**
  - `shouldShowRecall` false while confidence passes but the person or stories are unknown → pending
  - otherwise false → drop
  - visible with the same person → update in place. Replace `storyIds`, and set `focusStoryId` to the recall's focus, or keep the old one if the recall has none. If the focus changed, set `expiresAt = now + RECALL_CHIP_TIMEOUT_MS`.
  - visible with a different person → replace it and record `closedAt` for the old person
  - not visible and `now - closedAt[person] < RECALL_COOLDOWN_MS` → drop, unless `focusedBypassesCooldown && recall.focusStoryId`
  - `tick` past `expiresAt`, `dismiss` or `chip_tapped` → close and set `closedAt[person] = now`
  - pending older than `RECALL_PENDING_MS` → drop it on `tick`

- [ ] **Step 1: Write the failing tests,** using the fixture recalls at the replay's relative times (r1 at t=0, r2 at t=5000, r3 at t=8000) and `self` = Taylor:
  - `r1 shows Kevin with Cake, Airport, Landlord and no focus`
  - `r2 while visible updates in place with focus s_cake and expiresAt 11000`
  - `r3 while visible moves focus to s_airport, expiresAt 14000`
  - `the pop-up closes at tick 14000`
  - `a recall for Kevin at 20000 is dropped (cooldown from close)` and `the same recall at 29001 shows`
  - `with focusedBypassesCooldown, a focused recall at 20000 shows`
  - `Alex (joinedAtSeq 0) never sees a pop-up`
  - `a recall with confidence 0.6 is dropped`
  - `a recall before its stories is pending, then shown on the tick after the stories arrive`
  - `a pending recall is dropped after 6000 ms`
  - `visibleChips leaves out unknown story ids`
- [ ] **Step 2:** Run `npx vitest run src/recall/popup.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `popup.ts`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit with `[Web] Recall pop-up rules with in-place update and cooldown`.

### Task 9: RecallPopup component and wiring

**Files:**
- Create: `web/src/components/RecallPopup.tsx`, `web/src/recall/usePopup.ts`
- Modify: `web/src/screens/RoomScreen.tsx`
- Test: `web/src/components/RecallPopup.test.tsx`

**Interfaces:**
- `usePopup(state: RoomState, self: Member, opts?: { focusedBypassesCooldown?: boolean }): { popup: VisiblePopup | null; dismiss(): void; tapChip(storyId: Id): void; openStoryId: Id | null; closeStory(): void }`
- It feeds each new `state.recalls` entry, tracked by id so a recall isn't fed twice, to `popupReducer`. It ticks every 250 ms.
- `<RecallPopup person={Person} chips={Story[]} focusStoryId={Id | undefined} onChip={(id) => void} onDismiss={() => void} />` is fixed above the push-to-talk button and fades out with CSS.

- [ ] **Step 1: Write the failing tests:**
  - renders "Kevin" and three chips, with Cake marked `aria-current="true"` when it's the focus
  - **Review Focus 1:** after pointerdown on push-to-talk (pointerId 1), clicking a chip opens the card *and* push-to-talk still shows `aria-pressed="true"`
  - the pop-up never overlaps the button: the layout keeps it in a separate container above the button's container, checked structurally
- [ ] **Step 2:** Run the tests, implement, and run them again until they pass.
- [ ] **Step 3:** Commit with `[Web] Recall pop-up on the room screen`.

### Task 10: Story card

**Files:**
- Create: `web/src/components/StoryCard.tsx`
- Test: `web/src/components/StoryCard.test.tsx`

**Interfaces:** `<StoryCard story={Story} people={Person[]} self={Member} onClose={() => void} />`, shown as a bottom sheet.

- [ ] **Step 1: Write the failing tests** with `s_cake`:
  - the summary text is shown
  - `Sam: "NO WAY he ate the entire cake."` and Jamie's reaction are shown
  - a "came up" line is present
  - with an injected `openQuestion` and one `speculation`, the speculation sits under a visible "Guess" label
  - with no `openQuestion` and empty `speculation`, neither section renders
- [ ] **Step 2:** Run the tests, implement, and run them again until they pass.
- [ ] **Step 3:** Commit with `[Web] Story card sheet`.

### Task 11: Burn, Burned screen and the storage guard

**Files:**
- Create: `web/src/screens/BurnedScreen.tsx`, `web/src/privacy.test.tsx`
- Modify: `web/src/screens/RoomScreen.tsx` (host-only Burn button, two-tap confirm)

- [ ] **Step 1: Write the failing tests:**
  - only a host (`room.hostMemberId === self.id`) sees Burn
  - **Review Focus 4:** with the pop-up and card open, burning shows "This room has ended", and `document.body.textContent` contains neither "cake" nor "Kevin"
  - `privacy.test.tsx` spies on `Storage.prototype.setItem` and `indexedDB.open`, then renders App with `MockRoomClient` at `speed: 1000`, runs all timers as a latecomer and burns. Both spies are called 0 times.
- [ ] **Step 2:** Run the tests, implement, and run them again until they pass. Then run `npm test`, `npm run lint` and `npm run build`; all should succeed.
- [ ] **Step 3:** Commit with `[Web] Burn flow, burned screen, storage guard`.

### Task 12: Phone checkpoint (Sat noon, web side)

- [ ] **Step 1:** Run `npm run dev` and open the LAN URL with `?room=demo` on a real phone. If the venue Wi-Fi blocks it, ask whether to use a static deploy.
- [ ] **Step 2:** Walk through it as a latecomer:
  - the AI notice is visible
  - the recap text appears within about 2 s
  - the Kevin pop-up shows Cake, Airport and Landlord
  - the highlight moves to Cake, then to Airport
  - tapping Cake opens the card while push-to-talk is held with the other thumb
  - the pop-up fades
- [ ] **Step 3:** Walk through it as the host (no `?room`): no pop-ups appear, and Burn ends the room.
- [ ] **Step 4:** Try `?speed=3` and `?pauseAfterJoin=15000`, and write down the timing that feels right for the demo.
- [ ] **Done when** every check above holds on a real phone, and `npm test`, `npm run lint` and `npm run build` pass on `main`.

---

## Phase 2 (outline; planned after Phase 1 and the four decisions)

1. **`ConvexRoomClient`** (design issue 4), behind `?client=convex`, swapping in for `MockRoomClient`. Needs the backend items listed in the design doc.
2. **Recap audio:** unlock audio during the Join tap, and play `audioUrl` when it arrives.
3. **Demo page:** a projector view with the QR code, live transcript and story list.
4. **Devpost draft and demo script:** in `web/docs/`, with only measured results.
5. **Relation tree.** First on the cut list, so last.
