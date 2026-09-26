"""Speak Room's local Python server. Run with python server.py."""

import asyncio
import base64
import binascii
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from difflib import SequenceMatcher
import hashlib
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
DEFAULT_TRANSLATE_MODEL = DEFAULT_TEXT_MODEL
MODEL_OPTIONS = {
    "realtimeModel": ("gpt-realtime-2.1-mini", "gpt-realtime-2.1", "gpt-realtime-2"),
    "textModel": ("gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.4-mini", "gpt-4o-mini"),
    "translateModel": ("gpt-4o-mini", "gpt-5.6-luna", "gpt-5-nano", "gpt-5.4-nano"),
}
MODEL_ENV_NAMES = {
    "realtimeModel": "OPENAI_REALTIME_MODEL",
    "textModel": "OPENAI_TEXT_MODEL",
    "translateModel": "OPENAI_TRANSLATE_MODEL",
}
ENGLISH_SCORING_RUBRIC = """

Scoring calibration:
- Score five dimensions independently in scoreBreakdown: pronunciation, fluency, grammar, vocabulary, and communication.
- Use these anchors consistently: 90-100 = consistently clear and natural with only minor slips; 80-89 = clear and effective with occasional issues that rarely interrupt; 70-79 = understandable but recurring errors, restarts, or unclear moments are noticeable; 60-69 = frequent repair or listener effort is needed; below 60 = meaning is often incomplete or difficult to follow.
- Use the full range supported by the evidence. Do not default to a low-70s score and do not round every dimension to a multiple of five.
- Set pronunciation to null when user-only audio evidence is unavailable. Do not infer a pronunciation score from transcript text.
- communication measures whether the learner completed the intended speaking task clearly and efficiently, not whether the learner was polite.
- Provide an overall score, but the server will recalculate it from the dimension scores using fixed weights.
"""
MANDARIN_SCORING_RUBRIC = """

评分校准规则：
- 分别给 scoreBreakdown 中的 pronunciationClarity、toneControl、fluency、rhythmBreath 打 0-100 分；readingAccuracy 先给出估计值，但服务端会根据原文与识别文本的字符对齐结果覆盖它。
- 统一使用以下分档：90-100 = 全程稳定清楚，仅有极少轻微失误；80-89 = 整体清楚，偶有不影响理解的问题；70-79 = 可以理解，但含混、漏字、替换或不稳现象反复出现；60-69 = 多处需要听者费力辨认或明显修正；60 以下 = 经常难以辨认或未完整朗读。
- 请充分使用分数范围，不要习惯性给 82 或 88，也不要把所有分项都取 5 的倍数。
- pronunciationClarity 依据识别差异及低置信度片段评估清晰度；toneControl 只能根据识别线索谨慎推测，不得声称已精确测量声调曲线。
- fluency 关注重复、回读、漏读和不自然停顿；rhythmBreath 关注句子分组、停连和长句完整度。
- 总分仍需返回，但服务端会按固定权重重新计算。
"""
CONTENT = json.loads((ROOT / "practice_content.json").read_text(encoding="utf-8"))
AUDIO_TYPES = {"webm": "audio/webm", "mp4": "audio/mp4", "mp3": "audio/mpeg",
               "ogg": "audio/ogg", "wav": "audio/wav"}
SESSION_FILES = {"reference.txt", "transcript.txt", "analysis.json", "metadata.json"}
SESSION_FILES.update(f"{prefix}.{ext}" for prefix in ("audio", "user_audio") for ext in AUDIO_TYPES)


class DevelopmentStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store"
        return response

