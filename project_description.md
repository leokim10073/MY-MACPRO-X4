# Gossip Window — Project Description

Working name: **Gossip Window**. Alternative: **Spill**.

> **You can scroll back a chat. You can't scroll back a conversation.**

## The idea

Gossip Window is a voice room for friends telling stories. An AI companion listens to the conversation and keeps track of who and what is being talked about. When a friend joins late, the companion catches them up without anyone stopping the story. As the conversation continues, it quietly reminds the latecomer of the earlier stories they missed.

## The problem

A group of friends is on a call, deep into a story. Someone joins halfway through. Text chats have scrollback, but voice has nothing to scroll. The latecomer is left with two bad options:

- **Interrupt:** "Wait, who's Kevin?" The storyteller has to stop, the energy drops, and everyone waits through a retelling.
- **Stay quiet:** nod along, miss the jokes, and never really join in.

It gets worse as the conversation goes on. Friends keep saying "he did it *again*," "remember the airport thing," "classic Kevin." Every callback refers to something the latecomer never heard.

## Who it's for

Small groups of existing friends in casual voice conversations: group calls, catch-ups and late-night storytelling. People who already know each other, where someone joining late is normal and missing the context is frustrating.

## The experience

### 1. Joining late: a 20-second voice catch-up

When the latecomer joins, they hear a short spoken "previously on…" recap, about 20 seconds, in a neutral narrator voice. It covers:

- who is being talked about,
- the main stories so far,
- how the friends reacted,
- what everyone is discussing right now.

The others keep talking. Nobody has to stop and retell anything.

### 2. The relation tree: an optional side panel

Next to the conversation, a small tree shows the **people** being discussed and the **stories** connected to them. It's there when the latecomer wants it and never in the way.

- Tap a **person** to see their stories.
- Tap a **story** to open its story card.

The tree updates live as new people and stories come up.

### 3. Live recall: the companion reacts when someone is mentioned again

This is the core of the product.

When someone who has already come up is mentioned again, by name or vaguely ("he," "the roommate," "that guy from the party"), the companion briefly pops up on the latecomer's screen. It shows:

- **who** was mentioned, and
- **one keyword per story** about them, so it's clear at a glance which stories exist.

If the latecomer is curious, they tap a keyword to open that story's card. If not, the pop-up fades away on its own.

### 4. Story cards

Each story card shows:

- **What happened**, in a few lines, as told by the friend telling it.
- **How friends reacted**, using their actual words ("Sam: 'NO WAY he did that'").
- **When it came up** in the conversation.
- **What's still being discussed**, if the story isn't finished.

### 5. Burn

When the conversation is over, the host can burn the room. The transcript, stories and tree are deleted, and the invite link stops working.

## Example

> Alex, Sam and Jamie are on a call. Alex tells three stories about Kevin, their old roommate:
> - Kevin ate Alex's entire birthday cake → **Cake**
> - Kevin missed a flight because he was at the wrong airport → **Airport**
> - Kevin got into a shouting match with the landlord → **Landlord**
>
> Taylor joins 15 minutes late and hears a 20-second recap: *"Alex has been telling stories about Kevin, an old roommate who ate their birthday cake and went to the wrong airport. Sam can't believe it. Right now they're arguing about whether Kevin should be invited to the reunion."*
>
> Five minutes later Sam says, *"Honestly, after the cake thing, he's lucky anyone talks to him."*
>
> Taylor's screen shows:
>
> **Kevin** · `Cake` · `Airport` · `Landlord`
>
> Taylor taps **Cake**, reads two lines and Sam's reaction, then joins in: *"Wait, the WHOLE cake?"*

## What makes it different

- **Built for voice.** Text chats can be scrolled back. Spoken conversations can't. That's where catching up is actually hard.
- **Context at the moment it's needed.** Most catch-up tools give one summary when you arrive. Gossip Window keeps helping while the conversation continues, right when an old story comes up again.
- **Understands vague references.** "He did it again" and "the roommate" are linked to the right person, not just exact name matches.
- **Only covers what you missed.** Pop-ups appear only for stories the person wasn't there for. People who were there aren't interrupted.
- **Social, not a meeting summary.** Recaps keep the friends' own reactions and jokes. The point is to share the moment, not to take notes.
- **Glance first, read if curious.** One keyword per story keeps it light. More detail is one tap away, never forced.

## How it brings people closer

The AI never joins the conversation. Its only job is to get the latecomer into it quickly, so they can laugh at the right moment, ask the right question and join the debate instead of sitting it out. Success means the latecomer **speaks up**, not that they read a summary.

## What the AI does and doesn't do

- Uses only what was actually said in the room.
- Treats stories as *what the friends said happened*, not verified facts.
- Credits reactions to the right person and never invents them.
- Clearly labels guesses and speculation.
- Never guesses how someone feels from their silence.

## Privacy and trust

- A visible **listening** indicator whenever the room is transcribing.
- Everyone is told when they enter that the AI processes the conversation.
- Only the transcript is kept, never the audio.
- The room is temporary, and the host can burn it at any time.
- We don't promise that content is "gone forever." Friends can still take screenshots or remember what was said.

## Hackathon tracks

- **Meta: Bringing People Closer Together with AI** (main target): AI that helps a friend join a shared moment.
- **Cartesia:** speech-to-text (Ink) for the live conversation and text-to-speech (Sonic) for the voice catch-up.
