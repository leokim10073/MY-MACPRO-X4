# Stage 2 spike (throwaway)

A test page for the checks in [stage2-options.md](../stage2-options.md) section 7 (T1–T5). It is not production code and has no tests. When the results are written into stage2-options.md, delete this folder, the `spikeApi` lines in `vite.config.ts`, `"spike"` in `tsconfig.json`, the LiveKit lines in `.env.example`, and the three LiveKit dev dependencies.

## What the page does

One phone joins a LiveKit room with Krisp on its mic and runs two Ink turn-detection connections side by side, so both transcripts of the same speech can be compared:

| Lane | Audio path |
| --- | --- |
| **Filtered** | Krisp `processedTrack` (BVC on or off) → loudness gate → Ink. This is what Approach 1 would ship |
| **Raw** | The untouched mic → Ink. The baseline |

Every finding is written to the on-page log, tagged `[T1]` … `[T5]`. **Copy log** copies the log plus both transcripts, ready to paste into the doc.

Running both lanes costs twice the Ink credits (ink-2 is 3 credits per second per lane). Untick the comparison lane when you don't need it.

## Setup

1. Create a LiveKit Cloud project (free Build plan is enough). Krisp only works with LiveKit Cloud.
2. Add `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` to `voice/.env` (see `.env.example`).
3. `npm run dev` in `voice/`, then open `https://<this computer's Wi-Fi IP>:5174/spike/` on each phone and accept the certificate warning.
4. Everyone wears a headset. Two phones are enough for most checks; T2 needs a third person to play the passerby.

## How to run each check

**T1: does `processedTrack` reach Ink?**
- Join with the defaults (BVC on, attach after publishing). In the log, look for `[T1] after publish: processedTrack=present` and `filtered lane level after 3 s: … audio is flowing`.
- Speak. Both lanes should produce lines.
- Leave, switch "Attach Krisp" to *before publishing*, and join again to see whether that order works too.
- Look for `[krisp]` lines saying whether BVC actually turned on. Krisp only enables BVC on devices and sample rates it supports.

**T2: how much of a passerby does it block?**
- Tap **Calibrate** and talk normally for 4 seconds. The gate is set 15 dB below your speech.
- Have someone stand about 1 m away and talk while you stay quiet. Count the lines in each lane. Then about 0.5 m away.
- Then you talk quietly, laugh, and say short reactions ("no way", "wait what"). Check that the filtered lane still catches them.
- Repeat with BVC off (leave, untick, rejoin) to see how much BVC adds over the gate alone.
- Try `turn_start_threshold` at 0.8 and 0.9. It applies live.
- Write down the place (café, street, quiet room) and the numbers.

**T3: token expiry and connection length**
- Keep the token lifetime at 60 s and stay in the call for at least 5 minutes, talking now and then.
- The log shows either `[T3] connection still open N s after its token expired` (expiry doesn't cut open connections), or `ink closed … s AFTER token expiry` right after expiry (it does).
- For the longest connection, leave one phone in the call for an hour with the screen on and note `longest` in the lane stats and any `ink closed` codes.

**T4: iOS screen lock, app switch, calls**
- On an iPhone in the call: lock the screen for 10 s, then unlock. Switch to another app for 10 s, then come back. Receive a phone call if you can.
- The log shows `[T4] on return: {…}` with the state of the mic, AudioContext and LiveKit room, and whether the mic was recovered.
- Check whether the other phone could still hear you while the screen was locked.
- Check whether the Wake Lock line says the screen is being kept on.

**T5: CPU and battery**
- Run 15 minutes on the oldest phones you have, with quality `medium`, then `low`.
- The log reports Krisp buffer drops, worst main-thread lag every 30 s, audio arriving below real time, and battery % on Android (iOS has no battery API: note the % by hand before and after).
