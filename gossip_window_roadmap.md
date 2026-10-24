# Gossip Window — Product & Hackathon Roadmap

Status: concept and proposed implementation plan; no app has been built yet.

Working name: **Gossip Window**. Alternative: **Spill** (name availability not checked).

Tagline: *Catch up on the story. Join the moment.*

## 1. Product vision

A temporary space where friends share stories, react together, and join the conversation at different times without losing the social context. AI builds a living timeline or mind map (心智圖) from the story and discussion. A latecomer can understand what happened, how friends reacted, and what everyone is discussing now. When the session ends, the room can be burned.

The broader vision includes gossip, funny experiences, travel stories, and other moments friends want to share. AI could later turn parts of a story into interactive games, such as guessing what happens next.

The central product hypothesis: **helping someone catch up on both events and friends’ reactions makes it easier for them to participate meaningfully.**

Connection to Meta’s “Bringing People Closer Together with AI” theme, as discussed: AI helps people enter a human conversation and share an experience. This is our product interpretation, not a verified list of sponsor eligibility requirements. Confirm current rules separately before submission.

## 2. Target user and problem

Initial audience: small, existing friend groups sharing an unfolding story.

Situation: two friends start talking; another joins halfway through. Scrolling through messages takes time, asking for a recap interrupts the storyteller, and a basic summary can miss jokes, reactions, and unresolved questions.

Desired outcome: the latecomer quickly understands enough to contribute to the current conversation.

Initial scope assumption: **joining late while the room is still active**. Catch-up after everyone has left remains an open product decision because it changes retention and burn behavior.

## 3. What we will build

A responsive standalone web app demonstrating one focused social feature. Friends open a shared link on phones or laptops. It needs a real shared backend so different participants can see synchronized messages, reactions, and story updates.

Three primary views:

1. **Create / join:** nickname, create room, copy invite link, join an active room.
2. **Story room:** live text conversation, reactions, and an evolving story timeline.
3. **Catch me up:** story highlights, actual friends’ reactions, unresolved questions, and the current discussion; return directly to the live chat.

Burn is a room action, followed by a closed-room screen.

Recommended first implementation: text chat and reactions. Voice is part of the broader storytelling vision, but should be promoted into the MVP only if the team decides spoken storytelling is essential. That decision must happen before architecture is finalized.

## 4. Core user journey

1. Alex creates a room and invites Sam and Jamie.
2. Alex starts sharing a funny story. Sam reacts and asks questions.
3. AI updates a timeline of story events and links them to the relevant messages.
4. Jamie joins halfway through and selects “Catch me up.”
5. Jamie sees what happened, Sam’s reactions, and the question currently being debated.
6. Jamie responds in the live conversation without asking everyone to start over.
7. The host burns the room; connected clients clear its contents and the invite stops working.

## 5. MVP priorities

| Priority | Capability | Completion condition |
| --- | --- | --- |
| Must | Link-based rooms and guest identity | Three separate browser sessions can join the same room with distinct names. |
| Must | Live text chat and reactions | Messages and reactions arrive across clients without refreshing. |
| Must | AI story timeline | Events appear in order, with source-message references; uncertainty is explicit. |
| Must | Social catch-up | Recap includes story events, attributed reactions, and the current discussion. |
| Must | Burn lifecycle | Host ends room; server rejects further access and writes; active clients clear content. |
| Must | Loading and failure states | Chat remains usable when AI is slow or unavailable; old recaps are labeled. |
| Should | Source inspection | Selecting a recap item reveals the supporting message. |
| Should | Mobile layout | Chat and catch-up remain readable and easy to switch between on a phone. |
| Later | Mind-map visualization | People, events, and discussion branches become an interactive graph. |
| Later | Voice storytelling | Opt-in transcription feeds the same story pipeline. |
| Later | Interactive games | Storyteller triggers a prediction poll before revealing the next event. |
| Later | After-session catch-up | Retention and participant-access rules are defined first. |

Start with a timeline: it is simpler to read and build than a freely arranged graph. Use structured AI output so a mind map can reuse the same underlying data later.

