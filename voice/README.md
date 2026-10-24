# voice/

Turns what people say into transcript lines, and turns the recap into audio. **Owner: ___**

## Responsibilities

- Microphone capture on each phone in the browser, with **push-to-talk** (one device per speaker, so the speaker is always known).
- Stream audio to **Cartesia Ink** (speech-to-text) and send each finished phrase to the backend as a `NewTranscriptLine`.
- Show the **listening** indicator whenever the mic is live.
- Turn `Recap.text` into audio with **Cartesia Sonic** (neutral narrator voice) and set `Recap.audioUrl`.
- Never store raw audio.

## Uses from shared/schema.ts

`NewTranscriptLine` (out), `Recap` (in and out).

## Done when

Two phones talk with push-to-talk, and both people's lines show up in one room's transcript, in order, under the right names.

## Notes

- The venue is loud. Test with the phones next to each other. Open mics will pick up the person next to you.
- Keep API keys on the server. The browser gets short-lived tokens or goes through the backend.
- Full plan and decisions: [process.md](process.md).

## Running it

Needs Node 24. Put the key in `voice/.env` (see [.env.example](.env.example)).

```bash
npm install
npm test                  # unit tests (no network)
npm run dev               # test page on https://<this computer's LAN IP>:5174
npm run ink:latency       # live Ink check: Sonic reads the Kevin script, Ink transcribes it
npm run tts:audition      # narrator candidates → voice/out/ (not committed)
```

`npm run dev` serves a test page plus a **dev-only** stand-in backend ([devApi.ts](devApi.ts)): one shared in-memory room, STT tokens, line storage and TTS. Open it on two phones on the same Wi-Fi, accept the self-signed certificate warning, join with different names and hold to talk. Never deploy `devApi.ts`.

## What's in `src/`

| File | What it does |
| --- | --- |
| `audio/micSource.ts` | Mic → AudioWorklet → 16 kHz PCM16 frames, plus the 300 ms in-memory pre-roll |
| `stt/pttSession.ts` | One Ink connection for one press: queue while connecting, `finalize`, `flush_done`, `close` |
| `stt/pushToTalk.ts` | The controller web uses: pre-roll, 300 ms tail, 60 s split, sending lines, stop on burn |
| `stt/tokenSource.ts` | Keeps a valid STT token in memory and refreshes it before expiry |
| `stt/keyterms.ts` | Member names + the AI's people and aliases, cut to Ink's limits |
| `stt/lineSender.ts` | Sends `NewTranscriptLine`s with retries; drops empty or noise-only text |
| `server/cartesia.ts` | **Server only.** `mintSttToken`, `synthesizeRecap`. Plain functions for a Convex action |
| `audio/pcmCapture.ts` | Any mic track → AudioWorklet → 16 kHz PCM16 frames. Shared by push-to-talk and the call |
| `audio/trackSource.ts` | Frames from the call's mic; re-attached to a new track after the system restarts the mic |
| `audio/loudnessGate.ts` | Blocks audio too quiet to be this phone's owner. Learns the owner's level from their own turns |
| `call/callSession.ts` | The LiveKit call: join from the tap, publish with Krisp, play friends, recover after lock/app switch, wake lock |
| `call/noiseFilter.ts` | Loads Krisp (with background voice cancellation) only when someone joins |
| `call/liveText.ts` | The words someone is saying right now, sent to the others in the call over LiveKit |
| `stt/turns.ts` | Ink's turn-detection endpoint: URL and messages |
| `stt/turnSession.ts` | One Ink connection for the whole call: queue, reconnect with backoff, rotate every 10 min, drain on close |
| `stt/turnSplitter.ts` | Splits my open turn when someone cuts in, so the transcript keeps the real order |
| `stt/openMic.ts` | The call controller web uses: join, mute, leave, stop, live text, ducking. Counterpart of `PushToTalk` |
| `server/livekit.ts` | **Server only.** `mintCallToken`, `endCall`. Plain functions for a Convex action |
| `config.ts` | Every Cartesia and call setting and tuning number, including the narrator voice |

## For web: wiring push-to-talk

