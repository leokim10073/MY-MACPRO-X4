# Devpost 草稿：Best Use of Cartesia

只給 Cartesia track 用。依據：`project/cartesia.md` 和 `origin/main`（efe90cb）上的程式碼。
標 ⚠️ 的地方要由你們補上。

---

## Project name

```
Spill the Tea - Late to the call? We’ll spill it!
```

## Elevator pitch（≤ 200 字元）

```
Not a meeting summary. Spill the Tea gives late friends a 20-second spoken recap, pops up story cards when old gossip resurfaces, and pours every word away at the Last Sip.
```
（172 字元）

---

## About the project（直接貼進 Markdown 欄位）

```markdown
## Inspiration

> You can scroll back a chat. You can't scroll back a conversation.

A group of friends is on a call, deep into a story about Kevin, their old roommate. Taylor joins fifteen minutes late. In a group chat Taylor would just scroll up. On a voice call there's nothing to scroll, so Taylor has two bad options:

- **Interrupt:** "Wait, who's Kevin?" The story stops and everyone sits through a retelling.
- **Stay quiet:** nod along, miss the jokes, and never really join in.

It gets worse as the night goes on. "He did it *again*." "Remember the airport thing?" Every callback points to something Taylor never heard.

We wanted the latecomer to get the missing context **back as voice**, in the same medium they missed it in, without anyone stopping the story. And we didn't want another meeting summarizer: meeting tools give one summary at the end and keep everything forever. Gossip works the other way around. You need the backstory **right when the callback lands**, and nobody wants it on record afterwards. Friends *spill the tea*, and when the night is over, the tea gets poured out.

## What it does

Spill the Tea is a voice room for friends telling stories. Everyone joins an always-on call from their phone, and **Cartesia Ink** turns each phone's speech into lines under the right name, live, while people talk. On top of that, three things you won't find in a meeting tool:

### 1. Recap: a 20-second "previously on…", spoken

When someone joins late, **Cartesia Sonic** reads them a short recap in a neutral narrator voice: who's being talked about, the main stories, how friends reacted, and what's being discussed right now. Friends' voices duck while it plays, and **nobody else stops talking**. The latecomer can keep the phone in their pocket and their eyes on their friends.

### 2. Recall: story cards the moment old gossip comes back

The callbacks keep coming after the recap. When someone who already came up is mentioned again, by name or vaguely ("he", "the roommate", "after the cake thing"), a pop-up shows **Kevin · Cake · Airport · Landlord**, one keyword per story, straight from the live Ink transcript. Tap **Cake** and the story card shows what happened as the teller told it, plus friends' real reactions in their own words. It only shows stories **you** missed.

### 3. Last Sip: the tea gets poured out

When the night is over, the host ends the room. A teacup tips over and pours its tea out, and the transcript, stories and recap audio are deleted on every phone. What's said over tea stays over tea.

Success isn't the latecomer reading a summary. It's the latecomer saying *"Wait, the WHOLE cake?"*

## How we built it

**Voice is the product, and Cartesia is the voice.** Cartesia is both ends of the pipeline: Ink turns the call into text, and Sonic turns the catch-up back into voice.

| Cartesia feature | What it does for us |
| --- | --- |
| **Ink** (`ink-2`) streaming speech-to-text | Every phrase from every phone becomes a transcript line under the speaker's name. It's the only input everything else sees. |
| **Ink turn detection** | The always-on call needs no button: Ink decides when a turn starts and ends. We raised `turn_start_threshold` to 0.8 so background noise starts fewer turns. |
| **Ink keyterms** | Member names plus every person and alias mentioned so far ("Kevin", "the landlord") are sent as keyterms, so names stay spelled right as the story grows. |
| **Short-lived STT tokens** | The phone gets a 120-second token from our backend. The API key never reaches the browser. |
| **Sonic** (`sonic-3.6`) text-to-speech | Reads the recap aloud in a neutral narrator voice. The MP3 is stored on the backend and played on the latecomer's phone. |

```
phone mic → AudioWorklet (16 kHz PCM16) → loudness gate → Cartesia Ink
   → transcript → story tracking + recap text → Cartesia Sonic → latecomer's ear
