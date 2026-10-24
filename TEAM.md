# Team Plan

How four of us build Gossip Window together at Cal Hacks 13.0. The idea itself is in [project_description.md](project_description.md).

## Roles

Fill in names.

| Role | Name | Folder | Done when |
| --- | --- | --- | --- |
| **Voice** | ___ | [voice/](voice/README.md) | Two phones talk with push-to-talk and both people's lines land in one room's transcript under the right names |
| **Backend & realtime** (also integration) | ___ | [backend/](backend/README.md) | Three phones join one room, see the same live updates and all get cleared on burn |
| **AI** | ___ | [ai/](ai/README.md) | Replaying the Kevin story produces the expected stories, pop-ups and recap, including vague references |
| **Frontend & demo** | ___ | [web/](web/README.md) | A stranger joins late on a phone, catches up and joins the conversation without anyone explaining |

The frontend & demo owner has the most work. Voice and backend owners move over to help once their parts work. Everyone rehearses the demo.

## Shared contract

- [shared/schema.ts](shared/schema.ts) defines every shape that moves between folders. **Agree on it together first. After that, change it only by telling everyone.**
- [shared/fixtures/](shared/README.md) has a scripted demo conversation and the output we expect from it. Build against these until the real parts are ready.
- **Replay mode is the first thing to build.** It plays the scripted conversation into a room, so AI and web can work without microphones and the demo has a backup if the mics fail.

## Stack (decide on Friday night)

- [x] Realtime backend: **Convex** (TypeScript, also a sponsor track). Picked over SpacetimeDB: AI and voice calls run as Convex actions, so there's no separate server
- [ ] Web app framework: ___
- [ ] Audio between remote friends: none (everyone in person), LiveKit or Daily
- [ ] Push-to-talk or headset mics
- [ ] Models: Claude Haiku (fast path), Claude Sonnet (slow path and recap), Cartesia Ink (speech-to-text), Cartesia Sonic (text-to-speech)

## Working in git

- One folder per person. Don't edit someone else's folder without asking them.
- Pull before you push. Make small commits.
- Merge into `main` every few hours, not at the end. **`main` must always run.**
- Schema changes go in their own commit, announced in the team chat.
- Never commit API keys. Keep them in a local `.env` file that isn't in git.

## Checkpoints

Submissions close **Sunday 10/25 before 4 PM** (check the exact time in the Hacker Guide).

| When | Everyone should see |
| --- | --- |
| **Fri night** | Schema agreed, stack chosen, replay mode running, two phones transcribing into one room |
| **Sat noon** | **Replay transcript → AI → pop-up on a phone**, working end to end |
| **Sat evening** | Live voice end to end, and the 20-second recap plays for a latecomer |
| **Sat midnight** | **Stop adding features.** Only fixes after this. |
| **Sun morning** | Bug fixes, five-person latecomer test, backup video recorded, Devpost written |
| **Sun ~1 PM** | Code frozen |
| **Sun ~2:30 PM** | Submitted. Don't wait until 3:55. |

## Check-ins

10 minutes at every checkpoint. Each person answers:

1. What works on `main` now?
2. What's blocking me?
3. What should we cut?

The backend owner decides what counts as "working on `main`."

## Cut order if we're behind

Cut from the top first. Keep the bottom.

1. Relation tree (story cards from the pop-up are enough)
2. Speculation and open questions on story cards
3. Remote audio between phones (everyone in one place, transcription only)
4. Live voice on stage (run the demo on replay mode, labeled as replay)
5. **Never cut:** late join → recap → pop-up with keywords → story card → burn

## Proof for judges

On Sunday morning, run five people through a late join on a story they haven't heard. Some use the app and some don't. Count how many ask "who's Kevin?" or ask for a retelling, and how long until they say something relevant. Only claim results we actually measured.

## Demo (3 minutes)

1. **Hook:** "You can scroll back a chat. You can't scroll back a conversation."
2. **Live:** two of us tell the Kevin story out loud while the tree fills in.
3. **The moment:** a judge joins through the QR code, puts in an earbud and hears the recap while we keep talking.
4. **Recall:** "after the cake thing…" → the judge's phone shows **Kevin · Cake · Airport · Landlord**, with Cake highlighted.
5. **Burn:** one tap, and the room is gone on every phone.
6. **Proof:** test results, how it works, what's next.

Record the backup video by Saturday night. If anything in the demo is replayed or prerecorded, say so on stage.

## Sleep

Sleep in shifts so someone is always awake. The demo owner gets the most sleep before Sunday.
