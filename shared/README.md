# shared/

The data contract everyone builds against. **Owner: whole team.** Change it only after telling everyone.

- [schema.ts](schema.ts): every shape that moves between voice, backend, AI and web, plus the "only what you missed" rules.
- [fixtures/kevin.replay.json](fixtures/kevin.replay.json): a scripted, fictional conversation for replay mode. Taylor joins after line 16.
- [fixtures/kevin.expected.json](fixtures/kevin.expected.json): what the AI should produce for that conversation (people, stories, recalls, recap). Web uses it as mock data, and AI checks its output against it.

In the fixtures, line N of the replay script has id `lN` and seq `N`.

## Data flow

```
voice ──NewTranscriptLine──▶ backend ──line_added──▶ web
                               │  ▲
                 TranscriptLine│  │StoryState / Recall / Recap
                               ▼  │
                                ai
```

- **Fast path (every line, under 2 s):** backend sends the new line to AI, which returns `Recall`s; backend pushes them to every phone.
- **Slow path (every 20–30 s):** AI rebuilds the `StoryState`; backend keeps it only if `uptoSeq` is newer than the saved one.
- **Late join:** backend asks AI for a `Recap` covering everything up to the joiner's `joinedAtSeq`, then voice turns it into audio.
- **Each phone** decides what to show using `missedStory` and `shouldShowRecall`.
