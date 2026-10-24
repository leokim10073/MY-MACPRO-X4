# Stage 2 (live call) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tap "Join call" and talk: friends hear each other over LiveKit, and each phone turns its owner's speech into transcript lines with Ink's turn detection, with noise filtering, interruption splits, mute, reconnect and burn.

**Architecture:**
- Each phone publishes its Krisp-processed mic to LiveKit and feeds the same processed track through a self-learning loudness gate into one long-lived Ink `/stt/turns/websocket` connection.
- `OpenMic` is the controller web will use, styled like stage 1's `PushToTalk`.
- Everything is built and phone-tested inside `voice/`, on the voice test page and `devApi.ts`.

**Tech Stack:** TypeScript, Vite 8, Vitest 5, `livekit-client@2.22.4`, `@livekit/krisp-noise-filter@0.4.5`, `livekit-server-sdk@2.19.1`, Cartesia Ink-2.

**Spec:** [voice/stage2-design.md](stage2-design.md). Read it before any task; section numbers below refer to it.

## Global Constraints

- **Only files under `voice/` are created or changed.** Never edit `web/`, `backend/`, `ai/`, `shared/` or the repo root. What those folders need goes into `voice/README.md` (Task 12).
- No schema change. Lines are `NewTranscriptLine = { roomId, speakerId, text, at }` from `shared/schema.ts`.
- Audio is never stored, written to a file or logged (P5).
- Transcript text, tokens and keys are never logged (`console.*`), including in error paths.
- Ink's words are never changed or added to (P7). No markers such as "[cut by disconnect]". Lines are only cut (Task 11).
- `isListening` is true exactly while audio is going (or queued to go) to Ink. It is false while muted, while not in a call and after failure (P3).
- The recap is never published to LiveKit (D17).
- Dependencies are pinned to exact versions.
- `livekit-client` and `@livekit/krisp-noise-filter` are dependencies. `livekit-server-sdk` is imported only by `src/server/livekit.ts` and `devApi.ts`.
- Krisp is loaded with a dynamic `import()` only on "Join call".
- `CallSession.join` must create and `resume()` its `AudioContext` before its first `await` (iOS gesture rule).
- Every tuning number is a named constant in `src/config.ts` with the values from design 6.11.
- Code style follows the existing `src/`: plain TypeScript classes, `subscribe`/`getState` for controllers, injectable `openSocket` / `now` for tests, short doc comments.
- Commit messages start with `[Voice]` and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit after each task on branch `voice`. Never push.
- Run commands from `voice/`:
  - `npm test` runs all unit tests. `npx vitest run <file>` runs one file.
  - `npm run typecheck`.
  - Both must pass before every commit.
- **Phone checks** (marked 📱) are done by the voice owner on real phones. The executor stops, asks for the result, and writes it into `stage2-options.md` section 7 under a new "Results" subsection before starting the next task.

## Review Focus

1. **"Join call" when mic permission is denied or LiveKit is unreachable:**
   - `status` becomes `error` with a readable message and `isListening` stays false.
   - Nothing is left running: no Ink socket, the call is left.
   - Pinned in Task 8, test `join failure leaves nothing running`.
2. **"Join call" tapped twice, or Leave tapped while still joining:** only one call is created, and a leave during joining ends in `left` with nothing open. Pinned in Task 8, tests `double join creates one call` and `leave during join tears down after join resolves`.
3. **Burn (`stop()`) while joining or while a turn is open:**
   - No line is sent.
   - No socket is opened after the stop.
   - Pinned in Task 8, test `stop during join opens no socket`, and in Task 6, test `abort sends nothing`.
4. **The STT token fetch fails during a reconnect:**
   - The session keeps backing off (500, 1000, 2000, 4000, 10 000 ms, then 10 000 ms repeated) and never throws.
   - `status` is `reconnecting` while it does.
   - Pinned in Task 6, test `token failure keeps backing off`.
5. **Mute and unmute quickly while a turn is open:**
   - The open turn is sent once by the old connection's drain.
   - The new connection starts clean.
   - No duplicate line.
   - Pinned in Task 8, test `fast mute-unmute sends the open turn once`.

---

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `src/config.ts` | modify | New constants (design 6.11) |
| `src/server/livekit.ts` (+ `.test.ts`) | create | `callRoomName`, `mintCallToken`, `endCall` |
| `src/call/callSession.ts` (+ `.test.ts` for pure helpers) | create | LiveKit wrapper implementing `CallLike` |
| `src/call/noiseFilter.ts` | create | Lazy Krisp loading |
| `src/audio/pcmCapture.ts` | create | Shared worklet wiring used by `MicSource` and `TrackSource` |
| `src/audio/trackSource.ts` | create | Frames from any `MediaStreamTrack`, with `retarget` |
| `src/audio/micSource.ts` | modify | Uses `pcmCapture.ts` |
| `src/audio/loudnessGate.ts` (+ `.test.ts`) | create | Gate and self-learning threshold |
| `src/stt/turns.ts` (+ `.test.ts`) | create | Turns endpoint URL and message parser |
| `src/stt/fakeTurns.ts` | create | Test double for a turns socket |
| `src/stt/turnSession.ts` (+ `.test.ts`) | create | Long-lived Ink connection |
| `src/stt/turnSplitter.ts` (+ `.test.ts`) | create | Interruption split bookkeeping |
| `src/stt/openMic.ts` (+ `.test.ts`) | create | Controller and state |
| `devApi.ts` | modify | `/livekit-token`, burn calls `endCall`, takes env |
| `vite.config.ts` | modify | Passes env to `voiceDevApi`, later drops `spikeApi` |
| `index.html`, `src/testPage/main.ts` | modify | Mode switch, Call mode UI, debug panel |
| `package.json` | modify | Dependency moves |
| `README.md`, `process.md`, `stage2-options.md` | modify | Notes for web/backend, decisions, results |
| `spike/` | delete | Task 12 |

