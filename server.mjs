import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const recordingsDir = path.join(__dirname, "recordings");
const sessionsDir = path.join(__dirname, "practice-sessions");
const envPath = path.join(__dirname, ".env.local");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const defaultRealtimeModel = "gpt-realtime-2.1-mini";
const defaultTextModel = "gpt-5.6-luna";

const mandarinReadingBank = [
  {
    title: "我的愿望",
    text: "每个人心里都有一个愿望。小时候，我的愿望常常变来变去，有时想当医生，有时想当老师，有时又想去很远的地方旅行。长大以后，我慢慢明白，愿望不一定要非常宏大，它也可以是每天坚持读书，认真完成一件小事，或者让自己变得更有耐心。一个清楚的愿望，像一盏灯，提醒我们在忙碌和犹豫的时候，仍然知道应该往哪里走。",
  },
  {
    title: "我喜欢的季节",
    text: "一年四季各有不同的美。春天的风很轻，树枝上慢慢长出新叶；夏天的雨来得突然，空气里有一种热烈的气息；秋天最适合散步，阳光不刺眼，天空显得格外高远；冬天虽然寒冷，却让人更珍惜屋里的温暖。我最喜欢秋天，因为它不像夏天那样急促，也不像冬天那样沉静。秋天让人愿意放慢脚步，认真看看身边的变化。",
  },
  {
    title: "谈谈卫生与健康",
    text: "健康的生活离不开良好的卫生习惯。每天按时吃饭、保证睡眠、适当运动，看起来都是普通的小事，却会长期影响一个人的精神状态。保持卫生也不只是为了自己，它还关系到周围人的感受。比如咳嗽时遮住口鼻，饭前洗手，定期整理房间，都是对生活负责的表现。真正的健康，不只是没有生病，更是身体和心情都处在比较稳定的状态。",
  },
  {
    title: "我的朋友",
    text: "朋友不一定每天都见面，却常常在重要的时候给人支持。我有一个朋友，性格开朗，做事认真。遇到问题时，他不会急着评价别人，而是先把事情听清楚，再慢慢说出自己的看法。和他相处久了，我也学会了更加耐心地听别人说话。真正的朋友，不只是一起分享快乐的人，也是能提醒我们变得更好的人。",
  },
  {
    title: "难忘的一次旅行",
    text: "有一次旅行让我印象很深。那天清晨，我们坐车去一座山脚下的小镇。路上雾气很重，远处的房屋和树木都像隔着一层薄纱。到达以后，天气慢慢放晴，山路旁开着许多不知名的小花。旅行的意义，有时不在于去了多远的地方，而在于离开熟悉的环境以后，重新发现自己对世界的好奇。",
  },
  {
    title: "学习普通话的体会",
    text: "学习普通话不是简单地把每个字读出来，而是要注意声母、韵母、声调和语流的配合。有些字单独读时并不难，可是一放进句子里，就容易因为速度太快而变得含糊。练习朗读时，我会先把容易读错的词圈出来，再放慢速度读几遍。等发音稳定以后，再逐渐加快。这样一步一步练习，表达才会越来越清楚自然。",
  },
  {
    title: "保护环境",
    text: "保护环境并不是一句口号，而是和每个人的日常生活有关。节约用水、减少浪费、随手关灯、尽量少使用一次性物品，这些事情看起来很小，却能慢慢形成一种习惯。环境的改变不会在一天之内发生，但如果更多人愿意从身边的小事做起，干净的街道、清新的空气和安静的社区，就会离我们越来越近。",
  },
  {
    title: "科技与生活",
    text: "科技正在改变我们的生活。过去，很多事情需要花很长时间才能完成，现在只要一部手机，就可以查资料、买东西、联系朋友。科技带来了方便，也提醒我们要学会选择。过度依赖设备，可能会让人减少思考和交流。因此，好的科技使用方式，不是让机器替我们安排一切，而是帮助我们更有效地学习、工作和生活。",
  },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

await loadEnvFile(".env");
await loadEnvFile(".env.local");
await fs.mkdir(recordingsDir, { recursive: true });
await fs.mkdir(sessionsDir, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, 200, {
        keyPresent: Boolean(getApiKey()),
        realtimeModel: process.env.OPENAI_REALTIME_MODEL || defaultRealtimeModel,
        textModel: process.env.OPENAI_TEXT_MODEL || defaultTextModel,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/config/api-key") {
      const body = await readJson(req);
      const apiKey = String(body.apiKey || "").trim();
      if (!apiKey || !/^sk-[A-Za-z0-9_-]+/.test(apiKey)) {
        return sendJson(res, 400, { error: "Enter a valid OpenAI API key." });
      }

      await writeEnvValue("OPENAI_API_KEY", apiKey);
      process.env.OPENAI_API_KEY = apiKey;
      return sendJson(res, 200, { keyPresent: true });
    }

    if (req.method === "POST" && url.pathname === "/api/realtime-token") {
      const apiKey = getApiKey();
      if (!apiKey) return sendJson(res, 401, { error: "OPENAI_API_KEY is not configured." });

      const body = await readJson(req);
      const token = await createRealtimeClientSecret(apiKey, {
        voice: body.voice || "marin",
        pace: body.pace || "lively",
        topic: body.topic || "open practice",
      });
      return sendJson(res, 200, token);
    }

    if (req.method === "POST" && url.pathname === "/api/realtime-connect") {
      const apiKey = getApiKey();
      if (!apiKey) return sendJson(res, 401, { error: "OPENAI_API_KEY is not configured." });

      const sdp = await readText(req, 2 * 1024 * 1024);
      const answer = await createRealtimeCall(apiKey, sdp, {
        voice: url.searchParams.get("voice") || "marin",
        pace: url.searchParams.get("pace") || "lively",
        topic: url.searchParams.get("topic") || "open practice",
      });
      return sendText(res, 200, answer, "application/sdp");
    }

    if (req.method === "POST" && url.pathname === "/api/reading/generate") {
      const body = await readJson(req);
      const material = generateMandarinReading(body);
      return sendJson(res, 200, material);
    }

    if (req.method === "POST" && url.pathname === "/api/analyze") {
      const apiKey = getApiKey();
      if (!apiKey) return sendJson(res, 401, { error: "OPENAI_API_KEY is not configured." });

      const body = await readJson(req, 30 * 1024 * 1024);
      const result = await analyzePractice(apiKey, body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/sessions") {
      const body = await readJson(req, 30 * 1024 * 1024);
      const saved = await savePracticeSession(body);
      return sendJson(res, 200, saved);
    }

    if (req.method === "GET" && url.pathname === "/api/sessions") {
      const sessions = await listPracticeSessions();
      return sendJson(res, 200, { rootDir: sessionsDir, sessions });
    }

    const reanalyzeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/reanalyze$/);
    if (req.method === "POST" && reanalyzeMatch) {
      const apiKey = getApiKey();
      if (!apiKey) return sendJson(res, 401, { error: "OPENAI_API_KEY is not configured." });

      const saved = await reanalyzePracticeSession(apiKey, reanalyzeMatch[1]);
      return sendJson(res, 200, saved);
    }

    const deleteSessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (req.method === "DELETE" && deleteSessionMatch) {
      const deleted = await deletePracticeSession(deleteSessionMatch[1]);
      return sendJson(res, 200, deleted);
    }

    const sessionFileMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/files\/([^/]+)$/);
    if ((req.method === "GET" || req.method === "HEAD") && sessionFileMatch) {
      const [, sessionId, fileName] = sessionFileMatch;
      return serveSessionFile(sessionId, fileName, req, res, req.method === "HEAD");
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(url.pathname, res, req.method === "HEAD");
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(port, host, () => {
  console.log(`Speak Room is running at http://${host}:${port}`);
});

async function createRealtimeClientSecret(apiKey, options) {
  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: realtimeSessionConfig(options),
    }),
  });

  const data = await parseOpenAIResponse(response);
  return {
    value: data.value,
    expiresAt: data.expires_at,
    model: data.session?.model || process.env.OPENAI_REALTIME_MODEL || defaultRealtimeModel,
  };
}

