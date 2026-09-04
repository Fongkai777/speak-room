const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  config: null,
  english: {
    pc: null,
    dc: null,
    micStream: null,
    remoteStream: null,
    recorder: null,
    userRecorder: null,
    chunks: [],
    userChunks: [],
    audioBlob: null,
    userAudioBlob: null,
    messages: [],
    currentAssistant: "",
    currentUser: "",
    analyser: null,
    sessionId: "",
    startedAt: 0,
    durationMs: 0,
  },
  mandarin: {
    material: null,
    recorder: null,
    stream: null,
    chunks: [],
    audioBlob: null,
    timer: null,
    remaining: 0,
    transcript: "",
    sessionId: "",
    startedAt: 0,
    durationMs: 0,
    analyser: null,
    meterContext: null,
    meterTimer: null,
  },
};

const topicLibrary = {
  english: [
    {
      title: "课堂发言",
      prompt: "speaking up in a Singapore university tutorial when I partly disagree with a classmate",
      detail: "表达不同意见、接话、礼貌打断",
    },
    {
      title: "Group project",
      prompt: "coordinating a group project with local Singaporean classmates when deadlines are tight",
      detail: "分工、催进度、协商语气",
    },
    {
      title: "找教授沟通",
      prompt: "asking a professor for feedback after receiving a confusing grade",
      detail: "预约、解释困惑、争取建议",
    },
    {
      title: "租房看房",
      prompt: "viewing a rental room in Singapore and asking about contract terms, utilities, visitors, and repairs",
      detail: "押金、水电、维修、边界",
    },
    {
      title: "诊所看病",
      prompt: "visiting a clinic in Singapore and explaining symptoms, allergies, insurance, and follow-up questions",
      detail: "症状描述、确认医嘱",
    },
    {
      title: "银行与 Singpass",
      prompt: "asking customer service about bank account setup, card issues, and identity verification in Singapore",
      detail: "身份验证、问题描述",
    },
    {
      title: "实习面试",
      prompt: "an internship interview for a student role in Singapore, including self-introduction and project experience",
      detail: "自我介绍、经历追问",
    },
    {
      title: "Networking",
      prompt: "chatting with someone at a campus career fair and naturally introducing my background and goals",
      detail: "破冰、追问、交换联系",
    },
    {
      title: "Food court 点餐",
      prompt: "ordering at a busy Singapore hawker centre and handling questions about spice level and payment",
      detail: "快速反应、确认信息",
    },
    {
      title: "宿舍冲突",
      prompt: "talking to a roommate about noise, shared cleaning, and study time without sounding aggressive",
      detail: "边界、请求、缓和冲突",
    },
    {
      title: "小组展示 Q&A",
      prompt: "answering audience questions after a class presentation when I need a moment to think",
      detail: "拖延策略、澄清问题",
    },
    {
      title: "兼职/社团",
      prompt: "asking about joining a student club or part-time campus opportunity as an international student",
      detail: "兴趣表达、可用时间",
    },
  ],
};

const topicPage = {
  english: 0,
};

const els = {
  keyStatus: $("#keyStatus"),
  englishDot: $("#englishDot"),
  englishState: $("#englishState"),
  englishTranscript: $("#englishTranscript"),
  englishAnalysis: $("#englishAnalysis"),
  mandarinAnalysis: $("#mandarinAnalysis"),
  readingTitle: $("#readingTitle"),
  readingText: $("#readingText"),
  readingTimer: $("#readingTimer"),
  mandarinRecordState: $("#mandarinRecordState"),
  mandarinElapsed: $("#mandarinElapsed"),
  mandarinLevelBar: $("#mandarinLevelBar"),
  mandarinDb: $("#mandarinDb"),
  recordsList: $("#recordsList"),
  statsSummary: $("#statsSummary"),
  dailyStats: $("#dailyStats"),
  scoreTrend: $("#scoreTrend"),
  realtimeModel: $("#realtimeModel"),
  textModel: $("#textModel"),
  configMessage: $("#configMessage"),
};

init();

async function init() {
  bindTabs();
  bindEnglish();
  bindMandarin();
  bindConfig();
  bindTopics();
  renderTopicShelf("english");
  drawSignal();
  await refreshConfig();
}

function bindTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((item) => item.classList.remove("active"));
      $$(".panel").forEach((panel) => panel.classList.remove("active"));
      tab.classList.add("active");
      $(`#${tab.dataset.tab}Panel`).classList.add("active");
      if (tab.dataset.tab === "records") loadRecords();
      if (tab.dataset.tab === "stats") loadStats();
    });
  });
}

function bindEnglish() {
  $("#startEnglish").addEventListener("click", startEnglishSession);
  $("#stopEnglish").addEventListener("click", stopEnglishSession);
  $("#analyzeEnglish").addEventListener("click", analyzeEnglishSession);
}

function bindMandarin() {
  $("#generateReading").addEventListener("click", generateReading);
  $("#startReading").addEventListener("click", startReadingRecording);
  $("#stopReading").addEventListener("click", () => stopReadingRecording(true));
  $("#analyzeReading").addEventListener("click", analyzeReadingSession);
}

function bindConfig() {
  $("#apiKeyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("#apiKeyInput");
    els.configMessage.textContent = "保存中";
    try {
      await api("/api/config/api-key", { apiKey: input.value });
      input.value = "";
      els.configMessage.textContent = "已保存";
      await refreshConfig();
    } catch (error) {
      els.configMessage.textContent = error.message;
    }
  });
  $("#refreshRecords").addEventListener("click", loadRecords);
  $("#refreshStats").addEventListener("click", loadStats);
}

function bindTopics() {
  $("#shuffleEnglishTopics").addEventListener("click", () => {
    topicPage.english += 1;
    renderTopicShelf("english");
  });
}

function renderTopicShelf(mode) {
  const container = $("#englishTopics");
  const input = $("#englishTopic");
  const pageSize = 6;
  const topics = topicLibrary[mode];
  const start = (topicPage[mode] * pageSize) % topics.length;
  const visible = [...topics.slice(start), ...topics.slice(0, start)].slice(0, pageSize);
  container.innerHTML = "";

  visible.forEach((topic) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "topic-card";
    button.innerHTML = `<strong>${escapeHtml(topic.title)}</strong><span>${escapeHtml(topic.detail)}</span>`;
    button.addEventListener("click", () => {
      input.value = topic.prompt;
    });
    container.append(button);
  });
}

