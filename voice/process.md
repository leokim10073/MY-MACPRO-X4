# voice/ 實作流程

Voice 負責人的完整工作流程。產品目標以 [project_description.md](../project_description.md) 為準，資料形狀以 [shared/schema.ts](../shared/schema.ts) 為準，時程以 [TEAM.md](../TEAM.md) 為準。這份文件和它們衝突時，以它們為準，並更新這份文件。

---

## 0. Voice 在產品裡的角色

> **You can scroll back a chat. You can't scroll back a conversation.**

Gossip Window 的成敗標準是：**後到的人開口加入對話**，而不是讀完一份摘要。Voice 是這件事的入口和出口：

- **入口：** 朋友說的話 → 文字（`NewTranscriptLine`）。AI 的人物、故事、recall 全部建立在這些文字上。文字錯了、漏了、掛錯名字，後面全部跟著錯。
- **出口：** AI 寫好的 recap 文字 → 約 20 秒的語音（`Recap.audioUrl`）。這是後到的人進房後聽到的第一件事。

### 從 project_description 推導出的硬性原則

Voice 的每個設計決定都要符合下面這些原則。違反任何一條的功能都不做。

| # | 原則（project_description 原文出處） | 對 voice 的具體要求 |
| --- | --- | --- |
| P1 | **Built for voice**（What makes it different） | 語音是產品核心。轉文字要準、要快，recap 要清楚自然 |
| P2 | **AI never joins the conversation**（How it brings people closer） | AI 的聲音永遠不進入通話。Recap 只在後到的人自己的耳機裡播放，不傳給其他人。不做會插話的語音 agent |
| P3 | **A visible listening indicator whenever the room is transcribing**（Privacy and trust） | 只要麥克風的聲音正在送去轉文字，畫面上一定有明顯的指示 |
| P4 | **Everyone is told when they enter that the AI processes the conversation** | 第一次要求麥克風權限前，使用者已經在加入畫面看過告知（web 負責畫面，voice 確認順序） |
| P5 | **Only the transcript is kept, never the audio** | 麥克風音訊只存在記憶體，送完就丟。不寫檔、不錄音、不進 log。通話服務不開啟錄音 |
| P6 | **The room is temporary, the host can burn it** | Burn 時 voice 立刻停止錄音、離開通話、關閉連線、丟掉緩衝，recap 音檔一起刪除 |
| P7 | **Uses only what was actually said in the room** | 轉出來的文字原樣送出。Voice 不改寫、不摘要、不補字 |
| P8 | **Credits reactions to the right person** | 每一行都要掛在正確的說話者名下。做法是**一支手機對應一個人**：誰說的話由「哪支手機送來的」決定，不靠聲音辨識 |
| P9 | **Never guesses how someone feels**；**Clearly labels guesses** | Recap 用中性旁白的語氣，照 AI 給的文字原樣念。不加情緒標籤、不加笑聲，不讓聲音替朋友「演」出情緒 |
| P10 | **Joining late: a 20-second voice catch-up, neutral narrator voice. The others keep talking** | Recap 長度約 20 秒（`RECAP_MAX_WORDS = 50`），中性旁白聲音。播放不影響其他人繼續說話 |
| P11 | **Glance first, read if curious** | Voice 不主動對使用者播放 recap 以外的聲音 |

---

## 1. 兩個階段

| | **階段一：MVP（push-to-talk）** | **階段二：最終版（像講電話一樣）** |
| --- | --- | --- |
| 情境 | 大家在同一個地方，輪流照順序說話 | 大家在不同地方，透過通話同時聊天 |
| 說話方式 | 按住按鈕才送音訊 | 不用按按鈕，一直在聽，有靜音按鈕 |
| 朋友之間怎麼聽到彼此 | 面對面 | 即時通話服務（LiveKit），每人戴有麥克風的耳機 |
| Cartesia 端點 | `/stt/websocket`，放開時送 `finalize` | `/stt/turns/websocket`，Ink 自動判斷一句話何時結束 |
| 怎麼知道是誰在說話 | 哪支手機送來的 | 哪支手機送來的（不變） |
| 送給 backend | `NewTranscriptLine` | `NewTranscriptLine`，**schema 不用改** |
| 目的 | 先讓整條流程（voice → AI → 彈出視窗 → recap）跑通 | 最終的使用體驗 |

### 兩個階段共用的部分

階段二只換掉「什麼時候開始、結束送音訊」，其他全部共用。所以階段一就要把程式切成三塊：

```
音訊來源（麥克風 + AudioWorklet）
        │  PCM16 16kHz
        ▼
轉文字工作階段 ── 階段一：PttSession（manual finalize）
        │        階段二：OpenMicSession（turn detection）
        │  { text, at }
        ▼
送出一行（LineSender）→ backend
```

- **音訊來源**：拿麥克風、降頻、環形緩衝區。兩階段完全一樣。
- **轉文字工作階段**：唯一不同的地方。兩種實作對外介面相同，都輸出 `{ text, at }`。
- **送出一行**：組成 `NewTranscriptLine`、重試、失敗處理。兩階段完全一樣。

另外，token、keyterm、listening 指示燈、recap 播放、burn 的處理也都共用。

### 和 TEAM.md 的關係

TEAM.md 的刪減順序第 3 項是「Remote audio between phones」，也就是階段二的通話功能，屬於時間不夠時**可以刪掉**的項目。所以：

- **階段一是必做**，而且要一直保留在產品裡，作為階段二出問題時的備案（設定裡可以切換「Push-to-talk / Open mic」）。
- **階段二在 MVP 穩定後才開始**，週六午夜停止新增功能時沒完成就不上（見第 13 節）。
- TEAM.md 的「Never cut」流程（late join → recap → pop-up → story card → burn）不受影響。

---

## 2. 範圍和介面

### 負責的事

來自 [voice/README.md](README.md)：

1. 每支手機在瀏覽器裡抓麥克風。階段一用 **push-to-talk**，階段二用 **open mic**。都是一支手機對應一個說話者。
2. 把音訊串流到 **Cartesia Ink**，每句話完成後以 `NewTranscriptLine` 送給 backend。
3. 麥克風在送音訊時顯示 **listening** 指示。
4. 用 **Cartesia Sonic**（中性旁白聲音）把 `Recap.text` 轉成語音，並設定 `Recap.audioUrl`。
5. 永遠不保存原始音訊。

階段二新增：

6. 朋友之間的即時通話（LiveKit）：加入、離開、靜音、burn 時結束。

### 使用的 schema

