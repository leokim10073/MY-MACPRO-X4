# Spill the Tea: track details

*Late to the call? We'll spill it!* Live demo: https://spill-the-tea-call.vercel.app · Code: https://github.com/leokim10073/MY-MACPRO-X4

The project story covers what Spill the Tea does. This file adds the vision (Meta + Anthropic, Microsoft) and the technical detail for each sponsor track (Cartesia, Convex).

**In one line:** a voice room for friends. A latecomer hears a 20-second spoken recap, gets a story card when old gossip comes back, and at the end Last Sip deletes everything.

---

## Meta + Anthropic: bringing scattered friends back together, with Claude

**AI that gets you back into the conversation, not AI that talks for you.**

**Our community: recent graduates whose friends scattered across time zones after college.** The weekly call is how the group stays close, but someone is always finishing work in New York, waking up in Taipei or stuck on a late shift in London, so someone always joins late. Group chats have scrollback. Voice calls don't. The latecomer can interrupt ("wait, who's Kevin?") and kill the story, or stay quiet and miss every callback. Over time, the friends who keep joining late start to drift out of the group.

Spill the Tea never speaks in the call. Its only job is to get the latecomer talking. **Success isn't the latecomer reading a summary. It's the latecomer saying "Wait, the WHOLE cake?"**

| Criterion | Our answer |
| --- | --- |
| Named community, real problem | Graduates spread across time zones, for whom the call is the friendship. Joining late shouldn't mean being left out |
| Human connection | The latecomer gets the backstory by ear while friends keep talking, so nobody retells the story and nobody is left out. Story cards keep friends' real reactions in their own words, so the latecomer gets the joke, not meeting notes |
| AI essential, thoughtful use of Claude | Without Claude there's no product. It tracks people and stories from live speech, links vague references ("he", "the roommate") to the right person, and works out what *this* latecomer missed (details below) |
| Originality | Catch-up tools give one summary at the end and keep it forever. We help **at the moment a callback lands**, and pour the tea out when the night ends |
| It works | One flow done well, live on real phones on one call. Replay mode is the backup if the venue mics fail |

### What Claude does

| Job | Model | When | What Claude does |
| --- | --- | --- | --- |
| **Recall** (fast path) | Claude Haiku | Every new line | Decides whether the line calls back to a known person or story, including vague references ("he", "the roommate", "the cake thing") |
| **Story state** (slow path) | Claude Sonnet | About every 25 s | Rebuilds people, stories, one-word keywords, real reactions and the current topic |
| **Recap** | Claude Sonnet | When someone joins late | At most 50 words, only what *this* person missed |

- **Structured output by tool use**, matching `shared/schema.ts`. The fast path forces the tool and skips thinking, for speed.
- **Confidence isn't Claude's own number.** Claude answers plain questions about each recall, and fixed rules turn the answers into a score: name or alias 0.95, story reference 0.9, pronoun 0.8, more than one possible person 0.5. Pop-ups need 0.7.
- **Instant layer before Claude:** names, aliases and longer story keywords are matched against Ink's streaming text on the phone, so the card appears mid-sentence. Claude catches the vague references when the turn ends.
- **Eval:** `npm run eval` replays the Kevin conversation against expected output, including the hard case: "Kevin from work" must **not** merge with Roommate Kevin.

### Where it could go wrong for friends, and what we did

| Risk | What we did |
| --- | --- |
| Someone doesn't know the call is transcribed | Everyone is told on entry; a red dot on Mute whenever the mic is live |
| A vague reference is linked to the wrong person | Ambiguous matches score 0.5 and stay silent: better silent than wrong |
| Gossip shown as fact | Stories read as "Alex says…"; guesses are labeled as speculation |
| A reaction is invented or credited to the wrong friend | Reactions must be transcript quotes with the speaker's name, linked to their source lines |
| Claude guesses feelings | Rule: never infer feelings from silence |
| Someone speaks an "instruction" to the AI | Transcript text is treated as data, never instructions |
| Private stories leave the room | Audio is never stored; Last Sip deletes everything and discards AI results that arrive late |
| People who were there get interrupted | Pop-ups only show for stories that person missed |

---

## Microsoft: Built for the Real World / Customer Impact

**A context hand-off agent for live voice.** We proved it on friends' calls. The same agent fits anywhere someone joins a conversation already in progress: a stand-up you're late to, a support call passed to a second agent, a nurse's shift handover. The agent listens the whole time, briefs only the person who missed something, and keeps quiet for everyone else.