async function createRealtimeCall(apiKey, sdp, options) {
  if (!sdp.includes("v=0")) throw new Error("Invalid WebRTC SDP offer.");

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(realtimeSessionConfig(options)));

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Safety-Identifier": "local-speak-room",
    },
    body: form,
  });

  const answer = await response.text();
  if (!response.ok) {
    let message = answer;
    try {
      const parsed = JSON.parse(answer);
      message = parsed.error?.message || parsed.error || message;
    } catch {
    }
    throw new Error(message || `Realtime call failed with ${response.status}`);
  }
  if (!answer.includes("v=0")) throw new Error("Realtime call did not return a valid SDP answer.");
  return answer;
}

function realtimeSessionConfig(options) {
  const instructions = [
    "You are the English Speaking Room companion for a Chinese international student studying in Singapore.",
    "Keep the interaction live, playful, and useful for spoken English practice.",
    "Ask one short question at a time, invite the user to answer aloud, and adapt to their level.",
    "Use natural turn-taking. If the user pauses briefly, wait; if they finish, respond with concise feedback and a follow-up.",
    "Help with pronunciation, word choice, fluency, and confidence without turning the conversation into a lecture.",
    "Use campus, housing, food court, clinic, interview, and cross-cultural scenes when they fit.",
    `Practice theme: ${options.topic}.`,
    `Speaking energy: ${options.pace}.`,
  ].join(" ");

  return {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL || defaultRealtimeModel,
    instructions,
    output_modalities: ["audio"],
    max_output_tokens: 900,
    audio: {
      input: {
        transcription: {
          model: "gpt-4o-mini-transcribe",
          language: "en",
          prompt: "English speaking practice with everyday learner phrasing.",
        },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "medium",
          create_response: true,
          interrupt_response: true,
        },
        noise_reduction: { type: "near_field" },
      },
      output: {
        voice: options.voice,
        speed: options.pace === "calm" ? 0.94 : options.pace === "quick" ? 1.08 : 1,
      },
    },
  };
}