| 型別 | 方向 | 用途 |
| --- | --- | --- |
| `NewTranscriptLine` = `{ roomId, speakerId, text, at }` | voice → backend | 每句話產生一筆。`id` 和 `seq` 由 backend 給 |
| `Recap` | backend → voice → backend | voice 讀 `text`，產生音檔後填 `audioUrl` |
| `RECAP_MAX_SECONDS = 20`、`RECAP_MAX_WORDS = 50` | 常數 | 控制 recap 長度 |
| `RoomEvent` 的 `room_burned` | backend → 手機 | 收到後立刻停止所有錄音 |
| `Member.id` | backend → voice | 作為 `speakerId`；階段二也作為 LiveKit 的參與者身分 |

兩個階段都**不需要修改 schema**。

### 不是 voice 負責的事

| 事項 | 負責人 |
| --- | --- |
| 加入畫面、AI 告知文字、房間畫面的版面 | web |
| 指定 `seq`、決定順序、儲存 transcript、推送事件 | backend |
| 發 Cartesia token 和 LiveKit token 的端點（voice 提供呼叫 Cartesia／LiveKit 的程式碼） | backend 放進自己的 API，voice 提供邏輯 |
| 寫 recap 文字、決定 recap 涵蓋哪些內容 | AI |
| 什麼時候需要產生 recap（後到的人加入時） | backend 觸發，voice 提供 TTS 函式 |

Voice 提供**元件和函式**給 web 和 backend 使用，不修改別人的資料夾。

---

## 3. 已確定的技術決策

### 兩階段共用

| # | 決策 | 理由 |
| --- | --- | --- |
| D1 | STT 模型用 **`ink-2`** | 準確度最高，支援 keyterm 和 turn detection |
| D2 | **一支手機對應一個人**，說話者由送出的手機決定 | Ink 不能分辨說話者，也不需要。P8 |
| D3 | 每次建立連線帶 **keyterm**：成員名字 + AI 已知的人名和別名 | 名字是整個產品的關鍵（「Kevin」「Roommate Kevin」）。最多 100 個詞、1200 字元 |
| D4 | 瀏覽器用**短效 access token**：只給 `stt` 權限，`expires_in: 120`，事先拿好放在記憶體 | API key 不進瀏覽器。開始說話時不用等 token |
| D5 | TTS 在 **backend** 呼叫 **`POST /tts/bytes`**，輸出 **mp3**，模型固定 **`sonic-3.6-2026-08-27`** | 手機 `<audio>` 直接播 mp3。固定快照版本，demo 前不會被模型更新影響 |
| D6 | Recap 用**中性旁白聲音**，`generation_config` 不設 emotion，不加 `[laughter]` | P9、P10 |
| D7 | 所有請求帶 **`Cartesia-Version: 2026-08-14`**（WebSocket 用 `cartesia_version` query） | 官方目前版本 |
| D8 | 額度：CARTESIACALHACKS 兌換的 **Startup 方案**（125 萬 credits，STT 同時 20 條，TTS 同時 5 個） | 額度充足。唯一要留意的是 TTS 同時 5 個的上限 |

### 階段一：push-to-talk

| # | 決策 | 理由 |
| --- | --- | --- |
| D9 | 端點 **`wss://api.cartesia.ai/stt/websocket`**（manual finalize） | 放開按鈕 = 送 `"finalize"`，和 push-to-talk 完全對應 |
| D10 | **每按一次開一條連線**，放開後 finalize、close | 只有按住時聲音才離開手機（P3、P5）。每次連線都能帶入最新的 keyterm |
| D11 | 按住**超過 60 秒自動切段** | 避開未知的連線時長上限，也避免單行文字太長 |

### 階段二：open mic

| # | 決策 | 理由 |
| --- | --- | --- |
| D12 | 朋友之間的通話用 **LiveKit**（LiveKit Cloud），不開啟錄音 | 每個人的聲音是獨立的音訊軌，內建 WebRTC 回音消除。不錄音以符合 P5 |
| D13 | **每支手機自己把自己的麥克風送給 Ink**，端點 **`wss://api.cartesia.ai/stt/turns/websocket`** | 說話者就是這支手機的主人，不需要伺服器另外訂閱音訊軌。和階段一共用同一套音訊來源和 token |
| D14 | 只使用 **`turn.end`** 的文字送出一行，忽略 `turn.eager_end` 和 `turn.resume` | 我們不需要搶著回話，只需要最終確定的文字 |
| D15 | 每個人**戴有麥克風的耳機** | 近距離收音，不會收到別人的聲音；recap 也只有自己聽得到（P2） |
| D16 | 靜音時**關閉 Ink 連線**，取消靜音時重新連線 | 靜音時聲音完全不離開手機，指示燈也能清楚熄滅（P3） |
| D17 | Recap **只在本機播放，不發布到 LiveKit** | AI 的聲音永遠不進入通話（P2） |

---

## 4. 整體架構

### 階段一

```
┌──────────── 手機（每人一支） ────────────┐
│                                          │
│  [按住說話] ──▶ 麥克風 ──▶ AudioWorklet  │
│                  │        (降頻 16k, s16) │
│          listening 指示燈      │          │
│                                ▼          │
│                          WebSocket ───────┼──▶ Cartesia Ink（/stt/websocket）
│                                ▲          │        │ transcript (is_final)
│                                └──────────┼────────┘
│                    組成一行文字 │          │
│                                ▼          │
│              NewTranscriptLine ───────────┼──▶ backend ──▶ AI
│                                          │       │
│  <audio> ◀── recap_ready (audioUrl) ◀────┼───────┤
└──────────────────────────────────────────┘       │
                                                   │
   backend: 發 STT token ◀── POST /access-token ── Cartesia
   backend: recap.text ──▶ POST /tts/bytes (sonic-3.6) ──▶ mp3 ──▶ 存檔 ──▶ audioUrl
```

### 階段二

```
┌──────── Alex 的手機（戴耳機） ────────┐         ┌──── Sam 的手機 ────┐
│                                        │         │                    │
│  耳機麥克風 ──┬──▶ LiveKit 發布 ───────┼──▶ LiveKit ◀──── 同樣的結構  │
│               │                        │    (SFU，不錄音)            │
│               │    LiveKit 訂閱 ◀──────┼──────┘  │                    │
│               │       │ 其他人的聲音   │         └────────────────────┘
│               │       ▼                │
│               │     耳機播放 ◀── recap 只在本機播放，不發布
│               ▼                        │
│        AudioWorklet (16k, s16)         │
│               │                        │
│               ▼                        │
│      WebSocket（一直開著）─────────────┼──▶ Cartesia Ink（/stt/turns/websocket）
│               ▲                        │        │ turn.start / turn.update / turn.end
│               └────────────────────────┼────────┘
│        turn.end ▼                      │
│      NewTranscriptLine ────────────────┼──▶ backend ──▶ AI
└────────────────────────────────────────┘
```

