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
    sessionId: "",
    startedAt: 0,
    durationMs: 0,
    starting: false,
    paused: false,
    pausedAt: 0,
    pausedDurationMs: 0,
    remoteAudio: null,
    analyser: null,
    remoteAnalyser: null,
    meterContext: null,
    meterTimer: null,
    scopeLevels: {
      user: Array(44).fill(0),
      coach: Array(44).fill(0),
    },
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
  calendar: {
    selectedMonth: "",
    sessions: [],
  },
  records: {
    filter: "english",
    sessions: [],
  },
  scoreTrendMode: "english",
  translation: {
    timer: null,
    requestId: 0,
  },
  learningProfile: null,
};

const topicLibrary = {
  english: [
    {
      title: "随便聊聊",
      prompt: "a relaxed open conversation where the coach asks me about my day, recent thoughts, small worries, interests, and anything I want to talk about",
      detail: "日常闲聊、自然接话、自由表达",
    },
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
  englishWaveCanvas: $("#englishWaveCanvas"),
  englishTranscript: $("#englishTranscript"),
  englishAnalysis: $("#englishAnalysis"),
  learningProfileStatus: $("#learningProfileStatus"),
  learningProfileContent: $("#learningProfileContent"),
  useLearningMemory: $("#useLearningMemory"),
  generateLearningProfile: $("#generateLearningProfile"),
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
  calendarMonthSelect: $("#calendarMonthSelect"),
  practiceCalendar: $("#practiceCalendar"),
  dailyStats: $("#dailyStats"),
  scoreTrend: $("#scoreTrend"),
  translateDirection: $("#translateDirection"),
  translateInput: $("#translateInput"),
  translateOutput: $("#translateOutput"),
  realtimeModelSelect: $("#realtimeModelSelect"),
  textModelSelect: $("#textModelSelect"),
  translateModelSelect: $("#translateModelSelect"),
  modelConfigMessage: $("#modelConfigMessage"),
  configMessage: $("#configMessage"),
};

init();

async function init() {
  drawVoiceScope();
  bindTabs();
  bindEnglish();
  bindMandarin();
  bindConfig();
  bindRecords();
  bindTopics();
  bindCalendar();
  bindTranslator();
  renderTopicShelf("english");
  await refreshConfig();
  loadPracticeCalendar();
  loadLearningProfile();
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
  $("#pauseEnglish").addEventListener("click", toggleEnglishPause);
  $("#stopEnglish").addEventListener("click", stopEnglishSession);
  $("#analyzeEnglish").addEventListener("click", analyzeEnglishSession);
  els.generateLearningProfile.addEventListener("click", () => generateLearningProfile(true).catch(() => {}));
  const savedMemoryPreference = localStorage.getItem("speak-room-use-learning-memory");
  els.useLearningMemory.checked = savedMemoryPreference !== "false";
  els.useLearningMemory.addEventListener("change", () => {
    localStorage.setItem("speak-room-use-learning-memory", String(els.useLearningMemory.checked));
  });
}

async function loadLearningProfile() {
  try {
    const response = await fetch("/api/learning-profile");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法读取学习档案");
    renderLearningProfile(data);
  } catch (error) {
    els.learningProfileStatus.textContent = error.message;
  }
}

async function generateLearningProfile(force = false) {
  const button = els.generateLearningProfile;
  button.disabled = true;
  button.textContent = "整理中";
  els.learningProfileStatus.textContent = "正在综合全部英文对话文本，这可能需要一点时间";
  try {
    const result = await api(force ? "/api/learning-profile/generate" : "/api/learning-profile/ensure", {});
    renderLearningProfile(result);
    return result;
  } catch (error) {
    els.learningProfileStatus.textContent = error.message;
    throw error;
  } finally {
    button.disabled = false;
    button.textContent = "更新总建议";
  }
}

function renderLearningProfile(data) {
  state.learningProfile = data;
  const count = Number(data?.recordCount || 0);
  const profile = data?.profile;
  if (!count) {
    els.learningProfileStatus.textContent = "完成一次英文对话并保存后，就可以生成长期学习档案";
    els.learningProfileContent.hidden = true;
    els.generateLearningProfile.disabled = true;
    return;
  }

  els.generateLearningProfile.disabled = false;
  if (!profile) {
    els.learningProfileStatus.textContent = `已有 ${count} 条英文记录 · 尚未生成总建议`;
    els.learningProfileContent.hidden = true;
    return;
  }

  const status = data.stale ? "有新记录，更新后会纳入总建议" : "已汇总全部英文对话";
  els.learningProfileStatus.textContent = `${count} 条英文记录 · ${status}`;
  const sections = [
    ["已掌握 / 开始掌握的句式", profile.masteredPatterns, (item) => `${item.pattern}\n${item.evidence}\n下一步：${item.nextStep}`],
    ["建议积累的短语", profile.usefulPhrases, (item) => `${item.phrase}\n${item.use}`],
    ["需要避免的用法", profile.avoidUsages, (item) => `${item.usage}\n${item.problem}\n建议：${item.replacement}`],
    ["反复出现的问题", profile.recurringIssues, (item) => `${item.issue}\n${item.evidence}\n练习：${item.practice}`],
    ["接下来的练习计划", profile.nextPlan, (item) => String(item)],
  ];
  const memory = [...(profile.personalContext || []), ...(profile.strengths || [])];
  const cards = sections
    .filter(([, items]) => Array.isArray(items) && items.length)
    .map(([title, items, format]) => `
      <section class="learning-advice-item">
        <h3>${escapeHtml(title)}</h3>
        <ul>${items.map((item) => `<li>${escapeHtml(format(item)).replaceAll("\n", "<br>")}</li>`).join("")}</ul>
      </section>`).join("");
  els.learningProfileContent.innerHTML = `
    <p class="learning-profile-summary">${escapeHtml(profile.summary || "综合建议已生成。")}</p>
    ${memory.length ? `<section class="learning-memory"><strong>后续对话可参考</strong><span>${escapeHtml(memory.join(" · "))}</span></section>` : ""}
    <details class="learning-advice-details">
      <summary>查看完整建议</summary>
      <div class="learning-advice-grid">${cards}</div>
    </details>`;
  els.learningProfileContent.hidden = false;
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
  $("#modelConfigForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "保存中";
    els.modelConfigMessage.textContent = "";
    try {
      await api("/api/config/models", {
        realtimeModel: els.realtimeModelSelect.value,
        textModel: els.textModelSelect.value,
        translateModel: els.translateModelSelect.value,
      });
      els.modelConfigMessage.textContent = "已保存，新请求将使用所选模型";
      await refreshConfig();
    } catch (error) {
      els.modelConfigMessage.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "保存模型配置";
    }
  });
}

