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

## Notes

- Check membership on the server for every read and write. Hiding buttons isn't security.
- Keep conversation text out of logs and analytics.