---

## M1: the call

### Task 1: Server helpers for LiveKit

**Files:**
- Create: `src/server/livekit.ts`, `src/server/livekit.test.ts`
- Modify: `src/config.ts`, `package.json`

**Interfaces:**
- Produces:
  ```ts
  export interface LiveKitConfig { url: string; apiKey: string; apiSecret: string }  // url is wss://…
  export interface CallToken { url: string; token: string }
  export function callRoomName(roomId: Id): string                     // `gw-${roomId}`
  export function mintCallToken(cfg: LiveKitConfig, who: { roomId: Id; memberId: Id; name: string },
    opts?: { ttlSeconds?: number }): Promise<CallToken>                // ttl default CALL_TOKEN_TTL_SECONDS
  export function endCall(cfg: LiveKitConfig, roomId: Id,
    opts?: { client?: { deleteRoom(name: string): Promise<void> } }): Promise<void>
  ```
- Config adds every constant in design 6.11 with the values listed there: `TURN_START_THRESHOLD`, `GATE_START_DB`, `GATE_MAX_DB`, `GATE_MARGIN_DB`, `GATE_STEP_DB`, `GATE_MIN_SPEECH_MS`, `GATE_LOOKAHEAD_MS`, `GATE_HANG_MS`, `CONNECT_QUEUE_MS`, `INK_ROTATE_MS`, `RECONNECT_BACKOFF_MS`, `SPLIT_MIN_GAP_MS`, `DUCK_VOLUME`, `KRISP_QUALITY`, `CALL_TOKEN_TTL_SECONDS`.
- Config also adds `CLOSE_DRAIN_MS = 2000` and `GATE_LEARN_WINDOW_MS = 30_000`.

- [ ] **Step 1: Write the failing tests** in `src/server/livekit.test.ts`. Decode the JWT payload with `JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())`.
  - `callRoomName('r1')` is `'gw-r1'`.
  - `mintCallToken token is limited to one room`:
    - `payload.sub === 'm_alex'` and `payload.name === 'Alex'`.
    - `payload.video` equals `{ room: 'gw-r1', roomJoin: true, canPublish: true, canSubscribe: true }`. No other grant keys: no `roomRecord`, `roomAdmin` or `roomCreate`.
    - `payload.exp - payload.nbf === 3600`.
    - The returned `url` equals `cfg.url`.
  - `endCall deletes the room`: a fake client's `deleteRoom` is called with `'gw-r1'`.
  - `endCall tolerates a missing room`: the fake rejects with `Object.assign(new Error('requested room does not exist'), { status: 404 })` and `endCall` resolves. Any other error rejects.
- [ ] **Step 2: Run** `npx vitest run src/server/livekit.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** with `AccessToken` (as in `spike/spikeApi.ts`). The default client is `new RoomServiceClient(cfg.url.replace(/^ws/, 'http'), cfg.apiKey, cfg.apiSecret)`, so `wss://x` becomes `https://x`. File header comment: server-only, like `server/cartesia.ts`. In `package.json`, move `livekit-client` and `@livekit/krisp-noise-filter` to `dependencies`.
- [ ] **Step 4: Run** `npx vitest run src/server/livekit.test.ts`, then `npm test` and `npm run typecheck`. Expected: all PASS.
- [ ] **Step 5: Commit** `[Voice] LiveKit token and end-call helpers for the backend`.

### Task 2: CallSession (LiveKit only, raw mic)

**Files:**
- Create: `src/call/callSession.ts`, `src/call/callSession.test.ts`

