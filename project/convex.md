# Best Use of Convex

Prize: $5,000 cash to the winning team (from Convex's Slack announcement; the Hacker Guide listed a Teenage Engineering EP-133 K.O. II and a Waveshare ESP32-S3 touch display).

## What the track asks for

The Hacker Guide says "Coming soon!". Convex's Slack post (Wayne Sutton) is the only description so far:

- **Prize track: Best Use of Convex**, $5,000 cash.
- What Convex offers: **a reactive database and TypeScript backend functions. Write to the database and every connected client sees the change live. No websockets to wire up, no cache to babysit.**
- It works for any kind of project: AI agents, healthtech apps, full-stack side projects.
- Hardware option: an alpha Convex client for ESP32 gives devices live query updates without polling (github.com/convex/convex-esp32).
- Resources: convex.dev, convex.dev/hackathons/resources, docs.convex.dev, docs.convex.dev/ai, Discord #hackathon.
- **Workshop: "How to build agentic apps", Saturday 4 PM.** Worth attending to hear what judges look for.

Until real criteria appear, we pitch against what the post stresses: **reactivity (live updates to every client), TypeScript functions and agentic or AI apps.**

- [ ] Check Slack and the Live Site for the final criteria on Saturday

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
| **Reactive queries** | `events.listAfter`, `story.*`, `rooms.get` | Phones subscribe to the room's event log. Every change shows up on every phone with no polling |
| **Mutations as transactions** | `lines.add`, `rooms.join`, `rooms.burn` | A line gets its `seq` and its event row in the same transaction, so every phone sees the same order |
| **Append-only event table** | `events` with a per-room `eventSeq` | The web app replays events into its reducer. A phone that reconnects catches up from its last `eventSeq` |
| **Actions** (calling outside APIs) | `ai.fastPath`, `ai.slowPath`, `ai.writeRecap`, `voice.sttToken`, `call.callToken` | Claude, Cartesia and LiveKit calls run inside Convex, so API keys stay in Convex env vars and never reach a phone |
| **Node runtime actions** | `call.ts` (`"use node"`) | LiveKit's server SDK runs inside Convex too |
| **Scheduler** | `ctx.scheduler.runAfter` in `lines.ts`, `rooms.ts`, `replay.ts` | Each new line schedules the fast AI path right away and the slow path after 25 s. A late join schedules the recap. Replay mode plays the scripted conversation line by line on a timer |
| **Cron jobs** | `crons.ts` | Every 10 minutes, rooms abandoned for 12 hours are burned |
| **File storage** | Recap MP3 from Cartesia Sonic | Stored in Convex, served by URL, deleted on burn |
| **Indexes** | `by_room_seq`, `by_room_eventSeq`, `by_token`, `by_inviteToken` | Fast per-room reads and session lookups |
| **Environment variables** | `ANTHROPIC_API_KEY`, `CARTESIA_API_KEY`, `LIVEKIT_*` | Secrets live on the deployment |
| **`convex-test`** with Vitest | `backend/convex/*.test.ts` | Backend tests run in memory, timers run instantly |

## Agentic angle (for the Saturday workshop's theme)

The AI is an agent loop driven by the database: a write (new line) schedules an action, the action reads the room's state, calls Claude, and writes results back with a mutation, which every subscribed phone sees right away. Stale results are guarded: a `StoryState` is saved only if its `uptoSeq` is newer, and any AI result that arrives after a burn is thrown away.

## Security

- Every read and write checks the caller's `sessionToken` on the server. No accounts, but no access without joining.
- Burn deletes transcript, story state, recalls, recap and audio file, then rejects later reads and writes.

## Tech used

Convex (database, queries, mutations, actions, scheduler, crons, file storage), TypeScript, React + Vite (`ConvexClient` from `convex/browser`), Vitest + convex-test.