async function refreshConfig() {
  try {
    state.config = await fetch("/api/config").then((res) => res.json());
    setKeyStatus(state.config.keyPresent ? "live" : "error", state.config.keyPresent ? "Key 已配置" : "需要配置 Key");
    els.realtimeModel.textContent = state.config.realtimeModel;
    els.textModel.textContent = state.config.textModel;
  } catch {
    setKeyStatus("error", "配置不可用");
  }
}

async function startEnglishSession() {
  clearAnalysis(els.englishAnalysis);
  resetEnglishTranscript();
  setEnglishState("busy", "请求麦克风");

  try {
    const voice = $("#voiceSelect").value;
    const pace = $("#paceSelect").value;
    const topic = $("#englishTopic").value;

    const pc = new RTCPeerConnection();
    const remoteAudio = new Audio();
    remoteAudio.autoplay = true;
    const remoteStream = new MediaStream();
    remoteAudio.srcObject = remoteStream;

    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    micStream.getAudioTracks().forEach((track) => pc.addTrack(track, micStream));

    pc.ontrack = (event) => {
      event.streams[0].getAudioTracks().forEach((track) => remoteStream.addTrack(track));
      attachRemoteToRecorder(event.streams[0]);
    };

    const dc = pc.createDataChannel("oai-events");
    dc.addEventListener("open", () => {
      setEnglishState("live", `在线 · ${state.config?.realtimeModel || "Realtime"}`);
      sendStarterPrompt();
    });
    dc.addEventListener("message", handleRealtimeEvent);
    dc.addEventListener("close", () => {
      if (!state.english.lastError) setEnglishState("idle", "连接关闭");
    });
    dc.addEventListener("error", () => {
      state.english.lastError = "DataChannel error";
      setEnglishState("error", "连接通道错误");
    });

    pc.addEventListener("connectionstatechange", () => {
      console.info("Realtime connection state:", pc.connectionState);
      if (["failed", "disconnected"].includes(pc.connectionState)) {
        state.english.lastError = `WebRTC ${pc.connectionState}`;
        setEnglishState("error", "连接中断");
      }
    });

    state.english.pc = pc;
    state.english.dc = dc;
    state.english.micStream = micStream;
    state.english.remoteStream = remoteStream;
    startMixedRecorder(micStream);
    connectAnalyser(micStream);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const connectUrl = new URL("/api/realtime-connect", window.location.origin);
    connectUrl.searchParams.set("voice", voice);
    connectUrl.searchParams.set("pace", pace);
    connectUrl.searchParams.set("topic", topic);

    const sdpResponse = await fetch(connectUrl, {
      method: "POST",
      body: offer.sdp,
      headers: {
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) {
      let message = await sdpResponse.text();
      try {
        message = JSON.parse(message).error || message;
      } catch {
      }
      throw new Error(message);
    }

    await pc.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    $("#startEnglish").disabled = true;
    $("#stopEnglish").disabled = false;
    $("#analyzeEnglish").disabled = true;
  } catch (error) {
    state.english.lastError = error.message;
    console.error("English session failed:", error);
    setEnglishState("error", error.message);
    closeEnglishConnection();
  }
}

function sendStarterPrompt() {
  const dc = state.english.dc;
  if (!dc || dc.readyState !== "open") return;

  const topic = $("#englishTopic").value || "daily conversation";
  dc.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{
        type: "input_text",
        text: `Start an English speaking practice session about ${topic}. Greet me briefly, then ask one inviting spoken question.`,
      }],
    },
  }));
  dc.send(JSON.stringify({ type: "response.create" }));
}

async function stopEnglishSession() {
  setEnglishState("busy", "保存中");
  await stopRecorder("english");
  ensureEnglishDuration();
  closeEnglishConnection();
  const transcript = transcriptText(state.english.messages);
  const audioBase64 = state.english.audioBlob ? await blobToBase64(state.english.audioBlob) : "";
  const userAudioBase64 = state.english.userAudioBlob ? await blobToBase64(state.english.userAudioBlob) : "";
  const saved = await saveSession({
    mode: "english",
    title: $("#englishTopic").value,
    transcript,
    audioBase64,
    mimeType: state.english.audioBlob?.type,
    userAudioBase64,
    userMimeType: state.english.userAudioBlob?.type,
    durationMs: state.english.durationMs,
  });
  state.english.sessionId = saved?.id || "";
  loadRecords();
  setEnglishState("idle", "已保存");
  $("#startEnglish").disabled = false;
  $("#stopEnglish").disabled = true;
  $("#analyzeEnglish").disabled = false;
}

async function analyzeEnglishSession() {
  setEnglishState("busy", "分析中");
  try {
    const transcript = transcriptText(state.english.messages);
    const result = await api("/api/analyze", {
      mode: "english",
      topic: $("#englishTopic").value,
      transcript,
      audioBase64: state.english.audioBlob ? await blobToBase64(state.english.audioBlob) : "",
      mimeType: state.english.audioBlob?.type,
      userAudioBase64: state.english.userAudioBlob ? await blobToBase64(state.english.userAudioBlob) : "",
      userMimeType: state.english.userAudioBlob?.type,
      durationMs: state.english.durationMs,
    });
    renderAnalysis(els.englishAnalysis, result.analysis, result.transcript, true);
    const saved = await saveSession({
      sessionId: state.english.sessionId,
      mode: "english",
      title: $("#englishTopic").value,
      transcript: result.transcript,
      analysis: result.analysis,
      audioBase64: state.english.audioBlob ? await blobToBase64(state.english.audioBlob) : "",
      mimeType: state.english.audioBlob?.type,
      userAudioBase64: state.english.userAudioBlob ? await blobToBase64(state.english.userAudioBlob) : "",
      userMimeType: state.english.userAudioBlob?.type,
      durationMs: state.english.durationMs,
    });
    state.english.sessionId = saved?.id || state.english.sessionId;
    loadRecords();
    setEnglishState("idle", "分析完成");
  } catch (error) {
    setEnglishState("error", error.message);
  }
}