**Interfaces:**
- Consumes: `CallToken` (Task 1).
- Produces:
  ```ts
  export type NoiseFilterKind = 'krisp' | 'browser'
  export interface CallParticipant { id: Id; name: string; speaking: boolean; muted: boolean }
  export interface CallEvents {
    onParticipants(list: CallParticipant[]): void      // includes self, self first
    onRemoteSpeakingStarted(id: Id): void              // a remote id newly entered the active-speaker set
    onReconnecting(reconnecting: boolean): void         // LiveKit's own retry
    onDropped(message: string): void                    // final disconnect we didn't ask for
    onMicRestarted(): void                              // mic re-acquired (Task 10); gate resets
    onNeedsTap(needed: boolean): void                   // audio playback blocked (Task 10)
  }
  export interface CallLike {
    join(token: CallToken, events: CallEvents): Promise<NoiseFilterKind>
    onFrame(listener: (frame: Int16Array) => void): () => void   // 16 kHz PCM16 of the published (processed) track
    setMuted(muted: boolean): Promise<void>
    setRemoteVolume(volume: number): void               // 0..1, every remote participant
    resume(): Promise<void>
    leave(): Promise<void>
  }
  export class CallSession implements CallLike { constructor(opts?: { krispDebugLogs?: boolean }) }
  export function toParticipants(local: ParticipantLike, remotes: ParticipantLike[]): CallParticipant[]
  export function newSpeakers(before: ReadonlySet<Id>, now: readonly Id[], selfId: Id): Id[]
  ```
  `ParticipantLike = { identity: string; name?: string; isSpeaking: boolean; isMicrophoneEnabled: boolean }`. `muted` is `!isMicrophoneEnabled`, and `name` falls back to `identity`.

- [ ] **Step 1: Write failing tests** for the pure helpers only. `CallSession` itself is checked on phones.
  - `toParticipants puts self first and maps muted`.
  - `newSpeakers returns only remote ids that just started`. For example, before `{b}`, now `['a','b','c']`, self `'a'` gives `['c']`.
- [ ] **Step 2: Run** `npx vitest run src/call/callSession.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `join`:
    - Create the `AudioContext` and call `resume()` before any await.
    - `getUserMedia` with stage 1's constraints.
    - Create `new Room({ webAudioMix: { audioContext: ctx } })`, connect, and publish `new LocalAudioTrack(raw.clone(), undefined, true, ctx)`.
    - Frames come from a `TrackSource` (Task 4). Until Task 4 lands, use a local `MicSource`-style wiring and leave `// replaced in Task 4`.
    - Return `'browser'`. Krisp comes in Task 7.
  - Subscribe to `RoomEvent`s: `ParticipantConnected/Disconnected`, `TrackMuted/Unmuted`, `ActiveSpeakersChanged`, `Reconnecting/Reconnected`, `Disconnected`.
    - Recompute with `toParticipants` and emit.
    - `Disconnected` after `leave()` was called is not a drop.
  - `setRemoteVolume` calls `RemoteParticipant.setVolume` on every remote participant, and on participants who join later.
  - `setMuted` uses `localParticipant.setMicrophoneEnabled`.
  - `leave` disconnects, stops all tracks and closes the context.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `[Voice] CallSession: join a LiveKit room and publish the mic`.

### Task 3: Test page Call mode and devApi token route

**Files:**
- Modify: `devApi.ts`, `vite.config.ts`, `index.html`, `src/testPage/main.ts`, `.env.example`

**Interfaces:**
- Consumes: `mintCallToken`, `endCall`, `LiveKitConfig` (Task 1), `CallSession` (Task 2).
- Produces:
  - `voiceDevApi(env: { cartesiaKey?: string; livekit?: LiveKitConfig })`. `vite.config.ts` builds `livekit` from `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` when all three are set.
  - `POST /api/livekit-token` (member header as for `/stt-token`) returns `CallToken`, or 500 `"LIVEKIT_* missing from voice/.env"`. The room is `dev-room`, identity is the member id.
  - `POST /api/burn` also calls `endCall(livekit, 'dev-room')`.

- [ ] **Step 1: Update** `devApi.ts` and `vite.config.ts`. Keep `spikeApi` first in the plugin list, as it is now. In `.env.example`, change the LiveKit comment from "Stage 2 spike only" to "Stage 2 call".
- [ ] **Step 2: Update the test page.**
  - Mode switch under the transcript: "Push-to-talk" (current behavior, unchanged) or "Call".
  - Call mode shows "Join call" / "Leave" and a participant list (`name · speaking / muted`), and hides the hold button.
  - Joining must happen inside the click handler, without awaiting anything before `call.join`.
- [ ] **Step 3: Verify the server.** Run `npm run dev` in the background, then `curl -sk -X POST https://127.0.0.1:5174/api/livekit-token -H "x-member-id: nobody"`. Expected: 403. Join via `/api/join`, repeat with that member id, and expect 200 with `url` and `token`. Never print the token: pipe the body to `grep -o '"token"'` and expect one match. Stop the server afterwards.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `[Voice] Test page: Call mode joins a LiveKit room`.
- [ ] **Step 6: 📱 M1 phone check.** Two phones with headsets join in Call mode. Expected: each hears the other, the participant list shows both, speaking lights up, and Leave works. Record the result.

---

## M2: transcription

### Task 4: TrackSource and shared PCM capture

**Files:**
- Create: `src/audio/pcmCapture.ts`, `src/audio/trackSource.ts`
- Modify: `src/audio/micSource.ts`, `src/call/callSession.ts` (replace the Task 2 placeholder)

