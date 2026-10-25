# Meta: Bringing People Closer Together with AI

Main target. Prize: invitation to the Round 2 hackathon at Meta's Menlo Park campus, plus a Meta swag bag.

## What the track asks for

Judged on four things:

1. **How meaningfully the project strengthens human connection**
2. **How essential and well-integrated the AI is**
3. **Originality**
4. **Strength of the working demo**

No extra deliverables.

## Scenario

Alex, Sam and Jamie are on a group call. Alex has been telling stories about Kevin, their old roommate: he ate Alex's whole birthday cake, went to the wrong airport and got into a shouting match with the landlord.

Taylor joins 15 minutes late. Normally Taylor would interrupt ("wait, who's Kevin?") and kill the story, or stay quiet and miss every joke. With Gossip Window:

- Taylor hears a 20-second spoken recap while the others keep talking.
- Five minutes later Sam says "after the cake thing, he's lucky anyone talks to him". The moment Sam says "Kevin", Taylor's phone shows `Kevin · Cake · Airport · Landlord`, while Sam is still mid-sentence.
- Taylor taps **Cake**, reads two lines and Sam's reaction, then says "Wait, the WHOLE cake?" and is part of the conversation.

## Where it's used

- Friends' group calls and late-night catch-ups where people drift in and out
- Friends in different time zones who join a call at different times
- In-person hangouts where someone arrives late to the table

## Problem it solves

Text chats have scrollback. Voice doesn't. A latecomer has two bad options:

- **Interrupt**, so the storyteller stops and the energy drops.
- **Stay quiet**, and miss every callback ("he did it *again*", "classic Kevin").

It gets worse over time because callbacks keep referring to stories the latecomer never heard.

## How it scores

| Criterion | Our answer |
| --- | --- |
| Human connection | The AI never joins the conversation. Its only job is to get the latecomer talking. **Success means the latecomer speaks up, not that they read a summary.** Recaps keep friends' own words and reactions, so the latecomer shares the moment instead of getting meeting notes |
| AI essential and integrated | Without AI there's no product: it tracks people and stories from live speech, links vague references ("he", "the roommate") to the right person, decides what this specific latecomer missed and writes the recap. Pop-ups show only for stories the person missed, so people who were there aren't interrupted |
| Shared view | Everyone sees the same recall board: who is being talked about, their stories in two lines, and what the group is on now. Tap a story for the reactions in friends' own words |
| Originality | Catch-up tools give one summary on arrival. Gossip Window keeps helping **while the conversation continues**, at the moment an old story comes back. Built for casual voice between friends, not meetings |
| Working demo | Runs on real phones on one call. Replay mode plays the scripted Kevin conversation as a backup if the venue mics fail |

## Trust and responsibility (worth saying to Meta judges)

- Visible **listening** indicator (a red dot on the Mute button), and everyone is told on entry that the AI processes the conversation.
- Only the transcript is kept, never audio.
- Stories are framed as "what Alex said happened", never as fact. Reactions are real quotes credited to the right person. Guesses are labeled.
- The host can **burn** the room: transcript, stories, tree and recap audio are deleted and the invite link stops working.

## Tech used

- Claude Haiku (live recalls) and Claude Sonnet (stories and recap)
- Cartesia Ink (speech-to-text) and Sonic (spoken recap)
- Convex (realtime backend), LiveKit (always-on audio call), React + Vite (phone web app)

## Demo checklist

- [ ] Live flow on three phones plus one latecomer
- [ ] Replay mode ready on a bookmark in case the mics fail
- [ ] Two-minute pitch rehearsed, whole team at the table 10:30 AM–12:30 PM