同一個麥克風 track 同時給 LiveKit 和 AudioWorklet 使用。每支手機只轉自己主人的聲音，所以說話者永遠正確，兩個人同時說話時也會各自產生自己的一行。

API key 只存在 backend 的環境變數裡。手機只拿得到 120 秒有效、只能轉文字的 Cartesia token，以及只能加入這個房間的 LiveKit token。

---

## 5. 流程 A：進入房間，準備麥克風（兩階段共用）

**觸發：** 使用者在加入畫面輸入暱稱並進入房間（web 負責畫面）。

1. **確認告知已顯示（P4）。** 加入畫面已經寫明「AI 會處理這段對話」，使用者按下進入。Voice 要確保在這之前不會請求麥克風權限。
2. **確認 HTTPS。** 手機上的 `getUserMedia` 只在 HTTPS（或 localhost）下能用。開發時用 cloudflared 或 ngrok tunnel，正式部署用 HTTPS 網域。
3. **先拿 STT token。** 呼叫 backend 的發 token 端點，backend 會先檢查：
   - 這個人是房間成員。
   - 房間是 `active`，不是 `burned`。
   - 這個成員沒有在短時間內要太多次 token。

   拿到的 token 只放在 JavaScript 記憶體，不放 localStorage 或 sessionStorage，不印到 console。
4. **背景更新 token。** 剩不到 10 秒就過期時自動換新的。房間 burn 或離開房間時停止更新。
5. **在使用者的動作之後才開麥克風。**
   - 階段一：第一次按下說話按鈕時。
   - 階段二：按下「加入通話」時。
   
   iOS Safari 要求 `AudioContext` 必須在使用者手勢裡 `resume()`，這兩個時機剛好滿足。
6. **開麥克風時：**
   - `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })`
   - 建立 `AudioContext`，在同一個手勢裡 `resume()`，載入 AudioWorklet。
   - **之後保留這個 stream**，只用「有沒有在送資料」來控制。每次都重新 `getUserMedia` 會漏掉第一個字。
7. **權限被拒絕時：** 顯示說明，告訴使用者怎麼開啟權限，並提供打字輸入作為備案（見第 11 節）。

> **關於保留 stream（階段一）：** 瀏覽器在 stream 開著時會顯示系統的麥克風圖示（例如 iOS 的橘色點），但我們的程式只有在按住按鈕時才處理和傳送聲音。沒按住時，AudioWorklet 只把最近約 300ms 的聲音放在記憶體的環形緩衝區裡（給 pre-roll 用），而且會不斷被覆蓋，不送出、不保存。如果團隊認為這仍然不符合 P3 的精神，就改成「沒按住時完全停止處理」，代價是第一個字比較容易被切掉。這點要和團隊確認（見第 14 節）。

---

## 6. 流程 B：階段一，一次 push-to-talk 的完整生命週期

每次按下到放開，產生**剛好一筆** `NewTranscriptLine`（超過 60 秒時會切成多筆）。

### 6.1 狀態機

```
         按下                 連線成功              放開（或滿 60 秒）
 idle ─────────▶ connecting ─────────▶ streaming ─────────────▶ finalizing
  ▲                  │                     │                        │
  │                  │ 連線失敗            │ 連線中斷               │ 收到 flush_done
  │                  ▼                     ▼                        ▼
  │               error ◀──────────────────┘                     closing
  │                  │                                              │ 收到 done
  └──────────────────┴──────────────────────────────────────────────┘
                                   送出 NewTranscriptLine（如果有文字）
```

### 6.2 逐步說明

**① 按下按鈕（`pointerdown`）**
- 記下 `at = Date.now()`，這就是這一行的時間戳記。
- **listening 指示燈立刻亮起（P3）。**
- 把環形緩衝區裡最近約 300ms 的聲音複製出來，當作 pre-roll。很多人按下的同時就開口，沒有 pre-roll 會切掉第一個字。
- 開始把新的聲音存進「待送佇列」。
- 按鈕要設定 `touch-action: none`、`user-select: none`，並取消 `contextmenu`，避免長按時跳出選字或放大鏡。用 `setPointerCapture`，手指滑出按鈕外也不會意外放開。

**② 建立連線（`connecting`）**
- URL：
  ```
  wss://api.cartesia.ai/stt/websocket
    ?model=ink-2
    &encoding=pcm_s16le
    &sample_rate=16000
    &cartesia_version=2026-08-14
    &access_token=<token>
    &keyterm=Alex&keyterm=Sam&keyterm=Kevin&keyterm=Roommate%20Kevin ...
  ```
- keyterm 的組法見第 8 節。
- 連線期間聲音繼續進待送佇列，不會漏掉。

**③ 串流音訊（`streaming`）**
- AudioWorklet 把 48kHz 的 float32 降頻到 16kHz，轉成 PCM16（little-endian、單聲道）。
- 連線成功後，先送 pre-roll 和待送佇列，之後**每 100ms 送一個 chunk**（16000 × 2 bytes ÷ 10 = 3200 bytes）。
- Cartesia 要求以即時速度送音訊，不能一次大量送出。pre-roll 和連線期間累積的聲音合計通常不到 1 秒，可以接受。如果實測會出錯，就改成以稍快於即時的速度補送。
- 收到的 `transcript` 事件：只保留 `is_final: true` 的 `text`，**原樣串接，不要 trim，不要自己加空白**。`is_final: false` 的文字可以在自己的手機上顯示成「正在辨識…」，但不送給 backend。

**④ 放開按鈕（`pointerup` 或 `pointercancel`）**
- 再多錄約 300ms 的尾音（很多人在說完最後一個字之前就放開了），送出後停止送音訊。
- **listening 指示燈在停止送音訊時熄滅。**
- 送出文字訊息 `"finalize"`，進入 `finalizing`。

**⑤ 結束（`finalizing` → `closing`）**
- 收到 `flush_done` 表示這段聲音的文字都到齊了。
- 送出 `"close"`，**一直讀到收到 `done` 為止**才關閉，否則最後幾個字可能不見。
- 設逾時（例如 3 秒）。逾時就用手上已經收到的文字，強制關閉連線。

**⑥ 送出 `NewTranscriptLine`**：見第 9 節（兩階段共用）。