function handleRealtimeEvent(message) {
  const event = JSON.parse(message.data);

  if (event.type === "input_audio_buffer.speech_started") setEnglishState("live", "你在说话");
  if (event.type === "input_audio_buffer.speech_stopped") setEnglishState("busy", "正在回应");
  if (event.type === "response.done") setEnglishState("live", "轮到你了");
  if (event.type === "error") setEnglishState("error", event.error?.message || "Realtime error");

  if (event.type === "conversation.item.input_audio_transcription.delta") {
    state.english.currentUser += event.delta || "";
    renderDraft("user", state.english.currentUser);
  }

  if (event.type === "conversation.item.input_audio_transcription.completed") {
    commitMessage("user", event.transcript || state.english.currentUser);
    state.english.currentUser = "";
  }

  if (event.type === "response.output_audio_transcript.delta") {
    state.english.currentAssistant += event.delta || "";
    renderDraft("assistant", state.english.currentAssistant);
  }

  if (event.type === "response.output_audio_transcript.done") {
    commitMessage("assistant", event.transcript || state.english.currentAssistant);
    state.english.currentAssistant = "";
  }
}

async function generateReading() {
  clearAnalysis(els.mandarinAnalysis);
  $("#generateReading").disabled = true;
  els.readingTitle.textContent = "抽取中";
  els.readingText.textContent = "";

  try {
    const material = await api("/api/reading/generate", {
    });
    state.mandarin.material = material;
    els.readingTitle.textContent = material.title;
    els.readingText.textContent = material.text;
    els.readingTimer.textContent = formatSeconds(material.targetSeconds);
    $("#startReading").disabled = false;
  } catch (error) {
    els.readingTitle.textContent = "抽取失败";
    els.readingText.textContent = error.message;
  } finally {
    $("#generateReading").disabled = false;
  }
}

async function startReadingRecording() {
  if (!state.mandarin.material) return;
  clearAnalysis(els.mandarinAnalysis);
  state.mandarin.stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  state.mandarin.chunks = [];
  state.mandarin.audioBlob = null;
  state.mandarin.startedAt = performance.now();
  state.mandarin.durationMs = 0;
  setMandarinMeterState("录音中");
  state.mandarin.recorder = new MediaRecorder(state.mandarin.stream);
  state.mandarin.recorder.ondataavailable = (event) => {
    if (event.data.size) state.mandarin.chunks.push(event.data);
  };
  state.mandarin.recorder.onstop = () => {
    state.mandarin.durationMs = Math.max(0, Math.round(performance.now() - state.mandarin.startedAt));
    state.mandarin.audioBlob = new Blob(state.mandarin.chunks, { type: state.mandarin.recorder.mimeType || "audio/webm" });
    $("#analyzeReading").disabled = false;
  };
  state.mandarin.recorder.start(250);
  connectAnalyser(state.mandarin.stream, "mandarin");
  startMandarinMeter();
  startCountdown(state.mandarin.material.targetSeconds);
  $("#startReading").disabled = true;
  $("#stopReading").disabled = false;
  $("#analyzeReading").disabled = true;
}

async function stopReadingRecording(save) {
  clearInterval(state.mandarin.timer);
  stopMandarinMeter();
  if (state.mandarin.recorder?.state === "recording") state.mandarin.recorder.stop();
  state.mandarin.stream?.getTracks().forEach((track) => track.stop());
  state.mandarin.meterContext?.close?.();
  $("#startReading").disabled = false;
  $("#stopReading").disabled = true;
  setMandarinMeterState("已停止");

  if (save) {
    setTimeout(async () => {
      if (!state.mandarin.audioBlob) return;
      const saved = await saveSession({
        mode: "mandarin",
        title: state.mandarin.material?.title,
        referenceText: state.mandarin.material?.text,
        audioBase64: await blobToBase64(state.mandarin.audioBlob),
        mimeType: state.mandarin.audioBlob.type,
        durationMs: state.mandarin.durationMs,
      });
      state.mandarin.sessionId = saved?.id || "";
      loadRecords();
    }, 100);
  }
}

async function analyzeReadingSession() {
  if (!state.mandarin.material || !state.mandarin.audioBlob) return;
  els.mandarinAnalysis.classList.add("visible");
  els.mandarinAnalysis.textContent = "分析中";

  try {
    const result = await api("/api/analyze", {
      mode: "mandarin",
      referenceText: state.mandarin.material.text,
      audioBase64: await blobToBase64(state.mandarin.audioBlob),
      mimeType: state.mandarin.audioBlob.type,
    });
    renderAnalysis(els.mandarinAnalysis, result.analysis, "", false);
    const saved = await saveSession({
      sessionId: state.mandarin.sessionId,
      mode: "mandarin",
      title: state.mandarin.material.title,
      referenceText: state.mandarin.material.text,
      transcript: result.transcript,
      analysis: result.analysis,
      audioBase64: await blobToBase64(state.mandarin.audioBlob),
      mimeType: state.mandarin.audioBlob.type,
      durationMs: state.mandarin.durationMs,
    });
    state.mandarin.sessionId = saved?.id || state.mandarin.sessionId;
    loadRecords();
  } catch (error) {
    els.mandarinAnalysis.textContent = error.message;
  }
}

async function loadRecords() {
  if (!els.recordsList) return;
  els.recordsList.innerHTML = `<div class="empty-state">加载记录中</div>`;
  try {
    const response = await fetch("/api/sessions");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法加载练习记录");
    renderRecords(withPracticeNumbers(data.sessions || []));
  } catch (error) {
    els.recordsList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function loadStats() {
  if (!els.statsSummary || !els.dailyStats || !els.scoreTrend) return;
  els.statsSummary.innerHTML = `<div class="empty-state">加载统计中</div>`;
  els.dailyStats.innerHTML = "";
  els.scoreTrend.innerHTML = "";
  try {
    const response = await fetch("/api/sessions");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法加载练习统计");
    const sessions = withPracticeNumbers(await hydrateSessionDurations(data.sessions || []));
    renderStats(sessions);
  } catch (error) {
    els.statsSummary.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function hydrateSessionDurations(sessions) {
  const settled = await Promise.allSettled(sessions.map(async (session) => {
    if (Number(session.durationMs || 0) > 0 || !session.files?.audio) return session;
    const durationMs = await readAudioDurationMs(sessionFileUrl(session.id, session.files.audio));
    return { ...session, durationMs };
  }));
  return settled.map((result, index) => result.status === "fulfilled" ? result.value : sessions[index]);
}

function readAudioDurationMs(src) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      audio.removeAttribute("src");
      audio.load();
      resolve(value);
    };
    const tryDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        finish(Math.round(audio.duration * 1000));
        return true;
      }
      return false;
    };
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => {
      if (tryDuration()) return;
      const restoreTime = () => {
        audio.removeEventListener("timeupdate", restoreTime);
        audio.currentTime = 0;
        if (!tryDuration()) finish(0);
      };
      audio.addEventListener("timeupdate", restoreTime);
      try {
        audio.currentTime = 1e101;
      } catch {
        finish(0);
      }
    }, { once: true });
    audio.addEventListener("durationchange", tryDuration);
    audio.addEventListener("error", () => reject(new Error("无法读取音频时长")), { once: true });
    setTimeout(() => finish(0), 3500);
    audio.src = src;
  });
}

