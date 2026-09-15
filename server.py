"""Speak Room's local Python server. Run with python server.py."""

import asyncio
import base64
import binascii
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import math
import mimetypes
import os
from pathlib import Path
import random
import re
import shutil
import tempfile
import threading
from uuid import uuid4

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles
import uvicorn


ROOT = Path(__file__).resolve().parent
DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1-mini"
DEFAULT_TEXT_MODEL = "gpt-5.6-luna"
CONTENT = json.loads((ROOT / "practice_content.json").read_text(encoding="utf-8"))
AUDIO_TYPES = {"webm": "audio/webm", "mp4": "audio/mp4", "mp3": "audio/mpeg",
               "ogg": "audio/ogg", "wav": "audio/wav"}
SESSION_FILES = {"reference.txt", "transcript.txt", "analysis.json", "metadata.json"}
SESSION_FILES.update(f"{prefix}.{ext}" for prefix in ("audio", "user_audio") for ext in AUDIO_TYPES)


def load_env(root):
    for name in (".env", ".env.local"):
        path = root / name
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
            if not match or os.environ.get(match[1]):
                continue
            value = match[2]
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                try:
                    value = json.loads(value)
                except ValueError:
                    value = value[1:-1]
            os.environ[match[1]] = str(value)


def atomic_write(path, data):
    """Publish complete files so readers never see partially written metadata."""
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".saving-")
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data if isinstance(data, bytes) else data.encode("utf-8"))
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def dump_json(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)


def read_metadata(path):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def safe_session_id(value):
    value = str(value or "").strip()
    if value in (".", "..") or not re.fullmatch(r"[A-Za-z0-9_.-]+", value):
        raise HTTPException(400, "Invalid session id.")
    return value


def normalize_score(value):
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        number = float(value)
        return max(0, min(100, math.floor(number + 0.5))) if math.isfinite(number) else None
    except (ValueError, TypeError):
        return None


def extension_from_mime(value):
    value = str(value or "")
    return next((ext for token, ext in (("mp4", "mp4"), ("mpeg", "mp3"),
                                       ("ogg", "ogg"), ("wav", "wav")) if token in value), "webm")