**Interfaces:**
- Produces:
  ```ts
  // pcmCapture.ts: loads the worklet once per AudioContext, wires source → worklet → muted sink,
  // resamples to STT_SAMPLE_RATE and calls onFrame. Returns a disconnect function.
  export function startPcmCapture(ctx: AudioContext, track: MediaStreamTrack,
    onFrame: (frame: Int16Array) => void): Promise<() => void>
  export class TrackSource {             // fan-out like MicSource's listeners
    constructor(ctx: AudioContext)
    attach(track: MediaStreamTrack): Promise<void>     // also used to retarget; detaches the old track first
    onFrame(listener: (frame: Int16Array) => void): () => void
    detach(): void
  }
  ```
  `MicSource` keeps its public `AudioInput` behavior exactly. Its pre-roll ring stays in `MicSource`.

- [ ] **Step 1: Run** `npm test` and record the current count of passing tests (56 at the time of writing).
- [ ] **Step 2: Implement** `pcmCapture.ts` by moving the wiring out of `MicSource.open`. Loading the worklet module is cached per context in a `WeakMap<AudioContext, Promise<void>>`. Then implement `trackSource.ts`, switch `MicSource` to `startPcmCapture`, and make `CallSession` use `TrackSource` on its published track.
- [ ] **Step 3: Run** `npm test` and `npm run typecheck`. Expected: the same count passes, no type errors.
- [ ] **Step 4: Commit** `[Voice] Share PCM capture between the mic and call tracks`.
- [ ] **Step 5: 📱 Quick check.** Push-to-talk on one phone still transcribes. If not, fix before continuing.

### Task 5: Turns protocol and fake socket

**Files:**
- Create: `src/stt/turns.ts`, `src/stt/turns.test.ts`, `src/stt/fakeTurns.ts`

**Interfaces:**
- Produces:
  ```ts
  export function buildTurnsUrl(token: string, keyterms: readonly string[], startThreshold: number): string
  export type TurnMessage =
    | { type: 'turn.start' } | { type: 'turn.update'; text: string } | { type: 'turn.end'; text: string }
    | { type: 'turn.eager_end' } | { type: 'turn.resume' } | { type: 'error'; message: string }
  export function parseTurnMessage(data: unknown): TurnMessage | null
  // fakeTurns.ts
  export class FakeTurnsSocket implements SocketLike {
    constructor(url: string, opts?: { endOnClose?: string | null })  // reply to {"type":"close"} with turn.end(text) then close; null = just close
    readonly audio: number[]; readonly commands: object[]; closedByClient: boolean
    open(): void; serverSend(msg: object): void; serverClose(): void
  }
  ```
  - The turns endpoint sends text as `transcript`, with `text` as a fallback, the same way the spike reads it.
  - The URL is `${CARTESIA_WS_BASE}/stt/turns/websocket`. Params in this order: `model`, `encoding`, `sample_rate`, `cartesia_version`, `access_token`, `turn_start_threshold` (two decimals), then repeated `keyterm`. Encode with `encodeURIComponent`, like `buildSttUrl`.
  - Commands are JSON text frames: `{"type":"close"}` and `{"type":"config","turn":{"start_threshold":x}}`.

- [ ] **Step 1: Write failing tests.**
  - `URL has the turns path, threshold 0.80 and %20 in keyterms`, for example `'Roommate Kevin'` becomes `keyterm=Roommate%20Kevin`.
  - `parses each turn event`: `transcript` is preferred, and `text` is the fallback.
  - `error carries the message`.
  - `unknown, non-string and malformed frames return null`.
- [ ] **Step 2: Run** `npx vitest run src/stt/turns.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Model `fakeTurns.ts` on `fakeInk.ts`.
- [ ] **Step 4: Run** the file, then `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `[Voice] Ink turns endpoint: URL and messages`.

### Task 6: TurnSession

**Files:**
- Create: `src/stt/turnSession.ts`, `src/stt/turnSession.test.ts`

**Interfaces:**
- Consumes: `buildTurnsUrl`, `parseTurnMessage`, `FakeTurnsSocket` (Task 5), `Chunker`, `SocketLike`.
- Produces:
  ```ts
  export type TurnSessionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'
  export interface TurnEvents {
    onStart(): void
    onUpdate(text: string): void
    onEnd(text: string, complete: boolean): void   // complete=false: last update after a lost connection
    onStatus(status: TurnSessionStatus): void
  }
  export class TurnSession {
    constructor(connect: () => Promise<SocketLike>, events: TurnEvents, opts?: { startThreshold?: number })
    start(): void
    push(samples: Int16Array): void                 // chunked to STT_CHUNK_MS; queued while not open
    setStartThreshold(value: number): void          // sends config when open; used for reconnects too
    close(): Promise<void>                          // drain (mute/leave)
    abort(): void                                   // burn: nothing more is emitted
  }
  ```
  `connect` is supplied by `OpenMic` and builds the URL with a fresh token and keyterms each time it's called.