- **Customer understanding:** the latecomer wants to join in fast without making anyone repeat themselves. That's why the recap is spoken and at most 50 words (about 20 s), and a story card is one keyword you can tap.
- **Measurable usefulness:** final text arrives about 134 ms after the speaker stops; a pop-up only shows at 0.7 confidence or above; recaps are capped at 50 words in the schema; an eval replays a scripted conversation and checks the expected people, stories and recalls.
- **Path to production:** a serverless Convex backend deployed with one command; API keys stay on the server and phones get short-lived tokens; per-room rate limits; tests on every layer; it degrades instead of failing (no AI → text recap, no voice key → text only). Next: accounts and saved groups, a native app for background audio, more languages, consent per participant, and plugging into existing meeting platforms.
- **Responsible design:** better silent than wrong (vague matches don't pop up), no invented feelings, reactions are real quotes credited by name, and rooms are deleted on request or after 12 hours idle.
- **End to end:** phone mic → Cartesia Ink → Convex → Claude → Cartesia Sonic → the latecomer's phone, all live, and Last Sip clears every phone.

---

## Cartesia: voice is the product

Cartesia handles both ends of the voice: **Ink** turns the call into text, and **Sonic** turns the catch-up back into voice.

| Feature | How we use it |
| --- | --- |
| **Ink** (`ink-2`), turns WebSocket | One long-lived connection per phone. Streaming `turn.update` text powers live captions and the mid-sentence pop-up. `turn.end` becomes a transcript line under the speaker's name |
| **Turn detection** | No push-to-talk: Ink decides when turns start and end. `turn_start_threshold` 0.8, so a turn only starts on clear speech |
| **Keyterms** | Member names plus every person and alias mentioned so far ("Kevin", "the landlord"), trimmed to Ink's limits (100 terms / 1,200 chars) and refreshed on every reconnect, so names come out spelled right as the story grows |
| **Access tokens** | Convex checks you're in a live room, then mints a 120 s speech-to-text-only token. The API key never reaches the browser |
| **Sonic** (`sonic-3.6`, pinned snapshot) | Reads the recap as an MP3 in a neutral narrator voice. It plays only on the latecomer's phone, never into the call, and friends' voices drop to 30% meanwhile |

```
phone mic → LiveKit (Krisp noise + background-voice filter)
  → 16 kHz PCM16 → loudness gate → Cartesia Ink
       turn.update → live captions + instant recall pop-up
       turn.end    → transcript line → Claude (stories, recap text)
  → Cartesia Sonic → recap MP3 → latecomer's phone only
```

- **Per-phone transcription, not one scribe:** every line has the right name with no speaker diarization, and Ink hears the same cleaned audio friends hear.
- **Loud rooms:** three layers: Krisp, our loudness gate (learns the owner's level, sits about 15 dB below it, moves at most 6 dB per turn) and the raised turn threshold.
- **Edge cases:** a turn splitter keeps the real order when someone cuts in; reconnects back off from 0.5 s to 10 s; a fresh connection every 10 minutes picks up a new token and the latest keyterms; iOS lock and app-switch recovery.
- **Testing without a crowd:** Sonic read our scripted conversation into Ink in real time. All six lines came back right, names included; connecting took about 350 ms on average, and final text arrived about 134 ms after speech ended.
- **Known limits:** English only; the recap MP3 takes a few seconds (the text shows first; streaming Sonic is next); the noise gate is unit-tested but not yet tried in a loud room.

Other tools, so Cartesia's part is clear: LiveKit carries call audio, Krisp filters noise, Claude writes the recap text and spots callbacks, and Convex stores and syncs everything.

---

## Convex: the whole backend in one TypeScript project

All of the backend is in `backend/convex/` and shares types with the React app through `shared/schema.ts`. There's no websocket server, cache, job queue or separate API server, and four people built it in one weekend.

| Track asks for | What we built |
| --- | --- |
| **Agent / full-stack** | An agent loop driven by the database: each new line schedules Claude, and the results are written back and pushed to every phone |
| **Database** | Rooms, members, transcript lines, story state, recalls, recaps and an append-only `events` log, all indexed |
| **Functions** | Queries, mutations and actions, including a Node-runtime action for LiveKit. Every public function checks the caller's `sessionToken` |
| **Workflows** | The scheduler chains the work: a new line runs the AI fast path at once and the slow path 25 s later; a late join schedules the recap, then its narration. A cron burns rooms idle for 12 h |
| **Sync / live queries** | Every phone subscribes to `events.listAfter` and `presence.list`. Lines, recalls, story updates, leaves and burns reach every phone with no polling |
| **Components** | `@convex-dev/presence`: 15 s heartbeats, about 40 s timeout, and a disconnect when the tab closes, so the people count stays right. `@convex-dev/rate-limiter`: caps AI and voice use per room or member on a public link, and degrades gracefully (e.g. recap falls back to text) |
| **File storage** | The Sonic recap MP3 is stored in Convex, served by URL and deleted on burn |
| **Search** | Not used: recall is Claude's job. A transcript search index is a next step |

- **Consistency:** a line gets its `seq` and its event row in one mutation, so every phone sees the same order. Phones that reconnect catch up from their last `eventSeq`. A stale AI result is dropped if its `uptoSeq` is old or the room has burned.
- **Security:** token checks on every read and write; burn wipes transcript, stories, recalls, audio and presence; secrets live in Convex env vars.
- **Testing:** `convex-test` + Vitest run the backend in memory with instant timers, components included.
