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

## Demo and submission (also this owner)

Demo script, pitch, Devpost page, backup video and the five-person latecomer test. See [../TEAM.md](../TEAM.md).
