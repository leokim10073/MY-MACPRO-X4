# Stage 2: two ways to build the live call

Replace push-to-talk with an always-on voice call, like a phone call. This document records what we've decided so far, what the research found, and a comparison of two ways to build it. No approach has been chosen yet, and no code has been written.

Related: [process.md](process.md) (sections 1 and 7 hold the original stage 2 plan), [project_description.md](../project_description.md).

---

## 1. Decided requirements

| Item | Decision |
| --- | --- |
| Devices | Everyone joins on their own phone with a headset. No sharing |
| Call type | Voice only, no video. The room screen keeps the transcript, relation tree and pop-ups, and adds "Join call", mute, and a "speaking / muted" state next to each member |
| Who is speaking | Decided by which phone sent the audio (P8). No voiceprint recognition |
| Noise | Filter out most of it. Lean strict: better to miss a very quiet line than to put a passerby's words under a friend's name |
| Interruptions | When someone cuts in, the current speaker's turn is split in two, so the transcript follows the real order of the conversation |
| Going off topic and coming back | Handled by the AI owner (see section 6) |
| iOS | Accept the web limits for now: remind users to keep the screen on, detect when the system stops the mic, and reconnect automatically when they come back. Consider a native app later |
| Schedule | No deadline pressure. Completeness and stability come first. A part is done only after it has been tested on real phones in real noisy places |
| Push-to-talk | Kept as a fallback and as an option in settings |

### Interruption split example

> Alex tells the cake story for 20 seconds. At second 8, Sam cuts in with "NO WAY".

Without splitting, Sam's line finishes first and gets the earlier `seq`, so the reaction lands before the story:

```
Sam:  NO WAY
Alex: So Kevin walks into the kitchen and eats the whole cake...
```

With splitting:

```
Alex: So Kevin walks into the kitchen
Sam:  NO WAY
Alex: and eats the whole cake...
```

The words are not changed at all, only split into two lines, so this still follows P7.

### Noise filtering layers

All layers run before audio is sent to Ink, so filtered audio never leaves the phone. While audio is being blocked, the phone sends all-zero silence to Ink so the connection stays open.

| Layer | Blocks | Doesn't block |
| --- | --- | --- |
| ① Headset + browser processing (`noiseSuppression`, `echoCancellation`) | Wind, dishes, traffic | Voices |
| ② Background voice removal (Krisp BVC or VIVA) | Other people talking farther away | Someone very close and loud |
| ③ Loudness gate (calibrated by saying one sentence when joining) | Sounds much quieter than your own voice | Someone as loud as you |
| ④ Voiceprint recognition | **Not doing this time** | |

We also raise Ink's `turn_start_threshold` so background sound triggers `turn.start` less often. It can be changed mid-connection with `{"type":"config"}`, so the calibration result can be applied directly.

---

## 2. Research findings (2026-10-24)

### LiveKit background voice removal

- The web package `@livekit/krisp-noise-filter` (0.4.5) has **`useBVC?: boolean`** in `KrispOptions`, which removes background voices inside the phone's browser.
- The processor exposes **`processedTrack?: MediaStreamTrack`**. In principle, the cleaned audio can go to both LiveKit and Ink. The docs don't say whether the track is only available after publishing to LiveKit. **Needs testing.**
- Requires **LiveKit Cloud**.
- Safari needs **17.4 or later**. Check with `isKrispNoiseFilterSupported()` and fall back to layer ① when it isn't supported.
- The package is about **6 MB**. Load it only when joining the call.
- It has `quality: "low" | "medium" | "high"`. Use `low` on low-end phones.
- Server side (agents SDK) also offers **Krisp VIVA** and ai-coustics Voice Focus. They remove voices better than BVC but can't run in the browser.
- **Cost is unclear:** regular noise suppression is free. The pricing page lists "voice isolation" at 100 minutes/month on the free Build plan and $0.0012/min overage (Ship / Scale). Whether BVC counts as voice isolation is contradicted across LiveKit's own docs. Ask LiveKit.

### Cartesia Ink turns endpoint