def decode_audio(value):
    value = re.sub(r"^data:[^;]+;base64,", "", str(value))
    try:
        return base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(400, "Invalid base64 audio.")


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class SessionStore:
    def __init__(self, root):
        self.root = root / "practice-sessions"
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    def directory(self, session_id):
        directory = self.root / safe_session_id(session_id)
        if directory.is_symlink() or directory.resolve().parent != self.root.resolve():
            raise HTTPException(400, "Invalid session path.")
        return directory

    def file(self, session_id, filename):
        if filename not in SESSION_FILES:
            raise HTTPException(404, "Not found")
        directory = self.directory(session_id)
        path = directory / filename
        if path.is_symlink() or path.resolve().parent != directory.resolve() or not path.is_file():
            raise HTTPException(404, "Not found")
        return path

    def save(self, body):
        with self.lock:
            mode = "mandarin" if body.get("mode") == "mandarin" else "english"
            session_id = body.get("sessionId") or f"{now_iso().replace(':', '-').replace('.', '-')}-{mode}-{uuid4().hex[:8]}"
            directory = self.directory(session_id)
            session_id = directory.name
            # Decode before touching disk so invalid uploads cannot partially replace a record.
            audio = decode_audio(body["audioBase64"]) if body.get("audioBase64") else None
            user_audio = decode_audio(body["userAudioBase64"]) if body.get("userAudioBase64") else None
            directory.mkdir(exist_ok=True)
            existing = read_metadata(directory / "metadata.json")
            audio_file = existing.get("audioFile")
            user_file = existing.get("userAudioFile")
            if audio is not None:
                audio_file = "audio." + extension_from_mime(body.get("mimeType"))
                atomic_write(directory / audio_file, audio)
            if user_audio is not None:
                user_file = "user_audio." + extension_from_mime(body.get("userMimeType"))
                atomic_write(directory / user_file, user_audio)
            reference = str(body.get("referenceText") or existing.get("referenceText") or "")
            transcript = str(body.get("transcript") or existing.get("transcript") or "")
            analysis = body.get("analysis") or existing.get("analysis") or None
            if analysis is not None and not isinstance(analysis, dict):
                raise HTTPException(400, "Invalid analysis.")
            score_value = body.get("score")
            if score_value is None:
                score_value = (analysis or {}).get("score")
            if score_value is None:
                score_value = existing.get("score")
            score = normalize_score(score_value)
            for filename, value in (("reference.txt", reference), ("transcript.txt", transcript),
                                    ("analysis.json", dump_json(analysis) if analysis else "")):
                if value:
                    atomic_write(directory / filename, value)
            try:
                duration = float(body.get("durationMs") or existing.get("durationMs") or 0)
                if not math.isfinite(duration) or duration < 0:
                    raise ValueError()
            except (TypeError, ValueError):
                raise HTTPException(400, "Invalid practice duration.")
            metadata = {
                "id": session_id, "mode": mode, "createdAt": existing.get("createdAt") or now_iso(),
                "updatedAt": now_iso(), "title": str(body.get("title") or existing.get("title") or ""),
                "durationMs": duration, "score": score, "scoreTag": "" if score is None else f"{score}分",
                "referenceText": reference, "transcript": transcript, "analysis": analysis,
                "audioFile": audio_file, "userAudioFile": user_file,
                "files": {"audio": audio_file, "userAudio": user_file,
                          "reference": "reference.txt" if reference else None,
                          "transcript": "transcript.txt" if transcript else None,
                          "analysis": "analysis.json" if analysis else None, "metadata": "metadata.json"},
            }
            atomic_write(directory / "metadata.json", dump_json(metadata))
            return {"id": session_id, "sessionDir": str(directory),
                    "metadataPath": str(directory / "metadata.json"),
                    "audioPath": str(directory / audio_file) if audio_file else None,
                    "userAudioPath": str(directory / user_file) if user_file else None, "analysis": analysis}

    def list(self):
        with self.lock:
            sessions = []
            for directory in self.root.iterdir():
                if not directory.is_dir() or directory.is_symlink():
                    continue
                metadata = read_metadata(directory / "metadata.json")
                if not metadata.get("id"):
                    continue
                score = metadata.get("score")
                score = normalize_score(score if score is not None else (metadata.get("analysis") or {}).get("score"))
                sessions.append({**metadata, "sessionDir": str(directory),
                                 "durationMs": metadata.get("durationMs") or 0, "score": score,
                                 "scoreTag": metadata.get("scoreTag") or ("" if score is None else f"{score}分")})
            return sorted(sessions, key=lambda item: str(item.get("updatedAt") or ""), reverse=True)

    def delete(self, session_id):
        with self.lock:
            directory = self.directory(session_id)
            if not directory.is_dir():
                raise HTTPException(404, "Practice session not found.")
            shutil.rmtree(directory)
            return {"id": directory.name, "deleted": True}

    def analysis_input(self, session_id):
        with self.lock:
            metadata = read_metadata(self.directory(session_id) / "metadata.json")
            if not metadata.get("id"):
                raise HTTPException(404, "Practice session not found.")
            body = {"mode": metadata.get("mode"), "topic": metadata.get("title"),
                    "referenceText": metadata.get("referenceText"), "transcript": metadata.get("transcript")}
            for field, audio_field, mime_field in (("audioFile", "audioBase64", "mimeType"),
                                                  ("userAudioFile", "userAudioBase64", "userMimeType")):
                if metadata.get(field):
                    path = self.file(session_id, metadata[field])
                    body[audio_field] = base64.b64encode(path.read_bytes()).decode("ascii")
                    body[mime_field] = AUDIO_TYPES.get(path.suffix[1:], "audio/webm")
            return metadata, body

    def save_feedback(self, session_id, metadata, result):
        with self.lock:
            if not (self.directory(session_id) / "metadata.json").is_file():
                raise HTTPException(404, "Practice session was deleted during analysis.")
            return self.save({"sessionId": session_id, "mode": metadata["mode"],
                              "transcript": result["transcript"], "analysis": result["analysis"]})


