"use strict";

const API = `${SB_URL}/ai/chat`;
const HIST_KEY = "nang_hist";
const LOG_KEY = "nang_chat_log";
const CONVERSATIONS_KEY = "nang_conversations";
const ACTIVE_CONVERSATION_KEY = "nang_active_conversation";
const MAX_CHARS = 500;
const MAX_LOG_MESSAGES = 40;
const MAX_CONVERSATIONS = 30;
const GREETING_TEXT = "こんにちは。おんJのスレッドやレスについて、調べたいことを聞いてください。何かお手伝いできることはありますか?";

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineFormat(str) {
  return str
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+?)`/g, "<code>$1</code>")
    .replace(/(https?:\/\/[^\s<]+)/g, url => {
      const trimmedTrailing = url.match(/^(.*?)([)\]},.!?:;]*)$/);
      const cleanUrl = trimmedTrailing ? trimmedTrailing[1] : url;
      const trailing = trimmedTrailing ? trimmedTrailing[2] : "";
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
    });
}

// **太字**、`インラインコード`、# 〜 ### 見出し、* 箇条書き(インデントによるネスト対応)を扱う簡易Markdownレンダラー
function renderMarkdown(raw) {
  const lines = escapeHtml(raw).split("\n");
  let html = "";
  const listStack = [];

  const closeListsTo = indent => {
    while (listStack.length && listStack[listStack.length - 1] >= indent) {
      html += "</li></ul>";
      listStack.pop();
    }
  };

  lines.forEach(line => {
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      closeListsTo(0);
      const level = headingMatch[1].length;
      html += `<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`;
      return;
    }
    const match = line.match(/^(\s*)[*\-]\s+(.*)$/);
    if (match) {
      const indent = match[1].length;
      const content = inlineFormat(match[2]);
      if (!listStack.length || indent > listStack[listStack.length - 1]) {
        html += `<ul><li>${content}`;
        listStack.push(indent);
      } else if (indent === listStack[listStack.length - 1]) {
        html += `</li><li>${content}`;
      } else {
        closeListsTo(indent + 1);
        if (listStack.length && listStack[listStack.length - 1] === indent) {
          html += `</li><li>${content}`;
        } else {
          html += `<ul><li>${content}`;
          listStack.push(indent);
        }
      }
      return;
    }
    closeListsTo(0);
    if (line.trim() === "") return;
    html += `<p>${inlineFormat(line)}</p>`;
  });
  closeListsTo(0);
  return html;
}

const form = document.getElementById("chatForm");
const input = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const chatLog = document.getElementById("chatLog");
const chatStatus = document.getElementById("chatStatus");
const charCount = document.getElementById("charCount");
const modelSelect = document.getElementById("modelSelect");
const thinkingSelect = document.getElementById("thinkingSelect");
const temperatureInput = document.getElementById("temperatureInput");
const newChatButton = document.getElementById("newChatButton");
const conversationList = document.getElementById("conversationList");
const clearConversationsButton = document.getElementById("clearConversationsButton");
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const aiShell = document.querySelector(".ai-shell");

let sending = false;
let cooldownUntil = 0;
let cooldownTimer = null;
let activeController = null;

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "") || fallback; } catch (_) { return fallback; }
}

function getSavedLog() {
  const saved = readJson(LOG_KEY, []);
  return Array.isArray(saved) ? saved.filter(item => item && typeof item.text === "string" && ["user", "assistant"].includes(item.role)) : [];
}

// static-greeting はUI表示のみの案内なので、保存・送信対象から除外する
function getMessages() {
  return Array.from(chatLog.querySelectorAll(".chat-message:not(.static-greeting)"))
    .map(node => {
      const contentEl = node.querySelector(".message-content");
      const text = contentEl?.dataset.raw ?? contentEl?.textContent ?? "";
      return { role: node.dataset.role, text };
    })
    .filter(item => item.text)
    .slice(-MAX_LOG_MESSAGES);
}

function getConversations() {
  const saved = readJson(CONVERSATIONS_KEY, []);
  return Array.isArray(saved) ? saved.filter(item => item && typeof item.id === "string" && Array.isArray(item.log)) : [];
}

function setConversations(conversations) {
  try { localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS))); } catch (_) {}
}

function createConversationId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function conversationTitle(messages) {
  const firstQuestion = messages.find(item => item.role === "user")?.text || "新しい会話";
  return firstQuestion.replace(/\s+/g, " ").slice(0, 34) || "新しい会話";
}

function getActiveConversationId() {
  try { return localStorage.getItem(ACTIVE_CONVERSATION_KEY) || ""; } catch (_) { return ""; }
}

function setActiveConversationId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
    else localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  } catch (_) {}
}

function saveActiveConversation() {
  const messages = getMessages();
  if (!messages.length) return;

  const id = getActiveConversationId() || createConversationId();
  const previous = getConversations().filter(item => item.id !== id);
  const conversation = {
    id,
    title: conversationTitle(messages),
    updatedAt: Date.now(),
    historyToken: localStorage.getItem(HIST_KEY) || "",
    log: messages
  };
  setActiveConversationId(id);
  setConversations([conversation, ...previous]);
  renderConversationList();
}

function saveLog() {
  const messages = getMessages();
  try { localStorage.setItem(LOG_KEY, JSON.stringify(messages)); } catch (_) {}
  saveActiveConversation();
}

function setHistoryToken(token) {
  try {
    if (token) localStorage.setItem(HIST_KEY, token);
    else localStorage.removeItem(HIST_KEY);
  } catch (_) {}
  saveActiveConversation();
}

function createMessage(role, text = "", isStatic = false) {
  const message = document.createElement("article");
  message.className = `chat-message ${role}${isStatic ? " static-greeting" : ""}`;
  message.dataset.role = role;

  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "✦";
    message.appendChild(avatar);
  }

  const content = document.createElement("div");
  content.className = "message-content";
  content.dataset.raw = text;
  if (role === "assistant" && !isStatic) {
    content.innerHTML = renderMarkdown(text);
  } else {
    content.textContent = text;
  }
  message.appendChild(content);
  chatLog.appendChild(message);

  if (isStatic) {
    const note = document.createElement("small");
    note.className = "message-note";
    note.innerHTML = "この案内は画面表示のみで、AIへの質問や会話履歴には送信されません。<br>これはAIであり、間違えることがあります。<br>まだまだ不安定です🥺";
    chatLog.appendChild(note);
  }

  message.scrollIntoView({ block: "end", behavior: "smooth" });
  return content;
}

// 会話が空のときだけ、案内をAIの吹き出しとして表示する(送信・保存はしない)
function showGreeting() {
  createMessage("assistant", GREETING_TEXT, true);
}

function renderLog(messages) {
  chatLog.innerHTML = "";
  if (messages.length) {
    messages.forEach(item => createMessage(item.role, item.text));
  } else {
    showGreeting();
  }
}

function restoreLog() {
  renderLog(getSavedLog());
}

function renderConversationList() {
  const conversations = getConversations();
  const activeId = getActiveConversationId();
  conversationList.innerHTML = "";

  if (!conversations.length) {
    const empty = document.createElement("p");
    empty.className = "conversation-empty";
    empty.textContent = "保存した会話はまだありません。";
    conversationList.appendChild(empty);
    return;
  }

  conversations.forEach(conversation => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-item";
    button.classList.toggle("active", conversation.id === activeId);
    button.dataset.id = conversation.id;
    button.innerHTML = `<strong></strong><small></small>`;
    button.querySelector("strong").textContent = conversation.title;
    button.querySelector("small").textContent = new Date(conversation.updatedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
    conversationList.appendChild(button);
  });
}

function setStatus(text, type = "loading") {
  chatStatus.hidden = !text;
  chatStatus.classList.toggle("error", type === "error");
  chatStatus.textContent = text || "";
}

function setSending(value) {
  sending = value;
  const locked = value || Date.now() < cooldownUntil;
  input.disabled = locked;
  sendButton.disabled = locked;
  modelSelect.disabled = locked;
  thinkingSelect.disabled = locked;
  temperatureInput.disabled = locked;
  if (!locked) input.focus();
}

const modelHintText = document.getElementById("modelHint");
const thinkingHintText = document.getElementById("thinkingHint");
const temperatureHintText = document.getElementById("temperatureHint");

const MODEL_HINTS = {
  "0": "デフォルト: サーバーが自動で最適なモデルを選びます。迷ったらこれでOK。",
  "1": "gemma-4-26b-a4b-it: 軽量モデルで応答が速く、気軽な質問向き。",
  "2": "gemma-4-31b-it: パラメータが大きく、より詳しく踏み込んだ回答が得意。",
  "3": "gemini-3.5-flash-lite: 高速・軽量でバランスの良い汎用モデル。",
  "4": "gemini-3.1-flash-lite: 3.5系より少し前の世代の高速軽量モデル。",
  "5": "gemini-flash(flash族): flash-lite系より上位で、より高精度な回答が可能。"
};
const THINKING_HINTS = {
  "": "サーバー既定: 質問内容に応じてバランスを自動調整します。",
  "minimal": "minimal: 検討量を抑え、短く素早い回答を優先します。",
  "low": "low: minimalよりやや丁寧に検討します。",
  "medium": "medium: 速度と精度のバランスが取れた標準的な検討量です。",
  "high": "high: 検討量を増やし、より丁寧・正確な回答を優先します(応答はやや遅め)。"
};

// モデルごとに選べる思考レベルの段階が異なるため、選択中のモデルに応じてoptionを作り直す
const THINKING_LEVELS_BY_GROUP = {
  none: [["", "サーバー既定"]],
  gemma: [["", "サーバー既定"], ["minimal", "minimal"], ["high", "high"]],
  flash: [["", "サーバー既定"], ["minimal", "minimal"], ["low", "low"], ["medium", "medium"], ["high", "high"]]
};

function getThinkingGroup(modelValue) {
  if (modelValue === "0") return "none";
  if (modelValue === "1" || modelValue === "2") return "gemma";
  return "flash";
}

function rebuildThinkingOptions() {
  const group = getThinkingGroup(modelSelect.value);
  const levels = THINKING_LEVELS_BY_GROUP[group];
  const current = thinkingSelect.value;
  thinkingSelect.innerHTML = "";
  levels.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    thinkingSelect.appendChild(option);
  });
  thinkingSelect.value = levels.some(([value]) => value === current) ? current : "";
}

function updateSettingHints() {
  modelHintText.textContent = MODEL_HINTS[modelSelect.value] || "";
  thinkingHintText.textContent = THINKING_HINTS[thinkingSelect.value] || "";
  temperatureHintText.textContent = "低いほど安定的、高いほど表現が多様になります(0〜2、空欄はサーバー既定)。";
}

function updateCharCount() {
  if (input.value.length > MAX_CHARS) input.value = input.value.slice(0, MAX_CHARS);
  charCount.textContent = `${input.value.length} / ${MAX_CHARS}`;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
}

function buildMessage(question) {
  const temp = temperatureInput.value.trim();
  if (temp !== "" && (!Number.isFinite(Number(temp)) || Number(temp) < 0 || Number(temp) > 2)) {
    throw new Error("temperature は 0〜2 の範囲で指定してください。");
  }
  return `${modelSelect.value},${thinkingSelect.value},${temp}:${question}`;
}

function showCooldown(seconds) {
  cooldownUntil = Date.now() + seconds * 1000;
  clearTimeout(cooldownTimer);
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    if (!remaining) {
      setStatus("");
      setSending(false);
      return;
    }
    setStatus(`混雑しています。${remaining}秒後に再試行できます。`, "error");
    setSending(true);
    cooldownTimer = window.setTimeout(tick, 250);
  };
  tick();
}

async function readError(response) {
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    try { return (await response.json()).error || "エラーが発生しました。"; } catch (_) {}
  }
  const text = (await response.text()).trim();
  return text || "エラーが発生しました。";
}

function processSseEvent(event, answer) {
  switch (event.type) {
    case "chunk":
      setStatus("");
      answer.dataset.raw = (answer.dataset.raw || "") + (event.text || "");
      answer.innerHTML = renderMarkdown(answer.dataset.raw);
      answer.scrollIntoView({ block: "end", behavior: "smooth" });
      break;
    case "status":
      setStatus(event.text || "検索しています…");
      break;
    case "history":
      if (typeof event.token === "string" && event.token) setHistoryToken(event.token);
      break;
    case "error":
      setStatus(event.text || "エラーが発生しました。", "error");
      break;
    case "done":
      return true;
  }
  return false;
}

function consumeSseLines(buffer, answer) {
  let completed = false;
  const lines = buffer.split("\n");
  const remainder = lines.pop() || "";
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.startsWith("data: ")) continue;
    try { completed = processSseEvent(JSON.parse(line.slice(6)), answer) || completed; } catch (_) {}
  }
  return { completed, remainder };
}

async function sendMessage(question) {
  createMessage("user", question);
  saveLog();
  const answer = createMessage("assistant");
  const controller = new AbortController();
  activeController = controller;
  setStatus("AIが考えています…");
  setSending(true);

  try {
    const response = await fetch(API, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: buildMessage(question), history_token: localStorage.getItem(HIST_KEY) || null })
    });
    if (!response.ok) {
      if (response.status === 403) throw Object.assign(new Error("このネットワークからは利用できません。"), { status: 403 });
      if (response.status === 429) {
        const headerValue = Number(response.headers.get("Retry-After"));
        const retryAfter = Number.isFinite(headerValue) && headerValue > 0 ? Math.ceil(headerValue) : 60;
        throw Object.assign(new Error("混雑しています。しばらくしてから再試行してください。"), { status: 429, retryAfter });
      }
      throw new Error(await readError(response));
    }
    if (!response.body) throw new Error("応答ストリームを開始できませんでした。");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;
    while (!completed) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = consumeSseLines(buffer, answer);
      buffer = parsed.remainder;
      completed = parsed.completed || completed;
    }
    buffer += decoder.decode();
    if (buffer.trim().startsWith("data: ")) {
      try { processSseEvent(JSON.parse(buffer.trimEnd().slice(6)), answer); } catch (_) {}
    }
    if (!answer.dataset.raw) {
      answer.dataset.raw = "応答を受信できませんでした。";
      answer.innerHTML = renderMarkdown(answer.dataset.raw);
    }
    saveLog();
    if (!chatStatus.classList.contains("error")) setStatus("");
  } catch (error) {
    if (error.name === "AbortError") return;
    answer.dataset.raw = answer.dataset.raw ? `${answer.dataset.raw}\n\n${error.message}` : error.message;
    answer.innerHTML = renderMarkdown(answer.dataset.raw);
    saveLog();
    if (error.status === 429) {
      showCooldown(error.retryAfter);
      return;
    }
    setStatus(error.message, "error");
  } finally {
    if (activeController === controller) {
      activeController = null;
      if (Date.now() >= cooldownUntil) setSending(false);
    }
  }
}

function startNewConversation() {
  if (sending && !confirm("送信中の応答があります。新しい会話を開始しますか？")) return;
  clearTimeout(cooldownTimer);
  if (activeController) activeController.abort();
  activeController = null;
  cooldownUntil = 0;
  try {
    localStorage.removeItem(HIST_KEY);
    localStorage.removeItem(LOG_KEY);
  } catch (_) {}
  setActiveConversationId("");
  chatLog.innerHTML = "";
  showGreeting();
  setStatus("");
  setSending(false);
  renderConversationList();
}

function loadConversation(id) {
  if (sending) {
    setStatus("送信中は会話を切り替えられません。", "error");
    return;
  }
  const conversation = getConversations().find(item => item.id === id);
  if (!conversation) return;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(conversation.log));
    if (conversation.historyToken) localStorage.setItem(HIST_KEY, conversation.historyToken);
    else localStorage.removeItem(HIST_KEY);
  } catch (_) {}
  setActiveConversationId(conversation.id);
  renderLog(conversation.log);
  setStatus("");
  renderConversationList();
  closeSidebarOnMobile();
}

function clearConversations() {
  if (!getConversations().length || !confirm("保存した会話をすべて削除しますか？")) return;
  try { localStorage.removeItem(CONVERSATIONS_KEY); } catch (_) {}
  startNewConversation();
}

function toggleSidebar() {
  const collapsed = aiShell.classList.toggle("sidebar-collapsed");
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
}

function closeSidebarOnMobile() {
  if (window.matchMedia("(max-width:900px)").matches) {
    aiShell.classList.add("sidebar-collapsed");
    document.body.classList.add("sidebar-collapsed");
  }
}

function startQuestionFromSearchPage() {
  const url = new URL(window.location.href);
  const question = (url.searchParams.get("q") || "").trim().slice(0, MAX_CHARS);
  if (!question) return;

  // 戻る・再読み込みで同じ質問を再送しないよう、受け渡し用パラメータは先に消す。
  url.searchParams.delete("q");
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  startNewConversation();
  sendMessage(question);
}

form.addEventListener("submit", event => {
  event.preventDefault();
  if (sending || Date.now() < cooldownUntil) return;
  const question = input.value.trim();
  if (!question) {
    setStatus("質問を入力してください。", "error");
    input.focus();
    return;
  }
  try { buildMessage(question); } catch (error) {
    setStatus(error.message, "error");
    return;
  }
  input.value = "";
  updateCharCount();
  sendMessage(question);
});

input.addEventListener("input", updateCharCount);
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
newChatButton.addEventListener("click", startNewConversation);
clearConversationsButton.addEventListener("click", clearConversations);
conversationList.addEventListener("click", event => {
  const button = event.target.closest(".conversation-item");
  if (button) loadConversation(button.dataset.id);
});
modelSelect.addEventListener("change", () => {
  rebuildThinkingOptions();
  updateSettingHints();
});
thinkingSelect.addEventListener("change", updateSettingHints);
sidebarToggle.addEventListener("click", toggleSidebar);
sidebarBackdrop.addEventListener("click", () => aiShell.classList.add("sidebar-collapsed"));

if (window.matchMedia("(max-width:900px)").matches) {
  aiShell.classList.add("sidebar-collapsed");
  document.body.classList.add("sidebar-collapsed");
}

restoreLog();
renderConversationList();
updateCharCount();
rebuildThinkingOptions();
updateSettingHints();
startQuestionFromSearchPage();
