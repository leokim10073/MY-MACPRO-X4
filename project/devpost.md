## Inspiration

> You can scroll back a chat. You can't scroll back a conversation.

A group of friends is on a call, deep into a story about Kevin, their old roommate. Taylor joins fifteen minutes late. In a group chat Taylor would just scroll up. On a voice call there's nothing to scroll, so Taylor has two bad options:

- **Interrupt:** "Wait, who's Kevin?" The story stops and everyone sits through a retelling.
- **Stay quiet:** nod along, miss the jokes, and never really join in.

It gets worse as the night goes on. "He did it *again*." "Remember the airport thing?" Every callback points to something Taylor never heard.

We wanted the latecomer to get the missing context **back as voice**, in the same medium they missed it in, without anyone stopping the story. And we didn't want another meeting summarizer: meeting tools give one summary at the end and keep everything forever. Gossip works the other way around. You need the backstory **right when the callback lands**, and nobody wants it on record afterwards. Friends *spill the tea*, and when the night is over, the tea gets poured out.


## What it does

Spill the Tea is a voice room for friends telling stories. Everyone joins an always-on call from their own phone, no push-to-talk. **Cartesia Ink** transcribes each phone as its owner speaks: friends see your words appear while you're still talking. On top of that, three things you won't find in a meeting tool:

### 1. Recap: a 20-second "previously on…", spoken

When someone joins late, **Cartesia Sonic** reads them a short recap in a neutral narrator voice: who's being talked about, the main stories, how friends reacted, and what's being discussed right now. It plays **only on the latecomer's phone**, never into the call. Friends' voices drop to 30% while it plays, and **nobody else stops talking**. The latecomer keeps their eyes on both the previous stories and the ongoing topics.

### 2. Recall: story cards the moment old gossip comes back

The callbacks keep coming after the recap. When Sam starts saying *"after the cake thing with Kevin…"*, a pop-up shows **Kevin · Cake · Airport · Landlord** before Sam finishes the sentence: the phone matches Ink's streaming text against the people and stories it already knows. Vague references ("he just texted", "the roommate") are caught a moment later, when the turn ends. Tap **Cake** and the story card shows what happened as the teller told it, plus friends' real reactions in their own words. Each card also says whether the story came up **before** or **after you joined**.

### 3. Last Sip: the tea gets poured out

When the night is over, the host ends the room. A teacup tips over and pours its tea out, the call ends for everyone, and the transcript, stories and recap audio are deleted. What's said over tea stays over tea.

Success isn't the latecomer reading a summary. It's the latecomer saying *"Wait, the WHOLE cake?"*


## How we built it

**Voice is the product, and Cartesia is both ends of it:** Ink turns the call into text, and Sonic turns the catch-up back into voice.

| Cartesia feature | How we use it |
| --- | --- |
| **Ink** (`ink-2`) over the **turns WebSocket** | One long-lived connection per phone for the whole call. Streaming `turn.update` text powers the live captions and the mid-sentence pop-up; `turn.end` becomes a transcript line under the speaker's name. |
| **Ink turn detection** | No button: Ink decides when each turn starts and ends. We set `turn_start_threshold` to 0.8 so it takes clearer speech to start a turn. |
| **Ink keyterms** | Member names plus every person and alias mentioned so far ("Kevin", "the landlord") are sent as keyterms, trimmed to Ink's limits (100 terms, 1,200 characters) and refreshed whenever the connection is renewed, so Ink gets the newest names as the story grows. |
| **Access tokens** | The backend checks you're in a live room, then mints a 120-second token that only grants speech-to-text. The phone refreshes it before it expires. The API key never reaches the browser. |
| **Sonic** (`sonic-3.6`, pinned to a dated snapshot) | Reads the recap as an MP3 in a neutral narrator voice: no emotion tags, no added sounds. Pinning the snapshot means the narrator can't change before the demo. |

```
phone mic → LiveKit call (Krisp noise + background-voice filter)
   → the same cleaned audio → 16 kHz PCM16 → loudness gate → Cartesia Ink (turns)
        turn.update → live captions for friends + instant recall pop-up
        turn.end    → transcript line → story tracking + recap text
   → Cartesia Sonic → recap MP3 → plays on the latecomer's phone only
```

