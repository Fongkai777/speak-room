# Speak Room

[中文版](README.md)

Speak Room is a local browser app for English realtime conversation practice and Mandarin reading practice. It saves recordings, text, feedback, scores, and practice statistics on your own machine so you can review and repeat over time.

## Features

- English realtime conversation: low-latency voice practice with the OpenAI Realtime API and WebRTC.
- Inline English translator: translate Chinese to English, English to Chinese, or let the app detect the direction automatically.
- Mandarin reading practice: random local reading prompts in a Putonghua-test style, with a target-time countdown.
- Coaching feedback: pronunciation, clarity, rhythm, expression, and follow-up drills after saving a practice session.
- Practice records: each session keeps audio, text, feedback, and metadata in one folder.
- Practice statistics: daily duration charts, score trends, and a fixed left-side calendar showing practice days by month.
- Model configuration: save `OPENAI_API_KEY` locally and view the current Realtime and text model settings.

## Local Setup

1. Create `.env.local`:

   ```bash
   OPENAI_API_KEY="sk-..."
   ```

   You can also save the key from the app's Model Configuration page. The key is written only to local `.env.local`; the browser never reads the plaintext key.

2. Optional model overrides:

   ```bash
   OPENAI_REALTIME_MODEL="gpt-realtime-2.1-mini"
   OPENAI_TEXT_MODEL="gpt-5.6-luna"
   OPENAI_TRANSCRIBE_MODEL="gpt-4o-mini-transcribe"
   PORT=3000
   ```

3. Start local development:

   ```bash
   npm run dev
   ```

4. Open:

   ```text
   http://localhost:3000
   ```

For the current local development port, you can also run:

```bash
PORT=3001 npm run dev
```

Then open:

```text
http://127.0.0.1:3001
```

## Project Structure

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

`practice-sessions/` is the local practice-record directory. It is ignored by `.gitignore` and is not pushed to GitHub.

## Client And Server Responsibilities

The browser handles:

- Requesting microphone permission.
- Creating the WebRTC connection for English realtime conversation.
- Playing realtime assistant audio.
- Recording practice audio with `MediaRecorder`.
- Displaying realtime status, transcripts, elapsed time, microphone level, records, charts, and the calendar.
- Calling local server endpoints for translation, analysis, saving, and deletion.

The server handles:

- Reading `OPENAI_API_KEY` from `.env.local`.
- Creating Realtime connections without exposing the project API key to the browser.
- Calling the OpenAI Responses API for translation and feedback.
- Calling transcription models for saved recordings.
- Managing local practice-session folders.

## OpenAI API Usage

English realtime conversation uses the Realtime API with WebRTC:

- The browser creates an `RTCPeerConnection`.
- The browser adds the microphone track and generates an SDP offer.
- The server sends that SDP plus the Realtime session config to OpenAI through `/api/realtime-connect`.
- OpenAI returns an SDP answer, and the browser starts realtime audio input/output.
- Conversation events arrive over the `oai-events` data channel for transcript and lifecycle updates.

Text translation and practice feedback use the Responses API.

Transcription defaults to:

```text
gpt-4o-mini-transcribe
```

For higher accuracy, configure:

```text
gpt-4o-transcribe
```

## Saved Data

Each saved practice session gets its own folder, for example:

```text
practice-sessions/
  2026-09-03T13-36-17-802Z-english/
    audio.webm
    user_audio.webm
    transcript.txt
    analysis.json
    metadata.json
```

English sessions:

- `audio.webm`: playable mixed conversation audio.
- `user_audio.webm`: user-only microphone audio for more targeted pronunciation feedback.
- `transcript.txt`: conversation transcript.
- `analysis.json`: feedback result.
- `metadata.json`: title, duration, score, file names, and other metadata.

Mandarin sessions:

- `audio.webm`: reading recording.
- `reference.txt`: source reading passage.
- `analysis.json`: feedback result.
- `metadata.json`: title, duration, score, file names, and other metadata.

## Practice Statistics

The Statistics tab includes:

- Total practice time.
- English practice time.
- Mandarin practice time.
- Average score.
- Daily duration bar chart.
- Separate English and Mandarin score trend lines.

The fixed left-side practice calendar shows:

- Blue squares for English practice days.
- Red squares for Mandarin practice days.
- Blue/red split squares when both were practiced on the same day.
- A month selector for switching between months.

## Developer Notes

Latency:

- Keep English realtime conversation on WebRTC. Do not replace it with a request/response audio loop.
- The Realtime session uses semantic VAD and interruption support for natural turn-taking.
- Assistant responses should stay short; long spoken replies increase perceived latency.

Session lifecycle:

- Start each English conversation with a fresh Realtime connection.
- On session end, close the peer connection, data channel, local tracks, remote tracks, and recorders.
- If the connection closes or fails, start a new session instead of reusing the old connection.

Permissions:

- Microphone access requires an explicit browser permission prompt.
- `getUserMedia` requires `localhost`, `127.0.0.1`, or HTTPS.
- The in-app key configuration page is intended for local development only. Production deployment should use a secret manager.

Error recovery:

- If the app says the key is missing, check `.env.local` or the Model Configuration tab.
- If English realtime connection fails, refresh and start a new session.
- If feedback analysis fails, the saved audio remains available and can be reanalyzed from Practice Records.
- If recording is unavailable, check the browser's `MediaRecorder` support.

## Validation Checklist

- The Model Configuration tab shows `Key 已配置` after saving or loading `.env.local`.
- English realtime conversation asks for microphone permission.
- English realtime conversation plays assistant audio and displays transcript text.
- Interrupting the assistant during speech keeps the connection usable.
- Inline translation works for Chinese to English, English to Chinese, and auto-detect mode.
- Ending an English session saves audio, text, feedback, and metadata.
- Mandarin random prompt shows a title, passage, and countdown.
- Mandarin recording shows microphone level and elapsed time.
- Mandarin recording stops automatically when the countdown ends.
- Practice Records can expand text, expand feedback, reanalyze, and delete sessions.
- Practice Statistics shows bar charts, line charts, and the left-side calendar.
- The calendar month selector switches between available months.

