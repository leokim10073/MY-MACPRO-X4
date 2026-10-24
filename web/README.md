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

The app uses the backend in `backend/` whenever `VITE_CONVEX_URL` is set in `web/.env.local`, and the mock when it isn't. Add `?mock` or `?client=mock` to force the mock anyway. `?client=convex` asks for the backend explicitly; without a URL it shows "Backend not configured" and links to the offline demo.

1. In `backend/`: `npx convex dev` (phones need a cloud dev deployment; they can't reach `127.0.0.1`).
2. In `web/`: put `VITE_CONVEX_URL=<url>` in `web/.env.local` (never commit it), then `npm run dev`. The dev server is HTTPS (self-signed): open the `https://<LAN IP>:5173` address it prints and accept the certificate once on each phone.
3. Create a room at `/`. The invite link carries `client=convex&room=<token>`.
4. From `backend/`: `npx convex run replay:startLatest` replays the Kevin script into the newest room.

Extras for Convex: `?type=1` shows a "Type a line" box; `?replay=1` shows a host-only "Start Kevin replay" button.

Push-to-talk and the narrated recap work only against the backend (it needs `CARTESIA_API_KEY`, see `backend/README.md`); on the mock the talk button just animates. The mic needs HTTPS, which the dev server already uses.

With `VITE_CONVEX_URL` set, no param or an unknown `?client=` value gives Convex. `?mock` and `?client=mock` always give the mock, even combined with `?client=convex`. Tests build their client explicitly (the mock), so a local `.env.local` doesn't affect them. `LIVE_CONVEX_URL=<url> npx vitest run src/room/convex/live.test.ts` runs the adapter against a running backend.

For the stage setup, bookmarks, rollback to the mock and the pre-flight checklist, see [docs/demo-runbook.md](docs/demo-runbook.md).

## Demo and submission (also this owner)

Demo script, pitch, Devpost page, backup video and the five-person latecomer test. See [../TEAM.md](../TEAM.md).