```

What the other tools do, so Cartesia's part is clear: LiveKit carries the call audio between phones, Krisp removes background noise, Claude writes the recap text and spots callbacks, and Convex stores and syncs everything.

To test Ink without four people talking, we had **Sonic read our scripted Kevin conversation and streamed it into Ink** in real time. All six lines came back correct, names included. Opening a connection took 130–680 ms (about 350 ms on average; audio queues in the meantime), and releasing the button to getting text took about 134 ms on average.

## Challenges we ran into

- **A hackathon venue is the worst place for an open mic.** Every phone hears every voice. We built a **loudness gate** that learns the phone owner's speaking level from their own turns and blocks quieter audio from neighbors before it reaches Ink. The threshold sits about 15 dB below the owner's level and moves at most 6 dB per turn, so one loud laugh can't break it.
- **People talk over each other.** A turn splitter cuts my open turn when a friend jumps in, so the transcript keeps the real order.
- **Long calls.** Tokens expire and sockets drop. The Ink connection reconnects with backoff (0.5 s → 10 s) and rotates every 10 minutes between turns with a fresh token and the latest keyterms.
- **Storytelling pauses.** People pause mid-story, and early on one sentence got cut into many turns. Tuning Ink's turn thresholds fixed it.
- **Phones.** iOS only allows audio from a direct tap, mics restart after the screen locks or you switch apps, and the mic needs HTTPS. We re-attach audio to the new mic track, hold a wake lock and show "Tap to resume" when the system needs a tap.

## Accomplishments that we're proud of

- The whole loop runs live: voice → Ink transcript → spoken Sonic recap → recall pop-up → story card → Last Sip.
- The recall pop-up appears the moment someone says "Kevin", straight from the live call text.
- **Privacy by design.** Raw audio is never stored, only the transcript, and Last Sip deletes it along with the recap MP3. The API key never touches a phone.
- **Clear when it's listening.** A red dot on the Mute button shows whenever the mic is live, and everyone is told on entry that the conversation is transcribed.
- **Accessible both ways.** The recap is spoken for anyone who can't look at a screen, and shown as text for anyone who can't listen.

## What we learned

- Speech-to-text quality in a real room depends as much on **what you send** (gating, turn thresholds, keyterms) as on the model.
- Giving context back **as voice** feels completely different from a text summary. You can listen with the phone in your pocket and keep looking at your friends.
- Using Sonic to generate test audio for Ink let us test the whole voice pipeline without a room full of people.

## What's next for Spill the Tea - Late to the call? We’ll spill it!

- **More languages.** Ink and Sonic are English-only in our app for now.
- **Pick the narrator.** Let the group choose the recap voice, or match the room's vibe.
- **Faster recaps.** The audio takes a few seconds to generate, so the text shows first. We want to stream Sonic so the voice starts right away.
- **Louder rooms.** Open mics can still catch a neighbor; earbuds help today, and we want the gate to handle it alone.
- **Not just latecomers.** Recaps for anyone who stepped away for a few minutes.
```

⚠️ 數字都來自 repo（`voice/src/config.ts`、`voice/process.md`）。如果有做五人 latecomer 測試，把實際結果加進 Accomplishments；沒測就不要寫。

---

## Built with（25 個以內）

```
cartesia, cartesia-ink, cartesia-sonic, livekit, krisp, convex, claude, react, vite, typescript, vitest, websockets, web-audio-api, audioworklet
```

---

## "Try it out" links

- GitHub：`https://github.com/leokim10073/MY-MACPRO-X4` ⚠️ 確認 repo 已公開，且沒有任何 key（Cartesia 要求 judges 能看到原始碼）
- Live demo：⚠️ 目前只有 LAN 上的 dev server，沒有公開網址

---

## Project Media（3:2，例如 1500×1000，≤ 5 MB，最多 15 張）

1. 封面圖：Spill the Tea + "Late to the call? We'll spill it!"
2. 通話中：朋友的話由 Ink 即時變成灰字
3. 晚到者聽 Sonic recap：recap banner + 播放中
4. Recall pop-up：**Kevin · Cake · Airport · Landlord**（最重要的一張）
5. Story card：Cake 的內容 + Sam 的反應
6. Last Sip 倒茶動畫
7. 語音流程圖：mic → loudness gate → Ink → recap → Sonic
8. 隱私說明：Mute 上的紅點 / 入場告知 / 不存音訊

技巧：手機截圖是直的，建議 2–3 支手機並排放在 3:2 的底圖上。

---

## Video demo link

⚠️ 還沒錄。Cartesia 要求 **2 分鐘、demo 優先**：

1. **0:00–1:10 一整段流程，不放投影片。** 三個朋友在聊 Kevin。Taylor 晚到，聽到 Sonic 念的 20 秒 recap；Sam 說 "after the cake thing"，pop-up 跳出 `Kevin · Cake · Airport · Landlord`；Taylor 點 **Cake**，然後開口："Wait, the WHOLE cake?" 最後 host 結束房間，Last Sip 把茶倒掉。
2. **1:10–1:40 問題。** 語音沒有 scrollback，晚到的人只能打斷或沉默。
3. **1:40–2:00 Cartesia 做了什麼。** Ink 把通話變成文字（turn detection、keyterms、loudness gate），Sonic 把 recap 變回聲音。

上傳到 YouTube（Unlisted 或 Public 都能嵌入）。若用 replay 模式錄，影片裡要說明。

---

## Sponsor / Special Prizes

```
Best Use of Cartesia
```

---

## Additional info：Upload a File（≤ 35 MB）

選填。建議放一個 zip：
- `README.md`：setup、用到的 Cartesia 功能、已知限制（Cartesia 要求，repo 根目錄目前**還沒有 README**）
- 語音流程圖

不要放 `.env` 或任何 key。