function bindRecords() {
  $$('[data-record-filter]').forEach((button) => {
    button.addEventListener("click", () => {
      state.records.filter = button.dataset.recordFilter || "english";
      $$('[data-record-filter]').forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      renderFilteredRecords();
    });
  });
}

function bindTopics() {
  $("#shuffleEnglishTopics").addEventListener("click", () => {
    topicPage.english += 1;
    renderTopicShelf("english");
  });
}

function bindCalendar() {
  els.calendarMonthSelect?.addEventListener("change", () => {
    state.calendar.selectedMonth = els.calendarMonthSelect.value;
    renderPracticeCalendar(state.calendar.sessions);
  });
}

function bindTranslator() {
  els.translateInput?.addEventListener("input", scheduleInlineTranslation);
  els.translateDirection?.addEventListener("change", scheduleInlineTranslation);
}

function scheduleInlineTranslation() {
  clearTimeout(state.translation.timer);
  const text = els.translateInput.value.trim();
  const requestId = ++state.translation.requestId;
  if (!text) {
    els.translateOutput.textContent = "翻译结果会显示在这里";
    els.translateOutput.classList.add("placeholder");
    return;
  }
  els.translateOutput.classList.remove("placeholder");
  els.translateOutput.textContent = "停止输入后将自动翻译...";
  state.translation.timer = setTimeout(() => translateInlineText(requestId), 550);
}

async function translateInlineText(requestId = ++state.translation.requestId) {
  const text = els.translateInput.value.trim();
  if (!text) {
    els.translateOutput.textContent = "先输入一句要翻译的话。";
    els.translateOutput.classList.add("placeholder");
    return;
  }

  els.translateOutput.classList.remove("placeholder");
  els.translateOutput.textContent = "翻译中...";
  try {
    const result = await api("/api/translate", {
      text,
      direction: els.translateDirection.value,
    });
    if (requestId !== state.translation.requestId) return;
    els.translateOutput.textContent = result.translated || "没有返回翻译结果。";
  } catch (error) {
    if (requestId !== state.translation.requestId) return;
    els.translateOutput.textContent = error.message;
  }
}

