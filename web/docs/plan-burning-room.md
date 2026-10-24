# Burning Room Implementation Plan

> **Superseded (visuals).** Historical plan. The `--br-*` tokens, canvas burn, ember ignition and charcoal screens it describes were replaced by the Tea Party "Last Sip" design on branch `chore/gossip-window-tea-party-cohesion`; colours now come only from `src/theme/tokens.css`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Burning Room to the web app. That means the entry ritual, the Shhh badge, a host-only "Burn room…" confirmation sheet, a server-confirmed burn animation over a frozen copy of the room, and the "Room burned." clean slate.

**Architecture:**
- A pure timeline module (`room/closing.ts`) defines the burn's phases.
- `useClosing` keeps the last live `RoomState` and runs those phases once the server confirms the burn.
- `RoomSession` (in `App.tsx`) renders the frozen room with a `closing` prop until the timeline ends, then the clean slate.
- A canvas `BurnOverlay`, ported from the approved prototype, draws the dissolve over the conversation area only.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest with jsdom and Testing Library. No new dependencies.

**Spec:** [burning-room-design.md](burning-room-design.md). The approved prototype sources are in [burning-room-prototype/](burning-room-prototype/).

## Global Constraints

**Where things go:**
- Work only in the worktree `.claude/worktrees/burning-room` on branch `web/burning-room`. Run npm from `web/`.
- Don't change `backend/`, `shared/schema.ts`, `roomReducer`, `JoinScreen.tsx` or the existing room look. Burn-only CSS is appended to `web/src/styles.css` under a `/* Burning Room */` comment.

**Burn tokens:** define these once as custom properties in that block, and use them only for the new pieces:
- `--br-charcoal: #111114`
- `--br-ivory: #F5EFE7`
- `--br-ember: #FF762E`
- `--br-gold: #FFE6AF`
- `--br-red: #AD3527`
- `--br-char: #241C1A`
- `--br-ash: #8D8580`

**Exact copy** (use verbatim):

| Where | Text |
|---|---|
| Ritual heading | "Shhh. Keep it in the room." |
| Ritual rule 1 | "This room stays private until the host burns it." |
| Ritual rule 2 | "When it burns, the transcript, stories and catch-ups are deleted for everyone." |
| Ritual rule 3 | "Only text is kept while it's open, never audio." |
| Ritual rule 4 | "Burning can't reach screenshots, recordings or memories." |
| Ritual button | "Enter room" |
| Badge line | "This room stays private until the host burns it." |
| Badge `aria-label` | "About this room" |
| Burn control | "Burn room…" |
| Sheet title | "Burn this room for everyone?" |
| Sheet body | "This ends the conversation for everyone and deletes its transcript, stories and catch-ups. People may still remember what was said." |
| Sheet buttons | "Keep talking", "Burn room"; while pending, "Burning…" |
| Ignition | "That's between us." |
| Closed talk button | "Room closed" |
| Clean slate | "Room burned.", "Conversation deleted.", "Deleted from Gossip Window. Screenshots or recordings people made aren't affected.", "Start a new room", "Back home" |

**Timeline:** all in ms from the moment closing starts.
- ignite 0–600
- the burn draws from 560 to 2560 (`BURN_START_MS = 560`, `BURN_DURATION_MS = 2000`)
- settle until 2900
- done at 2900 (`DONE_MS`)

**What the burn may and may not do:**
- Closing starts only on `room_burned`, or, on the host's phone, on a successful `client.burn()`. Whichever comes first wins; the second is ignored.
- A failed burn never animates.
- Nothing about the conversation goes to storage, logs or the canvas.
- The canvas never draws text and never reads the page.
- The existing ESLint storage ban and `privacy.test.tsx` must pass.

**Test conventions:**
- no jest-dom; use plain DOM assertions
- `afterEach(cleanup)`
- fake timers through `act(() => vi.advanceTimersByTime(n))`
- a fake `RoomClient` wherever a phone must receive `room_burned` without tapping, or needs `voice`, because the mock gives neither

**Accessibility:**
- touch targets at least 44 px
- visible `:focus-visible` outline on new buttons
- respect `prefers-reduced-motion: reduce`, guarded for jsdom where `window.matchMedia` is undefined

