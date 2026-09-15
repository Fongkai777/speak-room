import base64
from email import policy
from email.parser import BytesParser
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from server import CONTENT, create_app, load_env, normalize_score, parse_analysis


def multipart(request):
    message = BytesParser(policy=policy.default).parsebytes(
        f"Content-Type: {request.headers['content-type']}\r\n\r\n".encode() + request.content)
    return {part.get_param("name", header="content-disposition"): part.get_payload(decode=True)
            for part in message.iter_parts()}


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test-only"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.requests = []
        self.upstream_error = None
        self.feedback_text = '{"summary":"Helpful feedback","score":84}'
        self.app = create_app(self.root, transport=httpx.MockTransport(self.upstream), load_environment=False)
        self.client = TestClient(self.app)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def upstream(self, request):
        self.requests.append(request)
        if self.upstream_error == "timeout":
            raise httpx.ReadTimeout("timeout", request=request)
        if self.upstream_error == "network":
            raise httpx.ConnectError("offline", request=request)
        if self.upstream_error:
            return httpx.Response(429, json={"error": {"message": self.upstream_error}})
        if request.url.path.endswith("/calls"):
            return httpx.Response(201, text="v=0\r\ns=mock-answer\r\n")
        if request.url.path.endswith("/client_secrets"):
            return httpx.Response(200, json={"value": "ephemeral-test", "expires_at": 1234,
                                            "session": {"model": "test-realtime"}})
        if request.url.path.endswith("/transcriptions"):
            return httpx.Response(200, json={"text": "user spoken words", "logprobs": [
                {"token": "unclear", "logprob": -2}, {"token": "clear", "logprob": -0.1}]})
        payload = json.loads(request.content)
        result = self.feedback_text if "text" in payload else "Hello there."
        return httpx.Response(200, json={"output": [{"content": [{"type": "output_text", "text": result}]}]})

    def save(self, mode="english", **overrides):
        body = {"mode": mode, "title": "Test practice", "durationMs": 62000,
                "transcript": "User: hello", "audioBase64": base64.b64encode(b"0123456789").decode(),
                "mimeType": "audio/webm", **overrides}
        response = self.client.post("/api/sessions", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_static_and_config_keep_key_private(self):
        self.assertIn("<title>Speak Room</title>", self.client.get("/").text)
        self.assertEqual(self.client.head("/").content, b"")
        self.assertEqual(self.client.get("/app.js").status_code, 200)
        config = self.client.get("/api/config")
        self.assertTrue(config.json()["keyPresent"])
        self.assertNotIn("sk-test-only", config.text)
        for path in ("/.env.local", "/server.py", "/practice_content.json"):
            self.assertEqual(self.client.get(path).status_code, 404)

    def test_save_key_preserves_other_settings_and_permissions(self):
        path = self.root / ".env.local"
        path.write_text('OPENAI_TEXT_MODEL="custom"\nOPENAI_API_KEY="old"\n', encoding="utf-8")
        response = self.client.post("/api/config/api-key", json={"apiKey": "sk-unit-test"})
        self.assertEqual(response.json(), {"keyPresent": True})
        self.assertIn('OPENAI_TEXT_MODEL="custom"', path.read_text())
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(os.environ["OPENAI_API_KEY"], "sk-unit-test")
        self.assertEqual(self.client.post("/api/config/api-key", json={"apiKey": "invalid"}).status_code, 400)

    def test_missing_key_does_not_disable_local_practice(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            for endpoint in ("translate", "analyze", "realtime-token", "realtime-connect"):
                self.assertEqual(self.client.post("/api/" + endpoint, json={}).status_code, 401)
            self.assertEqual(self.client.post("/api/reading/generate", json={}).status_code, 200)
            self.save()

    def test_reading_bank_and_timer_preserved(self):
        for item in CONTENT["readingBank"]:
            with patch("server.random.choice", return_value=item):
                result = self.client.post("/api/reading/generate", json={}).json()
            self.assertEqual(result["text"], item["text"])
            self.assertGreater(result["targetChars"], 50)
            self.assertTrue(45 <= result["targetSeconds"] <= 120)

    def test_save_update_and_delete_preserve_audio_duration_and_score(self):
        saved = self.save(userAudioBase64=base64.b64encode(b"user-only").decode())
        result = self.client.post("/api/sessions", json={"sessionId": saved["id"], "mode": "english",
                                                       "analysis": {"summary": "Great", "score": 84}})
        self.assertEqual(result.status_code, 200)
        sessions = self.client.get("/api/sessions").json()["sessions"]
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["durationMs"], 62000)
        self.assertEqual(sessions[0]["scoreTag"], "84分")
        self.assertEqual(sessions[0]["files"]["userAudio"], "user_audio.webm")
        self.assertEqual(Path(saved["audioPath"]).read_bytes(), b"0123456789")
        self.assertEqual(self.client.delete("/api/sessions/" + saved["id"]).json()["deleted"], True)
        self.assertFalse(Path(saved["sessionDir"]).exists())
        self.assertEqual(self.client.get("/api/sessions").json()["sessions"], [])

    def test_legacy_records_read_without_migration(self):
        directory = self.root / "practice-sessions" / "2026-09-03T13-36-17-802Z-english"
        directory.mkdir()
        legacy = {"id": directory.name, "mode": "english", "createdAt": "2026-09-03T13:36:17.802Z",
                  "updatedAt": "2026-09-03T13:36:17.802Z", "title": "Legacy", "durationMs": 123456,
                  "score": None, "analysis": {"score": 72}, "files": {"audio": "audio.webm"}}
        raw = json.dumps(legacy).encode()
        (directory / "metadata.json").write_bytes(raw)
        result = self.client.get("/api/sessions").json()["sessions"][0]
        self.assertEqual(result["durationMs"], 123456)
        self.assertEqual(result["score"], 72)
        self.assertEqual(result["files"], legacy["files"])
        self.assertEqual((directory / "metadata.json").read_bytes(), raw)

    def test_audio_full_head_and_range_requests(self):
        saved = self.save()
        url = f"/api/sessions/{saved['id']}/files/audio.webm"
        full = self.client.get(url)
        self.assertEqual(full.content, b"0123456789")
        self.assertEqual(full.headers["content-length"], "10")
        self.assertEqual(full.headers["accept-ranges"], "bytes")
        head = self.client.head(url)
        self.assertEqual(head.headers["content-length"], "10")
        self.assertEqual(head.content, b"")
        for requested, expected, content_range in (("bytes=2-5", b"2345", "bytes 2-5/10"),
                                                    ("bytes=6-", b"6789", "bytes 6-9/10"),
                                                    ("bytes=-3", b"789", "bytes 7-9/10")):
            response = self.client.get(url, headers={"range": requested})
            self.assertEqual(response.status_code, 206)
            self.assertEqual(response.content, expected)
            self.assertEqual(response.headers["content-range"], content_range)
        self.assertEqual(self.client.get(url, headers={"range": "bytes=50-"}).status_code, 416)

    def test_path_and_upload_validation(self):
        for session_id in ("..", ".", "../outside", "/tmp/outside"):
            self.assertEqual(self.client.post("/api/sessions", json={"sessionId": session_id}).status_code, 400)
        saved = self.save()
        url = f"/api/sessions/{saved['id']}/files/"
        self.assertEqual(self.client.get(url + ".env.local").status_code, 404)
        with self.assertRaises(Exception):
            self.app.state.store.file(saved["id"], "../metadata.json")
        outside = self.root / "outside"
        outside.mkdir()
        (self.root / "practice-sessions" / "linked").symlink_to(outside, target_is_directory=True)
        self.assertEqual(self.client.delete("/api/sessions/linked").status_code, 400)
        self.assertTrue(outside.exists())
        self.assertEqual(self.client.post("/api/sessions", json={"audioBase64": "!!!"}).status_code, 400)
        self.assertEqual(self.client.post("/api/sessions", content="{").status_code, 400)
        self.assertEqual(self.client.post("/api/sessions", json=[]).status_code, 400)
        self.assertEqual(self.client.post("/api/translate", content=b" " * (1024 * 1024 + 1)).status_code, 413)

    def test_translation_all_directions(self):
        for direction in ("zh-en", "en-zh", "auto"):
            result = self.client.post("/api/translate", json={"text": "hello", "direction": direction})
            self.assertEqual(result.json(), {"direction": direction, "translated": "Hello there."})
        payload = json.loads(self.requests[-1].content)
        self.assertEqual(payload["max_output_tokens"], 500)
        self.assertNotIn("text", payload)
        self.assertEqual(self.client.post("/api/translate", json={"text": ""}).status_code, 400)
        self.assertEqual(self.client.post("/api/translate", json={"text": "x" * 1201}).status_code, 400)

    def test_realtime_sdp_and_session_contract(self):
        response = self.client.post("/api/realtime-connect?voice=marin&pace=calm&topic=free%20chat",
                                    content="v=0\r\ns=offer\r\n", headers={"content-type": "application/sdp"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("v=0", response.text)
        self.assertEqual(response.headers["content-type"], "application/sdp")
        fields = multipart(self.requests[-1])
        self.assertEqual(fields["sdp"], b"v=0\r\ns=offer\r\n")
        config = json.loads(fields["session"])
        self.assertEqual(config["audio"]["output"], {"voice": "marin", "speed": 0.94})
        self.assertTrue(config["audio"]["input"]["turn_detection"]["interrupt_response"])
        self.assertIn("free chat", config["instructions"])
        self.assertEqual(self.client.post("/api/realtime-connect", content="invalid").status_code, 400)

    def test_realtime_ephemeral_token_contract(self):
        result = self.client.post("/api/realtime-token", json={}).json()
        self.assertEqual(result, {"value": "ephemeral-test", "expiresAt": 1234, "model": "test-realtime"})
        self.assertEqual(json.loads(self.requests[-1].content)["expires_after"]["seconds"], 600)

    def test_english_analysis_uses_user_audio_and_structured_feedback(self):
        result = self.client.post("/api/analyze", json={"mode": "english", "transcript": "Full conversation",
            "userAudioBase64": base64.b64encode(b"user-only").decode(), "userMimeType": "audio/webm",
            "audioBase64": base64.b64encode(b"mixed").decode()})
        self.assertEqual(result.json()["analysis"]["score"], 84)
        self.assertEqual(result.json()["transcript"], "Full conversation")
        fields = multipart(self.requests[0])
        self.assertEqual(fields["file"], b"user-only")
        self.assertEqual(fields["include[]"], b"logprobs")
        self.assertEqual(fields["language"], b"en")
        payload = json.loads(self.requests[1].content)
        self.assertEqual(payload["text"]["format"], CONTENT["schemas"]["english"])
        self.assertIn("unclear", payload["input"])

    def test_mandarin_analysis_uses_reference_and_zh_transcription(self):
        result = self.client.post("/api/analyze", json={"mode": "mandarin", "referenceText": "朗读原文",
            "audioBase64": base64.b64encode(b"reading").decode(), "mimeType": "audio/wav"})
        self.assertEqual(result.json()["mode"], "mandarin")
        self.assertEqual(multipart(self.requests[0])["language"], b"zh")
        payload = json.loads(self.requests[1].content)
        self.assertIn("朗读原文", payload["input"])
        self.assertEqual(payload["text"]["format"], CONTENT["schemas"]["mandarin"])

    def test_reanalysis_updates_existing_record_not_audio(self):
        saved = self.save(userAudioBase64=base64.b64encode(b"user-only").decode())
        response = self.client.post(f"/api/sessions/{saved['id']}/reanalyze")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["id"], saved["id"])
        self.assertEqual(Path(saved["audioPath"]).read_bytes(), b"0123456789")
        record = self.client.get("/api/sessions").json()["sessions"][0]
        self.assertEqual(record["durationMs"], 62000)
        self.assertEqual(record["scoreTag"], "84分")

    def test_deleted_record_is_not_resurrected_by_analysis(self):
        saved = self.save()
        metadata, _ = self.app.state.store.analysis_input(saved["id"])
        self.app.state.store.delete(saved["id"])
        with self.assertRaises(Exception):
            self.app.state.store.save_feedback(saved["id"], metadata, {"transcript": "", "analysis": {"score": 90}})
        self.assertFalse(Path(saved["sessionDir"]).exists())

    def test_upstream_failures_keep_saved_record_and_return_readable_error(self):
        saved = self.save()
        for error, status in (("timeout", 504), ("network", 502), ("Quota exceeded", 502)):
            self.upstream_error = error
            response = self.client.post(f"/api/sessions/{saved['id']}/reanalyze")
            self.assertEqual(response.status_code, status)
            self.assertIsInstance(response.json()["error"], str)
            self.assertTrue(Path(saved["audioPath"]).exists())
        self.upstream_error = "Invalid API key: sk-test-only"
        self.assertNotIn("sk-test-only", self.client.post("/api/translate", json={"text": "hello"}).text)

    def test_truncated_feedback_never_displays_raw_json(self):
        self.feedback_text = '{"summary":"truncated'
        response = self.client.post("/api/analyze", json={"transcript": "User: hello"})
        analysis = response.json()["analysis"]
        self.assertIn("重新点评", analysis["summary"])
        self.assertIsNone(analysis["score"])
        self.assertEqual(parse_analysis('```json\n{"score":80}\n```')["score"], 80)

    def test_unscored_session_does_not_become_zero(self):
        self.save()
        record = self.client.get("/api/sessions").json()["sessions"][0]
        self.assertIsNone(record["score"])
        self.assertEqual(record["scoreTag"], "")
        self.assertEqual(normalize_score(0), 0)
        self.assertEqual(normalize_score(83.5), 84)

    def test_env_loading_preserves_existing_precedence(self):
        (self.root / ".env").write_text('TEST_SPEAK_VALUE="base"\n', encoding="utf-8")
        (self.root / ".env.local").write_text('TEST_SPEAK_VALUE="local"\nTEST_SPEAK_SECOND=local\n', encoding="utf-8")
        with patch.dict(os.environ, {}, clear=True):
            load_env(self.root)
            self.assertEqual(os.environ["TEST_SPEAK_VALUE"], "base")
            self.assertEqual(os.environ["TEST_SPEAK_SECOND"], "local")


if __name__ == "__main__":
    unittest.main()