function generateMandarinReading() {
  const best = mandarinReadingBank[Math.floor(Math.random() * mandarinReadingBank.length)];
  const text = best.text;
  const targetChars = countChineseChars(text);
  const targetSeconds = clamp(Math.round(targetChars / 3.1), 45, 120);

  return {
    title: best.title,
    source: "普通话水平测试风格本地素材",
    text,
    targetSeconds,
    targetChars,
  };
}

async function analyzePractice(apiKey, body) {
  const mode = body.mode === "mandarin" ? "mandarin" : "english";
  const transcript = String(body.transcript || "").trim();
  const referenceText = String(body.referenceText || "").trim();
  const topic = String(body.topic || "").trim();
  let audioTranscript = "";
  let transcriptionNotes = "";

  if (mode === "english" && body.userAudioBase64) {
    const transcription = await transcribeAudio(apiKey, body.userAudioBase64, body.userMimeType, "en", { includeLogprobs: true });
    audioTranscript = transcription.text;
    transcriptionNotes = summarizeTranscriptionConfidence(transcription);
  } else if (body.audioBase64 && (mode === "mandarin" || !transcript)) {
    const transcription = await transcribeAudio(apiKey, body.audioBase64, body.mimeType, mode === "mandarin" ? "zh" : "en");
    audioTranscript = transcription.text;
  }

  const spokenText = audioTranscript || transcript || "(No transcript captured.)";
  const displayTranscript = mode === "english" ? transcript || spokenText : spokenText;
  const prompt =
    mode === "mandarin"
      ? `你是普通话朗读教练。根据原文和识别文本，给出中文点评。
原文：
${referenceText}

识别文本：
${spokenText}

重点要求：
- 不要输出完整识别文本。
- 先评价发音清晰度，再评价节奏、气息和流畅度。
- 根据原文与识别结果的差异，指出可能没说清楚的词或短语。
- 重点检查 z/c/s 和 zh/ch/sh/r 的平翘舌，n/l/r 的声母稳定性，an/ang、en/eng、in/ing 的前后鼻音，二声/三声/四声的声调到位程度，轻声和连读吞字。
- 对可能的问题给出口腔位置建议，但必须用“可能、建议检查”这类措辞，不要假装能精确看到舌位。
- 反馈要像普通话考试练习教练，具体、短句、可执行。
- 每个文字字段控制在 1-2 句；unclearWords 最多 5 项；drills 正好 4 条。`
      : `You are an English speaking coach for a Chinese learner. Review the USER's spoken English performance from this realtime practice transcript.
Practice topic: ${topic || "general conversation"}
Conversation transcript:
${transcript || "(Conversation transcript was not captured.)"}

User-only audio transcription:
${audioTranscript || "(User-only audio was not available; use the transcript only.)"}

Possible low-confidence audio words or fragments:
${transcriptionNotes || "(No low-confidence audio fragments were available.)"}

Requirements:
- Focus on the user's speaking, not the coach's lines.
- Do not quote the full transcript.
- Start with the biggest pronunciation or clarity improvement opportunity if audio evidence is available.
- Use the user-only audio transcription and low-confidence fragments to identify likely unclear words, dropped endings, stress issues, rhythm problems, and hesitation patterns.
- Give practical feedback on pronunciation clarity, rhythm, word stress, linking, hesitation, word choice, grammar patterns, and better natural phrases.
- When audio evidence is missing or ambiguous, phrase it as likely clarity issues, not certain phonetic diagnosis.
- Keep the feedback concrete and short enough to act on before the next practice.
- Keep every text field to 1-2 short sentences. Use at most 5 unclear words, exactly 3 natural phrases, exactly 4 drills.

Return fields: summary, score, pronunciation, unclearWords, stressAndRhythm, fluency, vocabulary, grammar, naturalPhrases, keyMoments, nextDrills.
score is 0-100. unclearWords is an array of likely unclear words or short phrases. naturalPhrases is an array of 3 improved expressions. keyMoments is an array of likely weak moments. nextDrills is 4 short speaking drills.`;

  const data = await createTextResponse(apiKey, prompt, 2600, feedbackJsonSchema(mode));
  const outputText = extractResponseText(data);
  const parsed = parseJsonFromText(outputText);
  return {
    mode,
    transcript: displayTranscript,
    analysis: parsed || fallbackAnalysis(outputText),
  };
}

