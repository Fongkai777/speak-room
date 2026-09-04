# Speak Room

A local browser app for two speaking workflows:

- English realtime conversation with a live voice companion, WebRTC audio, transcripts, recording, and coaching analysis from the user-only microphone track when available.
- Mandarin reading practice with a local Putonghua-test-style random reading bank, target-time countdown, recording meter, and pronunciation-focused feedback.
- Scenario topic picks tailored for English speaking practice as a Chinese international student studying in Singapore.

## Setup

1. Put your key in `.env.local`:

   ```bash
   OPENAI_API_KEY="sk-..."
   ```

   The app also includes a local-only Config page that can save `OPENAI_API_KEY` to `.env.local`.
   The key is read only by `server.mjs`; the browser receives short-lived Realtime client secrets instead of the project key.

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

4. Open `http://localhost:3000`.

## Current OpenAI API Notes

This app follows the current Realtime WebRTC unified interface pattern from official OpenAI documentation:

- The browser never receives the standard project API key.
- The browser creates a `RTCPeerConnection`, adds the microphone track, and sends its SDP offer to the local `/api/realtime-connect` endpoint.
- The server combines the SDP with a `type: "realtime"` session config and calls `POST /v1/realtime/calls` using `OPENAI_API_KEY`.
- The server returns the SDP answer to the browser.
- Realtime audio output is handled by WebRTC media tracks; transcript and lifecycle events are handled through the `oai-events` data channel.

Model guidance:

- Realtime voice defaults to `gpt-realtime-2.1-mini`, a lower-cost realtime model for speech-to-speech practice.
- Text generation and analysis defaults to `gpt-5.6-luna` for lower-cost local development; override with `OPENAI_TEXT_MODEL`.
- Transcription defaults to `gpt-4o-mini-transcribe`; use `gpt-4o-transcribe` when you want higher accuracy at a higher cost.

Sources checked:

- https://developers.openai.com/api/docs/guides/realtime-webrtc
- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/models/gpt-realtime-2.1
- https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini
- https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe
- https://developers.openai.com/api/docs/models/gpt-4o-transcribe

## Responsibilities

Browser/client:

- Requests microphone permission.
- Starts and stops WebRTC sessions.
- Plays realtime assistant audio.
- Records practice audio with `MediaRecorder`.
- Displays transcripts for English, countdowns, microphone level, elapsed recording time, and visible session state.

Server:

- Loads and stores `OPENAI_API_KEY`.
- Mints short-lived Realtime client secrets.
- Serves Mandarin reading material from a local Putonghua-test-style practice bank.
- Transcribes saved recordings.
- Produces feedback analysis.
- Saves each practice session under `practice-sessions/<session-id>/`.

## Saved Sessions

New sessions are grouped into one managed directory per practice:

```text
practice-sessions/
  2026-09-03T13-36-17-802Z-english/
    audio.webm
    user_audio.webm
    transcript.txt
    analysis.json
    metadata.json
```

Mandarin reading sessions also include `reference.txt` when selected reading text is present. The Records tab can replay audio, expand or collapse saved text and feedback, rerun feedback analysis, and delete a whole saved session folder.
For English sessions, `audio.webm` is the playable mixed conversation and `user_audio.webm` is used for pronunciation-focused reanalysis.

Older files created before this directory layout may still exist in `recordings/`; they can be copied into `practice-sessions/` without deleting the original audio.

## Developer Notes

Latency:

- Use WebRTC for the English realtime workflow; avoid request/response audio loops for live conversation.
- The session uses semantic VAD with interruption enabled so the user can naturally cut in.
- Keep assistant turns short. Long spoken responses increase latency and make turn-taking feel heavy.

Session lifecycle:

- Realtime client secrets are short-lived and minted on each session start.
- Closing a session stops the peer connection, data channel, local tracks, remote tracks, and recorder.
- If the connection fails, end the current session and mint a fresh client secret.

Permissions:

- Browsers require a user gesture before microphone capture.
- Use `localhost` or HTTPS for `getUserMedia`.
- The API key configuration page is intended for local development only; production apps should use a secret manager and authenticated settings surface.

Error recovery:

- If token creation fails, confirm `.env.local` has `OPENAI_API_KEY`.
- If WebRTC connection fails, retry with a fresh session.
- If transcription fails, keep the saved audio and retry analysis later.
- If browser recording is unavailable, check MediaRecorder support for the current browser and audio MIME type.

Mandarin pronunciation analysis:

- The app uses transcription internally to compare the selected reading text with what the model heard.
- The UI does not show the recognized transcript for Mandarin practice by default.
- Feedback focuses on likely unclear words, flat/retroflex initials, front/back nasals, tone stability, mouth opening, tongue placement cues, rhythm, and breath.
- This is useful coaching feedback, not a certified phoneme-level Putonghua test score.

## Validation Checklist

- Config page shows `Key 已配置` after saving or loading `.env.local`.
- English session prompts for microphone permission.
- English session connects, plays assistant audio, and displays transcript deltas.
- Speaking over the assistant interrupts naturally or recovers cleanly.
- Ending English practice saves audio, transcript, feedback, and metadata under one `practice-sessions/` folder.
- New English sessions save a user-only microphone track for more useful pronunciation and clarity feedback.
- The Records tab can rerun feedback analysis and delete a saved practice session after confirmation.
- English analysis produces a score, summary, and drills.
- Mandarin random selection returns title, text, and a target countdown without an OpenAI request.
- Mandarin recording shows elapsed time and approximate microphone dB, then stops automatically when the countdown reaches zero.
- Mandarin analysis uses transcription internally, but the visible result focuses on pronunciation feedback instead of recognized text.
- Reloading the page and starting a new session mints a fresh Realtime client secret.
