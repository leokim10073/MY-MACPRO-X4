# Web Phase 2 Implementation Plan: the real backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** approved 2026-10-24. D2 is decided as "rejoin on reload" and D3 as "web-local backend API types".

**Goal:** Run the phone app against the Convex backend reliably enough for the Sat noon checkpoint: transcript → AI → recall pop-up on a real phone. The mock must stay one URL change away.

**Starting point:**
- `main` already has a working `ConvexRoomClient` (teammate PR #2: `web/src/room/convex/`).
- It already does five things:
  - subscribes to `events.listAfter` from eventSeq 0 with `ConvexClient.onUpdate`
  - removes duplicate events by eventSeq
  - turns `status: "burned"` into `room_burned`
  - implements create, join and burn
  - has unit tests and a live test (`LIVE_CONVEX_URL`)
- So Phase 2 hardens and aligns that client; it doesn't write a new one. The reducer and screens don't change.

**Architecture:**
- One function, `createRoomClient(search, env)`, picks `MockRoomClient` or `ConvexRoomClient` from `?client=`.
- `ConvexRoomClient` gets four things:
  - a pure row parser
  - a pure log follower (ordering, duplicates, gaps, windowing)
  - connection status
  - timeouts and error mapping on mutations

**Tech Stack:** unchanged. `convex@1.48.0` is already in `web/package.json`. No new packages.

**Spec:** [design.md](design.md), issue 4(a). Backend contract: [../../backend/README.md](../../backend/README.md) and `backend/convex/{events,rooms,lines,replay,ai}.ts` (read-only for us).

## Global Constraints
- Don't edit `backend/` or `shared/schema.ts`. Needed changes go to the backend owner as proposals (bottom of this file).
- The client is chosen in exactly one place, from `?client=mock|convex`. **Mock is the default** (decided).
- The Convex URL comes only from `import.meta.env.VITE_CONVEX_URL` (`web/.env.local`, git-ignored). Never hard-code it.
- No conversation text in browser storage or logs. The existing ESLint ban and `privacy.test.tsx` must stay green with the Convex client too.
- The reducer (`roomReducer`), `popupReducer` and the screens' props stay as they are. New UI only for connection state and errors.
- Commit after each task with a `[Web] …` message. Never push without asking.

## Review Focus
1. **Phone wakes after sleep:** the socket reconnects and the full log is resent, so no line or pop-up shows twice. Covered by the Task 3 duplicate test.
2. **Backend unreachable while joining:** Convex queues the mutation forever, so Join must time out with a clear message and offer the offline demo. Covered by the Task 4 timeout test.
3. **Invite link opened on another phone:** it must keep `client=convex`, or the friend lands in the mock room. Covered by the Task 1 invite-URL test.
4. **Burn while a pop-up or card is open on the Convex client:** both phones end, and nothing stays visible. Covered by the Task 5 test.
5. **A long room with many story snapshots:** each update resends the whole log, so its size must stay bounded. Covered by the Task 3 windowing test.

---

### Task 1: Leftovers, single client-selection point, backend-independent build

**Files:**
- Modify: `.gitignore` (add `.claude/launch.json`)
- Create: `web/src/room/createRoomClient.ts`, `web/src/room/createRoomClient.test.ts`
- Create: `web/src/room/convex/backendApi.ts` (web-local typed references; see the decision note below)
- Modify:
  - `web/src/main.tsx`
  - `web/src/App.tsx`: `client` becomes required, `defaultClient` is removed, and the invite URL is built by a helper
  - `web/src/room/convex/ConvexRoomClient.ts`: imports `backendApi`, not `backend/convex/_generated`
  - `web/src/room/convex/live.test.ts`: same import change
  - `web/src/config.ts`: add `readInviteToken`
  - `web/README.md`

**Interfaces:**

```ts
export type ClientKind = 'mock' | 'convex'
export interface ClientChoice { kind: ClientKind; client: RoomClient }
export class ClientConfigError extends Error {}               // ?client=convex but no VITE_CONVEX_URL
export function createRoomClient(search: string, env: { VITE_CONVEX_URL?: string }): ClientChoice
export function readInviteToken(search: string): string | undefined
export function inviteUrl(origin: string, pathname: string, kind: ClientKind, token: string): string
// → `${origin}${pathname}?client=${kind}&room=${token}`
```

**Rules for `createRoomClient`:**
- `?client=convex` with a URL gives Convex.
- `?client=convex` without a URL throws `ClientConfigError`. `main.tsx` then renders a one-screen message, "Backend not configured", with a link to `?client=mock`.
- Anything else gives the mock. That covers no param, `?client=mock`, the legacy `?mock` and unknown values.
- Tests construct `App` with an explicit client, so `MODE === 'test'` needs no special case.

**DECIDED D3: web-local function types.**
- **The problem:** today `ConvexRoomClient` type-imports `backend/convex/_generated/api`. That pulls every backend source file into `tsc -b`, so `npm --prefix web run build` **fails with 94 type errors unless `backend/node_modules` is installed**. I reproduced this on `web/phase2`.
- **Recommended:** a web-local `backendApi.ts` with explicit function references for the six functions web calls:
  - `rooms:create`, `rooms:join`, `rooms:burn`
  - `events:listAfter`
  - `lines:add`
  - `replay:start`

  Build each with `makeFunctionReference<'mutation' | 'query', Args, Return>(name)` from `convex/server`. `live.test.ts` stays the drift check against a real backend.
- **Alternative:** keep the import and document "run `npm --prefix backend install` before building web."

- [ ] **Step 1:** write failing tests for `createRoomClient`, `readInviteToken` and `inviteUrl`:
  - default is mock
  - `?client=mock` gives mock
  - `?mock` gives mock
  - `?client=convex` with a URL gives an instance of `ConvexRoomClient`, built from a URL string. Stub the `ConvexClient` constructor with `vi.mock('convex/browser')`.
  - `?client=convex` without a URL throws `ClientConfigError`
  - the invite URL keeps `client=convex`
- [ ] **Step 2:** run `npx vitest run src/room/createRoomClient.test.ts`. Expect FAIL.
- [ ] **Step 3:** implement. `App` shows the invite link whenever the room has an `inviteToken` and `kind === 'convex'`. `main.tsx` passes `kind` down as a prop.
- [ ] **Step 4:** run the full suite, `npm run lint`, and `npm run build` **with `backend/node_modules` absent**. All must pass.
- [ ] **Step 5:** commit `[Web] Pick the room client in one place from ?client=; build without backend deps`.

**Done when:**
- `main.tsx` is the only file that constructs a client.
- `App.tsx` imports neither client class.
- The build passes on a clean checkout with only `web/node_modules` installed.

### Task 2: Pure row → RoomEvent parser

**Files:**
- Create: `web/src/room/convex/parseEventRow.ts`, `web/src/room/convex/parseEventRow.test.ts`
- Create: `web/src/room/convex/__fixtures__/events.sample.json`, holding real rows from the backend (see the note below)

**Interfaces:**

```ts
export interface EventRow { eventSeq: number; event: RoomEvent }
export type ParsedRow = { ok: true; row: EventRow } | { ok: false; eventSeq: number | null; reason: string }
export function parseEventRow(raw: unknown): ParsedRow
```

**Rules:**
- `eventSeq` must be an integer ≥ 1.
- `event.type` must be one of the six `RoomEvent` types.
- Each variant must carry its payload object with the fields the reducer reads:
  - `member_joined`: `member.id`, `member.joinedAtSeq`
  - `line_added`: `line.id`, `line.seq`, `line.text`, `line.speakerName`
  - `story_state_updated`: `storyState.uptoSeq`, `storyState.people[]`, `storyState.stories[]`
  - `recall`: `recall.id`, `recall.seq`, `recall.personId`, `recall.storyIds[]`, `recall.confidence`
  - `recap_ready`: `recap.id`, `recap.uptoSeq`, `recap.text`
  - `room_burned`: `roomId`
- Anything else becomes `{ ok: false }`. The row is never thrown. The reason string contains no conversation text, only the type and field name.
- Extra fields pass through untouched.

**Test data (I need this from you):**
- Ask the backend owner to export the events of one real dev room, after a replay, a late join and at least one recall. That requires the AI to be wired, or a recall row inserted by hand.
- Export with `npx convex data events --limit 100 --format jsonl > events.sample.jsonl`, run before burning, because burn deletes the log.
- Until those arrive, the tests use rows built from `backend/convex/lib.ts`'s converters applied to `kevin.expected.json`. Mark those tests `// TODO replace with real rows`.

- [ ] **Step 1:** write failing tests:
  - every row in `events.sample.json` parses `ok`
  - folding the parsed events through `roomReducer` gives a state with the same number of lines as the sample
  - one test per broken shape: missing `type`, unknown `type`, `eventSeq` 0, `recall` without `storyIds`, `line_added` with a non-numeric `seq`
- [ ] **Step 2:** run them and confirm they fail. Implement. Run them and confirm they pass.
- [ ] **Step 3:** commit `[Web] Parse Convex event rows into RoomEvents in one pure function`.

**Done when** every event type in the real sample parses, and every malformed shape is rejected with a reason and no throw.

### Task 3: Log follower (ordering, duplicates, gaps, windowing) and connection status

**Files:**
- Create: `web/src/room/convex/logFollower.ts`, `web/src/room/convex/logFollower.test.ts`
- Modify: `web/src/room/convex/ConvexRoomClient.ts` and its test
- Modify: `web/src/room/RoomClient.ts` (add the optional connection API)
- Create: `web/src/components/ConnectionBanner.tsx` and its test
- Modify: `web/src/screens/RoomScreen.tsx` (render the banner in `room-header`), `web/src/room/useRoom.ts`

**Interfaces:**

```ts
// logFollower.ts — pure, no Convex import
export interface FollowerState { lastEventSeq: number; dropped: number }
export type FollowerOutput =
  | { kind: 'events'; events: RoomEvent[]; next: FollowerState; resubscribeFrom?: number }
  | { kind: 'burned' }
  | { kind: 'gap'; expected: number; got: number; next: FollowerState; resubscribeFrom: number }
export const WINDOW_SIZE = 200
export function follow(state: FollowerState, log: { status: 'active' | 'burned'; events: unknown[] }): FollowerOutput

// RoomClient.ts — optional so MockRoomClient needs no change
export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'lost'
export interface RoomClient { /* …existing… */ onConnectionChange?(listener: (s: ConnectionStatus) => void): () => void }
```

**Rules for `follow`:**
- Parse each row with `parseEventRow`. Count rejected rows in `dropped` and skip them.
- Skip `eventSeq <= lastEventSeq`, which removes duplicates when the whole log is resent.
- Emit the rest in ascending eventSeq.
- **Gap:** if the first new row's eventSeq is greater than `lastEventSeq + 1`, return `gap`. This should not happen with a log from 0, so it means rows were missed. Emit nothing and ask to resubscribe from `lastEventSeq`.
- **Windowing:** when a log update contains more than `WINDOW_SIZE` rows, return `resubscribeFrom: next.lastEventSeq`. The client then calls `onUpdate` again with `afterEventSeq = lastEventSeq` and stops the old subscription. That keeps each update small, which matters because every new line otherwise resends every story snapshot.
- `status: "burned"` returns `burned`.

**Connection status in `ConvexRoomClient`:**
- **Source:** read `ConvexClient`'s connection state (`client.connectionState()`, polled every 1 s, or its subscription API if present in 1.48). Map it to `ConnectionStatus`: not yet connected gives `connecting`, connected gives `online`, and a retry in progress gives `reconnecting`.
- **Subscription error:** call `onUpdate`'s error callback when the subscription fails, for example "Not a member of this room". The error gives `lost`, and the client stops the subscription.
- **Phone sleep:** on `visibilitychange` to visible after more than 30 s hidden, resubscribe from `lastEventSeq`. This covers phones that suspend the socket.
- **ConnectionBanner:**
  - `reconnecting`: "Reconnecting…", subtle, no layout jump
  - `lost`: "Lost connection to the room" with a **Rejoin** button that reloads the page, which joins again as a new member and gets a recap. See D2.
  - `online` and `connecting` after the first join: nothing

**DECIDED D2: reload means rejoining as a new member.**
- **The problem:** the `sessionToken` lives only in memory, so a reload makes you a new member.
- **Recommended:** keep it that way for Phase 2. It's simple and private, and a rejoin gets a fresh recap.
- **Alternative:** keep the token in `sessionStorage`. It isn't conversation text, but `privacy.test.tsx` spies on all `setItem` calls and would need an allow-list.

- [ ] **Step 1:** write failing `logFollower` tests:
  - the full log resent three times emits each event once
  - out-of-order rows in one update come out sorted
  - a first row at seq 5 when the last was 2 gives `gap` with `resubscribeFrom` 2
  - 201 rows give `resubscribeFrom`
  - a rejected row is skipped and counted
  - burned gives `burned`
- [ ] **Step 2:** write failing `ConvexRoomClient` tests with the existing fake Convex:
  - a gap or window result calls `onUpdate` again with `afterEventSeq: lastEventSeq` and stops the old subscription
  - the error callback produces `lost`
  - a simulated `visibilitychange` after 31 s resubscribes
  - **Review Focus 1:** after a resubscribe from 0, nothing is emitted twice
- [ ] **Step 3:** implement and run the tests.
- [ ] **Step 4:** write a `ConnectionBanner` test for the text in each status.
- [ ] **Step 5:** full suite, lint and build. Commit `[Web] Follow the Convex event log safely: dedupe, gaps, windowing, reconnect status`.

**Done when** all the cases above are covered by tests, and toggling the laptop's Wi-Fi in a manual test shows "Reconnecting…" and recovers without duplicates.

### ⛔ STOP: check-in 1

Report:
- **What works:** parser, follower and connection status.
- **Test results.**
- **Real rows:** whether the real sample rows arrived and parse.
- **Measured update size:** the update size for a replayed Kevin room (log the JSON byte length in the live test).

Wait for approval before Task 4.

### Task 4: Mutations with loading, timeouts and readable errors; send line; replay button

**Files:**
- Create: `web/src/room/convex/callBackend.ts` and its test
- Modify: `web/src/room/RoomClient.ts`, `web/src/room/convex/ConvexRoomClient.ts`, `web/src/room/mock/MockRoomClient.ts`
- Modify: `web/src/room/useRoom.ts`, `web/src/screens/JoinScreen.tsx`, `web/src/components/BurnButton.tsx`, `web/src/screens/RoomScreen.tsx`
- Tests: `JoinScreen.test.tsx`, `BurnRoom.test.tsx`, and a new `TypeLine.test.tsx`

**Interfaces:**

```ts
export type BackendErrorKind = 'unreachable' | 'room_ended' | 'bad_name' | 'not_member' | 'not_host' | 'unknown'
export class BackendError extends Error { constructor(readonly kind: BackendErrorKind, message: string) }
export const MUTATION_TIMEOUT_MS = 10_000
export function callBackend<T>(run: () => Promise<T>, timeoutMs?: number): Promise<T>  // maps ConvexError messages + timeout → BackendError

// RoomClient additions (MockRoomClient implements them too)
addLine(text: string, at: number): Promise<void>      // Convex → lines.add; Mock → appends a local line_added at the next seq
startReplay?(): Promise<void>                         // Convex → replay.start (host); Mock → undefined
// useRoom additions
pending: 'create' | 'join' | 'burn' | null; error: { kind: BackendErrorKind; message: string } | null
```

**Error mapping:** the backend's messages, verbatim, map to these kinds and user copy:

| Backend message | Kind | What the user sees |
| --- | --- | --- |
| "This room has ended" | `room_ended` | "This room has ended or the invite link is wrong." See proposal B2. |
| "Nickname must be 1 to 30 characters" | `bad_name` | the backend's message as-is |
| "Not a member of this room" | `not_member` | "You're not in this room anymore." |
| "Only the host can do that" | `not_host` | "Only the host can do that." |
| a timeout | `unreachable` | "Can't reach the server." plus a button: "Try the offline demo" (a link to `?client=mock`) |
| anything else | `unknown` | "Something went wrong. Try again." |

**UI:**
- **Join:**
  - The button shows "Connecting…" and is disabled while `pending`.
  - The nickname field gets `maxLength={30}`.
  - Errors appear in the existing alert.
- **Burn:** "Burning…" while pending. On error the room stays and a short alert shows.
- **Dev-only typed line:** with `?type=1`, the room shows a small text field plus Send that calls `addLine`. This lets the two-phone test add a human line without voice. Hidden otherwise.
- **Replay button:** with `?replay=1`, a host on Convex sees "Start Kevin replay", which calls `startReplay`. That gives the demo a backup without the CLI.
- **Voice:** the voice owner's `PushToTalk` controller (branch `voice`, not yet on main) will call `addLine`. Wiring the mic is out of scope here; see the risks.

- [ ] **Step 1:** write failing tests:
  - `callBackend` maps each backend message to its kind
  - a never-resolving call times out with `unreachable` at 10 s (fake timers)
  - **Review Focus 2:** joining while unreachable shows "Can't reach the server." and the offline-demo link
  - the Join button is disabled while pending
  - Burn shows the error and keeps the room
  - `addLine` on Convex calls `lines:add` with `{ sessionToken, text, at }`
  - the mock's `addLine` produces a `line_added` at the next seq
  - the typed-line field is hidden without `?type=1`
  - the replay button shows only for a host with `?replay=1`
- [ ] **Step 2:** implement and run. Full suite, lint and build.
- [ ] **Step 3:** commit `[Web] Backend calls with timeouts and readable errors; send line; replay button`.

**Done when** every error kind has a test and user copy, and no mutation can leave a spinner forever.

### Task 5: Burn while subscribed, and recap matching, on the Convex path

**Files:**
- Create: `web/src/room/convex/convexFlow.test.tsx`
- Modify: `web/src/room/state.ts` (comments only)

**What it checks:** an App-level test with the fake Convex.
- **Late join:** the fake log streams the converted `kevin.expected.json` events with `member_joined` for self (joinedAtSeq 16). Then:
  - `recap_ready` with `uptoSeq: 16` shows in the banner (`recapFor`)
  - a recap with `uptoSeq: 12`, meant for someone else, does not show
  - r2 arrives, and the pop-up shows
  - tapping Cake opens the card
- **Burn (Review Focus 4):** the log flips to `{ status: "burned", events: [] }`. The test asserts that:
  - the ended screen shows
  - no "Kevin" text is left
  - the subscription stopped
  - a later `addLine` is a no-op

**Recap rule:** recap matching stays in `recapFor` (`uptoSeq === joinedAtSeq`). The backend guarantees it: `ai.recapInput` sets `uptoSeq = member.joinedAtSeq`. Add a comment pointing to that, and to proposal B3 for when `forMemberId` lands.

- [ ] **Step 1:** write the test. It should pass with Tasks 1–4 done. If it fails, fix in the owning module, not in the test.
- [ ] **Step 2:** commit `[Web] Convex path: late-join recap and burn end to end in tests`.

**Done when** the test passes and `privacy.test.tsx` also runs once with the fake Convex client, with zero storage writes.

### Task 6: Rollback and demo configuration

**Files:** `web/README.md` and `web/docs/demo-runbook.md` (new).

**Runbook:**
1. **Phone bookmarks:** two per demo phone.
   - `…/?client=convex` for live
   - `…/?client=mock&room=demo&pauseAfterJoin=15000` for the backup
2. **Rollback in seconds:** open the mock bookmark. The mock is also the default, so dropping `?client=convex` is enough. No rebuild, no redeploy, no env change.
3. **If the backend drops mid-demo:** the banner says "Lost connection". Switch to the mock bookmark, and say on stage that it's a replay.
4. **Pre-flight checklist:**
   - the Convex dev URL is reachable from the phone network
   - `VITE_CONVEX_URL` is set
   - a test room was created and burned
   - the AI is not stubbed (a replay produced at least one recall)

- [ ] **Step 1:** write both docs. Add a test that the default client with no params is the mock. Task 1 already has one; reference it.
- [ ] **Step 2:** commit `[Web] Demo runbook and rollback to the mock`.

**Done when** someone else can switch a phone from live to mock in under 10 seconds by following the runbook.

### ⛔ STOP: check-in 2 (before the two-phone test)

**Before the test, confirm with the backend and AI owners:**
- the cloud dev deployment URL
- the AI functions are wired into `convex/ai.ts`, with `ANTHROPIC_API_KEY` set in the Convex env
- the replay plays the Kevin script

Report the results of Tasks 4–6, then wait for approval.

### Task 7: Two-phone end-to-end test (the Sat noon checkpoint)

**Needs:**
- a laptop on the venue Wi-Fi
- Phone A (host) and Phone B (latecomer), on the same Wi-Fi
- the cloud dev deployment, because phones can't reach `127.0.0.1`

**Steps:**
1. **Laptop:** set `web/.env.local` to `VITE_CONVEX_URL=<cloud dev URL>`, then `npm --prefix web run dev`. Note the `https://<LAN IP>:5173` address.
2. **Phone A:** open `https://<LAN IP>:5173/?client=convex&replay=1`, accept the certificate warning and **Create room** as "Alex". Expect the room screen with Listening and the invite link, which must contain `client=convex`.
3. **Phone A:** tap **Start Kevin replay**, or run `npx convex run replay:startLatest` from `backend/`. Expect lines to start appearing within 1 s on Phone A.
4. **Wait** until Phone A shows line 16 ("That is the most Kevin thing…"), about 40 s in.
5. **Phone B:** open the invite link from Phone A (AirDrop or retype it), accept the certificate and **Join room** as "Taylor".
6. **Phone B, ≤ 5 s:** the recap banner shows text (real AI text, or the stub "You joined after 16 lines…"), and the transcript shows only lines after 16.
7. **Phone B, ~6–15 s:** lines 17–21 arrive. The **Kevin** pop-up appears on "he just texted" or "after the cake thing", with at least the chips for stories already in the story state. Cake is highlighted on line 19.
8. **Phone B:** hold **Hold to talk** with one thumb and tap **Cake** with the other. The card opens and hold-to-talk stays pressed. This is the Phase 1 real-phone check.
9. **Phone A:** tap **Burn room** twice. Both phones show "This room has ended." within 2 s.
10. **Record:** the time from line 19 appearing on Phone A to the pop-up on Phone B. Also note any missing chip, duplicate line or error banner, and a screen recording from Phone B.

**Done when:** steps 2–9 pass on two real phones. Any failure is written down with its step number.

**Automated counterpart:** run `LIVE_CONVEX_URL=<url> npx vitest run src/room/convex/live.test.ts` and extend it to assert at least one `recall` after a replay, once the AI is live.

---

## Proposals for the backend owner (no edits from web)

| # | Proposal | Why |
|---|---|---|
| **B1** | **Wire the AI into `convex/ai.ts`.** The three functions are still `STUB` on `main`. `findRecalls` returns `[]` and `buildStoryState` returns `null`, so a real room never gets stories or recalls. The AI owner's code is on branch `ai/recall-story-recap` and isn't merged. | **Blocks the Sat noon checkpoint.** |
| B2 | Distinguish join errors with `ConvexError({ code })`: `ROOM_NOT_FOUND`, `ROOM_BURNED`, `BAD_NAME`. Today both "no such invite" and "burned" say "This room has ended". | Clearer errors for a wrong link. |
| B3 | Put the recap's owner in the event, since the `recaps` table already has `memberId`. Needs shared proposal P2 (`Recap.forMemberId?`) agreed first. | Recap matching stops depending on the `uptoSeq` coincidence. |
| B4 | Give `events.listAfter` an optional `limit` and return `hasMore`. | Bounds payload size. The web client also windows on its own (Task 3). |
| B5 | `replay.ts` says the script's late joiner is skipped, but `scheduleReplay` plays all 21 lines. A token-less "Taylor" member appears and speaks line 21. Either skip `lateJoiner`'s lines or fix the comment. | The demo has a real Taylor on a phone. |
| B6 | Run a slow-path pass before writing a late joiner's recap, and shorten the first slow-path delay (25 s today). | Stories exist when the recap and the first recalls arrive. Otherwise the pop-up shows fewer chips. |
| B7 | Share the cloud dev deployment URL. Optionally add a prod deployment for the demo, with `npm run deploy`. | Phones can't reach a local backend. |
| B8 | For voice: an action that mints a Cartesia STT token for a member, and `audioUrl` on recaps. | Not needed for Sat noon. Needed for live push-to-talk and spoken recaps. |
| B9 | Optional: validate `events.event` with a union validator instead of `v.any()`. | Bad rows fail on write, not on phones. |
| B10 | `listAfter` returns `{ status: "burned" }` for any unknown or invalid `roomId` too. Return a distinct `"gone"` status, or document it. | A typo'd room ID looks like a burn. |

## Shared schema proposals still open
P1–P4 from Phase 1 were **not adopted**; `shared/schema.ts` is unchanged since Phase 1. P3 (`RoomEventEnvelope`) exists, but it's defined privately in `backend/convex/events.ts`.

## Decisions marked NEEDS DECISION in this plan
- **D2:** survive a reload (`sessionStorage` token) vs. rejoin as a new member. Recommended: rejoin.
- **D3:** web-local backend API types vs. requiring `backend/node_modules` to build web. Recommended: web-local.
- **D1, already decided by you, flagged because it changes a teammate's behavior:** on `main` today the app uses Convex automatically whenever `VITE_CONVEX_URL` is set, and `?mock` forces the mock. This plan makes the mock the default, and Convex needs `?client=convex`. Tell khris1120, whose README section and invite link assume the old behavior.
