# Speak Room

[中文版](README.md)

Speak Room is a local bilingual speaking-practice assistant for English realtime conversation, Mandarin reading, recording and transcript review, AI feedback, long-term learning advice, and practice statistics.

The backend uses **Python + FastAPI**, while the frontend uses plain HTML, CSS, and JavaScript. English conversation streams audio through the OpenAI Realtime API and WebRTC.

## Features

### English Conversation

- Low-latency two-way audio through WebRTC and the OpenAI Realtime API.
- Start, pause, resume, and end a conversation with visible connection state and a two-color waveform.
- Study-abroad scenarios plus a default open-ended casual topic.
- Selectable voice and `0.9x`, `1.0x`, or `1.1x` speaking speed.
- Live transcripts with saved mixed audio, user-only microphone audio, and conversation text.
- Optional learning-memory reuse so a new session can reference background and long-term priorities.
- Feedback across pronunciation, fluency, grammar, vocabulary, and task communication, followed by a server-calculated weighted total.

### Mandarin Reading

- Random prompts from a Putonghua-test-style reading bank.
- An explicit countdown, elapsed recording time, and live input level.
- Separate Start Recording, End and Save, and Generate Feedback actions.
- Feedback across reading accuracy, pronunciation clarity, tone control, fluency, and rhythm/breath.
- Reading accuracy is calculated from the source and transcription; the server combines it with other dimensions into the final score.

### Records, Statistics, And Learning Advice

- Separate English and Mandarin tabs in Practice Records.
- Seekable audio, collapsed text, feedback review, reanalysis, and deletion for each record.
- Separate total practice time for English and Mandarin plus a two-color daily duration chart.
- English and Mandarin score-trend tabs with independent numbering and x-axes.
- A monthly sidebar calendar using blue, red, or split-color squares for practice days.
- Learning Advice analyzes all English transcripts for learned patterns, useful phrases, usages to avoid, recurring issues, and next steps.

### Translation And Configuration

- Sidebar translation with auto-detect, Chinese-to-English, and English-to-Chinese modes.
- Translation starts automatically after typing stops.
- Separate model selectors for realtime conversation, text/feedback, and translation.
- The API key can be saved to `.env.local`.

## Quick Start

Python 3.9 or later is required. Python 3.12 is recommended.

```bash
cd "/path/to/speak-room"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Create `.env.local`:

```bash
OPENAI_API_KEY="sk-..."
```

You can also start the app first and save the key from Model Configuration.

Start the server:

```bash
PORT=4000 .venv/bin/python -B server.py
```

Open `http://127.0.0.1:4000`. The server runs in the foreground, so keep that terminal open. Press `Ctrl+C` to stop it.

On Windows:

```powershell
$env:PORT=4000
.venv\Scripts\python.exe -B server.py
```

## Optional Configuration

```bash
OPENAI_REALTIME_MODEL="gpt-realtime-2.1-mini"
OPENAI_TEXT_MODEL="gpt-5.6-luna"
OPENAI_TRANSLATE_MODEL="gpt-5.6-luna"
OPENAI_TRANSCRIBE_MODEL="gpt-4o-mini-transcribe"
HOST="127.0.0.1"
PORT=4000
```

For higher-accuracy transcription, set `OPENAI_TRANSCRIBE_MODEL` to `gpt-4o-transcribe`.

## Project Structure

```text
.
├── server.py                 # FastAPI server, OpenAI calls, and local storage
├── practice_content.json     # Mandarin bank, prompts, and structured schemas
├── requirements.txt
├── tests/
│   └── test_server.py
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── .gitignore
```

## Feedback And Scoring

The feedback pipeline transcribes saved audio, then creates structured suggestions from transcripts, source text, and available low-confidence fragments.

- English: pronunciation 25%, fluency 25%, grammar 20%, vocabulary 15%, and communication 15%. Pronunciation is not invented from text when user-only audio is unavailable.
- Mandarin: reading accuracy 35%, pronunciation clarity 25%, tone control 15%, fluency 15%, and rhythm/breath 10%.

This is transcription- and model-assisted practice feedback, not professional phoneme measurement, tone-curve analysis, or tongue-position sensing. Treat articulation details as coaching suggestions rather than definitive diagnosis.

## Development And Tests

```bash
.venv/bin/python -m unittest discover -s tests -v
```

## Troubleshooting

**The page does not open**

Make sure the server terminal is still open and visit `http://127.0.0.1:4000`. Check the port with:

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

**Port 4000 is already in use**

Stop the previous server or use another port:

```bash
PORT=4001 .venv/bin/python -B server.py
```

**Realtime conversation closes or fails**

Reload and start a fresh session.

**Feedback fails**

Audio is saved locally first. Open Practice Records and select Reanalyze.

**Microphone permission is unavailable**

Check browser permissions and use `localhost`, `127.0.0.1`, or HTTPS.