LEARNING_PROFILE_SCHEMA = {
    "type": "json_schema",
    "name": "english_learning_profile",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["summary", "personalContext", "strengths", "masteredPatterns", "usefulPhrases",
                     "avoidUsages", "recurringIssues", "nextPlan", "conversationMemory"],
        "properties": {
            "summary": {"type": "string"},
            "personalContext": {"type": "array", "items": {"type": "string"}},
            "strengths": {"type": "array", "items": {"type": "string"}},
            "masteredPatterns": {
                "type": "array",
                "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["pattern", "evidence", "nextStep"],
                    "properties": {"pattern": {"type": "string"}, "evidence": {"type": "string"},
                                   "nextStep": {"type": "string"}},
                },
            },
            "usefulPhrases": {
                "type": "array",
                "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["phrase", "use"],
                    "properties": {"phrase": {"type": "string"}, "use": {"type": "string"}},
                },
            },
            "avoidUsages": {
                "type": "array",
                "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["usage", "problem", "replacement"],
                    "properties": {"usage": {"type": "string"}, "problem": {"type": "string"},
                                   "replacement": {"type": "string"}},
                },
            },
            "recurringIssues": {
                "type": "array",
                "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["issue", "evidence", "practice"],
                    "properties": {"issue": {"type": "string"}, "evidence": {"type": "string"},
                                   "practice": {"type": "string"}},
                },
            },
            "nextPlan": {"type": "array", "items": {"type": "string"}},
            "conversationMemory": {"type": "string"},
        },
    },
}


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