function renderTopicShelf(mode) {
  const container = $("#englishTopics");
  const input = $("#englishTopic");
  const pageSize = 4;
  const topics = topicLibrary[mode];
  const start = (topicPage[mode] * pageSize) % topics.length;
  const visible = [...topics.slice(start), ...topics.slice(0, start)].slice(0, pageSize);
  container.innerHTML = "";

  visible.forEach((topic) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "topic-card";
    button.classList.toggle("selected", input.value.trim() === topic.title);
    button.innerHTML = `<strong>${escapeHtml(topic.title)}</strong><span>${escapeHtml(topic.detail)}</span>`;
    button.addEventListener("click", () => {
      input.value = topic.title;
      container.querySelectorAll(".topic-card").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
    });
    container.append(button);
  });
}

async function refreshConfig() {
  try {
    state.config = await fetch("/api/config").then((res) => res.json());
    setKeyStatus(state.config.keyPresent ? "live" : "error", state.config.keyPresent ? "Key 已配置" : "需要配置 Key");
    renderModelSelect(els.realtimeModelSelect, state.config.modelOptions?.realtimeModel, state.config.realtimeModel);
    renderModelSelect(els.textModelSelect, state.config.modelOptions?.textModel, state.config.textModel);
    renderModelSelect(els.translateModelSelect, state.config.modelOptions?.translateModel, state.config.translateModel);
  } catch {
    setKeyStatus("error", "配置不可用");
  }
}

function renderModelSelect(select, options, selected) {
  const values = Array.isArray(options) && options.length ? options : [selected];
  select.replaceChildren(...values.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === selected;
    return option;
  }));
}

async function startEnglishSession() {
  if (state.english.pc || state.english.starting) return;
  state.english.starting = true;
  $("#startEnglish").disabled = true;
  clearAnalysis(els.englishAnalysis);
  resetEnglishTranscript();
  setEnglishState("busy", els.useLearningMemory.checked ? "整理历史记忆" : "请求麦克风");

  try {
    if (els.useLearningMemory.checked) {
      const profile = await generateLearningProfile(false);
      if (profile?.recordCount) setEnglishState("busy", "请求麦克风");
    }
    const voice = $("#voiceSelect").value;
    const pace = $("#paceSelect").value;
    const topic = englishTopicPrompt();

    const pc = new RTCPeerConnection();
    const remoteAudio = new Audio();
    remoteAudio.autoplay = true;
    const remoteStream = new MediaStream();
    remoteAudio.srcObject = remoteStream;
    state.english.remoteAudio = remoteAudio;

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
    startEnglishMeter();

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const connectUrl = new URL("/api/realtime-connect", window.location.origin);
    connectUrl.searchParams.set("voice", voice);
    connectUrl.searchParams.set("pace", pace);
    connectUrl.searchParams.set("topic", topic);
    connectUrl.searchParams.set("useMemory", els.useLearningMemory.checked ? "1" : "0");

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
    state.english.starting = false;
    $("#pauseEnglish").disabled = false;
    $("#stopEnglish").disabled = false;
    $("#analyzeEnglish").disabled = true;
  } catch (error) {
    state.english.lastError = error.message;
    console.error("English session failed:", error);
    setEnglishState("error", error.message);
    await stopRecorder("english");
    closeEnglishConnection();
    state.english.starting = false;
    $("#startEnglish").disabled = false;
    $("#stopEnglish").disabled = true;
    $("#analyzeEnglish").disabled = true;
  }
}

function toggleEnglishPause() {
  if (!state.english.pc) return;
  const shouldPause = !state.english.paused;
  state.english.paused = shouldPause;

  if (shouldPause) {
    state.english.pausedAt = performance.now();
    state.english.micStream?.getAudioTracks().forEach((track) => { track.enabled = false; });
    [state.english.recorder, state.english.userRecorder].forEach((recorder) => {
      if (recorder?.state === "recording") recorder.pause();
    });
    state.english.remoteAudio?.pause();
    $("#pauseEnglish").textContent = "继续对话";
    setEnglishState("busy", "已暂停");
    resetEnglishMeter();
    return;
  }

  finishEnglishPauseWindow();
  state.english.micStream?.getAudioTracks().forEach((track) => { track.enabled = true; });
  [state.english.recorder, state.english.userRecorder].forEach((recorder) => {
    if (recorder?.state === "paused") recorder.resume();
  });
  state.english.remoteAudio?.play().catch(() => {});
  $("#pauseEnglish").textContent = "暂停对话";
  setEnglishState("live", "轮到你了");
}

