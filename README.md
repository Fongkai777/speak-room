# Speak Room

[English version](README.en.md)

Speak Room 是一个本地运行的口语练习网页应用，面向英语实时对话练习和中文普通话朗读练习。它把录音、文本、点评、分数和练习统计保存在本机，适合做长期复练。

## 功能概览

- 英语实时对话：使用 OpenAI Realtime API 和 WebRTC，实现低延迟语音对话。
- 英语随手翻译：在实时对话页内支持自动判断、中转英、英转中。
- 普通话朗读：从本地普通话考试风格素材库随机抽题，按目标时长倒计时录音。
- 点评分析：保存练习后可生成发音、清晰度、节奏、表达和复练建议。
- 练习记录：每段练习独立保存音频、文本、点评和元数据。
- 练习统计：按天统计中英文练习时长、得分趋势，并在左侧日历显示每月练习日期。
- 模型配置：本地保存 `OPENAI_API_KEY`，并显示当前 Realtime / 文本模型配置。

## 本地启动

1. 创建 `.env.local`：

   ```bash
   OPENAI_API_KEY="sk-..."
   ```

   也可以在网页的“模型配置”页保存 API Key。Key 只会写入本地 `.env.local`，浏览器不会读取明文 Key。

2. 可选模型配置：

   ```bash
   OPENAI_REALTIME_MODEL="gpt-realtime-2.1-mini"
   OPENAI_TEXT_MODEL="gpt-5.6-luna"
   OPENAI_TRANSCRIBE_MODEL="gpt-4o-mini-transcribe"
   PORT=3000
   ```

3. 启动服务：

   ```bash
   npm run dev
   ```

4. 打开网页：

   ```text
   http://localhost:3000
   ```

如果使用当前本地开发端口，也可以用：

```bash
PORT=3001 npm run dev
```

然后打开：

```text
http://127.0.0.1:3001
```

## 项目结构

```text
.
├── server.mjs
├── package.json
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── practice-sessions/
    └── <session-id>/
        ├── audio.webm
        ├── user_audio.webm
        ├── transcript.txt
        ├── reference.txt
        ├── analysis.json
        └── metadata.json
```

`practice-sessions/` 是本地练习记录目录，已经被 `.gitignore` 忽略，不会提交到 GitHub。

## 前后端职责

浏览器端负责：

- 请求麦克风权限。
- 建立英语实时对话的 WebRTC 连接。
- 播放模型返回的实时语音。
- 使用 `MediaRecorder` 保存练习音频。
- 显示实时状态、转写文本、录音时长、音量、练习记录、统计图和日历。
- 调用本地服务端接口做翻译、分析、保存和删除记录。

服务端负责：

- 从 `.env.local` 读取 `OPENAI_API_KEY`。
- 创建 Realtime 会话连接，避免浏览器接触项目 API Key。
- 调用 OpenAI Responses API 做翻译和点评。
- 调用转写模型处理保存后的录音。
- 管理本地练习记录目录。

## OpenAI API 使用

英语实时对话使用 Realtime API 的 WebRTC 模式：

- 浏览器创建 `RTCPeerConnection`。
- 浏览器添加麦克风音轨并生成 SDP offer。
- 服务端通过 `/api/realtime-connect` 把 SDP 和 Realtime session 配置发送到 OpenAI。
- OpenAI 返回 SDP answer 后，浏览器开始收发实时音频。
- 对话事件通过 `oai-events` data channel 接收，用于显示文本转写和连接状态。

文本翻译、练习点评使用 Responses API。

录音转写默认使用：

```text
gpt-4o-mini-transcribe
```

如果需要更高准确率，可以配置为：

```text
gpt-4o-transcribe
```

## 数据保存

每次保存练习都会生成一个独立目录，例如：

```text
practice-sessions/
  2026-09-03T13-36-17-802Z-english/
    audio.webm
    user_audio.webm
    transcript.txt
    analysis.json
    metadata.json
```

英语练习：

- `audio.webm`：可播放的混合对话音频。
- `user_audio.webm`：用户麦克风单独录音，用于更有针对性的发音点评。
- `transcript.txt`：对话文本。
- `analysis.json`：点评结果。
- `metadata.json`：标题、时长、分数、文件名等元数据。

中文普通话练习：

- `audio.webm`：朗读录音。
- `reference.txt`：朗读原文。
- `analysis.json`：点评结果。
- `metadata.json`：标题、时长、分数、文件名等元数据。

## 练习统计

统计页包含：

- 总练习时长。
- 英语练习时长。
- 中文练习时长。
- 平均分。
- 每日练习时长柱状图。
- 中英文分开的得分趋势折线图。

页面左侧还有固定练习日历：

- 蓝色方格表示当天有英语练习。
- 红色方格表示当天有中文练习。
- 蓝红双色方格表示当天两种都练了。
- 月份可下拉选择。

## 开发注意事项

延迟：

- 英语实时对话必须走 WebRTC，不要改成普通请求响应式音频循环。
- Realtime 会话开启了语义 VAD 和打断能力，方便自然接话。
- 模型回复应保持短句，否则语音等待时间会变长。

会话生命周期：

- 每次开始英语对话都应创建新的 Realtime 连接。
- 结束会话时需要关闭 peer connection、data channel、本地音轨、远端音轨和录音器。
- 如果连接关闭或失败，应重新开始会话，而不是复用旧连接。

权限：

- 麦克风权限需要用户在浏览器里主动授权。
- `getUserMedia` 需要 `localhost`、`127.0.0.1` 或 HTTPS 环境。
- 这个项目的 Key 配置页只适合本地开发，线上部署应改用密钥管理服务。

错误恢复：

- 如果显示未配置 Key，检查 `.env.local` 或“模型配置”页。
- 如果英语实时连接失败，刷新页面后重新开始。
- 如果点评失败，音频仍然会保存在记录目录，可以在“练习记录”里重新点评。
- 如果浏览器无法录音，检查当前浏览器是否支持 `MediaRecorder`。

## 验证清单

- “模型配置”页保存 Key 后显示 `Key 已配置`。
- 英语实时对话能请求麦克风权限。
- 英语实时对话能听到模型语音，并显示文本转写。
- 对话中打断模型时，连接能保持正常。
- “随手翻译”能完成中转英、英转中和自动判断。
- 结束英语练习后，记录目录里出现音频、文本、点评和元数据。
- 中文随机抽题能显示标题、正文和倒计时。
- 中文录音时能显示音量和录制时长。
- 中文倒计时结束后能自动停止录音。
- 练习记录能展开文本、展开点评、重新点评和删除。
- 练习统计能显示柱状图、折线图和左侧月历。
- 左侧日历的月份下拉可以切换不同月份。