**Commits:** commit after each task with a `[Web] …` subject, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Host double-taps "Burn room" in the sheet:** exactly one `burn()` call. Test in Task 3.
2. **A burn while a story card, recall pop-up or the Leave confirmation is open:** all of them go away and nothing in them responds during closing. Test in Task 5.
3. **Leave tapped, or the session reset, during closing:** timers are cleared, the frozen copy is dropped, and no "Room burned." appears later in the new session. Test in Task 6.
4. **Reduced motion:** no particles or burn edge, but the clean slate still arrives at 2900 ms. Test in Task 7.
5. **`room_burned` arriving twice, or after the host's own successful burn:** closing doesn't restart and the timeline doesn't jump. Test in Task 6.

---

### Task 1: Closing timeline and seed (pure)

**Files:**
- Create: `web/src/room/closing.ts`
- Test: `web/src/room/closing.test.ts`

**Interfaces:**
- Produces:
  - `export type ClosingPhase = 'ignite' | 'burning' | 'settle' | 'done'`
  - `export const IGNITE_MS = 600, BURN_START_MS = 560, BURN_DURATION_MS = 2000, DONE_MS = 2900`
  - `export function closingPhase(elapsedMs: number): ClosingPhase`
  - `export function seedFromRoomId(roomId: string): number` (an unsigned 32-bit FNV-1a hash)

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  [0, 'ignite'], [599, 'ignite'], [600, 'burning'], [2559, 'burning'],
  [2560, 'settle'], [2899, 'settle'], [2900, 'done'], [99999, 'done'],
])('closingPhase(%i) is %s', (ms, phase) => expect(closingPhase(ms)).toBe(phase))
it('treats a negative elapsed time as ignite', () => expect(closingPhase(-5)).toBe('ignite'))
it('seedFromRoomId is stable, unsigned and differs by room', () => {
  expect(seedFromRoomId('demo')).toBe(seedFromRoomId('demo'))
  expect(seedFromRoomId('demo')).toBeGreaterThanOrEqual(0)
  expect(seedFromRoomId('demo')).not.toBe(seedFromRoomId('other'))
})
```

- [ ] **Step 2:** Run `npx vitest run src/room/closing.test.ts`. Expected: FAIL (the module doesn't exist).
- [ ] **Step 3:** Implement `closing.ts`. The phase boundaries are 600, 2560 (`BURN_START_MS + BURN_DURATION_MS`) and 2900.
- [ ] **Step 4:** Run the tests again. Expected: PASS.
- [ ] **Step 5:** Commit: `[Web] Burning Room: closing timeline and seed`.

### Task 2: Shhh icon and header badge

**Files:**
- Create: `web/src/components/ShhhIcon.tsx`, `web/src/components/ShhhBadge.tsx`
- Modify: `web/src/screens/RoomScreen.tsx` (put the badge in `room-header` before the `<h1>`), `web/src/styles.css`
- Test: `web/src/components/ShhhBadge.test.tsx`

**Interfaces:**
- Produces:
  - `ShhhIcon({ size, animated }: { size: number; animated?: boolean })`
    - Inline SVG with `aria-hidden="true"`, ported from `burning-room-prototype/Room.dc.html`: the ring, the lips paths, and the finger path with an ember fingertip.
    - With `animated`, the finger drifts up 2.5 px and the ring contracts from 30 to 27, on a 2.6 s loop. Use CSS `@keyframes` on classes, not SMIL, and switch them off under `prefers-reduced-motion`.
  - `ShhhBadge()`
    - A 44 px button with `aria-label="About this room"` and `aria-expanded`.
    - It toggles a `<p role="status">` containing the badge line.

- [ ] **Step 1: Write the failing tests:**
  - The badge line is hidden at first, and `aria-expanded` is `"false"`.
  - One click shows the line, exactly as in Global Constraints, and `aria-expanded` becomes `"true"`.
  - A second click hides the line again.
  - `RoomScreen`, rendered with the fixture state, shows the badge button by its label.
- [ ] **Step 2:** Run `npx vitest run src/components/ShhhBadge.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement both components. Wire the badge into the header. Add the `--br-*` tokens and the badge CSS (ivory icon, line on a dark panel with a 1 px border).
- [ ] **Step 4:** Run the full suite, `npm run lint` and `npm run build`. Expected: all pass.
- [ ] **Step 5:** Commit: `[Web] Burning Room: Shhh icon and header badge`.