- `turn_start_threshold` defaults to 0.8, range 0.5–0.9. Raising it reduces false starts from background sound, at the cost of detecting real speech a little later.
- Ink decides where a turn starts and ends from meaning and sentence completeness, not loudness alone. But the docs **say nothing about other people talking nearby**.
- If audio stops arriving, the server keeps waiting instead of treating it as silence. The docs recommend sending all-zero audio while muted.
- **Idle connections are closed after 3 minutes.**
- **Token `expires_in` is at most 3600 seconds.** Whether an open connection is cut when its token expires is not documented. **Needs testing.**
- The maximum length of one connection is not documented.
- **Idle connections still count toward concurrency.** The Startup plan caps it at 20, so **at most 20 people can be on calls at once across all rooms**. Fine for the hackathon; a real launch needs a bigger plan or a deal with Cartesia.

### iOS Safari

- According to Apple forum posts and WebKit bug reports (iOS 13–17), **Safari pauses the mic and WebRTC as soon as the screen locks or the user switches apps**. Web apps added to the home screen are worse. Needs testing on the latest iOS.
- Web workaround: listen for the track's `ended` event and the Page Visibility API, re-acquire the mic and reconnect when the page comes back, and remind users to keep the screen on.
- To keep talking with the screen locked, the app needs a native wrapper (for example Capacitor).

### Other call services

- **Daily**: also partners with Krisp, but I couldn't find whether its web SDK removes background voices or how it's billed.
- **Plain WebRTC**: we'd handle connections and firewall traversal (TURN) ourselves, and there's no BVC.
- Conclusion: **LiveKit fits best**, mainly because its web SDK has `useBVC`.

---

## 3. Approach 1: each phone transcribes itself

The original process.md plan (D13), plus BVC and a loudness gate.

```
Headset mic
    │
    ▼
Krisp (useBVC) ──▶ processedTrack ──┬──▶ LiveKit publish (friends hear it)
                                    │
                                    ▼
                          AudioWorklet (16k, s16)
                                    │
                                    ▼
                  Loudness gate (sends silence below the gate)
                                    │
                                    ▼
                   Ink /stt/turns/websocket (always open)
                                    │ turn.end
                                    ▼
                        NewTranscriptLine ──▶ backend
```

### Interruption split

Every phone already receives everyone else's `line_added`. If Alex's phone receives someone else's line while Alex's turn is still open, it sends the text accumulated so far in `turn.update` as one line, and the rest becomes a new line.

Detail to confirm: `turn.update` is cumulative, so after a split the phone has to remember how much it already sent and only send what's new.

### Pros

- Reuses the existing audio source, chunker, `LineSender` and token handling. Push-to-talk and open mic share one pipeline, so switching between them is natural.
- No new server.
- Audio goes only to LiveKit and Cartesia, never through our backend. The privacy checklist in process.md section 13 stays as is.
- The speaker sees their own "transcribing…" preview directly on their phone, with the lowest latency.

### Cons

- The split depends on receiving someone else's `line_added`, so the cut lands about 1 second after the other person actually started (they finish → Ink → backend → push).
- Every phone runs Krisp, which may cost CPU and battery on low-end phones.
- Only BVC is available, not the stronger VIVA.
- Whether `processedTrack` can feed the AudioWorklet is unconfirmed. If testing fails, this path has to change.
- The browser needs a Cartesia token, and a long-lived connection has to handle token refresh and reconnects.

---

## 4. Approach 2: a server-side "scribe" transcribes everyone

Phones only handle the call. A separate server program joins the LiveKit room, subscribes to each person's audio track, and transcribes them all.

```
Alex's phone ──┐                 ┌──▶ Sam and Jamie hear it
Sam's phone ───┼──▶ LiveKit ─────┤
Jamie's phone ─┘                 │
                                 ▼
               Scribe (our server, LiveKit agents SDK)
                 One pipeline per person:
                   audio track ──▶ Krisp VIVA ──▶ loudness gate ──▶ Ink
                                 │ turn.end
                                 ▼
                 Shared timeline: split by actual start time
                                 │
                                 ▼
                         Convex (NewTranscriptLine)
```

### Interruption split

All Ink events live in one program on one clock. As soon as Sam's `turn.start` arrives, Alex's open turn can be split right at the moment Sam actually started speaking.

### Pros

- Can use **Krisp VIVA**, which is server-side only and removes voices better than BVC.
- The most precise interruption splits.
- No Cartesia token in the browser at all, and keyterms are updated in one place.
- Phones only run the call and basic noise suppression, so they use less battery.

### Cons