async function reanalyzePracticeSession(apiKey, rawSessionId) {
  const sessionId = safeSessionId(rawSessionId);
  if (!sessionId) throw new Error("Invalid session id.");

  const sessionDir = path.join(sessionsDir, sessionId);
  const metadataPath = path.join(sessionDir, "metadata.json");
  const metadata = await readExistingMetadata(metadataPath);
  if (!metadata.id) throw new Error("Practice session not found.");

  let audioBase64 = "";
  let mimeType = "";
  let userAudioBase64 = "";
  let userMimeType = "";
  if (metadata.audioFile) {
    const audioPath = path.join(sessionDir, metadata.audioFile);
    const audio = await fs.readFile(audioPath);
    audioBase64 = audio.toString("base64");
    mimeType = audioMimeType(path.extname(audioPath)) || "audio/webm";
  }
  if (metadata.userAudioFile) {
    const userAudioPath = path.join(sessionDir, metadata.userAudioFile);
    const userAudio = await fs.readFile(userAudioPath);
    userAudioBase64 = userAudio.toString("base64");
    userMimeType = audioMimeType(path.extname(userAudioPath)) || "audio/webm";
  }

  const result = await analyzePractice(apiKey, {
    mode: metadata.mode,
    topic: metadata.title,
    referenceText: metadata.referenceText,
    transcript: metadata.transcript,
    audioBase64,
    mimeType,
    userAudioBase64,
    userMimeType,
  });

  return savePracticeSession({
    sessionId,
    mode: metadata.mode,
    title: metadata.title,
    referenceText: metadata.referenceText,
    transcript: result.transcript,
    analysis: result.analysis,
    durationMs: metadata.durationMs,
  });
}

async function createTextResponse(apiKey, input, maxOutputTokens, format) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || defaultTextModel,
      input,
      max_output_tokens: maxOutputTokens,
      ...(format ? { text: { format } } : {}),
    }),
  });

  return parseOpenAIResponse(response);
}