`PushToTalk` is plain TypeScript with `subscribe`/`getState`, so it fits React's `useSyncExternalStore` and voice doesn't depend on React:

```tsx
const ptt = useMemo(() => new PushToTalk({
  roomId: room.id,
  speakerId: self.id,
  mic: new MicSource(),
  getToken: () => tokens.get(),          // TokenSource over the backend's token endpoint
  sendLine: (line) => client.addLine(line),
  keyterms: () => buildKeyterms(members, state.storyState?.people ?? []),
}), [room.id, self.id])
const voice = useSyncExternalStore(ptt.subscribe, ptt.getState)

<PushToTalkButton onPressChange={ptt.press} />   // existing button, unchanged
// On room_burned or leaving: ptt.stop() and tokens.dispose()
```

`voice.isListening` is true exactly while audio is going to Ink; `voice.preview` is what Ink has heard so far (speaker's own screen only); `voice.failed` lists lines that couldn't be sent, each with `retry()`. To import from `../voice/src`, web's `vite.config.ts` needs `'../voice'` in `server.fs.allow`.

## For web: wiring the call

`OpenMic` is the call's counterpart of `PushToTalk`, with the same `subscribe`/`getState` shape:

```tsx
const call = useMemo(() => new OpenMic({
  roomId: room.id,
  speakerId: self.id,
  getSttToken: () => tokens.get(),
  getCallToken: () => client.callToken(),   // new VoiceTransport method → backend's callToken action
  sendLine: (line) => client.addLine(line),
  keyterms: () => buildKeyterms(members, state.storyState?.people ?? []),
}), [room.id, self.id])
const voice = useSyncExternalStore(call.subscribe, call.getState)

<button onClick={call.join}>Join call</button>  // call join() straight from the tap, no await before it (iOS)
// call.leave(), call.setMuted(bool); on room_burned: call.stop()
// every line_added: call.noteLine(line)
// around recap playback: call.duck(true) … call.duck(false)
```

The room screen needs:
- "Join call" / "Leave" and a mute button. The user is only in the call after tapping "Join call".
- `voice.participants`: everyone in the call, self first, with `speaking` and `muted`.
- `voice.live`: what each friend is saying right now, by member id, as they speak. Show it under their name, or as a greyed line at the end of the transcript. A `final` entry is their finished turn; it goes away when its real line arrives (via `noteLine`) or after 4 s. `voice.preview` is the same for me.
- The "Keep this screen on during the call" notice while `status` is `in_call`/`reconnecting`, and a "Tap to resume" button calling `call.resume()` while `voice.needsTap`.
- `voice.isListening` for the mic indicator, `voice.failed` with `retry()` as in push-to-talk, and `voice.error`.
- A mode switch between push-to-talk and the call, if both are kept.
- `livekit-client` and `@livekit/krisp-noise-filter` in web's package.json. Krisp (about 6 MB) is loaded only on "Join call".
- Join screen notice (process.md section 13): the call's audio goes through LiveKit to friends and through Cartesia for text, and neither records it. Live text goes only to the people in the call and isn't stored.

## For backend: the call

- An action `callToken(sessionToken)`: checks membership and that the room isn't burned (like the STT token), then returns `mintCallToken(cfg, { roomId, memberId, name })`. Needs a `"use node"` action file.
- On burn, call `endCall(cfg, roomId)`: everyone is dropped from the call.
- Environment variables `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `livekit-server-sdk` in backend's package.json.
- Expect 2–3 times as many lines as push-to-talk (splits, short reactions) for AI trigger and cost estimates.
- Q6 (sort by `seq` or `at`) still stands. The split keeps both orders right.
- Cartesia allows 20 Ink connections at once across all rooms: one per phone in a call. Fine for the hackathon.

## For backend: what to move into Convex

- An action that checks the caller is a member of an active room, then returns `mintSttToken(process.env.CARTESIA_API_KEY)` as `{ token, expiresAt }`.
- On late join, after AI writes the `Recap`: `synthesizeRecap(key, recap.text)` → store the MP3 in file storage → set `audioUrl` → push `recap_ready` again. Delete the file on burn, and drop results that arrive after burn.
