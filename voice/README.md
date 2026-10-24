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
| `config.ts` | Every Cartesia setting and tuning number, including the narrator voice |

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

## For backend: what to move into Convex

- An action that checks the caller is a member of an active room, then returns `mintSttToken(process.env.CARTESIA_API_KEY)` as `{ token, expiresAt }`.
- On late join, after AI writes the `Recap`: `synthesizeRecap(key, recap.text)` → store the MP3 in file storage → set `audioUrl` → push `recap_ready` again. Delete the file on burn, and drop results that arrive after burn.