**⑦ 超過 60 秒（D11）**
- 時間到時，在背景執行 ④ 到 ⑥ 結束目前這段，同時立刻用新 token 開新連線繼續錄。
- listening 指示燈保持亮著，使用者不會察覺切段。
- 新的一段使用切段當下的時間作為 `at`。

### 6.3 一些細節

- **同時按兩次：** 前一次還在 `finalizing` 或 `closing` 時再按下，直接開新連線，兩條連線各自完成。送出順序依照各自的 `at`。
- **輪流說話：** 階段一的使用方式是大家照順序輪流說話，所以兩個人同時按住的情況很少。如果發生了，兩支手機各自送出，backend 依收到的順序給 `seq`。

---

## 7. 流程 C：階段二，open mic 的完整生命週期

### 7.1 加入通話

1. 使用者按下「加入通話」（使用者手勢，滿足 iOS 的限制）。
2. 向 backend 拿 **LiveKit token**。backend 用 LiveKit server SDK 發一個只能加入這個房間的 token，參與者身分用 `Member.id`，顯示名稱用 `Member.name`。發 token 前的檢查和 Cartesia token 相同。
3. 開麥克風（第 5 節第 6 步）。同一個 track：
   - 發布到 LiveKit，讓其他人聽到。
   - 接到 AudioWorklet，送給 Ink。
4. 訂閱其他人的音訊軌，從耳機播放。
5. 開啟 Ink 連線（7.2），**listening 指示燈亮起**。

### 7.2 Ink 連線（`/stt/turns/websocket`）

- URL：
  ```
  wss://api.cartesia.ai/stt/turns/websocket
    ?model=ink-2
    &encoding=pcm_s16le
    &sample_rate=16000
    &cartesia_version=2026-08-14
    &access_token=<token>
    &keyterm=...
  ```
- **連續送音訊**：每 100ms 一個 chunk，即時速度。這個端點不會把「沒送資料」當成靜音，所以連線開著的時候不能停。
- Turn detection 的參數一開始用預設值（Balanced）。之後依實測調整：
  - 一句話常常被切得太碎（說故事時的停頓）→ 改用 Patient（`turn_end_threshold=0.1`、`turn_end_timeout_ms=8000` 等）。
  - 一行文字太長，AI 的 recall 太慢才出現 → 改用 Responsive。
  - 調整結果記錄在這份文件。

### 7.3 一句話的生命週期

| Ink 事件 | 處理方式 |
| --- | --- |
| `turn.start` | 記下 `at = Date.now()`，作為這一行的時間戳記 |
| `turn.update` | 文字是**累積的**（不是片段），可以在自己的手機上顯示成「正在辨識…」，不送給 backend |
| `turn.eager_end` | 忽略 |
| `turn.resume` | 忽略 |
| `turn.end` | 拿 `transcript` 作為最終文字，送出 `NewTranscriptLine`（第 9 節），清除 `at` |

- 兩個人同時說話時，各自的手機各自產生 `turn.start` 和 `turn.end`，所以會變成兩行，各自掛在正確的名字下。
- 一句話很長、中間沒有停頓時，就是很長的一行。如果實測發現長到影響 AI，可以在前端設上限：同一個 turn 超過 60 秒就把當下的 `turn.update` 內容先送出一行，之後的內容再另起一行（實作前先確認 Ink 的行為）。

### 7.4 靜音和取消靜音（D16）

- **靜音**：
  1. 停止發布到 LiveKit（`setMicrophoneEnabled(false)`）。
  2. 對 Ink 送 `{"type": "close"}`，**一直讀到伺服器關閉連線**，正在說的那句話會在這時以 `turn.end` 送回，照常送出。
  3. listening 指示燈熄滅，顯示「Muted」。
- **取消靜音**：
  1. 用當下有效的 token 重新開 Ink 連線（帶最新的 keyterm）。
  2. 恢復發布到 LiveKit。
  3. listening 指示燈亮起。
- 為了不漏掉取消靜音後的第一個字，重新連線期間的聲音先放進待送佇列，連線成功後補送（和階段一的 pre-roll 同一套機制）。

### 7.5 長時間連線

- Ink 連線會在整場通話期間一直開著。單次連線最長能開多久、token 過期時已建立的連線會不會被切斷，文件都沒寫（第 14 節 Q1）。
- 不管答案是什麼，都要處理**連線中斷後自動重連**：
  1. 用當下有效的 token 重新開連線，並帶入最新的 keyterm。
  2. 重連期間的聲音放進待送佇列，連線後補送。
  3. 如果中斷時有一句話正在進行（收過 `turn.start` 但沒收到 `turn.end`），把最後一次 `turn.update` 的內容當作一行送出，避免整句消失。
- 也可以每隔一段時間（例如 10 分鐘），在兩句話之間（剛收到 `turn.end` 時）主動換一條新連線，順便更新 keyterm。

### 7.6 離開通話

1. 對 Ink 送 `{"type": "close"}`，讀到伺服器關閉連線為止，最後一句照常送出。
2. 離開 LiveKit 房間。
3. 停止麥克風的 track，關閉 `AudioContext`。
4. listening 指示燈熄滅。

### 7.7 費用

Open mic 會一直送音訊，**靜音以外的時間都會計費**：ink-2 每秒 3 credits，一個人一小時約 1.08 萬 credits，4 個人約 4.3 萬 credits。Startup 方案的 125 萬 credits 大約可以讓 4 個人通話 29 小時，hackathon 期間足夠。LiveKit Cloud 的免費額度也要確認（第 14 節）。

---

## 8. Keyterm 的組法（兩階段共用）

每次建立 Ink 連線時重新組一次：

1. 房間所有成員的 `Member.name`。
2. 目前 `StoryState.people` 的 `name` 和 `aliases`。
3. 依照上面的順序取，最多 100 個、合計 1200 字元，超過的捨棄。
4. 不要放常見字。拼法和大小寫要和實際的寫法一致。

Keyterm 只能在連線時設定。階段一每按一次就重新連線，所以一直是最新的。階段二的連線會開很久，所以在重連或定期換連線時更新（7.5）。

---

## 9. 送出一行（兩階段共用）

```ts
{ roomId, speakerId: me.id, text: finalText.trim(), at }
```

