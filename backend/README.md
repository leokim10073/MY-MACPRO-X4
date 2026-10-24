# backend/

Rooms, ordering, storage and realtime updates. Also owns integration: decides when something counts as working on `main`. **Owner: ___**

## Responsibilities

- Create rooms, generate the invite link and QR code, and let people join with a nickname. No accounts.
- Record each `Member.joinedAtSeq` when they join.
- Accept `NewTranscriptLine`s, assign `id` and `seq`, store them and push `line_added`.
- Send each new line to AI's fast path and push the resulting `recall` events.
- Run AI's slow path every 20–30 s. Save the `StoryState` only if its `uptoSeq` is newer than the saved one.
- When someone joins late, request a `Recap` and push `recap_ready`.
- **Replay mode:** play [../shared/fixtures/kevin.replay.json](../shared/fixtures/kevin.replay.json) into a room using each line's `delayMs`. Build this first, since it unblocks everyone.
- **Burn:** host only. Mark the room `burned`, push `room_burned`, delete transcript, story state, recalls and recap, reject all later reads and writes, and discard any AI result that arrives after the burn.
- Deploy so phones can reach it over the venue Wi-Fi.

## Uses from shared/schema.ts

`Room`, `Member`, `TranscriptLine`, `NewTranscriptLine`, `StoryState`, `Recall`, `Recap`, `RoomEvent`.

## Done when

Three phones join one room, all receive the same live updates, and all get cleared when the host burns it.

## Running it

Built on Convex. From this folder:

```sh
npm install
npx convex dev   # logs in, creates a dev deployment, writes CONVEX_URL to .env.local, watches convex/
```

No account yet? `CONVEX_AGENT_MODE=anonymous npx convex dev` runs a local backend at http://127.0.0.1:3210.

`npm test` runs the backend tests in memory (no server needed, timers run instantly). Run it before merging into `main`.

Phones keep the `sessionToken` from `rooms.create` or `rooms.join` and pass it to every call. The server checks it every time.

Every change is also written to an append-only `events` table, one `RoomEvent` per row with a per-room `eventSeq`, in the same mutation as the change. The web app subscribes to `events.listAfter` and feeds each event to its reducer (see `web/docs/design.md`, issue 4).

| Function | Who calls it | Does |
| --- | --- | --- |
| `rooms.create({ name })` | web | New room with the caller as host. Returns `{ room, member, sessionToken }` |
| `rooms.join({ inviteToken, name })` | web | Join with a nickname. Same return. Late joiners get a recap written |
| `events.listAfter({ roomId, sessionToken, afterEventSeq })` | web (subscribe) | `{ status, events }`. `status: "burned"` with no events once the room ends |
| `rooms.burn({ roomId, sessionToken })` | web, host only | Deletes the conversation, ends the room on every phone |
| `lines.add({ sessionToken, text, at })` | voice | Adds a transcript line, assigns `seq`, runs the AI fast path |
| `replay.start({ sessionToken, script? })` | host only | Plays `kevin.replay.json` into the room |
| `rooms.get`, `lines.list`, `story.state`, `story.recalls`, `story.myRecap` | anyone (subscribe) | The same data as plain state queries, handy from the CLI |

A recap belongs to the member whose `joinedAtSeq` equals its `uptoSeq`.

Testing with the web app: create a room in the browser, then run `npx convex run replay:startLatest` to replay the Kevin script into the newest room.

The AI calls in `convex/ai.ts` are stubs marked `STUB`. Everything around them (scheduling, burn checks, the `uptoSeq` guard) is done. Abandoned rooms burn after 12 hours.

## Notes

- Check membership on the server for every read and write. Hiding buttons isn't security.
- Keep conversation text out of logs and analytics.
