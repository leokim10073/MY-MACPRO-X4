# Spill the Tea

**Late to the call? We'll spill it!**

A voice room for friends telling stories. Join late and you hear a 20-second spoken recap of what you missed. When old gossip comes back, a story card pops up before the sentence is even finished, and a live map shows who's who. When the night is over, **Last Sip** pours the tea out and deletes everything.

**Live demo:** https://spill-the-tea-call.vercel.app (open it on two or more phones)

## What it does

Everyone joins an always-on call from their own phone, with no push-to-talk, and friends see your words appear while you're still talking. On top of that:

1. **Recap.** A latecomer hears a 20-second "previously on…" read by a neutral narrator, on their phone only. Friends keep talking, and their voices drop while it plays.
2. **Recall.** When someone mentions a person or story you missed ("after the cake thing with Kevin…"), you get `Kevin · Cake · Airport · Landlord`. Tap a story to see what happened, as the teller told it, with friends' real reactions. Everyone also shares a live recall board: who's being talked about, their stories, and what the group is on now.
3. **Map.** Switch the board to **Map** for a live web of everyone being talked about. People who share stories are linked, and thicker lines mean more shared stories. It grows as new names come up. Tap a person for their stories, or a line for what two people have been through together.
4. **Last Sip.** The host ends the room: the call ends for everyone, and the transcript, stories and recap audio are deleted.

## How it works

```
phone mic → LiveKit call (Krisp noise filter)
  → 16 kHz PCM16 → loudness gate → Cartesia Ink (speech-to-text, per phone)
       turn.update → live captions + instant pop-up on the phone
       turn.end    → transcript line → Convex
                        → Claude Haiku: is this a callback? → recall pop-up
                        → Claude Sonnet: people, stories, reactions → recall board, Map, story cards
                        → Claude Sonnet: recap text for a latecomer
                        → Cartesia Sonic → recap MP3 → latecomer's phone only
Convex live queries push every change to every phone.
```

### Cartesia

| Feature | How we use it |
| --- | --- |
| **Ink** (`ink-2`), turns WebSocket | One connection per phone for the whole call. `turn.update` drives live captions and the mid-sentence pop-up; `turn.end` becomes a transcript line under the speaker's name |
| **Turn detection** | Ink decides when a turn starts and ends, so there's no button. `turn_start_threshold` is 0.8 to ignore background chatter |
| **Keyterms** | Member names plus every person and alias mentioned so far, kept within Ink's limits and refreshed on reconnect |
| **Access tokens** | The backend mints a 120 s speech-to-text token for room members only. The API key never reaches the browser |
| **Sonic** (`sonic-3.6`, pinned snapshot) | Reads the recap as an MP3 in a neutral narrator voice |

### Convex

All of the backend is in [`backend/convex/`](backend/convex). It uses:

- **Live queries:** every phone subscribes to the room's event log, so there's no polling.
- **Mutations as transactions:** every phone sees lines in the same order.
- **Actions:** Claude, Cartesia and LiveKit calls, with keys in Convex env vars.
- **Scheduler:** runs the AI after each line and writes the recap on a late join.
- **Cron:** deletes rooms idle for 12 h.
- **File storage:** holds the recap MP3.
- **Components:** [`@convex-dev/presence`](https://www.convex.dev/components/presence) for who's still in the room, and [`@convex-dev/rate-limiter`](https://www.convex.dev/components/rate-limiter) to cap AI and voice use.

### Claude

| Job | Model | When |
| --- | --- | --- |
| Recall: does this line refer back to a known person or story? | Claude Haiku | Every new line |
| Story state: people, stories, keywords, real reactions, current topic | Claude Sonnet | About every 25 s |
| Recap: at most 50 words, only what this person missed | Claude Sonnet | When someone joins late |

Both return structured output through tool use. Claude doesn't score its own confidence: fixed rules turn its answers into a score, and ambiguous matches stay silent. Stories are framed as "Alex says…", reactions are real quotes credited by name, and transcript text is treated as data, never instructions.

### Map

[React Flow](https://reactflow.dev) and d3-force draw the Map straight from the people and stories Claude already tracks, so it needs no extra AI call. It refits the screen as new names come up, and once you drag or zoom, it stays where you put it. Code: [`web/src/graph/`](web/src/graph).

## Repo layout

| Folder | What's in it |
| --- | --- |
| [`shared/`](shared) | `schema.ts`, the data contract every part builds against, plus the scripted Kevin conversation used for replay and tests |
| [`backend/`](backend) | Convex backend: rooms, lines, events, AI scheduling, recap, presence, rate limits |
| [`ai/`](ai) | Claude prompts, validation and the eval harness |
| [`voice/`](voice) | Mic capture, Cartesia Ink and Sonic, LiveKit call, loudness gate, turn splitter |
| [`web/`](web) | The phone web app (React + Vite) |
| [`project/`](project) | Devpost text and per-track notes |

## Running it locally

Needs Node 24, a [Convex](https://convex.dev) account, and keys for Anthropic, Cartesia and LiveKit. Every key lives in the Convex deployment, never in the repo or the browser.

```bash
# 1. Install (Convex bundles code from ai/ and voice/, so install those too)
(cd ai && npm install) && (cd voice && npm install) && (cd web && npm install)

# 2. Backend
cd backend && npm install
npx convex dev                     # creates a dev deployment and prints its URL
npx convex env set ANTHROPIC_API_KEY sk-ant-...
npx convex env set CARTESIA_API_KEY sk_car_...
npx convex env set LIVEKIT_URL wss://<project>.livekit.cloud
npx convex env set LIVEKIT_API_KEY ...
npx convex env set LIVEKIT_API_SECRET ...

# 3. Web app
cd ../web
echo "VITE_CONVEX_URL=<url from step 2>" > .env.local
npm run dev                        # HTTPS on https://<LAN IP>:5173 (mic needs HTTPS)
```

Open the printed address on each phone and accept the self-signed certificate. Create a room, then join from the invite link or QR code.

**Without a crowd:** `npx convex run replay:startLatest` (from `backend/`) plays the scripted Kevin conversation into the newest room.

**Missing keys:** the app still runs, just with less. Without Anthropic there are no recalls and the recap is a placeholder. Without Cartesia there's no speech-to-text, and recaps are text-only. Without LiveKit there's no call, but push-to-talk still works.

### Tests

```bash
cd backend && npm test    # convex-test, in memory
cd web && npm test        # Vitest
cd voice && npm test      # unit tests, no network
cd ai && npm test         # validation; `npm run eval` replays Kevin against Claude (needs a key)
```

More detail in each folder's README.

## Known limitations

- **English only.** Ink and Sonic are set to English.
- **Loud rooms.** Open mics can pick up a neighbor. Krisp, the loudness gate and the turn threshold help, but the gate is only unit-tested so far; earbuds help most.
- **Recap audio takes a few seconds.** The text shows first; streaming Sonic is the next step.
- **Phones.** iOS needs a tap to start audio and pauses the mic on lock; we recover with a "Tap to resume" prompt. Long calls (10+ minutes), Wi-Fi loss and phone locks mid-call aren't tested on real phones yet.
- **No accounts.** Rooms are one-off invite links that expire after 12 hours idle.

## Privacy

- Raw audio is never stored, only the transcript, and Last Sip deletes it along with the stories and recap audio.
- Everyone is told on entry that the call is transcribed, and a red dot on Mute shows whenever the mic is live.
- Every read and write is checked on the server against the caller's session.

Built at Cal Hacks.