def update_env_file(path, values):
    if path.is_symlink():
        raise HTTPException(400, "Invalid environment file path.")
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    for name, value in values.items():
        line = name + "=" + json.dumps(value)
        matches = [bool(re.match(rf"^\s*{re.escape(name)}\s*=", item)) for item in lines]
        lines = [line if match else item for item, match in zip(lines, matches)]
        if not any(matches):
            lines.append(line)
    atomic_write(path, "\n".join(lines) + "\n")


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
        self.profile_path = self.root / "english-learning-profile.json"
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

    def english_history(self):
        sessions = [item for item in self.list()
                    if item.get("mode") == "english" and str(item.get("transcript") or "").strip()]
        return sorted(sessions, key=lambda item: str(item.get("createdAt") or ""))

    def history_fingerprint(self, sessions=None):
        sessions = self.english_history() if sessions is None else sessions
        digest = hashlib.sha256()
        for item in sessions:
            digest.update(str(item.get("id") or "").encode())
            digest.update(str(item.get("updatedAt") or "").encode())
            digest.update(str(item.get("transcript") or "").encode())
            digest.update(dump_json(item.get("analysis") or {}).encode())
        return digest.hexdigest()

    def load_learning_profile(self):
        sessions = self.english_history()
        saved = read_metadata(self.profile_path)
        profile = saved.get("profile") if isinstance(saved.get("profile"), dict) else None
        fingerprint = self.history_fingerprint(sessions)
        return {
            "available": bool(profile),
            "stale": bool(profile) and saved.get("sourceFingerprint") != fingerprint,
            "recordCount": len(sessions),
            "generatedAt": saved.get("generatedAt"),
            "profile": profile,
            "sourceFingerprint": fingerprint,
        }

    def save_learning_profile(self, profile, sessions):
        with self.lock:
            payload = {
                "generatedAt": now_iso(),
                "recordCount": len(sessions),
                "sourceFingerprint": self.history_fingerprint(sessions),
                "profile": profile,
            }
            atomic_write(self.profile_path, dump_json(payload))
            return {"available": True, "stale": False, **payload}

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
    raw_speed = str(options.get("pace") or "1.0")
    legacy_speeds = {"calm": 0.9, "lively": 1.0, "quick": 1.1}
    if raw_speed in legacy_speeds:
        speed = legacy_speeds[raw_speed]
    else:
        try:
            speed = float(raw_speed)
        except ValueError:
            speed = 1.0
    if speed not in (0.9, 1.0, 1.1):
        speed = 1.0
    instructions = [
        "You are the English Speaking Room companion for a Chinese international student studying in Singapore.",
        "Keep the interaction live, playful, and useful for spoken English practice.",
        "Ask one short question at a time, invite the user to answer aloud, and adapt to their level.",
        "Use natural turn-taking. If the user pauses briefly, wait; if they finish, respond with concise feedback and a follow-up.",
        "Help with pronunciation, word choice, fluency, and confidence without turning the conversation into a lecture.",
        "Use campus, housing, food court, clinic, interview, and cross-cultural scenes when they fit.",
        f"Practice theme: {options.get('topic') or 'open practice'}.", f"Speaking speed: {speed:.1f}x.",
    ]
    memory = str(options.get("memory") or "").strip()
    if memory:
        instructions.extend([
            "Use the following long-term learner memory from saved practice as private background context.",
            "Do not recite the memory, mention that a profile exists, or assume facts beyond what it says.",
            "Avoid repeatedly asking for details already known. Revisit recurring language goals naturally and notice progress.",
            f"Learner memory:\n{memory}",
        ])
    return {
        "type": "realtime", "model": os.environ.get("OPENAI_REALTIME_MODEL") or DEFAULT_REALTIME_MODEL,
        "instructions": " ".join(instructions), "output_modalities": ["audio"], "max_output_tokens": 900,
        "audio": {
            "input": {"transcription": {"model": "gpt-4o-mini-transcribe", "language": "en",
                                        "prompt": "English speaking practice with everyday learner phrasing."},
                      "turn_detection": {"type": "semantic_vad", "eagerness": "medium",
                                         "create_response": True, "interrupt_response": True},
                      "noise_reduction": {"type": "near_field"}},
            "output": {"voice": options.get("voice") or "marin", "speed": speed},
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


def calibrate_english_score(analysis):
    if not isinstance(analysis, dict) or not isinstance(analysis.get("scoreBreakdown"), dict):
        return analysis
    weights = {"pronunciation": 0.25, "fluency": 0.25, "grammar": 0.20,
               "vocabulary": 0.15, "communication": 0.15}
    weighted, total_weight = 0.0, 0.0
    for field, weight in weights.items():
        value = normalize_score(analysis["scoreBreakdown"].get(field))
        if value is None:
            continue
        analysis["scoreBreakdown"][field] = value
        weighted += value * weight
        total_weight += weight
    if total_weight:
        analysis["score"] = normalize_score(weighted / total_weight)
    return analysis


def reading_accuracy_score(reference, spoken):
    clean = lambda value: "".join(re.findall(r"[\u3400-\u9fffA-Za-z0-9]", str(value or ""))).lower()
    expected, actual = clean(reference), clean(spoken)
    if not expected or not actual:
        return None
    return normalize_score(SequenceMatcher(None, expected, actual).ratio() * 100)


def calibrate_mandarin_score(analysis, reference, spoken):
    if not isinstance(analysis, dict) or not isinstance(analysis.get("scoreBreakdown"), dict):
        return analysis
    weights = {"readingAccuracy": 0.35, "pronunciationClarity": 0.25, "toneControl": 0.15,
               "fluency": 0.15, "rhythmBreath": 0.10}
    accuracy = reading_accuracy_score(reference, spoken)
    if accuracy is not None:
        analysis["scoreBreakdown"]["readingAccuracy"] = accuracy
    weighted, total_weight = 0.0, 0.0
    for field, weight in weights.items():
        value = normalize_score(analysis["scoreBreakdown"].get(field))
        if value is None:
            continue
        analysis["scoreBreakdown"][field] = value
        weighted += value * weight
        total_weight += weight
    if total_weight:
        analysis["score"] = normalize_score(weighted / total_weight)
    return analysis


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

    async def text(self, key, prompt, max_tokens, schema=None, model=None):
        payload = {"model": model or os.environ.get("OPENAI_TEXT_MODEL") or DEFAULT_TEXT_MODEL,
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
            result = await self.transcribe(key, body["audioBase64"], body.get("mimeType"),
                                           "zh" if mode == "mandarin" else "en", mode == "mandarin")
            audio_text = str(result.get("text") or "").strip()
            if mode == "mandarin":
                uncertain = [str(item.get("token") or "").strip() for item in (result.get("logprobs") or [])
                             if isinstance(item.get("logprob"), (float, int)) and item["logprob"] < -1.2]
                notes = " ".join([word for word in uncertain if word][:24])
        spoken = audio_text or transcript or "(No transcript captured.)"
        prompt = CONTENT["prompts"][mode].format(
            referenceText=str(body.get("referenceText") or "").strip(), spokenText=spoken,
            topic=str(body.get("topic") or "general conversation").strip(),
            transcript=transcript or "(Conversation transcript was not captured.)",
            audioTranscript=audio_text or "(User-only audio was not available; use the transcript only.)",
            transcriptionNotes=notes or "(No low-confidence audio fragments were available.)")
        if mode == "english":
            prompt += ENGLISH_SCORING_RUBRIC
        else:
            prompt += MANDARIN_SCORING_RUBRIC
        text = await self.text(key, prompt, 2600, CONTENT["schemas"][mode])
        analysis = parse_analysis(text)
        if mode == "english":
            analysis = calibrate_english_score(analysis)
        else:
            analysis = calibrate_mandarin_score(analysis, body.get("referenceText"), spoken)
        return {"mode": mode, "transcript": (transcript or spoken) if mode == "english" else spoken,
                "analysis": analysis}

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
        model = os.environ.get("OPENAI_TRANSLATE_MODEL") or DEFAULT_TRANSLATE_MODEL
        translated = await self.text(key, prompt, 500, model=model)
        return {"direction": direction, "translated": translated.strip() or "没有返回翻译结果。"}

    async def generate_learning_profile(self, key, sessions):
        if not sessions:
            raise HTTPException(400, "还没有可用于总结的英文对话文本。")
        documents = []
        for index, item in enumerate(sessions, 1):
            documents.append("\n".join([
                f"[English practice {index}]",
                f"Date: {item.get('createdAt') or ''}",
                f"Topic: {item.get('title') or ''}",
                "Transcript:", str(item.get("transcript") or ""),
                "Session feedback:", dump_json(item.get("analysis") or {}),
            ]))
        history = "\n\n".join(documents)
        chunks = [history[start:start + 36000] for start in range(0, len(history), 36000)]
        evidence = []
        for index, chunk in enumerate(chunks, 1):
            if len(chunks) == 1:
                evidence.append(chunk)
                continue
            evidence.append(await self.text(key, f"""Analyze this portion ({index}/{len(chunks)}) of a Chinese learner's English speaking history.
Extract only evidence useful for a later longitudinal report: explicitly stated personal context, demonstrated strengths, sentence patterns used successfully, useful phrases, repeated unnatural or incorrect usages with corrections, recurring fluency/grammar/pronunciation issues, and concrete next practice targets.
Focus on lines labeled User. Use Coach lines only as conversational context, never as evidence of the learner's ability or personal background.
Do not invent facts. Keep examples short and preserve which practice they came from.

{chunk}

Return concise structured notes in Chinese, keeping English examples in English.""", 1800))
        source = "\n\n".join(evidence)
        prompt = f"""你是一名长期英语口语教练。请根据下面全部历史英文口语记录，生成一份中文的综合学习档案。

要求：
- 区分“已经比较稳定掌握”“值得继续积累”“反复出现、需要避免”的内容。
- 只把标注为 User 的话当作学习者表达；Coach 的话只用于理解上下文，不能算作用户掌握的句式或个人信息。
- 掌握的句式必须有历史证据，不要因为只出现一次就断言已掌握；证据不足时明确写“开始尝试”。
- usefulPhrases 给出适合用户真实场景、可以直接开口使用的英文短语。
- avoidUsages 指出历史中确实出现或点评中反复提到的不自然/错误用法，并给出自然替换。
- recurringIssues 综合多次记录；只有一条记录时要说明样本有限。
- personalContext 只保留用户在对话中明确说过、且有助于后续陪练的非敏感背景或偏好；不要推断。
- conversationMemory 用英文写成不超过 220 词的教练背景说明，包含用户已知背景、偏好、优势、反复问题和下一步目标，供下次实时对话使用。不要包含分数或逐字转录。
- 每个数组最多 6 项，nextPlan 正好 4 项，建议要具体可练。

历史记录数：{len(sessions)}

历史材料：
{source}
"""
        output = await self.text(key, prompt, 3600, LEARNING_PROFILE_SCHEMA)
        profile = parse_analysis(output)
        if not isinstance(profile.get("conversationMemory"), str):
            raise HTTPException(502, "综合建议生成格式异常，请重试。")
        return profile


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

    @asynccontextmanager
    async def lifespan(app):
        app.state.config_lock = asyncio.Lock()
        app.state.learning_profile_lock = asyncio.Lock()
        async with httpx.AsyncClient(transport=transport, timeout=httpx.Timeout(120, connect=20)) as client:
            app.state.openai = OpenAIService(client)
            yield

    app = FastAPI(title="Speak Room", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store

    async def ensure_learning_profile(key, force=False):
        async with app.state.learning_profile_lock:
            current = await run_in_threadpool(store.load_learning_profile)
            if not current["recordCount"]:
                if force:
                    raise HTTPException(400, "还没有可用于总结的英文对话文本。")
                return current
            if current["available"] and not current["stale"] and not force:
                return current
            sessions = await run_in_threadpool(store.english_history)
            profile = await app.state.openai.generate_learning_profile(key, sessions)
            return await run_in_threadpool(store.save_learning_profile, profile, sessions)

    async def realtime_options(key, options):
        use_memory = str(options.get("useMemory", "1")).lower() not in ("0", "false", "off")
        if use_memory:
            memory = await ensure_learning_profile(key)
            profile = memory.get("profile") or {}
            options["memory"] = profile.get("conversationMemory") or ""
        return options

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
                "textModel": os.environ.get("OPENAI_TEXT_MODEL") or DEFAULT_TEXT_MODEL,
                "translateModel": os.environ.get("OPENAI_TRANSLATE_MODEL") or DEFAULT_TRANSLATE_MODEL,
                "modelOptions": MODEL_OPTIONS}

    @app.post("/api/config/api-key")
    async def save_key(request: Request):
        body = await read_body(request)
        key = str(body.get("apiKey") or "").strip()
        if not re.fullmatch(r"sk-[A-Za-z0-9_-]+", key):
            raise HTTPException(400, "Enter a valid OpenAI API key.")
        async with app.state.config_lock:
            def write_key():
                path = root / ".env.local"
                update_env_file(path, {"OPENAI_API_KEY": key})
            await run_in_threadpool(write_key)
            os.environ["OPENAI_API_KEY"] = key
        return {"keyPresent": True}

    @app.post("/api/config/models")
    async def save_models(request: Request):
        body = await read_body(request)
        selected = {}
        for field, env_name in MODEL_ENV_NAMES.items():
            value = str(body.get(field) or "").strip()
            if value not in MODEL_OPTIONS[field]:
                raise HTTPException(400, f"Unsupported model for {field}.")
            selected[field] = value
        async with app.state.config_lock:
            values = {MODEL_ENV_NAMES[field]: value for field, value in selected.items()}
            await run_in_threadpool(update_env_file, root / ".env.local", values)
            for name, value in values.items():
                os.environ[name] = value
        return selected

    @app.post("/api/realtime-token")
    async def token(request: Request):
        key = api_key()
        options = await realtime_options(key, await read_body(request))
        return await app.state.openai.token(key, options)

    @app.post("/api/realtime-connect")
    async def connect(request: Request):
        key = api_key()
        sdp = await read_body(request, 2 * 1024 * 1024, as_text=True)
        options = await realtime_options(key, dict(request.query_params))
        answer = await app.state.openai.connect(key, sdp, options)
        return Response(answer, media_type="application/sdp")

    @app.get("/api/learning-profile")
    async def learning_profile():
        return await run_in_threadpool(store.load_learning_profile)

    @app.post("/api/learning-profile/ensure")
    async def ensure_profile():
        return await ensure_learning_profile(api_key())

    @app.post("/api/learning-profile/generate")
    async def generate_profile():
        return await ensure_learning_profile(api_key(), force=True)

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

    app.mount("/", DevelopmentStaticFiles(directory=ROOT / "public", html=True), name="public")
    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host=os.environ.get("HOST") or "127.0.0.1", port=int(os.environ.get("PORT") or 4000))