- **Needs an always-on server.** Convex can't hold long-lived WebRTC or WebSocket connections, so it has to be deployed separately (for example Fly.io or Railway), with monitoring and upkeep.
- Audio passes through our server (in memory only, never written to disk). The privacy checklist item "audio for transcription never passes through the backend" has to change, and the notice on the join screen has to be rewritten.
- The room gets an extra "scribe" participant. It never speaks, so it doesn't break P2, but everyone must be able to see it on screen.
- Push-to-talk becomes a second, separate pipeline to maintain.
- The speaker's own "transcribing…" preview has to come back from the server, adding latency.
- If the server goes down, every room stops transcribing at once.

---

## 5. Comparison and recommendation

| | Approach 1: phones transcribe | Approach 2: server scribe |
| --- | --- | --- |
| Background voice removal | BVC (browser) | VIVA (stronger) |
| Interruption split | About 1 second late | Precise |
| New infrastructure | None | An always-on server |
| Reuses existing code | Mostly | Audio source must be rewritten for the server |
| Privacy promise | Audio never passes through our server | Audio passes through our server (memory only) |
| Push-to-talk fallback | Same pipeline | Two pipelines |
| Phone battery | Higher (runs Krisp) | Lower |
| Main uncertainty | Whether `processedTrack` can feed Ink | Deployment and upkeep |

**Recommendation: Approach 1.** It reuses existing code, keeps the stronger promise that audio never passes through our server, and makes the push-to-talk fallback natural. First, run the tests in section 7 on a throwaway test page. If they fail, or BVC can't block passersby in practice, switch to Approach 2.

Neither approach needs changes to `shared/schema.ts`.

---

## 6. Notes for other owners

### AI owner

- After a digression, when the group returns to the original story, should the latecomer get a pop-up? The current `continuesCurrentStory` rule can't decide this case.
- Voice will provide live-call style test data (text transcribed from real calls, text only) with interruptions, digressions and returns, to check that the AI's behavior doesn't get worse.
- Short lines like "um" or "uh" from noise that slips through are sent as-is (P7). The AI decides whether to ignore them.

### Backend owner

- Expect more lines. With interruption splits and short reactions, the same conversation may produce 2–3 times as many lines as push-to-talk. AI trigger frequency and cost estimates may need adjusting.
- Ordering (process.md Q6): with interruption splits, sorting by `seq` (arrival order) already comes close to the real order of the conversation.
- Needs a LiveKit token endpoint, and on burn, deletes the LiveKit room with the server SDK.
- For Approach 2, also deploy the scribe server and give it write access to Convex.

---

## 7. Tests to run before implementation

Run these on a throwaway test page. None of it goes into production code.

| # | Test | Affects |
| --- | --- | --- |
| T1 | Can Krisp's `processedTrack` feed the AudioWorklet and on to Ink? Must it be published to LiveKit first? | Whether Approach 1 works |
| T2 | In a real noisy place (a café, people talking nearby), how many passersby do BVC + loudness gate + a raised `turn_start_threshold` block? Does the user's own quiet speech get blocked? | Whether to switch to Approach 2's VIVA |
| T3 | Is an Ink connection cut when its token expires? How long can one connection stay open? | Reconnect and token refresh strategy |
| T4 | On the latest iOS Safari, what happens to the mic and LiveKit on screen lock, app switch and incoming calls? Does it recover automatically on return? | The web reconnect flow |
| T5 | Krisp CPU and battery use on low-end Android and older iPhones | Default `quality` |

Also ask LiveKit whether BVC is billed as voice isolation minutes.

---

## 8. References

- [LiveKit Enhanced noise cancellation](https://docs.livekit.io/transport/media/enhanced-noise-cancellation/)
- [LiveKit pricing](https://livekit.com/pricing)
- [LiveKit noise cancellation (client)](https://docs.livekit.io/home/client/tracks/noise-cancellation)
- [Cartesia Turn detection](https://docs.cartesia.ai/use-the-api/stt/turns.md)
- [Cartesia STT Turns WebSocket reference](https://docs.cartesia.ai/api-reference/stt/turns/websocket.md)
- [Cartesia Concurrency limits and timeouts](https://docs.cartesia.ai/use-the-api/concurrency-limits-and-timeouts.md)
- [Cartesia Access token](https://docs.cartesia.ai/api-reference/auth/access-token.md)
- [Apple Forums: Safari background WebRTC](https://developer.apple.com/forums/thread/774239)
- [WebKit Bug 239602](https://bugs.webkit.org/show_bug.cgi?id=239602)
- [WebKit Bug 241400](https://bugs.webkit.org/show_bug.cgi?id=241400)
- [Daily × Krisp](https://www.daily.co/partners/krisp)