function withPracticeNumbers(sessions) {
  const counters = { english: 0, mandarin: 0 };
  const numberedById = new Map();
  [...sessions]
    .sort((a, b) => String(a.createdAt || a.updatedAt || a.id).localeCompare(String(b.createdAt || b.updatedAt || b.id)))
    .forEach((session) => {
      const mode = session.mode === "mandarin" ? "mandarin" : "english";
      counters[mode] += 1;
      numberedById.set(session.id, {
        practiceNumber: counters[mode],
        practiceCode: mode === "mandarin" ? `中${counters[mode]}` : `英${counters[mode]}`,
      });
    });

  return sessions.map((session) => ({
    ...session,
    ...(numberedById.get(session.id) || { practiceNumber: 0, practiceCode: "" }),
  }));
}

function renderStats(sessions) {
  if (!sessions.length) {
    els.statsSummary.innerHTML = `<div class="empty-state">还没有可统计的练习记录。</div>`;
    els.dailyStats.innerHTML = "";
    els.scoreTrend.innerHTML = "";
    return;
  }

  const englishMs = sumDuration(sessions, "english");
  const mandarinMs = sumDuration(sessions, "mandarin");
  const scored = sessions
    .map((session) => ({ ...session, score: scoreFromSession(session) }))
    .filter((session) => session.score !== null);
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, session) => sum + session.score, 0) / scored.length)
    : null;

  els.statsSummary.innerHTML = `
    <article class="stat-card">
      <span>总练习时长</span>
      <strong>${escapeHtml(formatDurationLong(englishMs + mandarinMs))}</strong>
    </article>
    <article class="stat-card english">
      <span>英语</span>
      <strong>${escapeHtml(formatDurationLong(englishMs))}</strong>
    </article>
    <article class="stat-card mandarin">
      <span>中文</span>
      <strong>${escapeHtml(formatDurationLong(mandarinMs))}</strong>
    </article>
    <article class="stat-card">
      <span>平均分</span>
      <strong>${averageScore === null ? "-" : `${averageScore}分`}</strong>
    </article>
  `;

  renderDailyStats(sessions);
  renderScoreTrend(scored);
}

