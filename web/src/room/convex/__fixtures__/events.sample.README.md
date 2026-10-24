`events.sample.json` is generated from `shared/fixtures/kevin.expected.json` in the backend converters' shapes; it is NOT exported from a real deployment (TODO replace with real rows).
To replace it, ask the backend owner to run `npx convex data events --limit 100 --format jsonl > events.sample.jsonl` before burning the room, then convert the lines into a JSON array of `{ eventSeq, event }` rows.