Each phone transcribes **its own** mic. We considered one server-side "scribe" for the whole call, but per-phone transcription means every line is under the right name without speaker diarization, and Ink hears the same Krisp-cleaned audio friends hear.

What the other tools do, so Cartesia's part is clear: LiveKit carries the call audio and live captions between phones, Krisp removes background noise, Claude writes the recap text and spots callbacks, and Convex stores and syncs everything.

**Testing voice without a crowd.** We had **Sonic** read our scripted Kevin conversation and streamed it into **Ink** in real time. In our push-to-talk prototype all six lines came back correct, names included; opening a connection took 130–680 ms (about 350 ms on average, with audio queued meanwhile), and the final text arrived about 134 ms after the speaker let go.


## Challenges we ran into

- **Choosing who transcribes** A single server-side scribe would hear everyone at once and have to guess who said what. Giving each phone its own Ink connection solved naming, but meant every phone had to manage its own tokens, reconnects and noise.
- **A hackathon venue is the worst place for an open mic** Every phone hears every voice. We stacked three layers: Krisp with background-voice cancellation, our own **loudness gate**, and a raised turn-start threshold inside Ink. The gate learns the owner's speaking level from their own turns and silences anything quieter. It sits about 15 dB below the owner's level and moves at most 6 dB per turn, so one loud laugh can't throw it off. We've only checked it in unit tests so far, not yet in a loud room.
- **People talk over each other** When a friend's line lands while my turn is still open, a turn splitter cuts my turn there, so the transcript keeps the real order instead of one long line that swallows the interruption.
- **The recap must not leak into the call** The narrator plays locally on the latecomer's phone and is never published to LiveKit, so friends don't hear it, and their voices are ducked while it plays.
- **Long calls** Tokens last 120 s and sockets drop. We built the Ink connection to reconnect with backoff (0.5 s up to 10 s) and to open a fresh connection between turns every 10 minutes, with a new token and the latest keyterms.
- **Phones** iOS only starts audio from a direct tap and pauses the mic on lock or app switch, and the mic needs HTTPS. Joining happens inside the tap, so the call starts. For lock and app switch we wrote recovery code (re-attach the new mic track, show "Tap to resume").


## Accomplishments that we're proud of

- **It works on real phones** In our combined phone test, every turn landed under the right name with live text on every phone; two people talking at once gave separate lines; an interruption split the line in the right order; the recap ducked friends and they didn't hear it; and ending the room ended the call for everyone.
- **The pop-up beats the sentence** Because it reads Ink's streaming text, the latecomer sees Kevin's stories while Sam is still talking about him.
- **Privacy by design** Raw audio is never stored, only the transcript, and Last Sip deletes it with the recap MP3. Live captions go only to people in the call and aren't saved. The API key never touches a phone.
- **Clear when it's listening** A red dot on the Mute button shows whenever the mic is live, and everyone is told on entry that the conversation is transcribed.
- **Accessible both ways** The recap is spoken for anyone who can't look at a screen, and shown as text for anyone who can't listen.


## What we learned

- An always-on mic means designing for **what you send**, not just the model: in a room where every phone hears every voice, noise filtering, gating, turn thresholds and keyterms all had to be planned before the first word reached Ink.
- Streaming partial text isn't just for captions. It made the recall pop-up feel instant, without an extra AI call.
- Giving context back **as voice** feels completely different from a text summary. You can listen with the phone in your pocket and keep looking at your friends.
- Using Sonic to generate test audio for Ink let us test the whole voice pipeline without a room full of people.


## What's next for Spill the Tea - Late to the call? We’ll spill it!

- **Faster recaps** The recap MP3 takes a few seconds to generate, so the text shows first. Streaming Sonic would let the narrator start talking right away.
- **Harder rooms** The noise gate, reconnects, iPhone lock recovery and 10-minute renewal are built but not yet tested on real phones: a stranger talking 1 m away, Wi-Fi loss, phone locks mid-call and calls past 12 minutes are next. Earbuds help in loud rooms today.
- **More languages** Ink and Sonic run in English only in our app for now.
- **Pick the narrator** Let the group choose the recap voice.
- **Not just latecomers** Recaps for anyone who stepped away for a few minutes.
