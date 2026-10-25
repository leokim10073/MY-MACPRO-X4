# Spill the Tea: how we use Cartesia

For the Best Use of Cartesia judges. The public project page has the short version; this is the detail.

**Voice is the product, and Cartesia is both ends of it:** Ink turns the call into text, and Sonic turns the catch-up back into voice.

| Cartesia feature | How we use it |
| --- | --- |
| **Ink** (`ink-2`) over the **turns WebSocket** | One long-lived connection per phone for the whole call. Streaming `turn.update` text powers the live captions and the mid-sentence pop-up; `turn.end` becomes a transcript line under the speaker's name. |
| **Ink turn detection** | No button: Ink decides when each turn starts and ends. We set `turn_start_threshold` to 0.8 so it takes clearer speech to start a turn. |
| **Ink keyterms** | Member names plus every person and alias mentioned so far ("Kevin", "the landlord") are sent as keyterms, trimmed to Ink's limits (100 terms, 1,200 characters) and refreshed whenever the connection is renewed, so Ink gets the newest names as the story grows. |
| **Access tokens** | The backend checks you're in a live room, then mints a 120-second token that only grants speech-to-text. The phone refreshes it before it expires. The API key never reaches the browser. |
| **Sonic** (`sonic-3.6`, pinned to a dated snapshot) | Reads the recap as an MP3 in a neutral narrator voice: no emotion tags, no added sounds. Pinning the snapshot means the narrator can't change before the demo. |

```
phone mic → LiveKit call (Krisp noise + background-voice filter)
   → the same cleaned audio → 16 kHz PCM16 → loudness gate → Cartesia Ink (turns)
        turn.update → live captions for friends + instant recall pop-up
        turn.end    → transcript line → story tracking + recap text
   → Cartesia Sonic → recap MP3 → plays on the latecomer's phone only
```

Each phone transcribes **its own** mic. We considered one server-side "scribe" for the whole call, but per-phone transcription means every line is under the right name without speaker diarization, and Ink hears the same Krisp-cleaned audio friends hear.

What the other tools do, so Cartesia's part is clear: LiveKit carries the call audio and live captions between phones, Krisp removes background noise, Claude writes the recap text and spots callbacks, and Convex stores and syncs everything.

**Testing voice without a crowd.** We had **Sonic** read our scripted Kevin conversation and streamed it into **Ink** in real time. In our push-to-talk prototype all six lines came back correct, names included; opening a connection took 130–680 ms (about 350 ms on average, with audio queued meanwhile), and the final text arrived about 134 ms after the speaker let go.

## Voice challenges in detail

- **Choosing who transcribes.** A single server-side scribe would hear everyone at once and have to guess who said what. Giving each phone its own Ink connection solved naming, but meant every phone had to manage its own tokens, reconnects and noise.
- **The loudness gate.** It learns the owner's speaking level from their own turns and silences anything quieter. It sits about 15 dB below the owner's level and moves at most 6 dB per turn, so one loud laugh can't throw it off. We've only checked it in unit tests so far, not yet in a loud room.
- **Long calls.** Tokens last 120 s and sockets drop. We built the Ink connection to reconnect with backoff (0.5 s up to 10 s) and to open a fresh connection between turns every 10 minutes, with a new token and the latest keyterms. Our phone tests were short calls, so this hasn't been tried on real phones yet.
