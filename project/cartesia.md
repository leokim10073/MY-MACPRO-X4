# Best Use of Cartesia

Prize: Meta glasses (TBD in the Hacker Guide).

## What the track asks for

"Build a useful voice experience with Cartesia. Voice should be core to the product, not just a feature added for the demo. Other tools are fine; make clear what Cartesia contributes."

### Required deliverables

- [ ] **A working demo**
- [ ] **A 2-minute, demo-first presentation:** one complete user flow first, then a short problem + how we built it
- [ ] **A short README:** setup, Cartesia features used, known limitations. The repo has no root README yet, so this has to be written
- [ ] **Source access for judges.** Repo public or shared. **No API keys or secrets in the repo** (checked: only `sk_car_...` placeholders and `.env.example` are committed)

### Judging criteria (25% each)

1. **Problem and originality:** useful, clearly scoped, thoughtfully designed?
2. **Use of Cartesia:** meaningfully part of the core experience? Voice clear, responsive and natural?
3. **Execution:** does the main flow work? Are likely edge cases handled?
4. **Impact and responsibility:** accessibility, privacy and responsible use considered?

They favor a strong working prototype over a large unfinished idea.

## Scenario

A group of friends is on a voice call. Everything they say goes through Cartesia Ink and becomes transcript lines with speaker names, and friends see each other's words appear live while they speak. When Taylor joins late, Cartesia Sonic reads a 20-second "previously on…" recap in a neutral narrator voice while the others keep talking. Taylor never has to look at a screen to catch up.

This matches Cartesia's own idea list: an ambient, hands-free assistant that helps without pulling out a phone.

## Problem it solves

Spoken conversations can't be scrolled back. The only way to recover what was said is to make someone repeat it. Spill the Tea turns the conversation into data while it happens (Ink) and gives the latecomer the missing context **back as voice** (Sonic), in the same medium they missed it in.

## What Cartesia contributes

| Cartesia feature | Where | What it does for us |
| --- | --- | --- |
| **Ink** (`ink-2`) streaming speech-to-text | `voice/src/stt/` | Every phrase from every phone becomes a `TranscriptLine` under the right name. This feeds all the AI |
| Ink **turn detection** | `voice/src/stt/turnSession.ts`, `turns.ts` | The always-on call needs no button: Ink decides when a turn starts and ends |
| Ink **keyterms** | `voice/src/stt/keyterms.ts` | Member names plus the people and aliases the AI has found ("Kevin", "the landlord") are sent as keyterms, so names come out spelled right as the story grows |
| Short-lived **STT tokens** | `voice/src/server/cartesia.ts`, `backend/convex/voice.ts` | The browser gets a 120 s token from Convex. The API key never reaches the phone |
| **Sonic** (`sonic-3.6`) text-to-speech | `voice/src/server/cartesia.ts` | Reads the recap aloud in a neutral narrator voice. The MP3 goes to Convex file storage and the phone plays it |

Other tools and what they do (so Cartesia's part is clear): LiveKit carries the call audio between phones, Krisp removes background noise, Claude writes the recap text, Convex stores and syncs everything.

## Handling a loud venue (execution and edge cases)

- One phone per speaker in the call, so every line has the right name.
- **Loudness gate** learns the phone owner's voice level and blocks quieter audio from people nearby.
- **Turn splitter** keeps the real order when someone cuts in.
- Ink connection **reconnects with backoff** and rotates every 10 minutes with a fresh token and current keyterms.
- Friends' voices **duck** while the recap plays.
- Empty or noise-only transcripts are dropped. Line sending retries.

## Responsibility and accessibility

- **Never stores raw audio.** Only the transcript is kept, and burning the room deletes it along with the recap MP3.
- Visible **listening** indicator (a red dot on the Mute button) whenever the mic is live. Everyone is told on entry that the conversation is transcribed.
- The spoken recap helps anyone who can't read a screen at that moment, and the text version is shown for anyone who can't listen.
- Keys stay on the server.

## Known limitations (for the README)

- English only (`TTS_LANGUAGE = 'en'`).
- Open mics in a loud room can still pick up a neighbor. In-person groups should use earbuds or keep phone volume low.
- Recap audio takes a few seconds to generate. The text shows first while it loads.
- Without `CARTESIA_API_KEY` speech isn't transcribed and recaps are text-only.

## Setup (for the README)

```bash
cd backend && npx convex env set CARTESIA_API_KEY sk_car_...
cd voice && npm install && npm test
```

Full steps: [../voice/README.md](../voice/README.md) and [../backend/README.md](../backend/README.md).