### Task 3: "Burn room…" control and confirmation sheet

**Files:**
- Create: `web/src/components/BurnConfirm.tsx`
- Delete: `web/src/components/BurnButton.tsx`
- Modify:
  - `web/src/screens/RoomScreen.tsx`: the host gets a "Burn room…" button in place of `BurnButton`, keeping the divider before Leave. The sheet opens from it, and `onBurn` is called from the sheet.
  - `web/src/styles.css`
  - the tests that use the two-tap flow: `src/screens/BurnRoom.test.tsx`, `src/screens/LeaveRoom.test.tsx` (the button name stays "Burn room…"; keep the `burn` class on it so the existing class assertion holds) and `src/privacy.test.tsx` (click "Burn room…" then "Burn room")
- Test: `web/src/components/BurnConfirm.test.tsx`

**Interfaces:**
- Produces: `BurnConfirm({ pending, onBurn, onKeep }: { pending: boolean; onBurn: () => void; onKeep: () => void })`
  - It's a `role="dialog"` with `aria-modal="true"`, labelled by its title, over a scrim. Focus moves to "Keep talking" when it opens.
  - Escape and a scrim click both call `onKeep`.
- Consumes: `RoomScreen`'s existing `pending` prop. `pending === 'burn'` means the sheet shows a disabled "Burning…" button.

- [ ] **Step 1: Write the failing tests:**
  - It renders the title and body exactly as in Global Constraints.
  - "Keep talking", Escape and a scrim click each call `onKeep` once.
  - "Burn room" calls `onBurn` once.
  - **Review Focus 1:** clicking "Burn room" twice with `pending` flipping to `true` after the first click gives exactly one `onBurn` call. Re-render with `pending` and assert the button reads "Burning…" and is disabled.
  - In `RoomScreen`: a non-host sees no "Burn room…"; a host clicks "Burn room…" and the dialog appears.
- [ ] **Step 2:** Run `npx vitest run src/components/BurnConfirm.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement the sheet and the wiring. When `pending` goes from `'burn'` back to `null` and RoomScreen gets an `error`, the sheet closes and the existing error line shows. Style it with the ember outline (control) and ember fill (sheet button).
- [ ] **Step 4:** Update the three old tests to the new flow. Then run the full suite, lint and build. Expected: all pass.
- [ ] **Step 5:** Commit: `[Web] Burning Room: Burn room… with a confirmation sheet`.

### Task 4: Entry ritual

**Files:**
- Create: `web/src/components/EntryRitual.tsx`
- Modify: `web/src/App.tsx` (`RoomSession` holds `entered`, initially `false`, and passes `entered` and `onEnter` to `RoomScreen`), `web/src/screens/RoomScreen.tsx` (renders `<EntryRitual>` as an absolute overlay over `main.room` while `!entered`), `web/src/styles.css`
- Test: `web/src/components/EntryRitual.test.tsx`

**Interfaces:**
- Produces:
  - `EntryRitual({ onEnter }: { onEnter: () => void })`: shows the animated `ShhhIcon`, the heading, a `<ul>` of the four rules in order, and the "Enter room" button.
  - New `RoomScreen` props: `entered?: boolean` and `onEnter?: () => void`, defaulting to `true` and a no-op, so existing tests still render the room directly.
- **Notes:**
  - The ritual is in memory only, so a new session (Leave) shows it again.
  - The overlay covers the whole screen, which also makes push-to-talk unusable until Enter.

- [ ] **Step 1: Write the failing tests:**
  - It renders the heading and the four rules in order, exactly as given.
  - "Enter room" is enabled at once, and clicking it calls `onEnter`.
  - **App-level:** with the mock client, after "Create room", the ritual is shown and "Hold to talk" is not reachable through `getByRole`, because it's covered and `aria-hidden` sits on the room behind. After "Enter room", the ritual is gone and "Hold to talk" is reachable.
- [ ] **Step 2:** Run `npx vitest run src/components/EntryRitual.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement it. While the ritual shows, the room behind gets `aria-hidden="true"` and `inert`. On Enter, the icon shrinks toward the badge (about 250 ms, CSS); with reduced motion, there's no transition.
- [ ] **Step 4:** Run the full suite, lint and build. Expected: all pass. Existing App-level tests that click straight into the room must now click "Enter room" first; update them.
- [ ] **Step 5:** Commit: `[Web] Burning Room: entry ritual`.