async function transcribeAudio(apiKey, audioBase64, mimeType, language, options = {}) {
  const buffer = Buffer.from(stripDataUrl(audioBase64), "base64");
  const blob = new Blob([buffer], { type: mimeType || "audio/webm" });
  const form = new FormData();
  form.append("file", blob, `practice.${extensionFromMime(mimeType)}`);
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  form.append("language", language);
  if (options.includeLogprobs) form.append("include[]", "logprobs");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const data = await parseOpenAIResponse(response);
  return {
    text: String(data.text || "").trim(),
    logprobs: Array.isArray(data.logprobs) ? data.logprobs : [],
  };
}

async function savePracticeSession(body) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mode = body.mode === "mandarin" ? "mandarin" : "english";
  const id = safeSessionId(body.sessionId) || `${stamp}-${mode}`;
  const sessionDir = path.join(sessionsDir, id);
  await fs.mkdir(sessionDir, { recursive: true });

  const existing = await readExistingMetadata(path.join(sessionDir, "metadata.json"));
  let audioPath = null;
  let userAudioPath = null;

  if (body.audioBase64) {
    const ext = extensionFromMime(body.mimeType);
    audioPath = path.join(sessionDir, `audio.${ext}`);
    await fs.writeFile(audioPath, Buffer.from(stripDataUrl(body.audioBase64), "base64"));
  } else if (existing.audioFile) {
    audioPath = path.join(sessionDir, existing.audioFile);
  }

  if (body.userAudioBase64) {
    const ext = extensionFromMime(body.userMimeType);
    userAudioPath = path.join(sessionDir, `user_audio.${ext}`);
    await fs.writeFile(userAudioPath, Buffer.from(stripDataUrl(body.userAudioBase64), "base64"));
  } else if (existing.userAudioFile) {
    userAudioPath = path.join(sessionDir, existing.userAudioFile);
  }

  const referenceText = String(body.referenceText || existing.referenceText || "");
  const transcript = String(body.transcript || existing.transcript || "");
  const analysis = body.analysis || existing.analysis || null;
  const score = normalizeScore(body.score ?? analysis?.score ?? existing.score);
  const scoreTag = score === null ? "" : `${score}分`;

  if (referenceText) {
    await fs.writeFile(path.join(sessionDir, "reference.txt"), referenceText);
  }

  if (transcript) {
    await fs.writeFile(path.join(sessionDir, "transcript.txt"), transcript);
  }

  if (analysis) {
    await fs.writeFile(path.join(sessionDir, "analysis.json"), JSON.stringify(analysis, null, 2));
  }

  const metadata = {
    id,
    mode,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: String(body.title || existing.title || ""),
    durationMs: Number(body.durationMs || existing.durationMs || 0),
    score,
    scoreTag,
    referenceText,
    transcript,
    analysis,
    audioFile: audioPath ? path.basename(audioPath) : null,
    userAudioFile: userAudioPath ? path.basename(userAudioPath) : null,
    files: {
      audio: audioPath ? path.basename(audioPath) : null,
      userAudio: userAudioPath ? path.basename(userAudioPath) : null,
      reference: referenceText ? "reference.txt" : null,
      transcript: transcript ? "transcript.txt" : null,
      analysis: analysis ? "analysis.json" : null,
      metadata: "metadata.json",
    },
  };
  const metadataPath = path.join(sessionDir, "metadata.json");
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  return {
    id,
    sessionDir,
    metadataPath,
    audioPath,
    userAudioPath,
    analysis,
  };
}

async function deletePracticeSession(rawSessionId) {
  const sessionId = safeSessionId(rawSessionId);
  if (!sessionId) throw new Error("Invalid session id.");

  const sessionDir = path.normalize(path.join(sessionsDir, sessionId));
  if (!sessionDir.startsWith(`${sessionsDir}${path.sep}`)) {
    throw new Error("Invalid session path.");
  }

  try {
    await fs.rm(sessionDir, { recursive: true, force: false });
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("Practice session not found.");
    throw error;
  }

  return { id: sessionId, deleted: true };
}

