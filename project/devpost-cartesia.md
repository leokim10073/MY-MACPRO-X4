# Devpost 草稿（以 Cartesia 為主軸）

依據：`project/cartesia.md`、`project/README.md`、`project_description.md`，以及 `origin/main`（efe90cb）上的程式碼。
標 ⚠️ 的地方要等專案定案或由你們補上。

---

## Project name

```
Gossip Window
```

## Elevator pitch（≤ 200 字元）

```
You can scroll back a chat. You can't scroll back a conversation. Gossip Window catches late friends up on a voice call, then reminds them of old stories right when they come up again.
```
（目前 184 字元。偏 Cartesia 的版本：`Voice has no scrollback. Gossip Window listens with Cartesia Ink and catches late friends up out loud with Sonic, then pops up old stories the moment someone mentions them again.` → 178 字元）

---

## About the project（直接貼進 Markdown 欄位）

```markdown
## Inspiration

> You can scroll back a chat. You can't scroll back a conversation.

A group of friends is on a call, deep into a story about Kevin, their old roommate. Taylor joins fifteen minutes late. In a group chat Taylor would just scroll up. On a voice call there's nothing to scroll, so Taylor has two bad options:

- **Interrupt:** "Wait, who's Kevin?" The story stops and everyone sits through a retelling.
- **Stay quiet:** nod along, miss the jokes, and never really join in.

It gets worse as the night goes on. "He did it *again*." "Remember the airport thing?" Every callback points to something Taylor never heard.

We wanted the latecomer to get the missing context **back as voice**, in the same medium they missed it in, without anyone stopping the story.

## What it does

Gossip Window is a voice room for friends telling stories.

1. **Talk normally.** Everyone joins an always-on voice call from their phone. Cartesia Ink turns every phone's speech into transcript lines under the right name, and friends see each other's words appear live as they speak.
2. **Join late, hear a 20-second "previously on…".** When someone joins, Cartesia Sonic reads a short recap in a neutral narrator voice: who's being talked about, the main stories, how friends reacted, and what's being discussed right now. Friends' voices duck while it plays. The others never stop talking.
3. **Live recall.** When someone who already came up is mentioned again, by name or vaguely ("he", "the roommate", "after the cake thing"), a pop-up shows **Kevin · Cake · Airport · Landlord**, one keyword per story. Tap a keyword to open the story card: what happened as the teller told it, and friends' real reactions in their own words.
4. **Last Sip.** When the night is over, the host ends the room. The transcript, stories and recap audio are deleted on every phone.

Success isn't the latecomer reading a summary. It's the latecomer saying *"Wait, the WHOLE cake?"*

## How we built it

**Voice is the product, and Cartesia is the voice.**

| Cartesia feature | What it does for us |
| --- | --- |
| **Ink** (`ink-2`) streaming speech-to-text | Every phrase from every phone becomes a transcript line under the speaker's name. This is the only input the AI ever sees. |
| **Ink turn detection** | The always-on call needs no button: Ink decides when a turn starts and ends. We tuned `turn_start_threshold` up to 0.8 so background noise starts fewer turns. |
| **Ink keyterms** | Member names plus every person and alias the AI has found ("Kevin", "the landlord") are sent as keyterms, so names stay spelled right as the story grows. |
| **Short-lived STT tokens** | The phone gets a 120-second token from our backend. The API key never reaches the browser. |
| **Sonic** (`sonic-3.6`) text-to-speech | Reads the recap aloud in a neutral narrator voice. The MP3 is stored in Convex and played on the latecomer's phone. |

The rest of the pipeline:

- **LiveKit** carries call audio between phones, with **Krisp** noise filtering (loaded only when you join).
- **Convex** stores rooms, lines, stories and recaps and syncs them to every phone in real time. All AI and voice calls run as Convex actions, so there's no separate server.
- **Claude Haiku** checks every new line for recalls (fast path, under ~2 s). **Claude Sonnet** rebuilds the people/story map every 20–30 s and writes the recap.
- **React + Vite + TypeScript**, mobile-first, tested with Vitest.

```
phone mic → AudioWorklet (16 kHz PCM16) → loudness gate → Cartesia Ink
   → Convex (transcript) → Claude Haiku (recalls) / Sonnet (stories, recap)
   → Cartesia Sonic (recap audio) → every phone updates live
