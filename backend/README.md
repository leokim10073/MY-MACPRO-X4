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

Phones keep the `token` from `rooms.create` or `rooms.join` and pass it to every call. The server checks it every time.

| Function | Who calls it | Does |
| --- | --- | --- |
| `rooms.create({ name })` | web | New room with the caller as host. Returns `token`, `inviteToken` |
| `rooms.join({ inviteToken, name })` | web | Join with a nickname. Late joiners get a recap written |
| `rooms.get({ token })` | web (subscribe) | Room, me and members. `null` means the room ended |
| `rooms.burn({ token })` | web, host only | Deletes the conversation, ends the room on every phone |
| `lines.add({ token, text, at })` | voice | Adds a transcript line, assigns `seq`, runs the AI fast path |
| `lines.list({ token })` | web (subscribe) | Transcript in order |
| `story.state({ token })` | web (subscribe) | Latest `StoryState`, or `null` |
| `story.recalls({ token, afterSeq })` | web (subscribe) | Recalls after a seq |
| `story.myRecap({ token })` | web (subscribe) | The caller's recap, or `null` |
| `replay.start({ token, script? })` | web, host only | Plays `kevin.replay.json` into the room |

The AI calls in `convex/ai.ts` are stubs marked `STUB`. Everything around them (scheduling, burn checks, the `uptoSeq` guard) is done. Abandoned rooms burn after 12 hours.

## Notes

- Check membership on the server for every read and write. Hiding buttons isn't security.
- Keep conversation text out of logs and analytics.