function renderDailyStats(sessions) {
  const groups = new Map();
  sessions.forEach((session) => {
    const key = dateKey(session.createdAt || session.updatedAt);
    if (!groups.has(key)) groups.set(key, { english: 0, mandarin: 0, count: 0 });
    const group = groups.get(key);
    group[session.mode === "mandarin" ? "mandarin" : "english"] += Number(session.durationMs || 0);
    group.count += 1;
  });

  const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const margin = { top: 28, right: 24, bottom: 58, left: 68 };
  const width = Math.max(760, rows.length * 82 + margin.left + margin.right);
  const height = 280;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxMinutes = niceChartMax(Math.max(1, ...rows.flatMap(([, group]) => [
    group.english / 60000,
    group.mandarin / 60000,
  ])));
  const ticks = chartTicks(maxMinutes, 4);
  const groupWidth = plotWidth / Math.max(1, rows.length);
  const barWidth = Math.min(24, Math.max(10, groupWidth * 0.24));
  const yForMinutes = (minutes) => margin.top + plotHeight - (minutes / maxMinutes) * plotHeight;

  els.dailyStats.innerHTML = `
    <div class="chart-legend">
      <span><i class="legend-dot english-dot"></i>英语</span>
      <span><i class="legend-dot mandarin-dot"></i>中文</span>
    </div>
    <div class="chart-scroll">
      <svg class="axis-chart daily-axis-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-label="每日练习时长柱状图">
        ${ticks.map((tick) => {
          const y = yForMinutes(tick);
          return `
            <line class="grid-line" x1="${margin.left}" y1="${y.toFixed(2)}" x2="${width - margin.right}" y2="${y.toFixed(2)}"></line>
            <text class="axis-tick" x="${margin.left - 10}" y="${(y + 4).toFixed(2)}" text-anchor="end">${escapeHtml(formatMinutesTick(tick))}</text>
          `;
        }).join("")}
        <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
        <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
        <text class="axis-label" x="${margin.left}" y="16" text-anchor="start">时长（分钟）</text>
        <text class="axis-label" x="${width - margin.right}" y="${height - 9}" text-anchor="end">日期</text>
        ${rows.map(([key, group], index) => {
          const center = margin.left + groupWidth * index + groupWidth / 2;
          const englishMinutes = group.english / 60000;
          const mandarinMinutes = group.mandarin / 60000;
          const englishY = yForMinutes(englishMinutes);
          const mandarinY = yForMinutes(mandarinMinutes);
          const baseline = height - margin.bottom;
          return `
            <rect class="english-bar" x="${(center - barWidth - 3).toFixed(2)}" y="${englishY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(0, baseline - englishY).toFixed(2)}" rx="4"><title>${escapeHtml(`${formatDateKey(key)} 英语 ${formatDurationLong(group.english)}`)}</title></rect>
            <rect class="mandarin-bar" x="${(center + 3).toFixed(2)}" y="${mandarinY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(0, baseline - mandarinY).toFixed(2)}" rx="4"><title>${escapeHtml(`${formatDateKey(key)} 中文 ${formatDurationLong(group.mandarin)}`)}</title></rect>
            <text class="x-tick" x="${center.toFixed(2)}" y="${height - 28}" text-anchor="middle">${escapeHtml(formatDateKey(key))}</text>
          `;
        }).join("")}
      </svg>
    </div>
    <div class="daily-breakdown-grid">
      ${rows.slice().reverse().map(([key, group]) => {
        const total = group.english + group.mandarin;
        return `
          <article class="daily-breakdown-card">
            <strong>${escapeHtml(formatDateKey(key))}</strong>
            <span>${group.count} 条 · ${escapeHtml(formatDurationLong(total))}</span>
            <div class="daily-breakdown">
              <span>英 ${escapeHtml(formatDurationLong(group.english))}</span>
              <span>中 ${escapeHtml(formatDurationLong(group.mandarin))}</span>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderScoreTrend(scored) {
  if (!scored.length) {
    els.scoreTrend.innerHTML = `<div class="empty-state">还没有带分数的点评记录。完成点评后这里会出现趋势。</div>`;
    return;
  }

  const sorted = [...scored].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const margin = { top: 28, right: 24, bottom: 58, left: 68 };
  const maxSequence = Math.max(1, ...sorted.map((session) => Number(session.practiceNumber || 0)));
  const width = Math.max(760, maxSequence * 76 + margin.left + margin.right);
  const height = 300;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xForNumber = (number) => margin.left + (Number(number || 0) / maxSequence) * plotWidth;
  const yForScore = (score) => margin.top + plotHeight - (score / 100) * plotHeight;
  const pointFor = (session) => {
    const x = xForNumber(session.practiceNumber);
    const y = yForScore(session.score);
    return { x, y, text: `${x.toFixed(2)},${y.toFixed(2)}` };
  };
  const modePoints = (mode) => sorted
    .map((session) => ({ session, point: pointFor(session) }))
    .filter(({ session }) => (session.mode === "mandarin" ? "mandarin" : "english") === mode);
  const englishPoints = modePoints("english");
  const mandarinPoints = modePoints("mandarin");
  const scoreTicks = [0, 20, 40, 60, 80, 100];
  const sequenceTicks = chartSequenceTicks(maxSequence, 10);

  els.scoreTrend.innerHTML = `
    <div class="chart-legend">
      <span><i class="legend-dot english-dot"></i>英语</span>
      <span><i class="legend-dot mandarin-dot"></i>中文</span>
    </div>
    <div class="chart-scroll">
      <svg class="axis-chart trend-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-label="得分趋势图">
        ${scoreTicks.map((tick) => {
          const y = yForScore(tick);
          return `
            <line class="grid-line" x1="${margin.left}" y1="${y.toFixed(2)}" x2="${width - margin.right}" y2="${y.toFixed(2)}"></line>
            <text class="axis-tick" x="${margin.left - 10}" y="${(y + 4).toFixed(2)}" text-anchor="end">${tick}</text>
          `;
        }).join("")}
        <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
        <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
        <text class="axis-label" x="${margin.left}" y="16" text-anchor="start">分数</text>
        <text class="axis-label" x="${width - margin.right}" y="${height - 10}" text-anchor="end">练习序号</text>
        ${sequenceTicks.map((tick) => {
          const x = xForNumber(tick);
          return `
            <line class="x-grid-line" x1="${x.toFixed(2)}" y1="${margin.top}" x2="${x.toFixed(2)}" y2="${height - margin.bottom}"></line>
            <text class="x-tick" x="${x.toFixed(2)}" y="${height - 31}" text-anchor="middle">${tick}</text>
          `;
        }).join("")}
        ${englishPoints.length > 1 ? `<polyline class="english-line" points="${englishPoints.map(({ point }) => point.text).join(" ")}"></polyline>` : ""}
        ${mandarinPoints.length > 1 ? `<polyline class="mandarin-line" points="${mandarinPoints.map(({ point }) => point.text).join(" ")}"></polyline>` : ""}
        ${englishPoints.map(({ point, session }) => `<circle class="english-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4"><title>${escapeHtml(scoreChartTitle(session))}</title></circle>`).join("")}
        ${mandarinPoints.map(({ point, session }) => `<circle class="mandarin-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4"><title>${escapeHtml(scoreChartTitle(session))}</title></circle>`).join("")}
      </svg>
    </div>
    <div class="score-list">
      ${sorted.slice(-12).reverse().map((session) => `
        <article class="score-row">
          <span class="practice-code ${session.mode === "mandarin" ? "mandarin-code" : "english-code"}">${escapeHtml(session.practiceCode || "")}</span>
          <span class="score-tag ${session.mode === "mandarin" ? "mandarin-score" : "english-score"}">${escapeHtml(scoreTagFromSession(session))}</span>
          <div>
            <strong>${escapeHtml(session.title || (session.mode === "mandarin" ? "普通话朗读" : "英语对话"))}</strong>
            <span>${escapeHtml(session.mode === "mandarin" ? "中文普通话" : "英语实时对话")} · ${escapeHtml(formatDate(session.createdAt || session.updatedAt))}</span>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderRecords(sessions) {
  if (!sessions.length) {
    els.recordsList.innerHTML = `<div class="empty-state">还没有练习记录。完成一次保存后，这里会出现音频、文本和点评文件。</div>`;
    return;
  }

  els.recordsList.innerHTML = "";
  sessions.forEach((session) => {
    const card = document.createElement("article");
    card.className = "record-card";
    const title = session.title || (session.mode === "mandarin" ? "普通话朗读" : "英语对话");
    const modeLabel = session.mode === "mandarin" ? "中文普通话" : "英语实时对话";
    const files = session.files || {};
    const audioUrl = files.audio ? sessionFileUrl(session.id, files.audio) : "";
    const transcript = session.mode === "mandarin" ? "" : session.transcript || "";
    const analysisSummary = session.analysis ? formatAnalysisText(session.analysis) : "";
    const referenceText = session.referenceText || "";
    const scoreTag = session.scoreTag || scoreTagFromAnalysis(session.analysis);
    card.innerHTML = `
      <div class="record-top">
        <div>
          <h3 class="record-title">${escapeHtml(title)}</h3>
          <p class="record-meta">${escapeHtml(modeLabel)} · ${escapeHtml(formatDate(session.updatedAt || session.createdAt))}</p>
        </div>
        <div class="record-side">
          ${session.practiceCode ? `<span class="practice-code ${session.mode === "mandarin" ? "mandarin-code" : "english-code"}">${escapeHtml(session.practiceCode)}</span>` : ""}
          <div data-score-slot>${scoreTag ? `<span class="score-tag">${escapeHtml(scoreTag)}</span>` : ""}</div>
          <code>${escapeHtml(session.sessionDir || session.id)}</code>
        </div>
      </div>
      ${audioUrl ? `
        <div class="audio-row">
          <audio controls preload="metadata" src="${audioUrl}"></audio>
          <span class="record-duration">${session.durationMs ? `时长 ${formatDurationMs(session.durationMs)}` : "读取时长中"}</span>
        </div>
      ` : ""}
      <div class="record-toggles">
        ${renderRecordToggles(session)}
        <button class="file-link review-action" type="button" data-reanalyze-record="${escapeHtml(session.id)}">重新点评</button>
        <button class="file-link danger-action" type="button" data-delete-record="${escapeHtml(session.id)}">删除记录</button>
      </div>
      ${referenceText ? `
        <section class="record-text" data-record-section="reference" hidden>
          <h4>朗读原文</h4>
          <pre>${escapeHtml(referenceText)}</pre>
        </section>
      ` : ""}
      ${transcript ? `
        <section class="record-text" data-record-section="transcript" hidden>
          <h4>文本</h4>
          <pre>${escapeHtml(transcript)}</pre>
        </section>
      ` : ""}
      ${analysisSummary ? `
        <section class="record-text" data-record-section="analysis" hidden>
          <h4>点评</h4>
          <pre>${escapeHtml(analysisSummary)}</pre>
        </section>
      ` : `
        <section class="record-text" data-record-section="analysis" hidden>
          <h4>点评</h4>
          <pre>还没有点评。点击“重新点评”生成。</pre>
        </section>
      `}
    `;
    els.recordsList.append(card);
    bindRecordCard(card);
    hydrateAudioDuration(card, session.durationMs);
  });
}

function renderRecordToggles(session) {
  const controls = [];
  if (session.referenceText) controls.push(`<button class="file-link" type="button" data-toggle-record="reference">文本</button>`);
  if (session.mode !== "mandarin" && session.transcript) controls.push(`<button class="file-link" type="button" data-toggle-record="transcript">文本</button>`);
  controls.push(`<button class="file-link" type="button" data-toggle-record="analysis">点评</button>`);
  return controls.join("");
}

function sessionFileUrl(sessionId, fileName) {
  return `/api/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileName)}`;
}

function formatAnalysisText(analysis) {
  const normalized = normalizeAnalysisForDisplay(analysis);
  if (!normalized) return "点评生成被截断或格式异常，请点击“重新点评”。";
  return Object.entries(normalized)
    .map(([key, value]) => {
      const text = analysisValueToText(value);
      return `${labelize(key)}:\n${text}`;
    })
    .join("\n\n");
}

function bindRecordCard(card) {
  card.querySelectorAll("[data-toggle-record]").forEach((button) => {
    button.addEventListener("click", () => {
      const section = card.querySelector(`[data-record-section="${button.dataset.toggleRecord}"]`);
      if (!section) return;
      const willShow = section.hidden;
      section.hidden = !willShow;
      button.classList.toggle("active", willShow);
    });
  });

  card.querySelector("[data-reanalyze-record]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const sessionId = button.dataset.reanalyzeRecord;
    const section = card.querySelector('[data-record-section="analysis"]');
    const pre = section?.querySelector("pre");
    const analysisToggle = card.querySelector('[data-toggle-record="analysis"]');
    button.disabled = true;
    button.textContent = "点评中";

    if (section && pre) {
      section.hidden = false;
      pre.textContent = "正在重新点评...";
      analysisToggle?.classList.add("active");
    }

    try {
      const saved = await api(`/api/sessions/${encodeURIComponent(sessionId)}/reanalyze`, {});
      const fresh = await getSession(sessionId);
      const analysis = fresh?.analysis || saved?.analysis || { summary: "点评完成，但没有返回可显示文本。" };
      if (pre) pre.textContent = formatAnalysisText(analysis);
      const scoreSlot = card.querySelector("[data-score-slot]");
      const scoreTag = scoreTagFromSession(fresh || saved || {});
      if (scoreSlot) scoreSlot.innerHTML = scoreTag ? `<span class="score-tag">${escapeHtml(scoreTag)}</span>` : "";
    } catch (error) {
      if (pre) pre.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "重新点评";
    }
  });

  card.querySelector("[data-delete-record]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const sessionId = button.dataset.deleteRecord;
    if (!sessionId) return;
    const confirmed = window.confirm("确定删除这条练习记录吗？\n删除后会移除这一段的音频、文本和点评文件。");
    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "删除中";
    try {
      await deleteSession(sessionId);
      card.remove();
      if (!els.recordsList.querySelector(".record-card")) {
        els.recordsList.innerHTML = `<div class="empty-state">还没有练习记录。完成一次保存后，这里会出现音频、文本和点评文件。</div>`;
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = "删除记录";
      alert(error.message);
    }
  });
}

async function getSession(sessionId) {
  const response = await fetch("/api/sessions");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "无法刷新记录");
  return (data.sessions || []).find((session) => session.id === sessionId);
}