### Task 5: Closing room view (input closed, ignition, burn surface)

**Files:**
- Create: `web/src/components/BurnIgnition.tsx`
- Modify:
  - `web/src/screens/RoomScreen.tsx`:
    - a new `closing?: { phase: ClosingPhase; startedAt: number; seed: number } | null` prop
    - a wrapper `<div className="room-board">` (`position: relative`) around `room-banner`, `RoomStage`, `room-transcript` and `room-popup-slot`
  - `web/src/styles.css`
- Test: `web/src/screens/ClosingRoom.test.tsx`

**Interfaces:**
- Consumes: `ClosingPhase` from Task 1.
- Produces: `BurnIgnition({ animated }: { animated: boolean })`. It's `role="status"`, shows `ShhhIcon` and the ignition line, and drops one ember from about 23% to 98.5% of the board's height (CSS, 0.5 s, 0.1 s delay). With `animated` false, the ember sits at the bottom.
- **Behaviour when `closing` is set** (any phase):
  - push-to-talk becomes a disabled "Room closed" button
  - `TypeLine`, the replay button, the pop-up, the story card and the recap toggle are not rendered or are inert
  - an open `LeaveConfirm` or `BurnConfirm` sheet closes when closing starts; the header's Leave button keeps working afterwards (Task 6 tests leaving mid-burn)
  - `useVoice` receives `undefined` as its transport, which stops the mic
  - `ListeningIndicator` gets `micLive={false}`
  - `RoomStage` gets `speaker={null}`
  - `BurnIgnition` shows while `phase === 'ignite'`

  The header, `ConnectionBanner` and the error line stay outside `room-board`.

- [ ] **Step 1: Write the failing tests** (using the fixture state, `self` = Taylor):
  - With `closing={{ phase: 'ignite', … }}`: "Room closed" is disabled, "Hold to talk" is absent, and "That's between us." is present.
  - **Review Focus 2:** render with a story card open, plus separately with a pop-up showing, plus with the Leave confirmation open. Then re-render with `closing`. The card, pop-up and Leave dialog are gone, and no recall chip is in the page.
  - With `phase: 'burning'`: the ignition line is gone and "Room closed" is still shown.
  - **Mic:** a fake `voice` transport whose controller stop is observable through `useVoice`. Simplest: spy that `transport.sttToken` stops being used, or mock `../voice/useVoice` and assert it's called with `undefined` once `closing` is set.
  - The header and `ConnectionBanner` are outside `.room-board`; the transcript and the popup slot are inside it.