def realtime_session_config(options):
    pace = options.get("pace") or "lively"
    instructions = [
        "You are the English Speaking Room companion for a Chinese international student studying in Singapore.",
        "Keep the interaction live, playful, and useful for spoken English practice.",
        "Ask one short question at a time, invite the user to answer aloud, and adapt to their level.",
        "Use natural turn-taking. If the user pauses briefly, wait; if they finish, respond with concise feedback and a follow-up.",
        "Help with pronunciation, word choice, fluency, and confidence without turning the conversation into a lecture.",
        "Use campus, housing, food court, clinic, interview, and cross-cultural scenes when they fit.",
        f"Practice theme: {options.get('topic') or 'open practice'}.", f"Speaking energy: {pace}.",
    ]
    return {
        "type": "realtime", "model": os.environ.get("OPENAI_REALTIME_MODEL") or DEFAULT_REALTIME_MODEL,
        "instructions": " ".join(instructions), "output_modalities": ["audio"], "max_output_tokens": 900,
        "audio": {
            "input": {"transcription": {"model": "gpt-4o-mini-transcribe", "language": "en",
                                        "prompt": "English speaking practice with everyday learner phrasing."},
                      "turn_detection": {"type": "semantic_vad", "eagerness": "medium",
                                         "create_response": True, "interrupt_response": True},
                      "noise_reduction": {"type": "near_field"}},
            "output": {"voice": options.get("voice") or "marin",
                       "speed": 0.94 if pace == "calm" else 1.08 if pace == "quick" else 1},
        },
    }


def extract_response_text(data):
    if isinstance(data.get("output_text"), str) and data["output_text"].strip():
        return data["output_text"]
    chunks = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            for key in ("text", "output_text"):
                if isinstance(content.get(key), str):
                    chunks.append(content[key])
    return "\n".join(chunks).strip()


def parse_analysis(text):
    candidates = [text]
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        candidates.append(match[0])
    for candidate in candidates:
        try:
            value = json.loads(candidate)
            if isinstance(value, dict):
                return value
        except ValueError:
            pass
    if not text.strip():
        summary = "分析完成，但模型没有返回可显示文本。"
    elif re.match(r"\s*(?:```?|\{|\[)", text):
        summary = "点评生成被截断或格式异常，请在练习记录里点击“重新点评”。"
    else:
        summary = text.strip()[:900]
    return {"summary": summary, "score": None}