function hydrateAudioDuration(card, savedDurationMs) {
  const audio = card.querySelector("audio");
  const label = card.querySelector(".record-duration");
  if (!audio || !label) return;

  const setLabel = () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      label.textContent = `时长 ${formatSeconds(Math.round(audio.duration))}`;
      return true;
    }
    if (savedDurationMs) {
      label.textContent = `时长 ${formatDurationMs(savedDurationMs)}`;
    }
    return false;
  };

  audio.addEventListener("loadedmetadata", () => {
    if (setLabel()) return;
    const restoreTime = () => {
      audio.removeEventListener("timeupdate", restoreTime);
      audio.currentTime = 0;
      setLabel();
    };
    audio.addEventListener("timeupdate", restoreTime);
    try {
      audio.currentTime = 1e101;
    } catch {
      setLabel();
    }
  }, { once: true });
  audio.addEventListener("durationchange", setLabel);
}

function formatDurationMs(value) {
  return formatSeconds(Math.max(0, Math.round(Number(value || 0) / 1000)));
}

function formatDurationLong(value) {
  const totalSeconds = Math.max(0, Math.round(Number(value || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}小时${String(minutes).padStart(2, "0")}分`;
  if (minutes) return `${minutes}分${String(seconds).padStart(2, "0")}秒`;
  return `${seconds}秒`;
}

function sumDuration(sessions, mode) {
  return sessions
    .filter((session) => session.mode === mode)
    .reduce((sum, session) => sum + Number(session.durationMs || 0), 0);
}

function niceChartMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const normalized = value / base;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * base;
}

function chartTicks(maxValue, steps) {
  return Array.from({ length: steps + 1 }, (_, index) => (maxValue / steps) * index);
}

function chartSequenceTicks(maxValue, targetTicks) {
  const max = Math.max(1, Math.round(maxValue));
  const step = Math.max(1, Math.ceil(max / targetTicks));
  const ticks = [];
  for (let value = 0; value <= max; value += step) ticks.push(value);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

function formatMinutesTick(value) {
  if (value < 1) return `${Math.round(value * 60)}秒`;
  if (value < 10) return `${Number(value.toFixed(1))}`;
  return `${Math.round(value)}`;
}

function scoreChartTitle(session) {
  const title = session.title || (session.mode === "mandarin" ? "普通话朗读" : "英语对话");
  const mode = session.mode === "mandarin" ? "中文" : "英语";
  const code = session.practiceCode || `${mode}${session.practiceNumber || ""}`;
  return `${code} · ${mode} · ${scoreTagFromSession(session)} · ${formatDate(session.createdAt || session.updatedAt)} · ${title}`;
}

function startMixedRecorder(micStream) {
  state.english.chunks = [];
  state.english.userChunks = [];
  state.english.audioBlob = null;
  state.english.userAudioBlob = null;
  state.english.startedAt = performance.now();
  state.english.durationMs = 0;
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  audioContext.createMediaStreamSource(micStream).connect(destination);
  state.english.mixer = { audioContext, destination };
  state.english.recorder = new MediaRecorder(destination.stream);
  state.english.recorder.ondataavailable = (event) => {
    if (event.data.size) state.english.chunks.push(event.data);
  };
  state.english.recorder.onstop = () => {
    state.english.durationMs = Math.max(0, Math.round(performance.now() - state.english.startedAt));
    state.english.audioBlob = new Blob(state.english.chunks, { type: state.english.recorder.mimeType || "audio/webm" });
  };
  state.english.recorder.start(250);

  state.english.userRecorder = new MediaRecorder(micStream);
  state.english.userRecorder.ondataavailable = (event) => {
    if (event.data.size) state.english.userChunks.push(event.data);
  };
  state.english.userRecorder.onstop = () => {
    state.english.userAudioBlob = new Blob(state.english.userChunks, { type: state.english.userRecorder.mimeType || "audio/webm" });
  };
  state.english.userRecorder.start(250);
}

function attachRemoteToRecorder(remoteStream) {
  const mixer = state.english.mixer;
  if (!mixer || state.english.remoteRecorderAttached) return;
  try {
    mixer.audioContext.createMediaStreamSource(remoteStream).connect(mixer.destination);
    state.english.remoteRecorderAttached = true;
  } catch {
  }
}

function stopRecorder(mode) {
  const target = state[mode];
  const recorders = mode === "english" ? [target.recorder, target.userRecorder] : [target.recorder];
  return Promise.all(recorders.map((recorder) => new Promise((resolve) => {
    if (!recorder || recorder.state === "inactive") return resolve();
    recorder.addEventListener("stop", resolve, { once: true });
    recorder.stop();
  })));
}

function ensureEnglishDuration() {
  if (state.english.durationMs || !state.english.startedAt) return;
  state.english.durationMs = Math.max(0, Math.round(performance.now() - state.english.startedAt));
}

function closeEnglishConnection() {
  state.english.dc?.close();
  state.english.pc?.close();
  state.english.micStream?.getTracks().forEach((track) => track.stop());
  state.english.remoteStream?.getTracks().forEach((track) => track.stop());
  state.english.mixer?.audioContext?.close();
  state.english.pc = null;
  state.english.dc = null;
  state.english.userRecorder = null;
  state.english.micStream = null;
  state.english.remoteStream = null;
  state.english.remoteRecorderAttached = false;
}

function startCountdown(seconds) {
  clearInterval(state.mandarin.timer);
  state.mandarin.remaining = seconds;
  els.readingTimer.textContent = formatSeconds(state.mandarin.remaining);
  state.mandarin.timer = setInterval(() => {
    state.mandarin.remaining -= 1;
    els.readingTimer.textContent = formatSeconds(Math.max(0, state.mandarin.remaining));
    if (state.mandarin.remaining <= 0) stopReadingRecording(true);
  }, 1000);
}

function tipList(title, items) {
  const list = document.createElement("ol");
  list.className = "tip-list";
  const heading = document.createElement("strong");
  heading.textContent = title;
  list.append(heading);
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  });
  return list;
}

function resetEnglishTranscript() {
  state.english.lastError = "";
  state.english.sessionId = "";
  state.english.durationMs = 0;
  state.english.messages = [];
  state.english.currentAssistant = "";
  state.english.currentUser = "";
  state.english.userChunks = [];
  state.english.userAudioBlob = null;
  els.englishTranscript.innerHTML = "";
}

function renderDraft(role, text) {
  let node = els.englishTranscript.querySelector(`.message.${role}.draft`);
  if (!node) {
    node = document.createElement("div");
    node.className = `message ${role} draft`;
    node.innerHTML = `<strong>${role === "user" ? "我" : "教练"}</strong><span></span>`;
    els.englishTranscript.append(node);
  }
  node.querySelector("span").textContent = text;
  els.englishTranscript.scrollTop = els.englishTranscript.scrollHeight;
}

function commitMessage(role, text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  const draft = els.englishTranscript.querySelector(`.message.${role}.draft`);
  if (draft) draft.remove();
  state.english.messages.push({ role, text: clean });
  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.innerHTML = `<strong>${role === "user" ? "我" : "教练"}</strong><span></span>`;
  node.querySelector("span").textContent = clean;
  els.englishTranscript.append(node);
  els.englishTranscript.scrollTop = els.englishTranscript.scrollHeight;
}

function transcriptText(messages) {
  return messages.map((message) => `${message.role === "user" ? "User" : "Coach"}: ${message.text}`).join("\n");
}

function renderAnalysis(container, analysis, transcript, showTranscript = true) {
  container.classList.add("visible");
  const normalized = normalizeAnalysisForDisplay(analysis);
  if (!normalized) {
    container.innerHTML = `<strong>分析完成，但没有拿到可显示的点评文本。</strong>`;
    return;
  }
  const entries = Object.entries(normalized || {}).filter(([key]) => !["score", "summary"].includes(key));
  container.innerHTML = "";
  const summary = document.createElement("div");
  summary.innerHTML = `<span class="score">${normalized?.score ?? "-"}</span><strong>${escapeHtml(normalized?.summary || "分析完成")}</strong>`;
  container.append(summary);

  const grid = document.createElement("div");
  grid.className = "analysis-grid";
  entries.forEach(([key, value]) => {
    const item = document.createElement("div");
    item.className = "analysis-item";
    const text = analysisValueToText(value);
    item.innerHTML = `<strong>${escapeHtml(labelize(key))}</strong><p>${escapeHtml(text)}</p>`;
    grid.append(item);
  });
  container.append(grid);

  if (showTranscript && transcript) {
    const detail = document.createElement("details");
    detail.innerHTML = `<summary>识别文本</summary><pre>${escapeHtml(transcript)}</pre>`;
    container.append(detail);
  }
}

function clearAnalysis(container) {
  container.classList.remove("visible");
  container.innerHTML = "";
}

async function saveSession(payload) {
  try {
    return await api("/api/sessions", payload);
  } catch {
    return null;
  }
}

async function deleteSession(sessionId) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `删除失败：${response.status}`);
  return data;
}

async function api(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function setKeyStatus(kind, text) {
  const dot = els.keyStatus.querySelector(".status-dot");
  dot.className = `status-dot ${kind}`;
  els.keyStatus.querySelector("span:last-child").textContent = text;
}

function setEnglishState(kind, text) {
  els.englishDot.className = `status-dot ${kind}`;
  els.englishState.textContent = text;
}

function connectAnalyser(stream, mode = "english") {
  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;
    context.createMediaStreamSource(stream).connect(analyser);
    state[mode].analyser = analyser;
    state[mode].meterContext = context;
  } catch {
  }
}

function startMandarinMeter() {
  stopMandarinMeter();
  state.mandarin.meterTimer = setInterval(updateMandarinMeter, 120);
  updateMandarinMeter();
}

function stopMandarinMeter() {
  if (state.mandarin.meterTimer) clearInterval(state.mandarin.meterTimer);
  state.mandarin.meterTimer = null;
}

function updateMandarinMeter() {
  const elapsed = state.mandarin.startedAt ? Math.max(0, performance.now() - state.mandarin.startedAt) : 0;
  els.mandarinElapsed.textContent = formatDurationMs(elapsed);

  const analyser = state.mandarin.analyser;
  if (!analyser) {
    els.mandarinDb.textContent = "-- dB";
    els.mandarinLevelBar.style.width = "0%";
    return;
  }

  const samples = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }
  const rms = Math.sqrt(sum / samples.length);
  const db = rms > 0 ? Math.max(-60, Math.round(20 * Math.log10(rms))) : -60;
  const level = Math.min(100, Math.max(0, ((db + 60) / 60) * 100));
  els.mandarinDb.textContent = `${db} dB`;
  els.mandarinLevelBar.style.width = `${level}%`;
}

function setMandarinMeterState(text) {
  els.mandarinRecordState.textContent = text;
}

function drawSignal() {
  const canvas = $("#signalCanvas");
  const ctx = canvas.getContext("2d");
  const bars = new Uint8Array(64);

  function frame() {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#10231f";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    if (state.english.analyser) state.english.analyser.getByteFrequencyData(bars);
    const barWidth = width / bars.length;
    for (let i = 0; i < bars.length; i += 1) {
      const value = state.english.analyser ? bars[i] / 255 : 0.12 + Math.sin(Date.now() / 600 + i) * 0.04;
      const h = 20 + value * (height * 0.68);
      const x = i * barWidth;
      const hueColor = i % 3 === 0 ? "#66d2c7" : i % 3 === 1 ? "#f29b72" : "#9fbff0";
      ctx.fillStyle = hueColor;
      ctx.fillRect(x + 2, height - h - 28, Math.max(3, barWidth - 5), h);
    }

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "700 18px system-ui";
    ctx.fillText("Live voice signal", 26, height - 28);
    requestAnimationFrame(frame);
  }

  frame();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatSeconds(value) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "未知日期";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateKey(key) {
  if (key === "未知日期") return key;
  const [, month, day] = key.split("-");
  return `${month}/${day}`;
}

function scoreFromSession(session) {
  const value = session.score ?? session.analysis?.score;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreTagFromSession(session) {
  const score = scoreFromSession(session);
  return score === null ? "" : `${score}分`;
}

function scoreTagFromAnalysis(analysis) {
  const score = scoreFromSession({ analysis });
  return score === null ? "" : `${score}分`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function analysisValueToText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => `- ${analysisValueToText(item)}`).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${labelize(key)}：${analysisValueToText(item)}`)
      .join("\n");
  }
  if (value === null || value === undefined || value === "") return "暂无";
  return String(value);
}