- 這裡的 `trim()` 只去掉整行頭尾的空白。
- **空字串或只有標點就不送**（例如按了但沒說話，或只收到雜音）。
- **不改寫文字（P7）。** 不修正文法、不補字、不過濾髒話，AI 拿到的就是朋友實際說的話。
- 送出失敗時重試 2 到 3 次，`at` 保持不變。最後還是失敗就在自己手機上標示「未送出」，讓使用者可以點一下重送。
- 這一行在 backend 給 `seq` 後，透過 `line_added` 推給所有手機。**自己的手機也以 `line_added` 為準**，不要自己先插入一行，避免順序不一致。
- **順序：** backend 依收到的順序給 `seq`。階段二同時說話的情況很常見：A 先開口但講得比較久，B 後開口但先講完，B 的那行會先拿到 `seq`。要用 `seq` 還是 `at` 排序，由 backend 決定（第 14 節 Q6）。

---

## 10. 流程 D：listening 指示燈（兩階段共用）

P3 要求「只要在轉文字，就有明顯的指示」。

**已決定（2026-10-24）：採用 web 現在的做法。** 房間是 active 時，畫面上的「Listening」指示**一直亮著**，由 web 的 `ListeningIndicator` 負責。這比「只在送音訊時亮」更保守：房間開著就表示 AI 在處理這段對話。

Voice 另外提供**實際送音訊的狀態** `PushToTalkState.isListening`，web 可以拿來做輔助的提示，例如按鈕變色、或在按鈕旁顯示「Sending」：

| 狀態 | `isListening` |
| --- | --- |
| 階段一：按住說話（包含 pre-roll、放開後 300ms 的尾音、60 秒切段期間） | `true` |
| 階段一：放開且尾音結束後，等 Ink 回傳文字的期間（已經不送新聲音） | `false` |
| 階段二：在通話中且沒有靜音 | `true` |
| 階段二：靜音 | `false`，web 的指示顯示「Muted」 |
| 連線失敗、權限被拒 | `false`，`error` 有說明 |

- `isListening` **由實際的送音訊狀態決定**，不是由按鈕狀態推測。
- 階段二另外要讓**每個人都看得到誰的麥克風正在被轉文字**，例如在成員名單上每個人的名字旁邊顯示 listening 或 muted。這個狀態可以從 LiveKit 的參與者麥克風狀態取得，不需要改 schema。

---

## 11. 流程 E：產生和播放 recap 語音（兩階段共用）

### 11.1 觸發順序（依 [shared/README.md](../shared/README.md) 的 Late join 流程）

1. 有人在對話進行到一半時加入，backend 記錄 `Member.joinedAtSeq`。
2. Backend 請 AI 產生涵蓋到 `joinedAtSeq` 的 `Recap`（只有文字，`audioUrl` 是空的）。
3. Backend 推送 `recap_ready`。**後到的人的手機先顯示文字**（web 負責）。
4. Backend 呼叫 voice 的 TTS 函式，把 `Recap.text` 轉成 mp3。
5. 存好音檔，填入 `Recap.audioUrl`，再推送一次 `recap_ready`。
6. 後到的人的手機收到 `audioUrl`，顯示播放按鈕。

### 11.2 TTS 函式（在 backend 執行）

```
POST https://api.cartesia.ai/tts/bytes
Authorization: Bearer <API key>
Cartesia-Version: 2026-08-14

{
  "model_id": "sonic-3.6-2026-08-27",
  "transcript": <Recap.text 原文>,
  "voice": { "mode": "id", "id": <選定的旁白聲音 ID> },
  "language": "en",
  "output_format": { "container": "mp3", "sample_rate": 44100 }
}
```

- **照原文念（P7、P9）。** Voice 不改寫 `Recap.text`，不加情緒標籤、不加 `[laughter]`、不加開場白以外的任何內容。Recap 裡哪些是轉述、哪些是猜測，由 AI 在文字中標清楚。
- **不設 `emotion`。** 如果實測後語速需要調整，只用 `generation_config.speed`，並在這份文件記錄數值。
- **長度檢查（P10）。** 呼叫前計算字數。超過 `RECAP_MAX_WORDS` 時**不自己截斷**（截斷可能把句子意思切壞），而是記錄下來，回報給 AI 負責人修正 prompt。產生後如果音檔超過約 22 秒，也同樣回報。
- **請求參數格式**（例如 `voice` 的寫法、mp3 的必要欄位）要對照 Cartesia API reference 確認。`voice/generate_speech.py` 已經用 Python SDK 驗證過可以產生 wav。

### 11.3 選聲音

- 條件：**中性、清楚、像旁白**，在吵雜環境裡用耳機也聽得清楚，而且要和朋友的聲音明顯不同，不會被誤以為是通話中的人在說話。
- 候選（官方推薦的穩定聲音）：Daniel `47c38ca4-5f35-497b-b1a3-415245fb35e1`、Skylar `db6b0ed5-d5d3-463d-ae85-518a07d3c2b4`、Archie `ef191366-f52f-447a-a398-ed8c0f2943a1`、Gemma `62ae83ad-4f6a-430b-af41-a9bede9286ca`。
- 做法：用 `kevin.expected.json` 的 recap 文字把每個候選各產生一次，全隊一起聽，選一個。把聲音 ID 寫成常數，之後不再更換。

### 11.4 開場白快取（降低等待時間）

- 預先產生一段固定的開場白，例如「Previously on Gossip Window…」，存成靜態檔案，放在 web 的靜態資源裡。
- 後到的人按下播放時，**先播開場白**，同時等正式的 recap 音檔。開場白播完後接著播 recap。
- 開場白只是固定的片頭，不含任何對話內容，所以不受 P5、P6 的保存限制。
- 開場白用和 recap 相同的聲音。

### 11.5 在手機上播放

- **iOS 不允許沒有使用者手勢的自動播放。** 後到的人要點一下「🎧 Hear what you missed」才開始播放（web 負責按鈕，voice 提供播放邏輯）。
- 播放時畫面同時顯示 `Recap.text`。在吵雜的會場或聽不到聲音時，文字是備案。
- Recap 從後到的人自己的手機播出，不影響其他人說話（P2、P10）。
- **階段一：** 建議戴耳機。播放 recap 時如果後到的人按下說話，就把 recap 暫停，避免 recap 的聲音被自己的麥克風收進去。
- **階段二：**
  - Recap **只在本機播放，不發布到 LiveKit**（D17）。
  - 播放 recap 時，把通話中其他人的音量降低（例如降到 30%），讓後到的人聽得清楚 recap，同時仍然聽得到大家還在聊。播完後恢復音量。
  - 因為戴耳機，recap 的聲音不會被自己的麥克風收進去。如果偵測到沒有戴耳機（無法可靠偵測時就依使用者設定），播放 recap 時暫時停止送音訊給 Ink，並讓指示燈顯示暫停。

### 11.6 音檔的保存和刪除

