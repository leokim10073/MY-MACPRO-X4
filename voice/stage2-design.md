# Stage 2 design: the live call (voice/ only)

Status: **draft, waiting for the voice owner's approval.** Nothing here is built yet.

Related: [stage2-options.md](stage2-options.md) (the two approaches and the spike's test list), [process.md](process.md) (principles P1–P11, decisions D1–D17, section 7 is the original stage 2 flow).

---

## 1. Intent

Stage 1 works: friends in one place hold a button, and each phrase lands in the room's transcript under the right name. Stage 2 makes it feel like a FaceTime voice call. Friends are in different places, they just talk, and the transcript fills itself in real time: the right name on every line, interruptions in the right order, and a passerby's chatter kept out.

This matters because the whole product (recall pop-ups, story cards, the latecomer's recap) is built on the transcript. A missed line, a passerby's words under a friend's name, or a reaction placed before the story it reacts to all break what the AI shows.

## 2. Goals, non-goals, anti-goals

**Goals**
- Tap "Join call" and talk. No button to hold.
- Everyone in the call hears everyone else (LiveKit), through their own headset.
- Each phone transcribes only its owner, so the speaker is always right (P8).
- Lines appear as Ink finishes each turn, with no rewriting (P7).
- Most background noise and nearby voices are kept out. When unsure, it is better to miss a very quiet line than to put someone else's words under a friend's name.
- When someone cuts in, the current speaker's line is split so the transcript follows the real order.
- Mute, leave, automatic reconnect, and recovery when iOS pauses the mic.
- Everyone can see who is in the call, who is speaking, and who is muted (P3).
- Push-to-talk stays, unchanged, as the fallback mode.

**Non-goals (this round)**
- Video.
- Voiceprints or recognizing the owner's voice.
- A native app. iOS keeps the web limits: keep the screen on and recover when the user comes back.
- Handling digressions and returns. That's the AI owner's job (stage2-options.md section 6).
- Any change outside `voice/`. See section 11.

**Anti-goals: it fails even if it technically works when...**
- Audio is stored anywhere, or the call is recorded (P5).
- The AI's voice, including the recap, reaches the call (P2).
- Transcription runs while the user is muted, or without a visible indicator (P3).
- Words are added, removed or reworded. That includes markers such as "[cut by disconnect]" (P7).
- A passerby's speech regularly shows up as a friend's line.

## 3. Constraints

- **Only `voice/` is edited.** web, backend, ai and shared belong to other owners. Anything they need is written up in section 11 and agreed in the PR.
- No schema change. Lines are still `NewTranscriptLine = { roomId, speakerId, text, at }`.
- API keys stay on the server. The browser gets a 120 s STT-only Cartesia token (as today) and a LiveKit token for one room.
- Ink concurrency: at most 20 open connections across all rooms on the Startup plan. One per person in a call.
- iOS Safari 17.4+ for Krisp. Older browsers fall back to the browser's own noise suppression.
- Every new behavior is unit-tested with fakes (no network), like stage 1, and every milestone is checked on real phones before the next one starts.

## 4. Approaches

Decided in stage2-options.md, sections 3–5:

| | Approach 1: each phone transcribes itself (**chosen**) | Approach 2: a server "scribe" transcribes everyone |
| --- | --- | --- |
| Background voices | Krisp BVC in the browser | Krisp VIVA on the server (stronger) |
| New infrastructure | None | An always-on server |
| Privacy | Audio never passes through our server | Audio passes through our server (memory only) |
| Push-to-talk fallback | Same pipeline | A second pipeline |

**Why 1:** it reuses stage 1's pipeline, needs no new server, and keeps the stronger privacy promise. **The way back to 2:** if phone tests show BVC can't keep passersby out, the noise layer is swapped for Approach 2's VIVA. The noise filter is one replaceable piece (section 6.3), so that switch doesn't touch the rest.

## 5. What the spike showed (2026-10-24, Windows Chrome, laptop mic)

| Check | Result | Effect on the design |
| --- | --- | --- |
| T1: Krisp `processedTrack` → AudioWorklet → Ink | **Works.** Filtered and raw lanes produced nearly the same text | Approach 1 stands |
| Krisp start-up | Noise filtering turns on about 2 s after `setProcessor` | Audio starts flowing right away. The first ~2 s are only browser-filtered. Accepted |
| BVC on the laptop mic | **Blocked** ("is blocked for BVC compatibility") | BVC must be checked on phones with headsets in milestone 2. If it's blocked there too, the 6.3 fallback applies |
| Filtered vs raw | Filtered dropped background fragments and broke turns less | Keep the gate |
| T3: token expiry | The connection stayed open 32 s after its token expired | One long Ink connection per call. Tokens are only needed to (re)connect. Confirmed again in M2 with a 5+ minute run |
| T5 (laptop) | Worst lag 11 ms, 0 Krisp buffer drops | **No battery test** (owner's decision). Krisp buffer drops stay visible in the test page's debug panel |
| Not tested yet | iOS screen lock and app switch (T4), passerby on a phone (T2) | Milestones 2–3 |

Also seen: Ink returned Chinese as simplified characters. Q4 in process.md says English only for now, so no language setting is added. Noted for later.

## 6. Design

### 6.1 Overview

```
"Join call" tap
   │
   ▼
CallSession (LiveKit) ──── mic track ──▶ Krisp (BVC if allowed) ──▶ processedTrack
   │   ▲                                                               │
   │   └── friends' audio ──▶ headset                                  ├──▶ published to LiveKit
   │                                                                   ▼
   │                                                   TrackSource (AudioWorklet, 16 kHz s16)
   │                                                                   │
   │                                                                   ▼
   │                                                  LoudnessGate (self-learning; silence when closed)
   │                                                                   │
   │                                                                   ▼
   │                                                  TurnSession: one long Ink /stt/turns/websocket
   │                                                                   │ turn.start / update / end
   │  "someone else started speaking"                                  ▼
   └────────────────────────────────────────────────────────────▶ TurnSplitter ──▶ LineSender ──▶ backend
                                                                    (cuts my open turn)

OpenMic (the controller web uses) owns all of the above and exposes one state object.
```

Stage 1's `PushToTalk`, `LineSender`, `TokenSource`, `buildKeyterms`, `Resampler` and `Chunker` are reused as they are.

### 6.2 New files in `voice/src/`

| File | What it does | Tested with |
| --- | --- | --- |
| `call/callSession.ts` | Wraps `livekit-client`: connect, publish the mic with Krisp, play friends' audio, mute, leave, participants (who's here, speaking, muted), recovery after iOS stops the mic. Exposes a small `CallLike` interface so tests use a fake | Fake call in unit tests, real phones |
| `call/noiseFilter.ts` | Loads Krisp **lazily** (about 6 MB, only on "Join call"), picks `useBVC` / `quality`, reports `'krisp'` or `'browser'` (6.3 explains why BVC itself can't be reported) | Phones |
| `audio/trackSource.ts` | An `AudioInput` built from any `MediaStreamTrack` on a given `AudioContext`. Shares the worklet and resampler with `MicSource`, which is refactored to use it. `retarget(track)` swaps the track after recovery | Unit tests on the shared parts, phones |
| `audio/loudnessGate.ts` | The gate and its self-learning threshold (6.4). Pure logic, no Web Audio | Unit tests |
| `stt/turns.ts` | URL builder and message parser for `/stt/turns/websocket` | Unit tests |
| `stt/turnSession.ts` | One long Ink connection: queue while connecting, continuous audio, live `config`, drain on close, reconnect (6.6) | Unit tests with a fake turns socket |
| `stt/turnSplitter.ts` | Splitting an open turn when someone cuts in, and sending only the unsent rest at `turn.end` (6.5). Pure logic | Unit tests |
| `stt/openMic.ts` | The controller web uses. Same style as `PushToTalk`: plain TypeScript, `subscribe` / `getState` | Unit tests with fake call + fake socket |
| `server/livekit.ts` | **Server only.** `mintCallToken` and `endCall` (delete the LiveKit room on burn). Plain functions for a Convex action, like `server/cartesia.ts` | Unit tests with a fake fetch / SDK |

`livekit-client` and `@livekit/krisp-noise-filter` move from devDependencies to dependencies (pinned exact versions). `livekit-server-sdk` is only imported by `server/livekit.ts` and `devApi.ts`.

### 6.3 Noise layers

All of these run on the phone, before audio leaves it.

1. **Headset and browser processing:** `echoCancellation`, `noiseSuppression`, `autoGainControl` (as in stage 1).
2. **Krisp:** `KrispNoiseFilter({ useBVC: true, quality })`.
   - Krisp decides on its own whether BVC is allowed for the device, by matching the mic's label against a list it downloads. **The package (0.4.5) has no API that says whether BVC ended up on.** It only writes "is blocked for BVC compatibility" to its debug log.
   - So `noiseFilter.ts` reports `'krisp'` (Krisp running, BVC requested) or `'browser'` (Krisp unsupported, for example old Safari, so the raw track is used).
   - The test page turns on Krisp's `debugLogs` and shows "BVC: on / blocked" from that log line. That is how the phone tests record it. Production code doesn't read Krisp's log.
3. **Loudness gate**, self-learning (6.4).
4. **Ink's `turn_start_threshold`**, default 0.8, can be changed live with `{"type":"config"}`.

`quality` is `'medium'` (Krisp's default) on every device. There's no battery test (owner's decision). It only changes if the phone tests show Krisp buffer drops.

**If BVC is blocked on phones too,** layers 1, 2 (regular Krisp), 3 and 4 still run. M3's passerby test then decides between "good enough" and switching the Krisp layer to Approach 2's VIVA. That decision comes back to the voice owner.

### 6.4 Self-learning loudness gate (owner's decision: no calibration step)

The gate passes audio that is loud enough to be the owner speaking into their headset, and replaces everything else with silence. Ink needs a continuous stream, so blocked audio becomes zeros, not a gap.

- **Look-ahead 200 ms, hang 500 ms** (as in the spike): a word's soft start isn't clipped, and short dips inside a sentence don't close the gate. This adds 200 ms of delay before audio reaches Ink.
- **Starting threshold: loose,** -55 dBFS.
- **Learning:** while one of the owner's turns is open (between `turn.start` and `turn.end`), the gate records the level of every chunk it let through. After each `turn.end`, it takes the louder third of the last ~30 s of such speech, uses their median as the owner's speech level, and moves the threshold toward **speech level − 15 dB**.
- **Limits:**
  - It needs at least 3 s of the owner's speech before the first change.
  - The threshold moves at most 6 dB per turn.
  - It stays between -55 (the loose start) and -30 dBFS. It never becomes looser than the start.
  - If a passerby's turn sneaks into the learning data, the effect is bounded by these limits.
- **Reset to the loose start** when the input device changes (headset plugged in or out) or when the mic is re-acquired after iOS recovery.
- The current threshold, the learned speech level and the live level are in `OpenMic`'s debug state, so the test page can show them.

### 6.5 Interruption split

**Trigger:** while my turn is open, LiveKit reports that **another participant started speaking** (`ActiveSpeakersChanged`). That arrives a few hundred ms after they start, so my first part reaches the backend before their line does. That keeps the order right whether the backend sorts by `seq` or by `at` (process.md Q6). Backup trigger: another member's line arrives (web passes it in with `noteLine`) while my turn is still open.

**Split:**
1. Send the latest `turn.update` text as one line, with `at` = when my turn started.
2. Remember the words already sent.
3. The rest of the turn gets `at` = the moment of the split.
4. At `turn.end`, Ink sends the whole turn again. Only the words after the ones already sent go out.

**Alignment:** `turn.update` is a running guess and Ink may revise early words. The splitter compares words with case and punctuation ignored. If the start of the final text matches what was sent, it cuts right after it. If not, it cuts after the same number of words. In the rare revised case, a word at the cut may be repeated or lost. Ink's words are never changed, only cut (P7). Unit tests cover both cases.

**Limits:**
- No split if nothing has been transcribed yet in my turn.
- At most one split per 1.5 s, so a coughing friend doesn't shred my line into fragments.

### 6.6 Ink connection (TurnSession)

- **URL:** `wss://api.cartesia.ai/stt/turns/websocket?model=ink-2&encoding=pcm_s16le&sample_rate=16000&cartesia_version=2026-08-14&access_token=…&turn_start_threshold=0.80&keyterm=…`
- **Events:**

  | Event | What happens |
  | --- | --- |
  | `turn.start` | Note the time (`at`), open the gate's learning window |
  | `turn.update` | Becomes the speaker's own preview. Text is cumulative |
  | `turn.eager_end` | Ignored (D14) |
  | `turn.resume` | Ignored (D14) |
  | `turn.end` | Its text (minus anything already sent by a split) becomes a line |

- **Connecting:** audio is queued while connecting, up to 3 s, and sent as soon as the socket opens, so the first word after joining or unmuting is kept.
- **One connection for the whole call.**
  - The token is only checked when connecting.
  - Keyterms only update on connect, so every 10 minutes, right after a `turn.end`, the session opens a fresh connection (new token, current keyterms) and closes the old one once it's drained.
- **Unexpected close:**
  - Reconnect after 0.5 s, then back off (1, 2, 4 s, at most 10 s).
  - If a turn was open, its last `turn.update` text is sent as a line, unchanged. The speaker's own screen says "The end of that may be missing." No marker is added to the text.
- **Mute and leave (D16):** send `{"type":"close"}` and wait up to 2 s for the server to close, so the turn in progress comes back as `turn.end` and is sent normally. The docs don't say for certain that the turns endpoint does this, so M2 checks it. If no `turn.end` comes before the socket closes or the 2 s run out, the last `turn.update` text is sent, unchanged, the same way as on an unexpected close.
- **Burn:** close at once. Nothing in progress is sent (process.md section 12).

### 6.7 The controller (`OpenMic`)

```ts
new OpenMic({
  roomId, speakerId, speakerName,
  getSttToken: () => tokens.get(),                  // existing TokenSource
  getCallToken: () => transport.callToken(),        // { url, token } from backend
  sendLine: (line) => transport.addLine(line.text, line.at),
  keyterms: () => buildKeyterms(members, people),
})

openMic.join()           // from the "Join call" tap (iOS needs the gesture)
openMic.setMuted(bool)
openMic.leave()          // ends the call, sends the last turn
openMic.stop()           // burn: drops everything, sends nothing
openMic.resume()         // from a tap when iOS blocked audio playback
openMic.duck(bool)       // lowers friends' volume while the recap plays
openMic.noteLine(line)   // every line_added, for the backup split trigger
```

**State**, shaped for `useSyncExternalStore`:

| Field | Meaning |
| --- | --- |
| `status` | `idle` → `joining` → `in_call` ⇄ `reconnecting`, then `left` / `stopped` / `error` |
| `muted` | Muted by the user |
| `isListening` | True exactly while audio is going to Ink. False while muted, while not in a call, and after a failure (P3) |
| `participants` | `{ id, name, speaking, muted }[]`, including me. `id` is the `Member.id` |
| `preview` | My current `turn.update` text. Only shown on my own phone |
| `noiseFilter` | `'krisp'` or `'browser'` |
| `needsTap` | iOS blocked audio. Show a "Tap to resume" button that calls `resume()` |
| `sending`, `failed`, `error` | Same as `PushToTalk` |
| `debug` | Gate threshold, learned speech level, live level, Ink connection count. For the test page only |

**My calls on behavior:**
- If the LiveKit call drops for good (after LiveKit's own retries), Ink is closed too and `status` becomes `error` with a "Rejoin" path. Transcription never runs outside a call.
- The recap is never published to LiveKit (D17).
- `duck(true)` lowers friends to 30% volume.
- Push-to-talk and the call are two separate modes. A phone in a call doesn't also run `PushToTalk`.

### 6.8 iOS and app lifecycle

- **While in a call:** a Screen Wake Lock is held. The UI should say "Keep this screen on during the call" (web's job, text in section 11).
- **On `visibilitychange` back to visible**, and when the mic track ends:
  - re-acquire the mic and re-attach Krisp,
  - re-publish to LiveKit,
  - `retarget` the TrackSource,
  - reset the gate to the loose start,
  - reconnect Ink if it closed.
- **If the AudioContext can't resume without a gesture,** `needsTap` becomes true.
- All of this is checked on an iPhone in milestone 2 (T4). If something can't be recovered on the web, it's written up as a known limit, not worked around.

### 6.9 Leave and burn

| | Leave | Burn (`stop()`) |
| --- | --- | --- |
| Ink | Drain, so the last turn is sent | Close now, nothing sent |
| Unsent and failed lines | Kept, retries continue | Forgotten |
| LiveKit | Disconnect | Disconnect |
| Mic tracks and Krisp | Stop | Stop |
| AudioContext | Close | Close |
| Tokens | Kept (rejoin possible) | Forgotten (caller disposes `TokenSource`) |
| Wake lock | Released | Released |

On burn, the backend also deletes the LiveKit room with `endCall` (section 11), so anyone still connected is removed.

### 6.10 Server helpers (`server/livekit.ts`)

- `mintCallToken({ apiKey, apiSecret, url }, { roomId, memberId, name })` returns `{ url, token }`.
  - The LiveKit room name is derived from `roomId`. Identity is `memberId`, display name is `name`.
  - Grants: join this one room, publish audio, subscribe. Nothing else: no recording, no admin.
  - TTL 1 hour. LiveKit refreshes tokens for an open connection on its own.
  - The caller checks membership and that the room isn't burned first, as with `sttToken`.
- `endCall({ apiKey, apiSecret, url }, roomId)` deletes the LiveKit room. Calling it when the room doesn't exist isn't an error.

### 6.11 Settings in `config.ts`

Every new number is a named constant, so tuning means changing one line. Proposed starting values:

| Constant | Value |
| --- | --- |
| `TURN_START_THRESHOLD` | `0.8` |
| `GATE_START_DB` | `-55` |
| `GATE_MAX_DB` | `-30` |
| `GATE_MARGIN_DB` | `15` |
| `GATE_STEP_DB` | `6` |
| `GATE_MIN_SPEECH_MS` | `3000` |
| `GATE_LOOKAHEAD_MS` | `200` |
| `GATE_HANG_MS` | `500` |
| `CONNECT_QUEUE_MS` | `3000` |
| `INK_ROTATE_MS` | `600_000` |
| `RECONNECT_BACKOFF_MS` | `[500, 1000, 2000, 4000, 10_000]` |
| `SPLIT_MIN_GAP_MS` | `1500` |
| `DUCK_VOLUME` | `0.3` |
| `KRISP_QUALITY` | `'medium'` |
| `CALL_TOKEN_TTL_SECONDS` | `3600` |

## 7. Test page

The existing voice test page (`npm run dev`, `devApi.ts`, one in-memory room) becomes the stage 2 testbed, so everything can be tested on phones without web or backend:

- **Join screen:** name, then the room.
- **Mode switch:** "Push-to-talk" (stage 1, unchanged) or "Call".
- **In Call mode:**
  - "Join call" / "Leave", and a mute toggle.
  - The participant list with speaking and muted.
  - "Keep the screen on" notice and the "Tap to resume" button.
- **The shared transcript:** each phone already polls `/lines`, which is also how the backup split trigger gets other people's lines.
- **Debug panel:** noise layer in use, gate threshold, learned level, live level, Ink reconnects, turn threshold slider (applied when released, not on every step), Krisp buffer drops.
- **devApi gains:** `POST /api/livekit-token` (uses `mintCallToken`), and burn calls `endCall`.

Once milestone 3's phone results are written into stage2-options.md, the spike folder is deleted following its README checklist.

## 8. Milestones

Each milestone ends with a commit on `voice` and a phone check. A milestone isn't done until its phone check passes.

| # | Builds | Phone check |
| --- | --- | --- |
| M1 | `server/livekit.ts`, devApi token route, `CallSession` without Krisp, test page Call mode (join, leave, participants) | Two phones hear each other through headsets. Participant list correct |
| M2 | `TrackSource` + `MicSource` refactor, `turns.ts`, `TurnSession`, `OpenMic` sending lines, Krisp via `noiseFilter.ts` | Two phones talking: lines under the right names, simultaneous speech gives two correct lines. **BVC on/blocked recorded for each phone.** iPhone T4 (lock, app switch, call). Ink connection 5+ min (T3) |
| M3 | `LoudnessGate` with learning, live threshold, debug panel | T2 on phones in a real noisy place: passerby at 1 m and 0.5 m while the owner is silent. Owner's quiet speech and short reactions. **Decision point:** good enough, or switch to VIVA |
| M4 | Mute, reconnect with backoff, 10 min rotation with fresh keyterms, iOS recovery, wake lock | Muted: nothing sent, nobody hears. Wi-Fi off for 5 s: recovers by itself |
| M5 | `TurnSplitter`, both triggers | The interruption example from stage2-options.md comes out in the right order |
| M6 | `duck`, leave vs burn, `needsTap`; README "For web / For backend" notes; process.md and stage2-options.md updated with results; spike deleted | Burn mid-sentence: every phone leaves the call, mic released, nothing sent after |

## 9. Testing

**Unit tests** (vitest, node, no network), following stage 1's style with fakes:

| Area | What's tested |
| --- | --- |
| `turns.ts` | URL params and keyterm encoding. Every event type, unknown and malformed frames |
| `turnSession.ts` | Queue while connecting, continuous audio, `config` sent live, drain on close, reconnect and backoff, open turn sent unchanged on disconnect, rotation only right after `turn.end`, burn sends nothing |
| `loudnessGate.ts` | Look-ahead and hang, zeros when closed, learning only inside turns, 3 s minimum, 6 dB step, the -55 / -30 limits, reset |
| `turnSplitter.ts` | Matching prefix, revised prefix (word-count fallback), several splits in one turn, no split on empty turn, 1.5 s spacing |
| `openMic.ts` | State transitions. `isListening` false while muted, after failure and after leave. Mute closes Ink and unpublishes. Leave sends the last turn, burn doesn't. A split on a remote speaker. Text never logged |
| `server/livekit.ts` | Grants limited to one room, identity = member id, TTL. `endCall` tolerates a missing room |

**Phone tests:** the M1–M6 checks above, plus process.md section 16's stage 2 list (simultaneous speech, story pauses, mute, reconnect, same-venue, recap not in the call, burn, privacy). Results are written into stage2-options.md section 7 and process.md.

## 10. Done when

All of the following:

- process.md's stage 2 standard: two phones talk over the call without pressing anything, and both people's lines, including simultaneous ones, land in one room's transcript under the right names.
- In a noisy place, with someone talking 1 m away while the owner stays silent for 2 minutes, **no line** appears under the owner's name. The 0.5 m result is recorded but isn't required.
- The interruption example comes out in the right order.
- Every item in process.md section 13 (both stages) holds.
- Unit tests and typecheck pass.

## 11. What web and backend will need (for the PR discussion, not built here)

These go into `voice/README.md` when M6 is done. Voice doesn't edit these folders.

**Backend**
- An action `callToken(sessionToken)`: checks membership and that the room isn't burned (like `sttToken`), then returns `mintCallToken(...)`.
- On burn, call `endCall(roomId)`.
- Environment variables `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- `livekit-server-sdk` in backend's package.json. It needs a `"use node"` action file.
- Expect 2–3 times as many lines as push-to-talk (splits, short reactions) for AI trigger and cost estimates.
- Q6 (sort by `seq` or `at`) still stands. The split keeps both orders right.

**Web**
- `VoiceTransport` gains `callToken()`.
- `useVoice` creates `OpenMic` in Call mode, or `PushToTalk` in push-to-talk mode.
- The room screen gets:
  - "Join call" / "Leave" and a mute button,
  - the participant list with speaking and muted,
  - the "Keep this screen on" notice and the "Tap to resume" button,
  - the mode switch,
  - `noteLine` called on every `line_added`,
  - `duck(true/false)` around recap playback.
- `livekit-client` and `@livekit/krisp-noise-filter` in web's package.json. Krisp is loaded only on "Join call".
- Join screen notice (process.md section 13): the call's audio goes through LiveKit to friends and through Cartesia for text, and neither records it.

## 12. Risks

| Risk | What we do |
| --- | --- |
| BVC blocked on phones | Measured in M2. If passersby still get through in M3, switch to VIVA (Approach 2's noise layer) |
| iOS can't recover the mic after lock | Measured in M2. Documented as a web limit, native app later |
| Split alignment loses or repeats a word when Ink revises | Rare, tested. Words are never changed |
| BVC billed as voice isolation (100 free min/month) | Ask LiveKit before the demo. Watch the usage dashboard during tests |
| 20 Ink connections across all rooms | Fine for the hackathon. Noted in README |

## 13. Left to the builder

File-internal structure, exact wording on the test page, test names, how the fake call and fake turns socket are shaped, and log wording (never transcript text or tokens).

## 14. Calls made in this document (please check)

1. The split triggers on LiveKit's "someone else started speaking", with the other person's line as a backup. stage2-options.md's version used only the line, which arrives too late to keep the order right when sorting by `seq`.
2. The gate's numbers: loose start -55, speech − 15 dB, between -55 and -30, at most 6 dB per turn, 3 s minimum.
3. If the LiveKit call drops for good, transcription stops too. It never runs outside a call.
4. Push-to-talk and the call are separate modes. No "hold to transcribe" inside a call.
5. No language setting for Ink (English per Q4). The simplified Chinese seen in the spike is left alone.
6. Krisp `quality` `'medium'` on every device, with no battery test (owner's decision). It only changes if the phone tests show Krisp buffer drops.
7. A new Ink connection every 10 minutes, between turns, to refresh keyterms.
8. "Done" requires no passerby line at 1 m over 2 minutes. 0.5 m is only recorded.
