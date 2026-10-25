# Best Use of Convex

Prize: $5,000 cash to the winning team (from Convex's Slack announcement; the Hacker Guide listed a Teenage Engineering EP-133 K.O. II and a Waveshare ESP32-S3 touch display).

## What the track asks for

The official track description:

> Agent, healthtech, fintech, hardware, or full-stack side project. Build it on Convex: database, functions, workflows, sync, search, and file storage in one TypeScript backend that updates live. Use real Convex features like live queries and components to win.

How Spill the Tea answers each part:

| The track asks for | What we built |
| --- | --- |
| **Agent / full-stack project** | A full-stack voice app with an AI agent loop: each new line triggers Claude, and its results are written back to the room (see "Agentic angle") |
| **Database** | Rooms, members, transcript lines, story state, recalls, recaps and an append-only `events` log, all with indexes |
| **Functions** | Queries, mutations and actions, including a Node runtime action for LiveKit. Every public function checks the caller's `sessionToken` |
| **Workflows** | The scheduler chains the work: a line schedules the AI fast path at once and the slow path 25 s later; a late join schedules the recap, then its narration. A cron burns abandoned rooms |
| **Sync / updates live** | Every phone subscribes to `events.listAfter` and `presence.list`. A line, a recall, a story update, someone leaving or a burn reaches every phone with no polling |
| **Live queries** | Same as above: the whole UI is driven by live queries through `ConvexClient` |
| **Components** | **`@convex-dev/presence`** shows who still has the room open, and **`@convex-dev/rate-limiter`** caps AI and voice use per room (details below) |
| **File storage** | The recap's MP3 from Cartesia Sonic is stored in Convex, served by URL and deleted on burn |
| **Search** | Not used. Story recall is done by Claude, not text search. A possible next step: a search index over the transcript |
| **One TypeScript backend** | All of it is in `backend/convex/`, sharing types with the web app through `shared/schema.ts` |

### Components we use

- **Presence (`@convex-dev/presence`)**, in `backend/convex/presence.ts`. Each phone sends a heartbeat every 15 s while the room is open. If someone closes the tab without pressing Leave, their phone sends a disconnect as the page closes (or the heartbeat times out after about 40 s), and every other phone drops them from the people count. Heartbeats only change the live query when someone comes or goes. Leave and burn remove the member's presence too.
- **Rate limiter (`@convex-dev/rate-limiter`)**, in `backend/convex/limits.ts`. The site is a public link, so these limits protect the API bill. The room keeps working when a limit is hit:

  | Limit | Applies to | Over the limit |
  | --- | --- | --- |
  | `createRoom` 60/hour, burst 20 | whole deployment | "Too many requests" error |
  | `addLine` 60/min, burst 30 | each room | "Too many requests" error |
  | `aiFastPath` 60/min, burst 30 | each room | the line is still saved, but not checked for recalls |
  | `aiSlowPath` 60/hour, burst 10 | each room | stories update about once a minute instead of every 25 s |
  | `recap` 10/hour, burst 5 | each room | a short text recap, no AI and no audio |
  | `sttToken` 60/hour, burst 10 | each member | "Too many requests" error |
  | `callToken` 30/hour, burst 10 | each member | "Too many requests" error |

## Scenario

Four phones are in one room. A friend says a line. Within a moment:

1. The line is stored and every phone's live caption updates.
2. Claude checks whether it calls back to an earlier story, and the latecomer's phone shows a pop-up.
3. About 25 s after new lines, the stories are rebuilt and the shared recall board (people, stories, current topic) updates on every phone.
4. When someone joins late, their recap is written, read aloud and pushed to their phone only.
5. When the host burns the room, every phone switches to "This room has ended" at once.

None of this has a websocket server, cache or separate API server. It's Convex queries, mutations, actions and the scheduler.

## Problem it solves (for us as builders)

Spill the Tea is a realtime, multi-device app with AI running in the background. Without Convex we'd need a database, a websocket layer, a job queue for AI calls, a cron runner and file storage. With Convex, four people built it in one weekend, each in their own folder, with one shared schema.

## How we use Convex

| Convex feature | Where | What it does |
| --- | --- | --- |
| **Reactive queries** | `events.listAfter`, `presence.list`, `story.*`, `rooms.get` | Phones subscribe to the room's event log. Every change shows up on every phone with no polling |
| **Mutations as transactions** | `lines.add`, `rooms.join`, `rooms.burn` | A line gets its `seq` and its event row in the same transaction, so every phone sees the same order |
| **Append-only event table** | `events` with a per-room `eventSeq` | The web app replays events into its reducer. A phone that reconnects catches up from its last `eventSeq` |
| **Actions** (calling outside APIs) | `ai.fastPath`, `ai.slowPath`, `ai.writeRecap`, `voice.sttToken`, `call.callToken` | Claude, Cartesia and LiveKit calls run inside Convex, so API keys stay in Convex env vars and never reach a phone |
| **Node runtime actions** | `call.ts` (`"use node"`) | LiveKit's server SDK runs inside Convex too |
| **Scheduler** | `ctx.scheduler.runAfter` in `lines.ts`, `rooms.ts`, `replay.ts` | Each new line schedules the fast AI path right away and the slow path after 25 s. A late join schedules the recap. Replay mode plays the scripted conversation line by line on a timer |
| **Cron jobs** | `crons.ts` | Every 10 minutes, rooms abandoned for 12 hours are burned |
| **File storage** | Recap MP3 from Cartesia Sonic | Stored in Convex, served by URL, deleted on burn |
| **Indexes** | `by_room_seq`, `by_room_eventSeq`, `by_token`, `by_inviteToken` | Fast per-room reads and session lookups |
| **Components** | `convex.config.ts`, `presence.ts`, `limits.ts` | Presence for who is still in the room; the rate limiter for AI and voice quotas |
| **Environment variables** | `ANTHROPIC_API_KEY`, `CARTESIA_API_KEY`, `LIVEKIT_*` | Secrets live on the deployment |
| **`convex-test`** with Vitest | `backend/convex/*.test.ts` | Backend tests run in memory, timers run instantly |

## Agentic angle (for the Saturday workshop's theme)

The AI is an agent loop driven by the database: a write (new line) schedules an action, the action reads the room's state, calls Claude, and writes results back with a mutation, which every subscribed phone sees right away. Stale results are guarded: a `StoryState` is saved only if its `uptoSeq` is newer, and any AI result that arrives after a burn is thrown away.

## Security

- Every read and write checks the caller's `sessionToken` on the server. No accounts, but no access without joining.
- Burn deletes transcript, story state, recalls, recap and audio file, clears the room's presence, then rejects later reads and writes.
- Rate limits keep a shared public link from running up the Claude, Cartesia and LiveKit bills.

## Tech used

Convex (database, queries, mutations, actions, scheduler, crons, file storage, the presence and rate-limiter components), TypeScript, React + Vite (`ConvexClient` from `convex/browser`), Vitest + convex-test.