- Recap 音檔雖然是合成的聲音，**但內容來自對話**，所以和 transcript 一樣處理：
  - 存在 backend 的檔案儲存空間，只有房間成員能讀取。
  - **Burn 時一起刪除（P6）。**
  - 房間自動到期（`Room.expiresAt`）時一起刪除。
- 音檔網址不要放進 log。

### 11.7 並發和錯誤

- TTS 同時最多 5 個請求。同一份 `Recap` 只產生一次，多個後到的人共用同一個音檔。
- TTS 失敗：重試一次。仍然失敗就讓 `audioUrl` 保持空白，手機繼續顯示文字。可以用瀏覽器的 `speechSynthesis` 念 `Recap.text` 作為最後備案，但要在畫面上註明不是 Cartesia 的聲音。
- 如果 TTS 結果在房間 burn 之後才回來，**直接丟棄，不存檔**（和 backend README 的「discard any AI result that arrives after the burn」一致）。

---

## 12. 流程 F：Burn（兩階段共用）

收到 `room_burned` 事件時，voice 在每支手機上：

1. 立刻停止送音訊給 Ink。正在進行的那句話**不送出**，直接關閉連線，丟掉這段的文字。
2. 關閉所有 Ink WebSocket 連線。
3. 階段二：離開 LiveKit 房間。
4. 清空環形緩衝區、待送佇列、還沒送出的文字、正在辨識中的文字。
5. 停止麥克風的 track（`track.stop()`），讓系統的麥克風圖示消失。
6. 關閉 `AudioContext`。
7. 丟掉記憶體裡的 Cartesia token 和 LiveKit token，停止更新 token。
8. 停止播放 recap，釋放音檔的 object URL。
9. listening 指示燈熄滅。

在 backend：

10. 刪除這個房間所有的 recap 音檔。
11. 階段二：用 LiveKit server SDK 刪除這個 LiveKit 房間，把所有還連著的人踢出去。
12. 之後所有發 token 的請求一律拒絕。
13. Burn 之後才完成的 TTS 結果直接丟棄。

---

## 13. 隱私和責任檢查表

對應評分的「Impact and responsibility」，以及 project_description 的 Privacy and trust。上線前逐條確認。

**兩階段共用：**
- [ ] 麥克風權限只在使用者看過 AI 告知、並且做出動作（按下說話或加入通話）後才請求。
- [ ] 只要在送音訊給 Ink，listening 指示燈一定亮著。指示燈的狀態由實際送音訊的狀態決定。
- [ ] 原始音訊只存在記憶體。沒有任何地方寫入音訊檔案。
- [ ] 轉文字的音訊只送到 Cartesia，不經過 backend，也不送到其他服務。
- [ ] 轉出來的文字不進 console log、server log、analytics。
- [ ] API key 只在 backend 的環境變數。前端程式碼和 git 裡都沒有。
- [ ] Cartesia token 只有 `stt` 權限，120 秒過期，只發給活躍房間的成員。
- [ ] Recap 照 AI 的原文念，聲音中性，沒有加情緒或笑聲。
- [ ] Recap 只在後到的人自己的手機播放。
- [ ] Burn 後所有手機停止錄音，麥克風釋放，recap 音檔刪除。
- [ ] 不 clone 任何朋友的聲音。
- [ ] `voice/output.wav` 之類的測試音檔不 commit 進 git。

**階段二另外：**
- [ ] LiveKit 沒有開啟任何錄音或 egress。
- [ ] Recap 沒有發布到 LiveKit，其他人聽不到。
- [ ] 每個人都看得到誰的麥克風正在被轉文字。
- [ ] 靜音時，聲音既不送給 LiveKit，也不送給 Ink。
- [ ] 加入畫面的告知寫明：通話的聲音會經過 LiveKit 傳給朋友、經過 Cartesia 轉成文字，兩者都不錄音。
- [ ] LiveKit token 只能加入這個房間，burn 時 LiveKit 房間一起刪除。

---

## 14. 邊界情況和備案

| 情況 | 處理方式 |
| --- | --- |
| 麥克風權限被拒 | 顯示開啟權限的說明，提供打字輸入框。打字的內容也以 `NewTranscriptLine` 送出 |
| 不是 HTTPS | 開發時就用 tunnel，不要在 http 下測試 |
| 拿不到 token（網路斷、backend 掛了） | 按鈕顯示無法使用，並開啟打字輸入 |
| Cartesia 連線失敗 | 重試一次。仍然失敗就提示使用者，並開啟打字輸入 |
| 說話途中連線中斷 | 階段一：把已經收到的 `is_final` 文字送出，提示「後半段可能沒錄到」。階段二：自動重連（7.5） |
| 按了但沒說話、只有雜音 | 結果是空字串，不送出 |
| 階段一：會場很吵，收到隔壁的人的聲音 | push-to-talk 加上手機靠近嘴巴。開啟瀏覽器的降噪 |
| 階段二：demo 時大家在同一個會場，耳機麥克風收到旁邊的人 | 座位盡量分開。把 `turn_start_threshold` 調高，減少被背景聲音觸發。必要時 demo 改用階段一 |
| 階段二：有人沒戴耳機，用手機喇叭 | WebRTC 回音消除會處理大部分。recap 播放時暫停送音訊給 Ink（11.5） |
| 階段二：LiveKit 連線失敗或品質太差 | 切回階段一（push-to-talk） |
| 名字辨識錯誤（例如 Kevin 被聽成 Calvin） | keyterm。如果還是常錯，把 AI 已知的別名也加入 keyterm |
| 階段一：一次講很久 | 60 秒自動切段 |
| Recap 音檔產生失敗 | 顯示文字，必要時用 `speechSynthesis` 並註明 |
| 多人同時晚到 | 同一份 recap 只產生一次音檔 |
| 整個語音功能在 demo 時失效 | 切到 backend 的 replay mode，並在台上說明是 replay（TEAM.md 的規定） |

---

## 15. 實作步驟和時程

時程對齊 [TEAM.md](../TEAM.md) 的檢查點。每完成一步就合併進 `main`，`main` 必須隨時能跑。

### 階段一

#### 週五晚上（檢查點：兩支手機轉文字進同一個房間）