- [ ] **Step 1: Write failing tests** with `vi.useFakeTimers()` and a `connect` that returns new `FakeTurnsSocket`s:
  - `queues audio while connecting and flushes on open`: 10 chunks pushed before `open()` arrive in order.
  - `drops the oldest audio beyond 3 s of queue`: 35 chunks queued, 30 arrive, and the first 5 are dropped.
  - `turn.end emits onEnd with complete=true`. `eager_end` and `resume` emit nothing.
  - `unexpected close mid-turn emits the last update with complete=false`, with the text unchanged and no marker.
  - `reconnects with backoff 500, 1000, 2000, 4000, 10000, then 10000`, and the backoff resets after a successful open.
  - `token failure keeps backing off`: `connect` rejects 3 times. Status goes `reconnecting`, nothing throws, and the 4th attempt opens.
  - `rotation happens only right after turn.end` once `INK_ROTATE_MS` has passed:
    - A turn open at the 10-minute mark delays rotation until its `turn.end`.
    - The new socket gets the following audio. The old one gets `{"type":"close"}`.
  - `setStartThreshold sends config when open and is used by the next connection`.
  - `close drains: turn.end after close is emitted`.
  - `close without turn.end emits the last update with complete=false after 2 s`.
  - `abort sends nothing`: after `abort()`, a `turn.end` arriving on the socket emits nothing, and no reconnect happens.
- [ ] **Step 2: Run** `npx vitest run src/stt/turnSession.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** to the tests.
  - Audio is always sent as received. Zero-filling is the gate's job (Task 9).
  - The old socket's handlers are detached once it's replaced.
  - Status `open` is emitted on each successful open.
- [ ] **Step 4: Run** the file, then `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `[Voice] TurnSession: one long Ink connection with reconnect and drain`.

### Task 7: Krisp noise filter

**Files:**
- Create: `src/call/noiseFilter.ts`
- Modify: `src/call/callSession.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface NoiseFilter { kind: NoiseFilterKind; processor: TrackProcessor<Track.Kind.Audio> | null }
  export function loadNoiseFilter(opts: { debugLogs?: boolean }): Promise<NoiseFilter>
  ```
  - `loadNoiseFilter` dynamic-imports `@livekit/krisp-noise-filter`.
  - If `isKrispNoiseFilterSupported()` is false, it returns `{ kind: 'browser', processor: null }`.
  - Otherwise `KrispNoiseFilter({ useBVC: true, quality: KRISP_QUALITY, debugLogs })`.

- [ ] **Step 1: Implement**, then use it in `CallSession.join`:
  - `setProcessor` after `publishTrack` (the order the spike verified).
  - `TrackSource.attach(processor.processedTrack ?? raw)`.
  - Return the kind.
  - If `setProcessor` throws, fall back to the raw track and `'browser'`.
- [ ] **Step 2: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 3: Commit** `[Voice] Krisp with BVC on the call's mic, loaded on join`.

### Task 8: OpenMic controller and test page wiring

**Files:**
- Create: `src/stt/openMic.ts`, `src/stt/openMic.test.ts`
- Modify: `src/testPage/main.ts`, `index.html`

**Interfaces:**
- Consumes: `CallLike`, `CallEvents`, `CallParticipant`, `NoiseFilterKind` (Task 2), `CallToken` (Task 1), `TurnSession` (Task 6), `buildTurnsUrl` (Task 5), `LineSender`, `FailedLine`, `OpenSocket`.
- Produces:
  ```ts
  export type OpenMicStatus = 'idle' | 'joining' | 'in_call' | 'reconnecting' | 'left' | 'stopped' | 'error'
  export interface OpenMicDebug { gateDb: number; speechDb: number | null; levelDb: number; inkConnects: number }
  export interface OpenMicState {
    status: OpenMicStatus; muted: boolean; isListening: boolean; participants: readonly CallParticipant[]
    preview: string; noiseFilter: NoiseFilterKind | null; needsTap: boolean
    sending: number; failed: readonly FailedLine[]; error: string | null; debug: OpenMicDebug
  }
  export interface OpenMicOptions {
    roomId: Id; speakerId: Id
    getSttToken(): Promise<string>
    getCallToken(): Promise<CallToken>
    sendLine(line: NewTranscriptLine): Promise<void>
    keyterms?: () => string[]
    createCall?: () => CallLike          // default: () => new CallSession()
    openSocket?: OpenSocket
    now?: () => number
  }
  export class OpenMic {
    subscribe(listener: () => void): () => void; getState(): OpenMicState
    join(): Promise<void>; setMuted(muted: boolean): Promise<void>; leave(): Promise<void>; stop(): void
    resume(): Promise<void>; duck(on: boolean): void; noteLine(line: TranscriptLine): void
    setStartThreshold(value: number): void
  }
  ```
  - In this task the gate is a pass-through, `noteLine` is a no-op, `duck` and `resume` just forward to the call, and `debug` holds placeholders. Tasks 9–12 fill them in.
  - `join()` calls `createCall().join(...)` synchronously, as its first statement after the guards, so the iOS gesture is kept.