function sendStarterPrompt() {
  const dc = state.english.dc;
  if (!dc || dc.readyState !== "open") return;

  const topic = englishTopicPrompt();
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

function englishTopicPrompt() {
  const value = $("#englishTopic").value.trim() || "随便聊聊";
  return topicLibrary.english.find((topic) => topic.title === value)?.prompt || value;
}

async function stopEnglishSession() {
  setEnglishState("busy", "保存中");
  $("#pauseEnglish").disabled = true;
  $("#stopEnglish").disabled = true;
  finishEnglishPauseWindow();
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
  loadPracticeCalendar();
  loadLearningProfile();
  setEnglishState("idle", "已保存");
  $("#startEnglish").disabled = false;
  $("#pauseEnglish").disabled = true;
  $("#pauseEnglish").textContent = "暂停对话";
  $("#stopEnglish").disabled = true;
  $("#analyzeEnglish").disabled = false;
}

async function analyzeEnglishSession() {
  setEnglishState("busy", "分析中");
  try {
    const transcript = transcriptText(state.english.messages);
    const result = await api("/api/analyze", {
      mode: "english",
      topic: englishTopicPrompt(),
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
    loadPracticeCalendar();
    loadLearningProfile();
    setEnglishState("idle", "分析完成");
  } catch (error) {
    setEnglishState("error", error.message);
  }
}

function handleRealtimeEvent(message) {
  const event = JSON.parse(message.data);

  if (!state.english.paused) {
    if (event.type === "input_audio_buffer.speech_started") setEnglishState("live", "你在说话");
    if (event.type === "input_audio_buffer.speech_stopped") setEnglishState("busy", "正在回应");
    if (event.type === "response.done") setEnglishState("live", "轮到你了");
  }
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
    els.readingTimer.textContent = `倒计时 ${formatSeconds(material.targetSeconds)}`;
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
      loadPracticeCalendar();
      loadLearningProfile();
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
    loadPracticeCalendar();
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
    state.records.sessions = withPracticeNumbers(data.sessions || []);
    renderFilteredRecords();
  } catch (error) {
    els.recordsList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderFilteredRecords() {
  const { filter, sessions } = state.records;
  const visibleSessions = sessions.filter(
    (session) => (session.mode === "mandarin" ? "mandarin" : "english") === filter,
  );
  renderRecords(visibleSessions, sessions.length > 0);
}

async function loadStats() {
  if (!els.statsSummary || !els.practiceCalendar || !els.dailyStats || !els.scoreTrend) return;
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

async function loadPracticeCalendar() {
  if (!els.practiceCalendar) return;
  els.practiceCalendar.innerHTML = `<div class="empty-state">加载日历中</div>`;
  try {
    const response = await fetch("/api/sessions");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法加载练习日历");
    const sessions = withPracticeNumbers(await hydrateSessionDurations(data.sessions || []));
    renderPracticeCalendar(sessions);
  } catch (error) {
    els.practiceCalendar.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
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
    els.practiceCalendar.innerHTML = `<div class="empty-state">还没有可显示的练习日期。</div>`;
    els.dailyStats.innerHTML = "";
    els.scoreTrend.innerHTML = "";
    return;
  }

  const englishMs = sumDuration(sessions, "english");
  const mandarinMs = sumDuration(sessions, "mandarin");
  const scored = sessions
    .map((session) => ({ ...session, score: scoreFromSession(session) }))
    .filter((session) => session.score !== null);

  els.statsSummary.innerHTML = `
    <article class="stat-card english">
      <span>英语总练习时长</span>
      <strong>${escapeHtml(formatDurationLong(englishMs))}</strong>
    </article>
    <article class="stat-card mandarin">
      <span>中文总练习时长</span>
      <strong>${escapeHtml(formatDurationLong(mandarinMs))}</strong>
    </article>
  `;

  renderDailyStats(sessions);
  renderPracticeCalendar(sessions);
  renderScoreTrend(scored);
}

function renderPracticeCalendar(sessions) {
  state.calendar.sessions = sessions;
  const dayGroups = new Map();
  sessions.forEach((session) => {
    const key = dateKey(session.createdAt || session.updatedAt);
    if (key === "未知日期") return;
    if (!dayGroups.has(key)) {
      dayGroups.set(key, {
        englishCount: 0,
        mandarinCount: 0,
        englishMs: 0,
        mandarinMs: 0,
      });
    }
    const day = dayGroups.get(key);
    const isMandarin = session.mode === "mandarin";
    if (isMandarin) {
      day.mandarinCount += 1;
      day.mandarinMs += Number(session.durationMs || 0);
    } else {
      day.englishCount += 1;
      day.englishMs += Number(session.durationMs || 0);
    }
  });

  if (!dayGroups.size) {
    populateCalendarMonthSelect([currentMonthKey()], currentMonthKey(), true);
    els.practiceCalendar.innerHTML = `<div class="empty-state">还没有可显示的练习日期。</div>`;
    return;
  }

  const monthKeys = [...new Set([...dayGroups.keys()].map((key) => key.slice(0, 7)))]
    .sort((a, b) => b.localeCompare(a));
  const selectedMonth = monthKeys.includes(state.calendar.selectedMonth)
    ? state.calendar.selectedMonth
    : monthKeys[0];
  state.calendar.selectedMonth = selectedMonth;
  populateCalendarMonthSelect(monthKeys, selectedMonth, false);

  els.practiceCalendar.innerHTML = renderCalendarMonth(selectedMonth, dayGroups);
}

function populateCalendarMonthSelect(monthKeys, selectedMonth, disabled) {
  if (!els.calendarMonthSelect) return;
  els.calendarMonthSelect.disabled = disabled;
  els.calendarMonthSelect.innerHTML = monthKeys
    .map((monthKey) => `<option value="${escapeHtml(monthKey)}">${escapeHtml(formatMonthKey(monthKey))}</option>`)
    .join("");
  els.calendarMonthSelect.value = selectedMonth;
}

function renderCalendarMonth(monthKey, dayGroups) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < leadingBlanks; index += 1) {
    cells.push(`<div class="calendar-day is-empty" aria-hidden="true"></div>`);
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const key = `${monthKey}-${String(dayNumber).padStart(2, "0")}`;
    const day = dayGroups.get(key);
    const classes = ["calendar-day"];
    if (day) classes.push("has-practice");
    if (day?.englishCount) classes.push("has-english");
    if (day?.mandarinCount) classes.push("has-mandarin");
    cells.push(`
      <div class="${classes.join(" ")}" title="${escapeHtml(day ? calendarDayTitle(key, day) : key)}" aria-label="${escapeHtml(day ? calendarDayTitle(key, day) : key)}"></div>
    `);
  }

  const monthSummary = [...dayGroups.entries()]
    .filter(([key]) => key.startsWith(monthKey))
    .reduce((summary, [, day]) => {
      summary.days += 1;
      summary.english += day.englishCount;
      summary.mandarin += day.mandarinCount;
      return summary;
    }, { days: 0, english: 0, mandarin: 0 });

  return `
    <article class="calendar-month">
      <div class="calendar-month-head">
        <strong>本月练习</strong>
        <span>${monthSummary.days} 天 · 英 ${monthSummary.english} 次 · 中 ${monthSummary.mandarin} 次</span>
      </div>
      <div class="calendar-weekdays" aria-hidden="true">
        ${["一", "二", "三", "四", "五", "六", "日"].map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="calendar-grid">
        ${cells.join("")}
      </div>
    </article>
  `;
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
  `;
}

function renderScoreTrend(scored) {
  if (!scored.length) {
    els.scoreTrend.innerHTML = `<div class="empty-state">还没有带分数的点评记录。完成点评后这里会出现趋势。</div>`;
    return;
  }

  const mode = state.scoreTrendMode;
  const group = mode === "mandarin"
    ? { mode: "mandarin", label: "中文得分", colorClass: "mandarin" }
    : { mode: "english", label: "英文得分", colorClass: "english" };
  const sessions = scored
    .filter((session) => (session.mode === "mandarin" ? "mandarin" : "english") === group.mode)
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));

  els.scoreTrend.innerHTML = `
    <div class="record-filter score-trend-filter" role="group" aria-label="选择得分趋势语言">
      <button class="${mode === "english" ? "active" : ""}" type="button" data-score-trend-mode="english" aria-pressed="${mode === "english"}">英文</button>
      <button class="${mode === "mandarin" ? "active" : ""}" type="button" data-score-trend-mode="mandarin" aria-pressed="${mode === "mandarin"}">中文</button>
    </div>
    ${renderLanguageScoreTrend(sessions, group)}
  `;
  els.scoreTrend.querySelectorAll("[data-score-trend-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.scoreTrendMode = button.dataset.scoreTrendMode || "english";
      renderScoreTrend(scored);
    });
  });
}

function renderLanguageScoreTrend(sorted, { mode, label, colorClass }) {
  if (!sorted.length) {
    return `
      <section class="language-trend">
        <div class="language-trend-head">
          <h4><i class="legend-dot ${colorClass}-dot"></i>${label}</h4>
          <span>暂无记录</span>
        </div>
        <div class="empty-state">完成${mode === "mandarin" ? "中文朗读" : "英文对话"}点评后，这里会显示趋势。</div>
      </section>
    `;
  }

  const margin = { top: 28, right: 24, bottom: 58, left: 68 };
  const maxSequence = Math.max(1, ...sorted.map((session) => Number(session.practiceNumber || 0)));
  const width = Math.max(760, maxSequence * 76 + margin.left + margin.right);
  const height = 300;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xForNumber = (number) => margin.left + (Number(number || 0) / maxSequence) * plotWidth;
  const yForScore = (score) => margin.top + plotHeight - (score / 100) * plotHeight;
  const points = sorted.map((session) => {
    const x = xForNumber(session.practiceNumber);
    const y = yForScore(session.score);
    return { session, point: { x, y, text: `${x.toFixed(2)},${y.toFixed(2)}` } };
  });
  const scoreTicks = [0, 20, 40, 60, 80, 100];
  const sequenceTicks = chartSequenceTicks(maxSequence, 10);

  return `
    <section class="language-trend">
      <div class="language-trend-head">
        <h4><i class="legend-dot ${colorClass}-dot"></i>${label}</h4>
        <span>${sorted.length} 条已评分记录</span>
      </div>
      <div class="chart-scroll">
        <svg class="axis-chart trend-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-label="${label}趋势图">
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
          ${points.length > 1 ? `<polyline class="${colorClass}-line" points="${points.map(({ point }) => point.text).join(" ")}"></polyline>` : ""}
          ${points.map(({ point, session }) => `<circle class="${colorClass}-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4"><title>${escapeHtml(scoreChartTitle(session))}</title></circle>`).join("")}
        </svg>
      </div>
      <div class="score-list trend-score-list">
        ${sorted.slice(-8).reverse().map((session) => `
          <article class="score-row">
            <span class="practice-code ${colorClass}-code">${escapeHtml(session.practiceCode || "")}</span>
            <span class="score-tag ${colorClass}-score">${escapeHtml(scoreTagFromSession(session))}</span>
            <div>
              <strong>${escapeHtml(session.title || (mode === "mandarin" ? "普通话朗读" : "英语对话"))}</strong>
              <span>${escapeHtml(formatDate(session.createdAt || session.updatedAt))}</span>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderRecords(sessions, hasAnyRecords = sessions.length > 0) {
  if (!sessions.length) {
    els.recordsList.innerHTML = `<div class="empty-state">${hasAnyRecords ? "这个分类下还没有练习记录。" : "还没有练习记录。完成一次保存后，这里会出现音频、文本和点评文件。"}</div>`;
    return;
  }

  els.recordsList.innerHTML = "";
  sessions.forEach((session) => {
    const card = document.createElement("article");
    card.className = "record-card";
    const title = session.title || (session.mode === "mandarin" ? "普通话朗读" : "英语对话");
    const modeLabel = session.mode === "mandarin" ? "中文普通话" : "英文对话";
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
          <h4>点评回顾</h4>
          <pre>${escapeHtml(analysisSummary)}</pre>
        </section>
      ` : `
        <section class="record-text" data-record-section="analysis" hidden>
          <h4>点评回顾</h4>
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
  controls.push(`<button class="file-link" type="button" data-toggle-record="analysis">点评回顾</button>`);
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
      loadPracticeCalendar();
      loadLearningProfile();
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
      await loadRecords();
      loadPracticeCalendar();
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
  state.english.paused = false;
  state.english.pausedAt = 0;
  state.english.pausedDurationMs = 0;
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  const micSource = audioContext.createMediaStreamSource(micStream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.88;
  micSource.connect(destination);
  micSource.connect(analyser);
  state.english.analyser = analyser;
  audioContext.resume().catch(() => {});
  state.english.mixer = { audioContext, destination };
  const recorder = new MediaRecorder(destination.stream);
  state.english.recorder = recorder;
  recorder.ondataavailable = (event) => {
    if (event.data.size) state.english.chunks.push(event.data);
  };
  recorder.onstop = () => {
    state.english.durationMs = getEnglishElapsedMs();
    state.english.audioBlob = new Blob(state.english.chunks, { type: recorder.mimeType || "audio/webm" });
  };
  recorder.start(250);

  const userRecorder = new MediaRecorder(micStream);
  state.english.userRecorder = userRecorder;
  userRecorder.ondataavailable = (event) => {
    if (event.data.size) state.english.userChunks.push(event.data);
  };
  userRecorder.onstop = () => {
    state.english.userAudioBlob = new Blob(state.english.userChunks, { type: userRecorder.mimeType || "audio/webm" });
  };
  userRecorder.start(250);
}

function attachRemoteToRecorder(remoteStream) {
  const mixer = state.english.mixer;
  if (!mixer || state.english.remoteRecorderAttached) return;
  try {
    const remoteSource = mixer.audioContext.createMediaStreamSource(remoteStream);
    const remoteAnalyser = mixer.audioContext.createAnalyser();
    remoteAnalyser.fftSize = 256;
    remoteAnalyser.smoothingTimeConstant = 0.88;
    remoteSource.connect(mixer.destination);
    remoteSource.connect(remoteAnalyser);
    state.english.remoteAnalyser = remoteAnalyser;
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
  state.english.durationMs = getEnglishElapsedMs();
}

function getEnglishElapsedMs() {
  if (!state.english.startedAt) return 0;
  const currentPause = state.english.pausedAt ? performance.now() - state.english.pausedAt : 0;
  return Math.max(0, Math.round(
    performance.now() - state.english.startedAt - state.english.pausedDurationMs - currentPause,
  ));
}

function finishEnglishPauseWindow() {
  if (state.english.pausedAt) {
    state.english.pausedDurationMs += performance.now() - state.english.pausedAt;
  }
  state.english.pausedAt = 0;
  state.english.paused = false;
}

function closeEnglishConnection() {
  finishEnglishPauseWindow();
  stopEnglishMeter();
  state.english.dc?.close();
  state.english.pc?.close();
  state.english.micStream?.getTracks().forEach((track) => track.stop());
  state.english.remoteStream?.getTracks().forEach((track) => track.stop());
  state.english.mixer?.audioContext?.close();
  state.english.meterContext?.close?.();
  if (state.english.remoteAudio) state.english.remoteAudio.srcObject = null;
  state.english.pc = null;
  state.english.dc = null;
  state.english.userRecorder = null;
  state.english.micStream = null;
  state.english.remoteStream = null;
  state.english.remoteAudio = null;
  state.english.analyser = null;
  state.english.remoteAnalyser = null;
  state.english.meterContext = null;
  state.english.remoteRecorderAttached = false;
  $("#pauseEnglish").disabled = true;
  $("#pauseEnglish").textContent = "暂停对话";
  resetEnglishMeter();
}

function startCountdown(seconds) {
  clearInterval(state.mandarin.timer);
  state.mandarin.remaining = seconds;
  els.readingTimer.textContent = `倒计时 ${formatSeconds(state.mandarin.remaining)}`;
  state.mandarin.timer = setInterval(() => {
    state.mandarin.remaining -= 1;
    els.readingTimer.textContent = `倒计时 ${formatSeconds(Math.max(0, state.mandarin.remaining))}`;
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
  state.english.paused = false;
  state.english.pausedAt = 0;
  state.english.pausedDurationMs = 0;
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
    context.resume().catch(() => {});
  } catch {
  }
}

function startMandarinMeter() {
  stopMandarinMeter();
  state.mandarin.meterTimer = setInterval(updateMandarinMeter, 120);
  updateMandarinMeter();
}

function startEnglishMeter() {
  stopEnglishMeter();
  const drawFrame = () => {
    updateEnglishMeter();
    state.english.meterTimer = requestAnimationFrame(drawFrame);
  };
  drawFrame();
}

function stopEnglishMeter() {
  if (state.english.meterTimer) cancelAnimationFrame(state.english.meterTimer);
  state.english.meterTimer = null;
}

function updateEnglishMeter() {
  if (state.english.paused) {
    resetEnglishMeter();
    return;
  }
  drawVoiceScope(state.english.analyser, state.english.remoteAnalyser);
}

function resetEnglishMeter() {
  drawVoiceScope();
}

function drawVoiceScope(userAnalyser = null, coachAnalyser = null) {
  const canvas = els.englishWaveCanvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  if (!userAnalyser && !coachAnalyser) {
    state.english.scopeLevels.user.fill(0);
    state.english.scopeLevels.coach.fill(0);
  }
  drawScopeChannel(context, userAnalyser, state.english.scopeLevels.user, rect.width, rect.height, -1, "#3974d8");
  drawScopeChannel(context, coachAnalyser, state.english.scopeLevels.coach, rect.width, rect.height, 1, "#d94b82");
}

function drawScopeChannel(context, analyser, levels, width, height, direction, color) {
  const center = height / 2;
  const padding = 10;
  const points = 44;
  const data = new Uint8Array(analyser?.fftSize || 128);
  if (analyser) analyser.getByteTimeDomainData(data);
  else data.fill(128);

  let energy = 0;
  const amplitudes = Array.from({ length: points }, (_, index) => {
    const sample = data[Math.floor((index / (points - 1)) * (data.length - 1))];
    const raw = Math.abs((sample - 128) / 128);
    const target = raw < 0.035 ? 0 : Math.min(1, (raw - 0.035) * 3.2);
    const response = target > levels[index] ? 0.18 : 0.07;
    levels[index] += (target - levels[index]) * response;
    energy += levels[index];
    return levels[index];
  });
  energy /= points;

  context.save();
  context.beginPath();
  amplitudes.forEach((amplitude, index) => {
    const x = padding + (index / (points - 1)) * (width - padding * 2);
    const edgeFade = Math.sin((index / (points - 1)) * Math.PI);
    const y = center + direction * (0.7 + amplitude * edgeFade * (height * 0.32));
    if (!index) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.lineWidth = energy > 0.035 ? 1.6 : 1;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.strokeStyle = color;
  context.globalAlpha = energy > 0.035 ? 0.82 : 0.3;
  context.stroke();
  context.restore();
}

function stopMandarinMeter() {
  if (state.mandarin.meterTimer) clearInterval(state.mandarin.meterTimer);
  state.mandarin.meterTimer = null;
}

function updateMandarinMeter() {
  const elapsed = state.mandarin.startedAt ? Math.max(0, performance.now() - state.mandarin.startedAt) : 0;
  els.mandarinElapsed.textContent = formatDurationMs(elapsed);

  updateAudioLevel(state.mandarin.analyser, els.mandarinDb, els.mandarinLevelBar);
}

function updateAudioLevel(analyser, dbElement, barElement) {
  if (!analyser) {
    dbElement.textContent = "-- dB";
    barElement.style.width = "0%";
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
  dbElement.textContent = `${db} dB`;
  barElement.style.width = `${level}%`;
}

function setMandarinMeterState(text) {
  els.mandarinRecordState.textContent = text;
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

function currentMonthKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthKey(key) {
  const [year, month] = key.split("-");
  return `${year}年${month}月`;
}

function calendarDayTitle(key, day) {
  const lines = [key];
  if (day.englishCount) lines.push(`英语 ${day.englishCount} 次 · ${formatDurationLong(day.englishMs)}`);
  if (day.mandarinCount) lines.push(`中文 ${day.mandarinCount} 次 · ${formatDurationLong(day.mandarinMs)}`);
  return lines.join("\n");
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
    scoreBreakdown: "分项得分",
    communication: "沟通完成度",
    readingAccuracy: "朗读准确度",
    pronunciationClarity: "发音清晰度",
    toneControl: "声调控制",
    rhythmBreath: "节奏与气息",
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