| 步驟 | 內容 | 完成的判斷方式 |
| --- | --- | --- |
| 1 | ✅ Cartesia 帳號、Startup 方案額度、API key 放進 `voice/.env`，用 Python SDK 測試 TTS | 已完成 |
| 2 | ✅ `npm run ink:latency`：用 Sonic 念 Kevin 劇本，以即時速度串流給 ink-2（走真正的 `PttSession` 程式碼） | 已完成。6 句全對，人名正確。建立連線 130–680ms（平均 350ms，期間的聲音會排隊補送），放開到拿到文字平均 134ms（另加 300ms 尾音） |
| 3 | ✅ 測試頁（`npm run dev`）：麥克風 → AudioWorklet（16k、s16）→ ink-2。本機 dev API 發 token。程式已切成「音訊來源 / 轉文字工作階段 / 送出一行」三塊 | 已完成（2026-10-24）。手機用真的麥克風說話，即時轉出文字。手機要用 Wi-Fi 介面的 `https://` 網址，不是 `169.254` 開頭的那些；會場 Wi-Fi 如果擋裝置互連，就改用手機熱點 |
| 4 | 🟡 push-to-talk 狀態機、pre-roll、尾音、finalize、close、組成一行文字 | 單元測試通過，**還沒用真的麥克風連按 10 次** |
| 5 | 透過 HTTPS 在手機上測試（iOS Safari 和 Android Chrome 各一支）。dev server 已開 HTTPS 並監聽區網 | 兩種手機都能用 |
| 6 | 🟡 和 backend 對接：發 token 的端點、送出 `NewTranscriptLine`。backend 還沒好就先送到 mock | **完成標準已在 dev API（mock）上達成（2026-10-24）**：兩支手機輪流說話，兩個人的句子都正確出現在同一份 transcript、名字正確。**還差接上 Convex** |

#### 週六上午到中午

| 步驟 | 內容 | 完成的判斷方式 |
| --- | --- | --- |
| 7 | 🟡 `isListening` 狀態、60 秒切段、keyterm（成員名字 + AI 的人名和別名）。指示燈依第 10 節的決定由 web 負責 | 單元測試通過，**還沒在手機上講 70 秒實測** |
| 8 | 🟡 TTS 函式 `synthesizeRecap`、`npm run tts:audition` 產生 4 個候選聲音到 `voice/out/` | 函式完成，固定版本的模型 ID 可用。Kevin recap 約 15–17 秒，每段約 1.6 秒產生。**還差全隊聽過並選定聲音** |
| 9 | 產生開場白音檔 | 開場白檔案放進 web 的靜態資源 |
| 10 | TTS 接上 backend 的 late join 流程：存檔、填 `audioUrl`、推送 `recap_ready` | 有人晚到時，手機先顯示文字，接著可以播放語音 |
| 11 | 手機播放：點擊播放、開場白接 recap、按住說話時暫停 recap | 在 iPhone 上戴耳機完整聽完 |
| 12 | Burn 的處理（第 12 節）和錯誤處理、打字備案（第 14 節） | Burn 後所有手機的麥克風圖示消失 |

**➜ 週六中午檢查點：決定要不要開始階段二。** 條件：步驟 1 到 12 都已經在 `main` 上，而且 TEAM.md 的「Replay transcript → AI → pop-up on a phone」已經跑通。不符合條件就不做階段二，繼續把階段一做穩。

### 階段二（週六中午到午夜，午夜沒完成就不上）

| 步驟 | 內容 | 完成的判斷方式 |
| --- | --- | --- |
| 13 | 註冊 LiveKit Cloud、backend 的 LiveKit token 端點 | 兩支手機能加入同一個 LiveKit 房間並聽到彼此 |
| 14 | `OpenMicSession`：`/stt/turns/websocket`、`turn.start` / `turn.end`、送出一行 | 戴耳機通話，兩個人的句子都出現在 transcript，名字正確 |
| 15 | 靜音／取消靜音、自動重連、keyterm 更新、成員名單上的 listening 狀態 | 靜音時指示燈熄滅且沒有任何一行產生。中斷網路後會自動恢復 |
| 16 | 階段二的 recap：只在本機播放、降低其他人的音量 | 後到的人在通話中聽完 recap，其他人沒有聽到 |
| 17 | 階段二的 burn：離開 LiveKit 並刪除房間 | Burn 後所有人都被踢出通話 |
| 18 | 調整 turn detection 參數；兩個人同時說話的測試 | 同時說話時各自產生自己的一行，名字都正確 |
| 19 | 設定裡可以切換「Push-to-talk / Open mic」 | 切換後兩種模式都能用 |

### 週六午夜之後

- **停止新增功能，只修 bug。**
- 決定 demo 用哪一種模式。階段二不夠穩就用階段一。
- Voice 負責人轉去幫 web 和 demo：錄製備用影片、參加 5 人的晚到測試。
- 寫 README 的 Cartesia 段落（Cartesia 繳交要求）：用了哪些功能（Ink 2 + keyterm，階段二再加 turn detection；Sonic 3.6 + 開場白快取；短效 token）、已知限制。

---

## 16. 測試和完成標準

### 完成標準

**階段一**（voice/README.md）：

> Two phones talk with push-to-talk, and both people's lines show up in one room's transcript, in order, under the right names.

**階段二**：

> 兩支手機透過通話同時聊天，不按任何按鈕，兩個人說的話（包含同時說的話）都出現在同一個房間的 transcript，掛在正確的名字下。

### 測試清單

| 測試 | 階段 | 方法 | 通過條件 |
| --- | --- | --- | --- |
| 轉文字準確度 | 一、二 | 兩個人照 `kevin.replay.json` 念前 16 行 | 人名全部正確，大部分句子意思沒有錯 |
| 延遲 | 一、二 | 說完一句話到 `line_added` 出現在別人手機上 | 目標 2 秒內（AI 的 fast path 還需要另外 2 秒內完成） |
| 第一個字和最後一個字 | 一 | 按下的同時開口，說完前就放開 | 沒有漏字 |
| 說話者正確 | 一、二 | 兩支手機輪流說話 | 每一行都掛在正確的名字下 |
| 吵雜環境 | 一 | 兩支手機放在一起，旁邊有人說話 | 沒按住的手機不會產生任何一行 |
| 長時間按住 | 一 | 按住講 70 秒 | 變成兩行，中間沒有漏字 |
| 同時說話 | 二 | 兩個人同時講不同的句子 | 兩行各自正確，沒有互相混入 |
| 說故事的停頓 | 二 | 用自然的停頓講一段故事 | 不會被切成太多碎片 |
| 靜音 | 二 | 靜音後說話 | 沒有產生任何一行，指示燈熄滅，其他人聽不到 |
| 斷線重連 | 二 | 通話中關閉 Wi-Fi 幾秒再打開 | 自動恢復，最多漏掉斷線期間的話 |
| 同一個會場 | 二 | 戴耳機、坐在一起通話 | 記錄有沒有收到旁邊的人，決定 demo 用哪個模式 |
| Recap 長度 | 一、二 | 用 fixture 產生 | 約 20 秒，不超過 22 秒 |
| iOS 播放 | 一、二 | iPhone 戴耳機 | 點擊後能播放，開場白接得上 recap |
| Recap 不進入通話 | 二 | 後到的人播放 recap | 其他人聽不到 recap |
| Burn | 一、二 | 說話途中 host 按下 burn | 所有手機停止錄音，麥克風釋放，離開通話，音檔刪除 |
| 隱私 | 一、二 | 檢查 console、server log、git | 沒有文字內容、token、API key、音檔 |

