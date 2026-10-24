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