class OpenAIService:
    def __init__(self, client):
        self.client = client

    async def post(self, endpoint, key, **kwargs):
        headers = {"Authorization": f"Bearer {key}", **kwargs.pop("headers", {})}
        response = await self.client.post("https://api.openai.com/v1/" + endpoint, headers=headers, **kwargs)
        if not response.is_success:
            message = f"OpenAI request failed with {response.status_code}"
            try:
                error = response.json().get("error")
                message = error.get("message", message) if isinstance(error, dict) else error or message
            except ValueError:
                pass
            raise HTTPException(502, str(message).replace(key, "[redacted]"))
        return response

    async def token(self, key, options):
        response = await self.post("realtime/client_secrets", key, json={
            "expires_after": {"anchor": "created_at", "seconds": 600}, "session": realtime_session_config(options)})
        data = response.json()
        return {"value": data["value"], "expiresAt": data["expires_at"],
                "model": (data.get("session") or {}).get("model") or realtime_session_config(options)["model"]}

    async def connect(self, key, sdp, options):
        if "v=0" not in sdp:
            raise HTTPException(400, "Invalid WebRTC SDP offer.")
        response = await self.post("realtime/calls", key,
                                   headers={"OpenAI-Safety-Identifier": "local-speak-room"},
                                   files={"sdp": (None, sdp), "session": (None, json.dumps(realtime_session_config(options)))})
        if "v=0" not in response.text:
            raise HTTPException(502, "Realtime call did not return a valid SDP answer.")
        return response.text

    async def text(self, key, prompt, max_tokens, schema=None):
        payload = {"model": os.environ.get("OPENAI_TEXT_MODEL") or DEFAULT_TEXT_MODEL,
                   "input": prompt, "max_output_tokens": max_tokens}
        if schema:
            payload["text"] = {"format": schema}
        response = await self.post("responses", key, json=payload)
        return extract_response_text(response.json())

    async def transcribe(self, key, audio, mime_type, language, logprobs=False):
        fields = {"model": os.environ.get("OPENAI_TRANSCRIBE_MODEL") or "gpt-4o-mini-transcribe", "language": language}
        if logprobs:
            fields["include[]"] = "logprobs"
        response = await self.post("audio/transcriptions", key, data=fields,
                                   files={"file": ("practice." + extension_from_mime(mime_type),
                                                   decode_audio(audio), mime_type or "audio/webm")})
        return response.json()

    async def analyze(self, key, body):
        mode = "mandarin" if body.get("mode") == "mandarin" else "english"
        transcript = str(body.get("transcript") or "").strip()
        audio_text, notes = "", ""
        if mode == "english" and body.get("userAudioBase64"):
            result = await self.transcribe(key, body["userAudioBase64"], body.get("userMimeType"), "en", True)
            audio_text = str(result.get("text") or "").strip()
            uncertain = [str(item.get("token") or "").strip() for item in (result.get("logprobs") or [])
                         if isinstance(item.get("logprob"), (float, int)) and item["logprob"] < -1.2]
            notes = " ".join([word for word in uncertain if word][:24])
        elif body.get("audioBase64") and (mode == "mandarin" or not transcript):
            result = await self.transcribe(key, body["audioBase64"], body.get("mimeType"), "zh" if mode == "mandarin" else "en")
            audio_text = str(result.get("text") or "").strip()
        spoken = audio_text or transcript or "(No transcript captured.)"
        prompt = CONTENT["prompts"][mode].format(
            referenceText=str(body.get("referenceText") or "").strip(), spokenText=spoken,
            topic=str(body.get("topic") or "general conversation").strip(),
            transcript=transcript or "(Conversation transcript was not captured.)",
            audioTranscript=audio_text or "(User-only audio was not available; use the transcript only.)",
            transcriptionNotes=notes or "(No low-confidence audio fragments were available.)")
        text = await self.text(key, prompt, 2600, CONTENT["schemas"][mode])
        return {"mode": mode, "transcript": (transcript or spoken) if mode == "english" else spoken,
                "analysis": parse_analysis(text)}

    async def translate(self, key, body):
        text = str(body.get("text") or "").strip()
        if not text or len(text) > 1200:
            raise HTTPException(400, "请输入要翻译的内容。" if not text else "翻译内容太长，请控制在 1200 字以内。")
        direction = body.get("direction") if body.get("direction") in ("zh-en", "en-zh", "auto") else "auto"
        target = {"zh-en": "Translate Chinese into natural spoken English.",
                  "en-zh": "Translate English into clear Simplified Chinese.",
                  "auto": "Detect whether the input is Chinese or English. If Chinese, translate it into natural spoken English. If English, translate it into clear Simplified Chinese."}[direction]
        prompt = (target + "\n\nContext: The user is doing live English speaking practice. Prefer concise, speakable wording over literal translation. If translating into English, include one natural version only unless the input truly needs an alternative."
                  + f"\n\nInput:\n{text}\n\nReturn only the translation text.")
        translated = await self.text(key, prompt, 500)
        return {"direction": direction, "translated": translated.strip() or "没有返回翻译结果。"}


async def read_body(request, limit=1024 * 1024, as_text=False):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > limit:
            raise HTTPException(413, "Request body is too large.")
    try:
        if as_text:
            return raw.decode("utf-8")
        value = json.loads(raw) if raw else {}
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "Invalid JSON request body.")


def api_key():
    value = os.environ.get("OPENAI_API_KEY", "").strip()
    if not value:
        raise HTTPException(401, "OPENAI_API_KEY is not configured.")
    return value