async function listPracticeSessions() {
  const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metadataPath = path.join(sessionsDir, entry.name, "metadata.json");
    const metadata = await readExistingMetadata(metadataPath);
    if (metadata.id) {
      sessions.push({
        id: metadata.id,
        mode: metadata.mode,
        title: metadata.title,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        sessionDir: path.join(sessionsDir, entry.name),
        durationMs: Number(metadata.durationMs || 0),
        score: normalizeScore(metadata.score ?? metadata.analysis?.score),
        scoreTag: metadata.scoreTag || scoreTagFromAnalysis(metadata.analysis),
        referenceText: metadata.referenceText || "",
        transcript: metadata.transcript || "",
        analysis: metadata.analysis || null,
        files: metadata.files,
      });
    }
  }
  return sessions.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function serveSessionFile(sessionId, fileName, req, res, headOnly = false) {
  const safeId = safeSessionId(sessionId);
  const safeFile = safeSessionFile(fileName);
  if (!safeId || !safeFile) return sendText(res, 404, "Not found");

  const filePath = path.join(sessionsDir, safeId, safeFile);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(path.join(sessionsDir, safeId))) return sendText(res, 403, "Forbidden");

  try {
    const stat = await fs.stat(normalized);
    const type = mimeTypes[path.extname(normalized)] || audioMimeType(path.extname(normalized)) || "application/octet-stream";
    if (type.startsWith("audio/")) {
      return sendRangedFile(req, res, normalized, stat.size, type, headOnly);
    }

    const data = await fs.readFile(normalized);
    sendBuffer(res, 200, headOnly ? null : data, type, { "Content-Length": stat.size });
  } catch {
    sendText(res, 404, "Not found");
  }
}

function sendRangedFile(req, res, filePath, fileSize, type, headOnly) {
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": fileSize,
      "Accept-Ranges": "bytes",
    });
    if (headOnly) return res.end();
    return createReadStream(filePath).pipe(res);
  }

  const match = String(range).match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    res.writeHead(416, { "Content-Range": `bytes */${fileSize}` });
    return res.end();
  }

  const requestedStart = match[1] ? Number(match[1]) : 0;
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;
  const start = Math.max(0, Math.min(requestedStart, fileSize - 1));
  const end = Math.max(start, Math.min(requestedEnd, fileSize - 1));
  const chunkSize = end - start + 1;

  res.writeHead(206, {
    "Content-Type": type,
    "Content-Length": chunkSize,
    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
    "Accept-Ranges": "bytes",
  });
  if (headOnly) return res.end();
  return createReadStream(filePath, { start, end }).pipe(res);
}

async function readExistingMetadata(metadataPath) {
  try {
    return JSON.parse(await fs.readFile(metadataPath, "utf8"));
  } catch {
    return {};
  }
}

async function serveStatic(requestPath, res, headOnly = false) {
  const pathname = decodeURIComponent(requestPath === "/" ? "/index.html" : requestPath);
  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir)) return sendText(res, 403, "Forbidden");

  try {
    const data = await fs.readFile(filePath);
    sendBuffer(res, 200, headOnly ? null : data, mimeTypes[path.extname(filePath)] || "application/octet-stream");
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function parseOpenAIResponse(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(data.error?.message || data.error || `OpenAI request failed with ${response.status}`);
  }

  return data;
}

async function loadEnvFile(filename) {
  try {
    const raw = await fs.readFile(path.join(__dirname, filename), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = unquoteEnv(match[2]);
    }
  } catch {
  }
}

async function writeEnvValue(name, value) {
  let raw = "";
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch {
  }

  const line = `${name}=${quoteEnv(value)}`;
  const lines = raw ? raw.split(/\r?\n/) : [];
  let replaced = false;
  const next = lines.map((existing) => {
    if (existing.match(new RegExp(`^\\s*${name}\\s*=`))) {
      replaced = true;
      return line;
    }
    return existing;
  });
  if (!replaced) next.push(line);
  await fs.writeFile(envPath, next.filter((lineText, index) => lineText || index < next.length - 1).join("\n") + "\n", { mode: 0o600 });
}

function getApiKey() {
  return process.env.OPENAI_API_KEY?.trim();
}

function quoteEnv(value) {
  return JSON.stringify(value);
}

function unquoteEnv(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function readJson(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });
    req.on("error", reject);
  });
}

function readText(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  sendText(res, status, JSON.stringify(data), "application/json; charset=utf-8");
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(text);
}