## 6. Build phases and gates

Time allocations below are planning proportions of the available build window, not official event deadlines.

| Phase | Share | Work | Gate before moving on |
| --- | --- | --- | --- |
| 0. Define the experience | 10% | Confirm user, live-versus-later catch-up, text-versus-voice, room lifecycle, demo story, and sponsor constraints. | Team agrees on one core journey and a short must-build list. |
| 1. Test the main uncertainty | 10% | Feed a sample conversation into AI; test event extraction, reaction attribution, and latecomer comprehension. Prototype shared-room synchronization. | Recap helps a new reader understand the conversation; two clients can exchange messages. |
| 2. Build the complete basic flow | 30% | Create/join, chat, reactions, backend storage, AI generation, and catch-up view. | Three clients complete the full journey with real messages and real AI output. |
| 3. Make the social experience clear | 20% | Improve timeline, source links, current-discussion handoff, nickname attribution, and mobile interaction. | A fresh participant can catch up and contribute without verbal coaching. |
| 4. Stabilize and implement lifecycle | 15% | Burn/delete behavior, access checks, reconnects, AI failure handling, stale-result protection, and focused testing. | Required tests pass; deleted rooms cannot reappear through delayed requests. |
| 5. Package and rehearse | 15% | Freeze features, record backup demo, write README and submission, rehearse pitch. | A repeatable live demo and accessible submission materials are ready. |

If time runs short, cut games, voice, and graph styling first. Preserve the complete shared-room and late-join experience.

## 7. Architecture outline

Choose familiar tools after the first feasibility test; no framework or vendor is fixed by this roadmap.

| Component | Responsibility |
| --- | --- |
| Browser client | Join room, send messages, react, show timeline and catch-up, handle closed-room state. |
| Application backend | Validate membership, assign message ordering, enforce host-only burn, manage room lifecycle. |
| Realtime transport | Distribute messages, reactions, recap updates, and closure events to room members. |
| Temporary database | Store active rooms, memberships, messages, reactions, and derived story state. |
| Server-side AI worker | Generate structured story updates and catch-up from authorized room content. Keep API credentials server-side. |

Flow: message accepted by backend → stored and broadcast → debounced AI update → validated structured result saved and broadcast → latecomer opens catch-up.

Do not call AI for every keystroke. Batch new messages or trigger an update after a short pause. Display which message the recap covers. Use monotonic message sequence numbers so delayed AI responses cannot overwrite newer summaries.

Minimum records:

- `Room`: ID, host membership, lifecycle status, creation/expiry timestamps.
- `Member`: ID, room ID, nickname, session credential.
- `Message`: ID, room ID, author ID, sequence, timestamp, text.
- `Reaction`: message ID, member ID, emoji.
- `StoryState`: room ID, source sequence, events, attributed reactions, open questions, current topic.

An invite should grant access through an unguessable token or equivalent mechanism. Validate room membership server-side for every read/write; do not rely on hiding UI buttons.

## 8. AI behavior contract

AI output should distinguish:

- **Story events:** what participants explicitly said happened, framed as their account rather than independently verified facts.
- **Reactions:** actual emoji reactions or attributed comments.
- **Speculation:** guesses and interpretations, explicitly labeled and attributed.
- **Open questions:** issues still being discussed.
- **Current topic:** a concise handoff into the live conversation.

Every substantive recap item should reference source message IDs. Never infer someone’s feelings from silence, invent reactions, merge different people, or convert a joke into a factual event. Treat chat content as data, including messages that attempt to instruct the summarizer.

When AI is unavailable, continue chat and offer the original messages. When the recap is behind, label it as catching up. Consider participant corrections after the core flow works.

## 9. Burn behavior and trust

Proposed MVP policy: the host can burn the room, with a confirmation explaining that this ends access for everyone. All participants see the policy on entry.

On burn:

1. Atomically mark the room closed and revoke access.
2. Broadcast closure and clear connected clients’ visible state.
3. Delete application-controlled messages, reactions, and AI-derived content.
4. Reject new writes and discard any AI result returning after closure.
5. Ensure reopening the invite or reconnecting cannot retrieve the conversation.

Do not persist conversation content in localStorage, analytics, or routine application logs. Define an automatic expiry for abandoned rooms before release.

Describe deletion precisely: the application can delete content it controls, but cannot erase screenshots, participant copies, or promise immediate removal from provider retention and backups without verifying those systems. Avoid claiming “gone everywhere forever.” Tell participants that AI processes room messages.

## 10. Validation and definition of done

Proposed targets for a small pilot; these are goals, not measured results:

| Test | Pass condition |
| --- | --- |
| Latecomer comprehension | After reviewing catch-up for about 30 seconds, a tester identifies the main event, a real friend reaction, and the current question. |
| Participation | Tester makes a relevant contribution without asking for a complete retelling. |
| Attribution | Test conversations produce no invented reactions; recap claims can be traced to source messages. |
| Realtime flow | Three devices or browser sessions exchange messages and reactions without manual refresh. |
| AI outage | Chat continues; the interface clearly shows the unavailable or stale recap. |
| Ordering | A delayed AI response cannot replace a newer story state. |
| Burn | Connected clients clear, new joins fail, and server reads/writes are denied after closure. |
| Burn race | An in-flight AI job cannot recreate deleted room content. |

Where practical, compare catch-up against ordinary chat scrolling using different sample stories. Record completion time and comprehension; do not claim improvement without measuring it.

## 11. Team workstreams

Adapt ownership to team size; these are responsibilities, not assumed team members.

- **Experience/UI:** room interface, timeline, latecomer flow, mobile layout.
- **Backend/realtime:** membership, message transport, storage, lifecycle and deletion.
- **AI:** structured output, source attribution, batching, failure and ordering handling.
- **Integration/demo:** shared schemas, end-to-end checks, deployment, rehearsal, submission.

Agree on message/reaction schemas and room lifecycle before parallel implementation. Integrate as soon as the first messages can travel between two clients.

## 12. Demo plan

Use a fictional, clearly labeled story so the demonstration does not expose someone’s private gossip.

Suggested three-minute structure, subject to the selected track’s actual rules:

1. **0:00–0:20 — Problem:** a friend arrives late and cannot follow the conversation.
2. **0:20–0:55 — Live room:** two participants share a story and react; timeline updates.
3. **0:55–1:40 — Key moment:** third participant joins, opens catch-up, and understands events plus friends’ reactions.
4. **1:40–2:10 — Human connection:** newcomer contributes to the ongoing debate.
5. **2:10–2:35 — Burn:** close the room and show access ending on another client.
6. **2:35–3:00 — Evidence:** explain the AI contribution, what was tested, and current limitations.

Show actual synchronized clients and actual AI output. Label any prerecorded backup or simulated component. Keep one working flow ready even if optional features are unfinished.

## 13. Expansion after the MVP

1. **Story games:** storyteller-controlled “What happens next?” polls; AI uses only already-shared context and does not reveal the ending.
2. **Voice:** opt-in transcription, speaker attribution, and explicit retention choices.
3. **Interactive mind map:** navigate people, events, reactions, and branches of discussion.
4. **Asynchronous rooms:** allow catch-up after the live session with an explicit expiry and burn policy.
5. **Messaging-platform integration:** explore whether the feature fits existing group chat workflows; check platform APIs and permissions before committing.

## 14. Decisions to settle before implementation

- [ ] Confirm active-session catch-up as the first use case.
- [ ] Choose text-first or voice-essential MVP.
- [ ] Choose timeline-first or mind-map-essential presentation.
- [ ] Confirm host burn authority and automatic expiry.
- [ ] Choose familiar frontend, backend, realtime, database, and AI tools.
- [ ] Verify sponsor eligibility, required tools, submission format, and demo duration.
- [ ] Assign owners and convert the phase proportions into the team’s remaining hours.

First milestone: **three friends in one room, with a latecomer using AI catch-up to join the conversation.**