```

To test Ink without four people talking, we had **Sonic read our scripted Kevin conversation and streamed it into Ink** in real time. All six lines came back correct, names included. Opening a connection took 130–680 ms (about 350 ms on average; audio queues in the meantime), and releasing the button to getting text took about 134 ms on average.

## Challenges we ran into

- **A hackathon venue is the worst place for an open mic.** Every phone hears every voice. We built a **loudness gate** that learns the phone owner's speaking level from their own turns and blocks quieter audio from neighbors. The threshold sits about 15 dB below the owner's level and moves at most 6 dB per turn, so one loud laugh can't break it.
- **People talk over each other.** A turn splitter cuts my open turn when a friend jumps in, so the transcript keeps the real order.
- **Long calls.** Tokens expire and sockets drop. The Ink connection reconnects with backoff (0.5 s → 10 s) and rotates every 10 minutes between turns with a fresh token and the latest keyterms.
- **Phones.** iOS only allows audio from a direct tap, mics restart after the screen locks or you switch apps, and the mic needs HTTPS. We re-attach audio to the new mic track, hold a wake lock and show "Tap to resume" when the system needs a tap.
- **Vague references.** "He just texted" should point to Kevin, but "Kevin from work" must *not* be merged into Roommate Kevin. We don't trust the model's own confidence: the model answers plain questions (how was the person referred to, does only one known person fit?) and fixed rules turn those answers into a score. Ambiguous matches stay below the pop-up threshold.

## Accomplishments that we're proud of

- The whole loop runs live: voice → transcript → stories → spoken recap → recall pop-up → story card.
- The pop-up appears the moment someone says "Kevin", straight from the live call text.
- Privacy by design: no raw audio is ever stored, and the API key never touches a phone.

## What we learned

- Speech-to-text quality in a real room depends as much on **what you send** (gating, turn thresholds, keyterms) as on the model.
- Giving context back **as voice** feels completely different from a text summary. You can listen with the phone in your pocket and keep looking at your friends.
- Ask models for facts, not confidence numbers, and score with rules you can test.

## Responsibility and accessibility

- **Raw audio is never stored.** Only the transcript is kept, and ending the room deletes it along with the recap MP3.
- A red dot on the Mute button shows whenever the mic is live, and everyone is told on entry that the conversation is transcribed.
- The recap is spoken for anyone who can't look at a screen, and shown as text for anyone who can't listen.
- The AI only uses what was said in the room, frames stories as "Alex says…", quotes real reactions with the right names, labels speculation, and never guesses how someone feels from their silence.

## Known limitations

- English only for now.
- Open mics in a loud room can still catch a neighbor; earbuds help.
- Recap audio takes a few seconds to generate, so the text shows first.

## What's next for Gossip Window

- More languages for Ink and Sonic.
- Let the group pick the narrator's voice.
- Recaps for anyone who stepped away for a few minutes, not only latecomers.
```

⚠️ 「Accomplishments」和「Challenges」裡的數字都來自 repo（`voice/src/config.ts`、`voice/process.md`）。如果週日早上有做五人 latecomer 測試，把實際結果加進去；沒測就不要寫。

⚠️ Devpost 的 About 欄位是同一份，要投五個 track。如果主打 Meta，可以在最後加一段 **Sponsor tracks**，每個 track 一小段（從 `project/*.md` 摘）。上面這份是以 Cartesia 為主軸寫的。

---

## Built with（25 個以內，這裡 20 個）

```
cartesia, cartesia-ink, cartesia-sonic, convex, claude, claude-haiku, claude-sonnet, anthropic, livekit, krisp, react, vite, typescript, vitest, node.js, webrtc, websockets, web-audio-api, audioworklet, html5
```

---

## "Try it out" links

- GitHub：`https://github.com/leokim10073/MY-MACPRO-X4` ⚠️ 確認 repo 已公開（Cartesia 要求 judges 能看到原始碼，且不能有 key）
- Live demo：⚠️ 目前只有 LAN 上的 dev server（`https://<LAN IP>:5173`），沒有公開網址。如果要放，需要部署 web（例如 Vercel）並指向 Convex 的 production deployment

---

## Project Media（3:2，例如 1500×1000，≤ 5 MB，最多 15 張）

建議拍這些（目前 repo 只有 `web/docs/screenshots/join-tea-party/` 的加入畫面截圖，其他要重拍）：

1. 封面圖：產品名 + 一句 "You can scroll back a chat. You can't scroll back a conversation."
2. 建立/加入房間（可用 `create-1440x900.jpg`、`invited-1440x900.jpg`，裁成 3:2）
3. 通話中：朋友的字即時灰字出現
4. 晚到者聽 recap：recap banner + 播放中
5. Recall pop-up：**Kevin · Cake · Airport · Landlord**（最重要的一張）
6. Story card：Cake 的內容 + Sam 的反應
7. Recall board
8. Last Sip 結束動畫
9. 架構圖：phone → Ink → Convex → Claude → Sonic → phones
10. 隱私說明：紅點 / 入場告知 / 不存音訊

技巧：手機截圖是直的，建議 2–3 支手機並排放在 3:2 的底圖上。

---

## Video demo link

⚠️ 還沒錄。Cartesia 要求 **2 分鐘、demo 優先**：

1. **0:00–1:10 一整段流程，不放投影片。** 三個朋友在聊 Kevin。Taylor 晚到，聽到 20 秒 recap；Sam 說 "after the cake thing"，pop-up 跳出 `Kevin · Cake · Airport · Landlord`；Taylor 點 **Cake**，然後開口："Wait, the WHOLE cake?"
2. **1:10–1:40 問題。** 語音沒有 scrollback，晚到的人只能打斷或沉默。
3. **1:40–2:00 怎麼做的。** Cartesia Ink → Convex → Claude Haiku / Sonnet → Cartesia Sonic → 手機即時更新。Last Sip 刪掉一切。

上傳到 YouTube（Unlisted 或 Public 都能嵌入），把網址貼進來。若用 replay 模式錄，影片裡要說明。

---

## Sponsor / Special Prizes

依 `project/README.md`：Meta、Cartesia、Convex、Anthropic、Microsoft Grand Prize、Microsoft Customer Impact Award。
⚠️ 截圖裡的 Cal Hacks 自家獎項（Most Creative、Most Technically Complex、People-First Social Impact 等）要不要一起勾，請跟團隊確認。

---

## Additional info：Upload a File（≤ 35 MB）

選填。建議放一個 zip：
- `README.md`（setup、用到的 Cartesia 功能、已知限制）—— Cartesia 要求，但 repo 根目錄目前**還沒有 README**
- 架構圖 PDF
- （有的話）五人測試結果

不要放 `.env` 或任何 key。