function sendBuffer(res, status, buffer, type, headers = {}) {
  res.writeHead(status, { "Content-Type": type, ...headers });
  res.end(buffer || undefined);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function extractResponseText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
      if (typeof content.output_text === "string") chunks.push(content.output_text);
    }
  }
  return chunks.join("\n").trim();
}

function summarizeTranscriptionConfidence(transcription) {
  const uncertain = transcription.logprobs
    .filter((item) => Number.isFinite(item.logprob) && item.logprob < -1.2)
    .map((item) => String(item.token || "").trim())
    .filter(Boolean)
    .slice(0, 24);
  if (!uncertain.length) return "";
  return uncertain.join(" ");
}

function feedbackJsonSchema(mode) {
  if (mode === "mandarin") {
    return {
      type: "json_schema",
      name: "mandarin_speaking_feedback",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "score", "pronunciation", "unclearWords", "flatRetroflex", "nasalFinals", "tone", "articulationAdvice", "rhythmAndBreath", "drills"],
        properties: {
          summary: { type: "string" },
          score: { type: "number" },
          pronunciation: { type: "string" },
          unclearWords: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["word", "issue", "advice"],
              properties: {
                word: { type: "string" },
                issue: { type: "string" },
                advice: { type: "string" },
              },
            },
          },
          flatRetroflex: { type: "string" },
          nasalFinals: { type: "string" },
          tone: { type: "string" },
          articulationAdvice: { type: "string" },
          rhythmAndBreath: { type: "string" },
          drills: { type: "array", items: { type: "string" } },
        },
      },
    };
  }

  return {
    type: "json_schema",
    name: "english_speaking_feedback",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "score", "pronunciation", "unclearWords", "stressAndRhythm", "fluency", "vocabulary", "grammar", "naturalPhrases", "keyMoments", "nextDrills"],
      properties: {
        summary: { type: "string" },
        score: { type: "number" },
        pronunciation: { type: "string" },
        unclearWords: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["word", "issue", "advice"],
            properties: {
              word: { type: "string" },
              issue: { type: "string" },
              advice: { type: "string" },
            },
          },
        },
        stressAndRhythm: { type: "string" },
        fluency: { type: "string" },
        vocabulary: { type: "string" },
        grammar: { type: "string" },
        naturalPhrases: { type: "array", items: { type: "string" } },
        keyMoments: { type: "array", items: { type: "string" } },
        nextDrills: { type: "array", items: { type: "string" } },
      },
    },
  };
}

function fallbackAnalysis(outputText) {
  const text = String(outputText || "").trim();
  if (!text) return { summary: "分析完成，但模型没有返回可显示文本。", score: null };
  if (looksLikeJson(text)) {
    return { summary: "点评生成被截断或格式异常，请在练习记录里点击“重新点评”。", score: null };
  }
  return { summary: text.slice(0, 900), score: null };
}

function looksLikeJson(text) {
  return /^\s*```?json/i.test(text) || /^\s*\{/.test(text) || /^\s*\[/.test(text);
}

function parseJsonFromText(text = "") {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function countChineseChars(text) {
  return (String(text).match(/[\u4e00-\u9fff]/g) || []).length;
}

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreTagFromAnalysis(analysis) {
  const score = normalizeScore(analysis?.score);
  return score === null ? "" : `${score}分`;
}

function asStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function safeSessionId(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_.-]+$/.test(text) ? text : "";
}

function safeSessionFile(value) {
  const text = String(value || "").trim();
  const allowed = new Set([
    "audio.webm",
    "audio.mp4",
    "audio.mp3",
    "audio.ogg",
    "audio.wav",
    "user_audio.webm",
    "user_audio.mp4",
    "user_audio.mp3",
    "user_audio.ogg",
    "user_audio.wav",
    "reference.txt",
    "transcript.txt",
    "analysis.json",
    "metadata.json",
  ]);
  return allowed.has(text) ? text : "";
}

function audioMimeType(ext) {
  if (ext === ".webm") return "audio/webm";
  if (ext === ".mp4") return "audio/mp4";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".wav") return "audio/wav";
  return "";
}

function stripDataUrl(value) {
  return String(value).replace(/^data:[^;]+;base64,/, "");
}

function extensionFromMime(mimeType = "") {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}
