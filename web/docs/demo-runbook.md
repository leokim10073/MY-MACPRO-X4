# Demo runbook

Two data sources. The app is live (real backend) whenever `VITE_CONVEX_URL` is set when the dev server starts; `?mock` (or `?client=mock`) forces the offline replay of a scripted conversation.
The dev server is HTTPS with a self-signed certificate: each phone must accept the warning once.

## Bookmarks (two per demo phone)

Start `npm --prefix web run dev` on the laptop and use the `https://<LAN IP>:5173` address it prints.

| Name | URL |
|---|---|
| Live | `https://<LAN IP>:5173/` |
| Backup | `https://<LAN IP>:5173/?mock&room=demo&pauseAfterJoin=15000` |

The Backup joins as a latecomer at line 16, pauses the conversation 15 s after the join, and the recap still arrives in about 1.5 s.
Without `?room`, "Create room" makes you the host. `?speed=N` sets the mock playback speed.

## Rollback in seconds

1. Tap the **Backup** bookmark. That is all (no rebuild, no redeploy, no env change).
2. Adding `?mock` to any URL also works: it always wins, even over `?client=convex`.
3. Careful: removing params does **not** roll back. With `VITE_CONVEX_URL` set, a bare URL is live.

## If the backend drops mid-demo

- "Reconnecting…" at the top: wait a few seconds, it may recover.
- "Lost connection to the room" (Rejoin button): guests tap **Rejoin** once (their invite link brings them back as a new member). The **host** should switch to the **Backup** bookmark instead: a host reload lands on "Create room" and would start a new room.
- Create or join shows "Can't reach the server." after 10 s: tap **Try the offline demo**.
- Say on stage that this is a **replay** (TEAM.md requires it).
- A reload rejoins as a new member. The session is kept in memory only.

## Pre-flight checklist

- [ ] The Convex dev URL is reachable from the phone network (open it from a phone on the venue Wi-Fi).
- [ ] `VITE_CONVEX_URL` is set in `web/.env.local` (git-ignored; never commit it). Without it the Live bookmark silently runs the mock, so check the Live bookmark shows the invite link after Create room (only the real backend shows it).
- [ ] Phones use the cloud dev deployment, not `127.0.0.1`. Get its URL from the backend owner.
- [ ] Both bookmarks are saved on every phone, and the certificate is accepted.
- [ ] A test room was created and burned.
- [ ] The AI is live: `ANTHROPIC_API_KEY` is set on the deployment (`npx convex env set ANTHROPIC_API_KEY …`), and a test replay produced at least one recall pop-up. Without the key the AI calls are skipped and no pop-ups appear.
- [ ] Voice is live: `CARTESIA_API_KEY` is set on the deployment. Without it push-to-talk is refused and the recap stays text-only.
- [ ] Each phone allowed microphone access once (hold **Hold to talk** in a test room).
- [ ] The Backup bookmark was opened once and works.

## Live demo sequence

1. Phone A (host): open `…/?replay=1`, Create room. The invite link appears under the header.
2. Phone A: tap **Start Kevin replay**. Alternative, from `backend/`: `npx convex run replay:startLatest` (replays into the newest room).
3. Phone B: open the invite link (it carries `client=convex&room=<token>`) and join late.
4. Phone B gets the recap: the text shows at once, and the narrated audio follows a few seconds later. **On iPhone the audio does not start by itself yet** (it isn't unlocked on the Join tap), so tap **▶** in the "While you were away" card. Then tap the Kevin chip when the pop-up appears.
5. Anyone can hold **Hold to talk** to add their own line (the Listening dot turns live while the mic is on).

`?type=1` adds a "Type a line" box (handy without a mic). `?replay=1` shows the host-only "Start Kevin replay" button. **Leave** (top right) disconnects this phone without ending the room; only the host's red **Burn room** ends it for everyone.
Full two-phone test: Task 7 of [plan-phase2.md](plan-phase2.md).