- [ ] **Step 2:** Run `npx vitest run src/screens/ClosingRoom.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement it, keeping existing layout classes. `.room-board` should take the same flex role the transcript region had, so the room looks the same when it isn't closing.
- [ ] **Step 4:** Run the full suite, lint and build. Also check in the browser at 375×812 that the live room looks unchanged.
- [ ] **Step 5:** Commit: `[Web] Burning Room: closing room view and ignition`.

### Task 6: `useClosing` and the App flow (frozen copy, triggers, clean-slate hand-off)

**Files:**
- Create: `web/src/room/useClosing.ts`
- Modify:
  - `web/src/room/useRoom.ts`: add `burnConfirmed: boolean`, set to `true` when `client.burn()` resolves without throwing, and never reset within a session
  - `web/src/App.tsx`: `RoomSession` uses `useClosing` and renders `RoomScreen` from the frozen copy with `closing` until `phase === 'done'`, then `BurnedScreen`
- Test: `web/src/room/useClosing.test.tsx`, `web/src/screens/BurnFlow.test.tsx`

**Interfaces:**
- Consumes: `closingPhase`, `DONE_MS` and `seedFromRoomId` from Task 1; `RoomScreen`'s `closing` prop from Task 5.
- Produces: `useClosing(state: RoomState, roomId: string | null, burnConfirmed: boolean): { closing: { phase: ClosingPhase; startedAt: number; seed: number } | null; frozen: RoomState | null; done: boolean }`
  - It keeps the last `state` whose `status === 'active'` as `frozen`.
  - It starts once, when `state.status === 'burned' || burnConfirmed` first becomes true. `startedAt` is `Date.now()` at that moment.
  - It schedules updates at `IGNITE_MS`, `BURN_START_MS + BURN_DURATION_MS` and `DONE_MS`.
  - At `DONE_MS` it sets `frozen` to `null` and `done` to `true`.
  - If it starts with no active state ever seen, it reports `done` at once.
  - It clears its timers on unmount.
  - Make it lint-clean, including the react-hooks rules: no ref reads or writes during render. Use the "adjust state while rendering" pattern, as `room/speaking.ts` does.

- [ ] **Step 1: Write the failing hook tests** (`renderHook`, fake timers):
  - Active, then burned: `closing.phase` is `'ignite'` at once, `frozen` holds the last active lines, `'burning'` after 600, `'settle'` after 2560, and `done` with `frozen === null` after 2900.
  - `burnConfirmed` going true while the state is still active starts closing. A later `burned` state doesn't restart it: `startedAt` is unchanged and `done` still comes at 2900 from the first start. (**Review Focus 5**)
  - `seed === seedFromRoomId(roomId)`.
  - Unmounting mid-closing clears the timers: no warnings or updates after unmount.
- [ ] **Step 2: Write the failing App-level tests** (`BurnFlow.test.tsx`, fake timers):
  - **Host, mock client:** Create room → Enter room → "Burn room…" → "Burn room". Then "Room closed" and "That's between us." are on screen and the Kevin text is still visible. After 2900 ms, "Room burned." shows and `document.body.textContent` contains neither "Kevin" nor "cake".
  - **Non-host:** a fake client delivers fixture events, then `room_burned` with no tap. The same closing plays.
  - **Failed burn:** a fake client whose `burn()` rejects with a `BackendError`. The error line shows, there's no "Room closed", and after 3000 ms the room is still live.
  - **Burn during the entry ritual:** `room_burned` arrives before "Enter room". The ritual closes and closing plays.
  - **Review Focus 3:** at 1000 ms into closing, click "Leave", then "Leave room" in its confirmation. Advancing 5000 ms shows the fresh Join screen and never "Room burned.".
- [ ] **Step 3:** Run `npx vitest run src/room/useClosing.test.tsx src/screens/BurnFlow.test.tsx`. Expected: FAIL.
- [ ] **Step 4:** Implement the hook and the wiring. `RoomSession` renders:
  - `JoinScreen` while there's no `self`
  - otherwise, while closing and not done, `RoomScreen` from `frozen` with `closing`
  - otherwise, if `done` or `state.status === 'burned'` with nothing to freeze, `BurnedScreen`
  - otherwise the live room
- [ ] **Step 5:** Run the full suite, lint and build. Commit: `[Web] Burning Room: server-confirmed closing over a frozen room`.

### Task 7: `BurnOverlay` canvas (ported dissolve)

**Files:**
- Create: `web/src/components/BurnOverlay.tsx`
- Modify:
  - `web/src/screens/RoomScreen.tsx`: while `closing` is set, render `<BurnOverlay>` inside `.room-board`, with absolute inset 0 and `pointer-events: none`
  - `web/src/test/setup.ts`: stub `HTMLCanvasElement.prototype.getContext` to return `null`, so jsdom doesn't log "Not implemented"
- Test: `web/src/components/BurnOverlay.test.tsx`

**Interfaces:**
- Produces: `BurnOverlay({ startAt, durationMs, seed, reducedMotion }: { startAt: number; durationMs: number; seed: number; reducedMotion: boolean })`
  - `startAt` is an epoch ms, equal to `closing.startedAt + BURN_START_MS`.
  - `RoomScreen` computes `reducedMotion` from `matchMedia('(prefers-reduced-motion: reduce)')`, guarded.
- **Port from `burning-room-prototype/BurnLayer.dc.html`** the members `rng`, `lattice`, `build`, `paint`, `spawn`, `drawParts`, `drawPart`, `frame` and `front`, with their numbers unchanged:
  - cell 3
  - lattice steps 18 and 5
  - field weights 0.78, 0.22 and 0.24
  - bands 0.07, 0.035 and 0.012
  - 0.01 edge fade
  - glow alpha 0.45 with `blur(6px)` when `ctx.filter` is supported
  - at most 70 particles
  - easing `0.55·c + 0.45·smoothstep(c)`
  - `front(p) = 0.035 + 1.3·p`
  - reduced motion: a fade to `--br-charcoal` over the first 30% of the duration

  Drop the prototype's backdrop and static mode. Size the canvas from `getBoundingClientRect()` and retry on the next animation frame until the size is at least 2×2. Cancel the animation frame on unmount.

- [ ] **Step 1: Write the failing tests:**
  - With the stub returning `null`, it mounts and unmounts without throwing or logging an error.
  - It renders a `<canvas aria-hidden="true">`.
  - **Review Focus 4, App-level, extending `BurnFlow.test.tsx`:** with `window.matchMedia` stubbed to report reduced motion, a host burn still reaches "Room burned." at 2900 ms. The overlay gets `reducedMotion === true`; check it through a test id or `data-reduced` attribute on the canvas.
- [ ] **Step 2:** Run `npx vitest run src/components/BurnOverlay.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement the port.
- [ ] **Step 4:** Run the full suite, lint and build.
- [ ] **Step 5:** Commit: `[Web] Burning Room: canvas burn overlay`.