function normalizeAnalysisForDisplay(analysis) {
  if (!analysis || typeof analysis !== "object") return null;
  if (typeof analysis.summary === "string") {
    const nested = parseJsonFromText(analysis.summary);
    if (nested && typeof nested === "object") return nested;
    if (looksLikeJson(analysis.summary)) {
      return {
        summary: "这次点评返回被截断或格式异常，请在练习记录里点击“重新点评”。",
        score: analysis.score ?? null,
      };
    }
  }
  return analysis;
}

function parseJsonFromText(text = "") {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function looksLikeJson(text) {
  return /^\s*```?json/i.test(text) || /^\s*\{/.test(text) || /^\s*\[/.test(text);
}

function labelize(key) {
  const labels = {
    summary: "总结",
    score: "分数",
    pronunciation: "发音",
    stressAndRhythm: "重音和节奏",
    fluency: "流畅度",
    vocabulary: "词汇",
    grammar: "语法",
    naturalPhrases: "更自然的表达",
    keyMoments: "关键问题",
    nextDrills: "下一步练习",
    unclearWords: "疑似不清晰词语",
    flatRetroflex: "平翘舌",
    nasalFinals: "前后鼻音",
    tone: "声调",
    articulationAdvice: "口腔发音建议",
    rhythmAndBreath: "节奏和气息",
    drills: "练习建议",
  };
  return labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}