def create_app(root=ROOT, transport=None, load_environment=True):
    root = Path(root).resolve()
    if load_environment:
        load_env(root)
    store = SessionStore(root)
    config_lock = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(transport=transport, timeout=httpx.Timeout(120, connect=20)) as client:
            app.state.openai = OpenAIService(client)
            yield

    app = FastAPI(title="Speak Room", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(httpx.TimeoutException)
    async def timeout_error(request, exc):
        return JSONResponse({"error": "OpenAI 请求超时，请重试。已保存的练习记录不受影响。"}, status_code=504)

    @app.exception_handler(httpx.RequestError)
    async def network_error(request, exc):
        return JSONResponse({"error": "无法连接 OpenAI，请检查网络后重试。"}, status_code=502)

    @app.exception_handler(Exception)
    async def server_error(request, exc):
        return JSONResponse({"error": "Unexpected server error. Please retry."}, status_code=500)

    @app.get("/api/config")
    async def config():
        return {"keyPresent": bool(os.environ.get("OPENAI_API_KEY", "").strip()),
                "realtimeModel": os.environ.get("OPENAI_REALTIME_MODEL") or DEFAULT_REALTIME_MODEL,
                "textModel": os.environ.get("OPENAI_TEXT_MODEL") or DEFAULT_TEXT_MODEL}

    @app.post("/api/config/api-key")
    async def save_key(request: Request):
        body = await read_body(request)
        key = str(body.get("apiKey") or "").strip()
        if not re.fullmatch(r"sk-[A-Za-z0-9_-]+", key):
            raise HTTPException(400, "Enter a valid OpenAI API key.")
        async with config_lock:
            def write_key():
                path = root / ".env.local"
                if path.is_symlink():
                    raise HTTPException(400, "Invalid environment file path.")
                lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
                line = "OPENAI_API_KEY=" + json.dumps(key)
                matches = [bool(re.match(r"^\s*OPENAI_API_KEY\s*=", item)) for item in lines]
                updated = [line if match else item for item, match in zip(lines, matches)]
                if not any(matches):
                    updated.append(line)
                atomic_write(path, "\n".join(updated) + "\n")
            await run_in_threadpool(write_key)
            os.environ["OPENAI_API_KEY"] = key
        return {"keyPresent": True}

    @app.post("/api/realtime-token")
    async def token(request: Request):
        key = api_key()
        return await app.state.openai.token(key, await read_body(request))

    @app.post("/api/realtime-connect")
    async def connect(request: Request):
        key = api_key()
        sdp = await read_body(request, 2 * 1024 * 1024, as_text=True)
        answer = await app.state.openai.connect(key, sdp, dict(request.query_params))
        return Response(answer, media_type="application/sdp")

    @app.post("/api/reading/generate")
    async def reading(request: Request):
        await read_body(request)
        item = random.choice(CONTENT["readingBank"])
        chars = len(re.findall(r"[\u4e00-\u9fff]", item["text"]))
        return {**item, "source": "普通话水平测试风格本地素材", "targetChars": chars,
                "targetSeconds": max(45, min(120, math.floor(chars / 3.1 + 0.5)))}

    @app.post("/api/analyze")
    async def analyze(request: Request):
        key = api_key()
        return await app.state.openai.analyze(key, await read_body(request, 30 * 1024 * 1024))

    @app.post("/api/translate")
    async def translate(request: Request):
        key = api_key()
        return await app.state.openai.translate(key, await read_body(request))

    @app.get("/api/sessions")
    async def sessions():
        return {"rootDir": str(store.root), "sessions": await run_in_threadpool(store.list)}

    @app.post("/api/sessions")
    async def save_session(request: Request):
        return await run_in_threadpool(store.save, await read_body(request, 30 * 1024 * 1024))

    @app.delete("/api/sessions/{session_id}")
    async def delete_session(session_id: str):
        return await run_in_threadpool(store.delete, session_id)

    @app.post("/api/sessions/{session_id}/reanalyze")
    async def reanalyze(session_id: str):
        key = api_key()
        metadata, body = await run_in_threadpool(store.analysis_input, session_id)
        result = await app.state.openai.analyze(key, body)
        return await run_in_threadpool(store.save_feedback, session_id, metadata, result)

    @app.api_route("/api/sessions/{session_id}/files/{filename}", methods=["GET", "HEAD"])
    async def session_file(session_id: str, filename: str):
        path = await run_in_threadpool(store.file, session_id, filename)
        media_type = AUDIO_TYPES.get(path.suffix[1:]) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return FileResponse(path, media_type=media_type, headers={"Cache-Control": "no-cache"})

    app.mount("/", StaticFiles(directory=ROOT / "public", html=True), name="public")
    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host=os.environ.get("HOST") or "127.0.0.1", port=int(os.environ.get("PORT") or 4000))