- [ ] **Step 1: Write failing tests** with a `FakeCall implements CallLike` (records calls, `emitFrame`, `events` handle) and `FakeTurnsSocket`:
  - `join goes joining → in_call and opens one Ink connection`. `isListening` is true and `noiseFilter` is set.
  - `turn.end becomes a line`: `{ roomId, speakerId, text, at }`, where `at` is the `now()` at `turn.start`.
  - `preview follows turn.update and clears on turn.end`.
  - `join failure leaves nothing running`: `call.join` rejects. `status: 'error'`, `isListening: false`, `call.leave` was called, and no socket was opened.
  - `double join creates one call`.
  - `leave during join tears down after join resolves`. The final status is `left`.
  - `stop during join opens no socket`. The final status is `stopped`.
  - `mute closes Ink and unpublishes`:
    - `setMuted(true)` leads to `call.setMuted(true)` and `{"type":"close"}` on the socket.
    - `isListening` becomes false.
    - Frames emitted while muted reach no socket.
  - `unmute opens a fresh connection with current keyterms`.
  - `fast mute-unmute sends the open turn once`: a turn is open, mute, then unmute before the drain finishes, and the old socket then sends `turn.end`. Exactly one line is sent.
  - `leave sends the last turn; stop does not`.
  - `call drop stops transcription`: `events.onDropped('x')` leads to `status: 'error'`, `isListening: false`, and the socket is closed.
  - `participants come from the call`.
- [ ] **Step 2: Run** `npx vitest run src/stt/openMic.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Frames from `call.onFrame` go to the current `TurnSession` while it isn't muted.
  - Each `TurnSession`'s `connect` does `openSocket(buildTurnsUrl(await getSttToken(), keyterms?.() ?? [], currentThreshold))`.
  - Status `reconnecting` is shown when either the call or Ink is reconnecting.
  - Lines go through `LineSender` with `stop()` → `cancel()`, as in `PushToTalk.stop`.
  - The "may be missing" error ("The end of that may be missing.") is shown when `onEnd` has `complete=false`.
- [ ] **Step 4: Run** the file, then `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Wire the test page.** Call mode uses `OpenMic`:
  - Join, Leave, a mute toggle, the participant list, the preview.
  - "Noise: krisp/browser".
  - "BVC: on / blocked / unknown", read on the test page only, by wrapping `console.info` while Krisp has `debugLogs: true` and looking for `is blocked for BVC`. Pass `createCall: () => new CallSession({ krispDebugLogs: true })`.
  - Lines show in the shared transcript as today.
- [ ] **Step 6: Commit** `[Voice] OpenMic: transcribe the call with Ink turn detection`.
- [ ] **Step 7: 📱 M2 phone check.** Record each item:
  1. Two phones with headsets talking turn by turn: every line under the right name.
  2. Both speak at once: two separate, correct lines.
  3. For each phone (model, browser): BVC on or blocked.
  4. iPhone (T4): lock for 10 s, switch apps for 10 s, an incoming call. For each one, note what still works when the user comes back. Recovery itself is Task 10.
  5. Stay in the call for 5+ minutes and note any Ink reconnects (T3).
  6. Mute, then speak: the drain behavior. Does `turn.end` arrive after `close`?

---

## M3: noise

### Task 9: Self-learning loudness gate

**Files:**
- Create: `src/audio/loudnessGate.ts`, `src/audio/loudnessGate.test.ts`
- Modify: `src/stt/openMic.ts`, `src/stt/openMic.test.ts`, `src/testPage/main.ts`, `index.html`

**Interfaces:**
- Produces:
  ```ts
  export function rmsDb(chunk: Int16Array): number      // dBFS; all-zero → -120
  export class LoudnessGate {
    constructor(chunkMs?: number)                         // default STT_CHUNK_MS; all other numbers from config
    process(chunk: Int16Array<ArrayBuffer>): Int16Array<ArrayBuffer> | null  // delayed by look-ahead; zeros when closed; null while filling
    turnStarted(): void
    turnEnded(): void
    reset(): void                                         // threshold back to GATE_START_DB, learning data cleared
    readonly thresholdDb: number; readonly speechDb: number | null; readonly levelDb: number
  }
  ```
  - Look-ahead is `GATE_LOOKAHEAD_MS / chunkMs` chunks and hang is `GATE_HANG_MS / chunkMs`, as in the spike's `onChunk`.
  - **Learning:**
    - Between `turnStarted` and `turnEnded`, record `rmsDb` of each chunk the gate passes open.
    - Keep only the last `GATE_LEARN_WINDOW_MS` worth of these.
    - On `turnEnded`, if at least `GATE_MIN_SPEECH_MS` is recorded:
      - `speechDb` = median of the loudest third.
      - `target = clamp(speechDb - GATE_MARGIN_DB, GATE_START_DB, GATE_MAX_DB)`.
      - Move `thresholdDb` toward `target` by at most `GATE_STEP_DB`.

