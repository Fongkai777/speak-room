# Speak Room

[English](README.en.md)

Speak Room 是一个本地运行的双语口语练习助手，包含英语实时对话、中文普通话朗读、录音与文本归档、AI 点评、长期学习建议和练习统计。

后端使用 **Python + FastAPI**，前端使用原生 HTML、CSS 和 JavaScript。英语对话通过 OpenAI Realtime API + WebRTC 传输实时音频。

## 主要功能

### 英文对话

- 使用 WebRTC 连接 OpenAI Realtime API，支持低延迟双向语音。
- 支持开始、暂停、继续和结束对话，并显示双方声波与连接状态。
- 提供留学场景主题，也可以使用默认的“随便聊聊”。
- 可选择声音和 `0.9x`、`1.0x`、`1.1x` 语速。
- 实时显示双方对话文本，结束后保存混合音频、用户单独录音和文本。
- 可选择继承历史学习记忆，让新对话参考用户背景和长期练习重点。
- 结束练习后可以生成发音、流畅度和表达建议。

### 中文普通话

- 从普通话考试风格素材库随机抽题。
- 显示明确的阅读倒计时、录音时长和实时音量。
- 支持“开始录音”“结束并保存”和“生成点评”。
- 点评关注朗读准确度、发音清晰度、声调、流畅度和节奏。

### 点评与评分

点评会结合录音转写、参考文本和低置信度片段生成结构化建议。

- 英文总分按发音 25%、流畅度 25%、语法 20%、词汇 15%、沟通完成度 15% 加权。没有用户单独音频时，不会凭文本生成发音分。
- 中文总分按朗读准确度 35%、发音清晰度 25%、声调控制 15%、流畅度 15%、节奏与气息 10% 加权。

点评基于转写和模型推断，不属于专业音素、声调曲线或口腔位置测量。

### 记录、统计与学习建议

- 练习记录按英文和中文两个页签展示。
- 每条记录包含可拖动进度的音频、折叠文本、点评回顾、重新点评和删除功能。
- 统计页分别显示英语与中文总练习时长。
- 每日练习时长使用中英文双色柱状图。
- 得分趋势可在英文和中文页签间切换，两种语言使用独立的练习编号和横轴。
- “学习建议”基于全部英文历史文本，总结已掌握句式、建议短语、需避免用法、反复问题和下一步计划。

### 练习日历与随手翻译

- 日历以蓝色、红色或双色方格标记每月的英语和中文练习日期。
- 左侧随手翻译支持自动判断、中转英和英转中。
- 停止输入后自动翻译，不需要额外点击按钮。

### 模型配置

- 模型配置页可以分别选择实时对话、文本/点评和翻译模型。
- API Key 可从页面保存到 `.env.local`。

## 快速开始

需要 Python 3.9 或更高版本，推荐 Python 3.12。

```bash
cd "/path/to/speak-room"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

创建 `.env.local`：

```bash
OPENAI_API_KEY="sk-..."
```

也可以先启动应用，再从“模型配置”页保存 Key。

启动服务：

```bash
PORT=4000 .venv/bin/python -B server.py
```

打开 `http://127.0.0.1:4000`。服务以前台方式运行，必须保持终端窗口开启；按 `Ctrl+C` 停止。

Windows 可以使用：

```powershell
$env:PORT=4000
.venv\Scripts\python.exe -B server.py
```

## 可选配置

```bash
OPENAI_REALTIME_MODEL="gpt-realtime-2.1-mini"
OPENAI_TEXT_MODEL="gpt-5.6-luna"
OPENAI_TRANSLATE_MODEL="gpt-5.6-luna"
OPENAI_TRANSCRIBE_MODEL="gpt-4o-mini-transcribe"
HOST="127.0.0.1"
PORT=4000
```

若需要更高精度的录音转写，可将 `OPENAI_TRANSCRIBE_MODEL` 改为 `gpt-4o-transcribe`。

## 项目结构

```text
.
├── server.py                 # FastAPI 服务、OpenAI 调用与本地存储
├── practice_content.json     # 中文素材、点评提示词与结构化输出格式
├── requirements.txt
├── tests/
│   └── test_server.py
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── .gitignore
```

## 常见问题

**网页打不开**

确认运行服务的终端仍然开启，并访问 `http://127.0.0.1:4000`。检查端口：

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

**端口被占用**

停止旧服务，或临时使用：

```bash
PORT=4001 .venv/bin/python -B server.py
```

**Realtime 对话关闭或连接失败**

刷新页面后重新开始一次新会话。

**点评失败**

录音会先保存在本机。进入“练习记录”，点击“重新点评”即可恢复。

**没有麦克风权限**

检查浏览器权限，并使用 `localhost`、`127.0.0.1` 或 HTTPS。
