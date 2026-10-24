# web/

The phone web app everyone uses, plus the demo itself. **Owner: ___** (voice and backend owners help once their parts work)

## Screens

1. **Join:** enter a nickname, create a room or join one from a link or QR code. Show on entry that the AI processes the conversation.
2. **Room:** live transcript, push-to-talk button, listening indicator.
3. **Late-join catch-up:** plays the 20-second recap audio, with the text shown while the audio loads.
4. **Recall pop-up:** when a `recall` arrives and `shouldShowRecall` is true, show the person's name and one keyword chip per story. Highlight `focusStoryId` if set. Fade after `RECALL_CHIP_TIMEOUT_MS`, and wait `RECALL_COOLDOWN_MS` before showing the same person again.
5. **Story card:** opened from a chip. Shows the summary, friends' reactions with names, when it came up, the open question and any speculation (labeled).
6. **Relation tree:** side panel of people and their stories. Tap a person for their stories, tap a story for its card.
7. **Burned:** "This room has ended" screen. Clear all room data from the page.

## Uses from shared/schema.ts

`RoomEvent` and everything in it, plus `missedStory` and `shouldShowRecall`.

## Done when

Someone who has never seen the app joins late on a phone, hears the recap, taps a keyword when Kevin comes up and joins the conversation, without anyone explaining anything.

## Notes

- Build against [../shared/fixtures/kevin.expected.json](../shared/fixtures/kevin.expected.json) until the backend is ready.
- Design for phones first. The pop-up has to work while the user is holding push-to-talk.
- Don't store conversation content in `localStorage`.

## Running against the real backend

The mock is the default. Add `?client=convex` to the URL to use the backend in `backend/` (needs `VITE_CONVEX_URL`; without it the page says "Backend not configured"):

1. In `backend/`: `npx convex dev` (or `CONVEX_AGENT_MODE=anonymous npx convex dev` for a local backend at http://127.0.0.1:3210).
2. In `web/`: put `VITE_CONVEX_URL=<the CONVEX_URL from backend/.env.local>` in `web/.env.local`, then `npm run dev` and open `/?client=convex`.
3. Create a room in one tab. The host sees an invite link (it carries `client=convex`); open it in another tab or phone to join.
4. From `backend/`: `npx convex run replay:startLatest` plays the Kevin script into the newest room.

`?client=mock` or the legacy `?mock` forces the mock. Tests build their client explicitly (the mock). `LIVE_CONVEX_URL=<url> npx vitest run src/room/convex/live.test.ts` runs the adapter against a running backend.

Phones on the Wi-Fi can't reach a local backend on `127.0.0.1`; use a cloud dev deployment (`npx convex login`, then `npx convex dev`) for phones.

## Demo and submission (also this owner)

Demo script, pitch, Devpost page, backup video and the five-person latecomer test. See [../TEAM.md](../TEAM.md).
