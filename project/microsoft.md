# Microsoft: Built for the Real World (Grand Prize) and Customer Impact Award

Prizes: Grand Prize is a Microsoft Surface laptop for each team member, a remote tech talk for Microsoft's Delta/Frontier Co. FDE team and 1:1 mentorship with senior FDEs. The Customer Impact Award has the same talk and mentorship. **Same criteria for both, so select both on Devpost.**

## What the track asks for

"Build a production-minded AI agent that solves a meaningful problem in finance, productivity, healthcare, or another high-impact domain."

Judging criteria:

1. **Customer understanding**
2. **Measurable usefulness**
3. **Path from prototype to production**
4. **Responsible design**
5. **End-to-end functionality**

It doesn't require Microsoft technology.

## Fit and how to frame it

Weakest fit: a casual friends' call isn't finance, productivity or healthcare. **Select it, but don't spend build time on it.** The framing that works:

> Spill the Tea is a **context hand-off agent for live voice**. Friends' calls are where we proved it. The same agent works wherever someone joins a conversation in progress: a stand-up you're late to, a support call passed to a second agent, or a nurse shift handover.

Keep the demo on the friends' scenario (that's what's built) and use the hand-off framing only in the pitch and this section.

## Scenario

Taylor joins a group call 15 minutes late. An agent that has been listening all along gives Taylor a 20-second spoken recap of only what they missed, then watches the rest of the call. When an earlier topic comes back ("after the cake thing"), it shows Taylor a one-line reminder. Nobody else is interrupted.

**Wider uses:** late joiners to meetings and stand-ups; support calls handed to a second agent; clinical shift handovers.

## Customer understanding

- **Who:** [TODO: the named community from anthropic.md, plus quotes from the people we talked to].
- **The pain:** the latecomer either interrupts and the conversation stalls, or stays quiet and is left out. It gets worse as callbacks pile up.
- **What they want:** to join in quickly, without making anyone repeat themselves and without reading a wall of notes. That's why the recap is 50 words and spoken, and the pop-up is one keyword per story.

## Measurable usefulness

What we can measure, and what to report on Devpost:

| Metric | How | Result |
| --- | --- | --- |
| Recall accuracy | `npm run eval` against `kevin.expected.json` (incl. "Kevin from work" not merged) | [TODO: x / y expected recalls] |
| Fast-path latency | Line arrives → pop-up shown. Target under 2 s | [TODO: measured median] |
| Time until the latecomer speaks | Five-person latecomer test from TEAM.md, with vs. without the app | [TODO] |
| Interruptions | Count of "wait, who's…?" questions, with vs. without | [TODO] |
| Recap length | At most 50 words, about 20 s spoken | Enforced by schema |

## Path from prototype to production

Already production-minded:

- **Serverless backend on Convex.** Deploys with one command, scales without our own servers, and has cron, scheduler and file storage built in.
- **Secrets on the server only.** The browser gets 120 s Cartesia tokens and per-room LiveKit tokens.
- **Every read and write checked** against the caller's session token.
- **Tests on every layer:** backend (`convex-test`), AI (validation + eval), voice (unit tests), web (Vitest).
- **Graceful degradation.** No AI key means the room still works with a placeholder recap. No Cartesia key means recaps are text-only. The AI recap falls back to a placeholder if a call fails.
- **Data lifecycle.** Rooms burn on request or after 12 hours. Late AI results after a burn are discarded.

Next steps to production:

1. Accounts and persistent friend groups instead of one-off invite links.
2. Cost control: send only new lines to the slow path, cache story state, measure tokens per room-hour.
3. Native mobile app for background audio and better echo cancellation.
4. More languages (currently English only).
5. Consent per participant, and a data retention policy written down.
6. For enterprise hand-off: plug into existing meeting and call platforms instead of our own call.

## Responsible design

- Everyone is told on entry that the AI processes the conversation. Visible listening indicator (a red dot on the Mute button).
- Only the transcript is kept, never audio. The host can burn the room at any time.
- Stories are framed as the teller's account, reactions are real quotes credited by name, guesses are labeled, and feelings are never inferred from silence.
- Ambiguous references don't pop up: better silent than wrong.
- We don't promise content is "gone forever": friends can still take screenshots.

## End-to-end functionality

Speech on a phone → Cartesia Ink → Convex → Claude Haiku (recall) / Sonnet (stories, recap) → Cartesia Sonic → recap audio and pop-ups on the latecomer's phone → burn clears every phone. Runs live on real phones, with replay mode as a backup.

## Tech used

Claude Haiku and Sonnet (Anthropic API), Cartesia Ink and Sonic, Convex, LiveKit + Krisp, React + Vite, TypeScript, Vitest.