- [ ] **Step 1: Write failing tests:**
  - `rmsDb of full-scale square is about 0, of zeros is -120`.
  - `loud chunk passes, quiet chunk becomes zeros`.
  - `look-ahead opens 200 ms before a loud chunk`.
  - `hang keeps 500 ms open after the last loud chunk`.
  - `no learning outside a turn`.
  - `no change before 3 s of speech`.
  - `learns speech − 15 dB in steps of at most 6 dB`. With speech at -20 dB: -55 → -49 → -43 → -37 → -35.
  - `never looser than -55 and never stricter than -30`.
  - `reset returns to -55`.
- [ ] **Step 2: Run** `npx vitest run src/audio/loudnessGate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then put the gate between `call.onFrame` and `TurnSession.push` in `OpenMic`:
  - Chunk with a `Chunker` of `STT_CHUNK_MS`.
  - `onStart` calls `turnStarted`, `onEnd` calls `turnEnded`, and `onMicRestarted` calls `reset`.
  - Fill `debug` from the gate.
  - Add the OpenMic test `quiet frames reach Ink as zeros`.
- [ ] **Step 4: Update the test page debug panel:**
  - Gate threshold, learned speech level, live level, Ink connects.
  - A `turn_start_threshold` slider (0.65–0.9) that calls `setStartThreshold` on `change`, not on `input`.
  - Krisp buffer drops: pass `onBufferDrop` through the `CallSession` options (add `onBufferDrop?: () => void` next to `krispDebugLogs`).
- [ ] **Step 5: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `[Voice] Self-learning loudness gate before Ink`.
- [ ] **Step 7: 📱 M3 phone check (T2).** In a real noisy place, with phones and headsets. Record the place and the counts:
  1. Someone talks 1 m away for 2 minutes while the owner is silent. **Pass: 0 lines.**
  2. The same at 0.5 m: recorded only.
  3. The owner speaks quietly and gives short reactions: are they caught?
  4. `turn_start_threshold` 0.8 vs 0.9.
  5. Any Krisp buffer drops.

  **Decision point for the owner:** keep going, or switch the noise layer to VIVA (design 6.3). Stop and ask before continuing.

---

## M4: robustness

### Task 10: Lifecycle recovery, wake lock and tap-to-resume

**Files:**
- Modify: `src/call/callSession.ts`, `src/stt/openMic.ts`, `src/stt/openMic.test.ts`, `src/testPage/main.ts`, `index.html`

**Interfaces:**
- Consumes and produces nothing new. This task fills in `CallEvents.onMicRestarted`, `onNeedsTap` and `CallLike.resume`.
- **`CallSession`:**
  - Holds a Screen Wake Lock while in a call, re-requested on return to visible, released on leave.
  - Watches `visibilitychange` and the mic track's `ended`. If the raw or processed track has ended, or the context isn't `running`:
    - re-acquire the mic,
    - re-apply Krisp,
    - `replaceTrack` on the published track,
    - `TrackSource.attach` the new track,
    - emit `onMicRestarted`.
  - `onNeedsTap(true)` when `ctx.resume()` doesn't reach `running` or LiveKit's `AudioPlaybackStatusChanged` says playback is blocked.
  - `resume()` calls `ctx.resume()` and `room.startAudio()`.

- [ ] **Step 1: Write failing OpenMic tests:**
  - `mic restart resets the gate`: after `events.onMicRestarted()`, `debug.gateDb === -55`.
  - `needsTap mirrors the call and resume forwards`.
- [ ] **Step 2: Run** `npx vitest run src/stt/openMic.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, including the `CallSession` parts above.
- [ ] **Step 4: Update the test page:**
  - Show "Keep this screen on during the call" while in a call.
  - Show a "Tap to resume" button while `needsTap` is true.
- [ ] **Step 5: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `[Voice] Recover the call after iOS pauses the mic`.
- [ ] **Step 7: 📱 M4 phone check:**
  1. Muted: nothing sent, the friend hears nothing, the indicator is off.
  2. Wi-Fi off for 5 s, then on: recovers by itself, at most the outage is missing.
  3. iPhone lock, app switch and incoming call: recovered on return, or written up as a web limit.
  4. 12+ minutes in the call: the debug panel shows one rotation, and transcription continues.

---

## M5: interruptions

### Task 11: Interruption split

**Files:**
- Create: `src/stt/turnSplitter.ts`, `src/stt/turnSplitter.test.ts`
- Modify: `src/stt/openMic.ts`, `src/stt/openMic.test.ts`, `src/testPage/main.ts`

**Interfaces:**
- Produces:
  ```ts
  export function remainderAfter(sentText: string, text: string): string
  export class TurnSplitter {
    constructor(now: () => number)
    start(at: number): void
    update(text: string): void
    split(): { text: string; at: number } | null   // null: no turn, nothing new, or < SPLIT_MIN_GAP_MS since last split
    end(finalText: string): { text: string; at: number } | null
    readonly open: boolean
  }
  ```
  - The first part's `at` is the turn start. Each later part's `at` is the `now()` of the split that began it.
  - `remainderAfter` works on whitespace tokens of `text`. Compare tokens normalized with `toLowerCase()` and `\p{P}` stripped. Let `n` be the number of normalized words in `sentText`.
    - If `text`'s normalized tokens contain `sentText`'s at an offset of 0, 1 or 2, cut after `offset + n` tokens.
    - Otherwise cut after `n` tokens.
    - Return the original tokens after the cut, joined with single spaces.