### Task 8: Clean slate and restart

**Files:**
- Modify:
  - `web/src/screens/BurnedScreen.tsx`: rewritten
  - `web/src/App.tsx`: `App` gains `restart(mode: 'new-room' | 'home', name?: string)`. It disposes the current client, removes `room` from the URL search with `history.replaceState`, and starts a fresh session with `makeClient()`. For `'new-room'`, the fresh session calls `create(name)` once on mount, then shows the entry ritual.
  - `web/src/styles.css`
- Test: `web/src/screens/BurnedScreen.test.tsx`, plus more cases in `BurnFlow.test.tsx`

**Interfaces:**
- Produces: `BurnedScreen({ onNewRoom, onHome }: { onNewRoom?: () => void; onHome?: () => void })`. The buttons render only when their handler is given, so `BurnedScreen` still works without `makeClient`.

- [ ] **Step 1: Write the failing tests:**
  - It renders the five clean-slate strings exactly as given.
  - "Start a new room" calls `onNewRoom`, and "Back home" calls `onHome`.
  - **App-level:** after a host burn finishes, "Back home" shows the Join screen with "Create room", and `location.search` no longer contains `room=`. To set up, start from `search="?room=demo"` with `history.replaceState` before rendering.
  - **App-level:** "Start a new room" calls `createRoom` on the new client with the same nickname and shows the entry ritual.
- [ ] **Step 2:** Run `npx vitest run src/screens/BurnedScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement it, styled with the burn tokens: centred on `--br-charcoal`, ivory text, and the small line in `--br-ash`, which must pass 4.5:1 on charcoal; lighten it if it doesn't.
- [ ] **Step 4:** Run the full suite, lint and build.
- [ ] **Step 5:** Commit: `[Web] Burning Room: clean slate and restart`.

### Task 9: Browser check

- [ ] **Step 1:** Run `npm run build` and serve `web/dist` on a free port, e.g. `python -m http.server 5176 -d web/dist`. Open it in the browser pane at 375×812.
- [ ] **Step 2:** Walk the host flow with `?speed=2`:
  - Create room → ritual → Enter room
  - the badge line toggles
  - "Burn room…" → sheet → "Burn room"
  - watch: "That's between us." and the ember drop → burn edge from the bottom middle → charcoal → "Room burned."

  Throughout, the header and "Room closed" button stay visible and unburned.
- [ ] **Step 3:** Repeat at 375×568, and once with reduced motion emulated (`resize_window` `colorScheme` doesn't cover it; use DevTools' rendering emulation or a `matchMedia` stub through the browser's JS tool).
- [ ] **Step 4:** Record what each phase looked like in the final report, including anything that differs from the prototype.

**Done when:** the full suite, lint and build pass, and the walk-through matches the approved prototype on both screen sizes.