---

## 17. 待決事項

| # | 問題 | 和誰確認 | 目前狀態 |
| --- | --- | --- | --- |
| Q1 | Token 過期時，已經建立的連線會不會被切斷？單次連線最長多久？ | 實測，或問 Cartesia 攤位 | 階段一不依賴答案。**階段二需要知道**，才能決定要不要定期換連線 |
| Q2 | Demo 長度：Cartesia 要求 2 分鐘，TEAM.md 寫 3 分鐘，兩個 track 的評審是否分開？ | 全隊、web owner | 待確認 |
| Q3 | Backend 用 Convex 嗎？發 token 和 TTS 放在 Convex action，recap 音檔放 file storage？ | backend owner | 待確認 |
| Q4 | 全程只用英文嗎？ | 全隊 | 預設英文 |
| Q5 | 階段一「沒按住時保留 300ms 環形緩衝區」是否符合 P3 的精神？ | 全隊 | **已決定：保留**。只在記憶體、持續被覆蓋，沒按住時不送出 |
| Q6 | 同時說話時，transcript 依 `seq`（收到順序）還是 `at`（開始說話的時間）排序？ | backend owner | 待確認。**階段二同時說話很常見，必須決定** |
| Q7 | LiveKit Cloud 免費額度夠不夠？要不要用 Daily？ | voice | 階段二開始前確認 |
| Q8 | Demo 用階段一還是階段二？如果用階段二，大家在同一個會場會不會互相收到聲音？ | 全隊 | 週六午夜後依測試結果決定 |
| Q9 | 階段二要不要在畫面上即時顯示「某人正在說話」？用 LiveKit 的說話偵測就做得到，不需要改 schema | web owner | 預設做，成本很低 |

### 不在 project_description 範圍內的點子

下面這些討論過，但 project_description 沒有提到。**預設不做**。只有在 TEAM.md「Never cut」清單全部完成，而且還沒到週六午夜時，才和全隊討論是否要做：

- 故事卡的語音朗讀（點 🎧 聽 summary 和反應）。
- Recap 播放時逐字高亮字幕（需要改用 SSE 或 WebSocket 拿 word timestamps）。
- 多語言 recap。

**明確不做：**
- Clone 朋友的聲音。
- 用 Managed Agents 讓 AI 參與對話（違反 P2）。
- Line SDK（2026/12/1 停止託管）。
- 多個人共用一支手機或一個麥克風，再用 AI 分辨說話者。Ink 不能分辨說話者，同時說話時也很難分得準（違反 P8）。

---

## 18. API 速查

### Cartesia

| 項目 | 值 |
| --- | --- |
| Base URL | `https://api.cartesia.ai` |
| 版本 | `Cartesia-Version: 2026-08-14`（WebSocket 用 query `cartesia_version`） |
| 發 token | `POST /access-token`，body `{"grants":{"stt":true},"expires_in":120}`，回傳 `token` |
| STT（階段一） | `wss://api.cartesia.ai/stt/websocket?model=ink-2&encoding=pcm_s16le&sample_rate=16000&access_token=...&keyterm=...` |
| STT 送出（階段一） | 二進位音訊（每 100ms 一個 chunk，即時速度）、文字 `"finalize"`、文字 `"close"` |
| STT 收到（階段一） | `transcript`（`text` 是片段、`is_final`、`words`）、`flush_done`、`done`、`error` |
| STT（階段二） | `wss://api.cartesia.ai/stt/turns/websocket?model=ink-2&...`，參數同上，另可加 `turn_start_threshold`、`turn_eager_end_threshold`、`turn_end_threshold`、`turn_end_timeout_ms` |
| STT 送出（階段二） | 二進位音訊（連續、即時速度）、`{"type": "close"}` |
| STT 收到（階段二） | `turn.start`、`turn.update`（`transcript` 是累積的）、`turn.eager_end`、`turn.resume`、`turn.end`（最終文字） |
| Turn detection 預設 | start 0.8、eager_end 0.6、end 0.3、end_timeout 5600ms。Patient：0.8 / 0.3 / 0.1 / 8000。Responsive：0.7 / 0.6 / 0.4 / 4500 |
| keyterm 上限 | 100 個詞、1200 字元，只能在連線時設定 |
| TTS | `POST /tts/bytes`，`model_id: sonic-3.6-2026-08-27`，mp3 |
| TTS 調整 | `generation_config.speed`（0.6–1.5）、`volume`（0.5–2.0）。我們不設 `emotion` |
| 價格 | ink-2 每秒 3 credits（靜音也計費），TTS 約每字元 1 credit |
| 並發上限（Startup） | STT 20 條、TTS 5 個 |

文件：[Cal Hacks 頁面](https://docs.cartesia.ai/calhacks)、[STT WebSocket](https://docs.cartesia.ai/api-reference/stt/websocket.md)、[Turn detection](https://docs.cartesia.ai/use-the-api/stt/turns.md)、[Access token](https://docs.cartesia.ai/get-started/authenticate-your-client-applications.md)、[Keyterm](https://docs.cartesia.ai/use-the-api/stt/keyterms.md)、[Sonic 3.6](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest.md)、[輸出格式](https://docs.cartesia.ai/build-with-cartesia/capability-guides/tts-output-audio-format.md)、[STT 疑難排解](https://docs.cartesia.ai/use-the-api/stt/troubleshooting/manual.md)

### LiveKit（階段二）

API 細節在開始階段二前查官方文件確認，這裡只列需要用到的功能：

| 功能 | 用途 |
| --- | --- |
| Server SDK 發 access token | backend 發只能加入指定房間的 token，身分用 `Member.id` |
| Client SDK 加入房間、發布麥克風、訂閱其他人 | 通話本身 |
| 本機麥克風開關 | 靜音 |
| 調整訂閱音訊軌的音量 | 播放 recap 時降低其他人的音量 |
| 參與者麥克風狀態、說話偵測 | 成員名單上的 listening 狀態和「正在說話」 |
| Server SDK 刪除房間 | Burn |