- [ ] **Step 1: Write failing tests:**
  - `remainderAfter`:
    - matching prefix: `('So Kevin walks', 'So Kevin walks into the kitchen')` gives `'into the kitchen'`.
    - case and punctuation are ignored: `('so, kevin', 'So Kevin walks.')` gives `'walks.'`.
    - Ink added a word in front: `('So Kevin walks', 'Oh so Kevin walks in')` gives `'in'`.
    - revised words fall back to the word count: `('So Calvin walks', 'So Kevin walks in')` gives `'in'`.
  - `split sends the update so far with the turn's at`.
  - `second split sends only the new words with the first split's time`.
  - `split within 1.5 s returns null`.
  - `split with an empty update returns null`.
  - `end returns only the unsent rest`.
  - `end with nothing new returns null`.
- [ ] **Step 2: Run** `npx vitest run src/stt/turnSplitter.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then use it in `OpenMic`:
  - `onStart` calls `start(now())`, `onUpdate` calls `update`, and `onEnd` sends `end(text)` if non-null.
  - `events.onRemoteSpeakingStarted` and `noteLine(line)` for another speaker's line both call `split()` and send the result.
  - Splits never happen while muted or when no turn is open.
- [ ] **Step 4: Add OpenMic tests:**
  - `remote speaking splits the open turn`. This is the stage2-options.md example: Alex's turn, update "So Kevin walks into the kitchen", Sam starts speaking, then turn.end "So Kevin walks into the kitchen and eats the whole cake". Lines sent: "So Kevin walks into the kitchen" (at = start), then "and eats the whole cake" (at = split time).
  - `noteLine from someone else splits; my own line does not`.
- [ ] **Step 5: Wire** the test page's `/lines` poll to call `noteLine` for each new line.
- [ ] **Step 6: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 7: Commit** `[Voice] Split my open turn when someone cuts in`.
- [ ] **Step 8: 📱 M5 phone check.** Act out the stage2-options.md interruption example three times. Record the transcript order each time.

---

## M6: recap, burn and hand-over

### Task 12: Duck, final behavior, docs, and spike removal

**Files:**
- Modify: `src/stt/openMic.ts`, `src/stt/openMic.test.ts`, `src/testPage/main.ts`, `index.html`, `README.md`, `process.md`, `stage2-options.md`, `vite.config.ts`, `.env.example`, `package.json` (only if a dependency is unused)
- Delete: `spike/`, and `"spike"` from `tsconfig.json`'s `include`

**Interfaces:**
- Consumes: `CallLike.setRemoteVolume` (Task 2).
- `duck(on)` calls `setRemoteVolume(on ? DUCK_VOLUME : 1)`.

- [ ] **Step 1: Write failing OpenMic tests:**
  - `duck lowers friends to 0.3 and restores 1`.
  - `stop releases everything`:
    - `call.leave` is called and no line is sent, even with an open turn.
    - `failed` is cleared and `isListening` is false.
    - Later `turn.end`s are ignored.
- [ ] **Step 2: Run** `npx vitest run src/stt/openMic.test.ts`. Expected: FAIL on the duck test at least.
- [ ] **Step 3: Implement**, and on the test page:
  - The recap test ducks while it plays.
  - Burn calls `openMic.stop()`.
- [ ] **Step 4: Update the docs.**
  - **`README.md`:**
    - Add the new files to "What's in `src/`".
    - Add "For web: wiring the call" from design section 11.
    - Add "For backend: the call" from design section 11.
    - Note the 20-connection Ink limit.
  - **`process.md`:**
    - Mark steps 13–19 with their results.
    - Update D14 and D16 if M2 changed them.
    - Add the phone results to section 16.
  - **`stage2-options.md`:** "No approach has been chosen yet" becomes "Approach 1 chosen, see stage2-design.md".
- [ ] **Step 5: Delete the spike** following `spike/README.md`'s checklist:
  - Delete the folder.
  - Remove `spikeApi` from `vite.config.ts`.
  - Remove `"spike"` from `tsconfig.json`.
  - Keep the LiveKit lines in `.env.example`, since they are now used by the call.
  - `livekit-server-sdk` stays, because `devApi.ts` uses it.
- [ ] **Step 6: Run** `npm test` and `npm run typecheck`. Expected: PASS. Then search the source for logs: `grep -rn "console\." src devApi.ts` shows no transcript text, tokens or keys.
- [ ] **Step 7: Commit** `[Voice] Stage 2 call: recap ducking, burn, hand-over notes; remove spike`.
- [ ] **Step 8: 📱 M6 phone check:**
  1. Burn mid-sentence: every phone leaves the call, the mic indicator disappears, and no line appears afterwards.
  2. Recap played in a call: the player's friends sound quieter, and the friends don't hear the recap.
  3. Run the full stage 2 list in process.md section 16 and design section 10. Record everything.
