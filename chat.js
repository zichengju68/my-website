/**
 * ===== AI 配置 =====
 * API Key 已安全存储在 Vercel 服务器端环境变量中，前端无需填写。
 * 前端只需调用自己的 /api/chat 接口，由服务器代理转发给 Kimi。
 */
const API_CONFIG = {
  // 指向自己的后端代理（部署后自动生效）
  baseUrl: '/api/chat',
  // 本地开发时如果直接双击 html 打开，可临时填入以下两项调试：
  // directUrl: 'https://api.moonshot.cn/v1/chat/completions',
  // directKey: '',
  systemPrompt: '你是一个友好、专业的通用 AI 助手，用简洁清晰的中文回答用户问题。',
};

const SUGGESTIONS = [
  '用三句话介绍一下徐志成的个人网站可以写什么内容',
  '推荐几个适合温暖风格个人网站的主色调',
  '如何写一段好看的摄影作品集介绍',
  'JavaScript 里 fetch 流式读取怎么实现',
];

// ===== 仅内存会话，刷新即清空 =====
let sessions = [];
let currentSessionId = null;
let isGenerating = false;
let abortController = null;

const sessionListEl = document.getElementById('sessionList');
const messagesInnerEl = document.getElementById('messagesInner');
const chatMessagesEl = document.getElementById('chatMessages');
const chatInputEl = document.getElementById('chatInput');
const btnSendEl = document.getElementById('btnSend');
const btnNewChatEl = document.getElementById('btnNewChat');
const chatTitleEl = document.getElementById('chatTitle');
const chatSidebarEl = document.getElementById('chatSidebar');
const sidebarOverlayEl = document.getElementById('sidebarOverlay');
const btnSidebarToggleEl = document.getElementById('btnSidebarToggle');

if (typeof marked !== 'undefined') {
  marked.setOptions({ breaks: true, gfm: true });
}

function isApiReady() {
  // 后端代理模式：只要 baseUrl 存在就行，不需要前端有 apiKey
  return Boolean(API_CONFIG.baseUrl);
}

function createSession() {
  const id = crypto.randomUUID();
  const session = {
    id,
    title: '新对话',
    messages: [],
  };
  sessions.unshift(session);
  currentSessionId = id;
  return session;
}

function getCurrentSession() {
  return sessions.find((s) => s.id === currentSessionId) || null;
}

function ensureSession() {
  let session = getCurrentSession();
  if (!session) {
    session = createSession();
  }
  return session;
}

function truncateTitle(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 24 ? `${t.slice(0, 24)}…` : t || '新对话';
}

function renderSessionList() {
  if (!sessionListEl) return;
  sessionListEl.innerHTML = '';

  if (sessions.length === 0) {
    const li = document.createElement('li');
    li.style.padding = '12px 14px';
    li.style.color = '#aaa';
    li.style.fontSize = '0.85rem';
    li.textContent = '暂无会话，发送消息开始';
    sessionListEl.appendChild(li);
    return;
  }

  sessions.forEach((session) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-session-item' + (session.id === currentSessionId ? ' active' : '');
    btn.textContent = session.title;
    btn.addEventListener('click', () => {
      currentSessionId = session.id;
      renderSessionList();
      renderMessages();
      closeSidebarMobile();
    });
    li.appendChild(btn);
    sessionListEl.appendChild(li);
  });
}

function renderEmptyState() {
  return `
    <div class="chat-empty">
      <h2>你好，有什么想聊的？</h2>
      <p>我是通用 AI 助手，可以回答问题、写作、编程等。试试下面的建议：</p>
      <div class="suggestion-chips">
        ${SUGGESTIONS.map(
          (text) =>
            `<button type="button" class="suggestion-chip" data-suggestion="${escapeHtmlAttr(text)}">${escapeHtml(text)}</button>`
        ).join('')}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeHtmlAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function renderUserBubble(content) {
  return `
    <div class="message-row user">
      <div class="message-avatar" aria-hidden="true">徐</div>
      <div>
        <div class="message-bubble"><p>${escapeHtml(content).replace(/\n/g, '<br>')}</p></div>
        <div class="message-actions">
          <button type="button" data-action="copy-user">复制</button>
        </div>
      </div>
    </div>
  `;
}

function renderAssistantBubble(html, extraClass = '') {
  return `
    <div class="message-row assistant">
      <div class="message-avatar" aria-hidden="true">AI</div>
      <div>
        <div class="message-bubble ${extraClass}">${html || '<span class="typing-indicator"><span></span><span></span><span></span></span>'}</div>
        <div class="message-actions">
          <button type="button" data-action="copy-assistant">复制</button>
          <button type="button" data-action="regenerate">重新生成</button>
        </div>
      </div>
    </div>
  `;
}

function parseMarkdown(raw) {
  if (!raw) return '';
  if (typeof marked === 'undefined') {
    return `<p>${escapeHtml(raw).replace(/\n/g, '<br>')}</p>`;
  }
  return marked.parse(raw);
}

function wrapCodeBlocks(container) {
  container.querySelectorAll('pre code').forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (pre.parentElement?.classList.contains('code-block-wrap')) return;

    const wrap = document.createElement('div');
    wrap.className = 'code-block-wrap';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-copy-code';
    btn.textContent = '复制';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(codeEl.textContent);
        btn.textContent = '已复制';
        setTimeout(() => { btn.textContent = '复制'; }, 1500);
      } catch {
        btn.textContent = '失败';
      }
    });
    wrap.appendChild(btn);
  });
}

function renderMessages() {
  const session = getCurrentSession();
  if (!messagesInnerEl) return;

  if (!session || session.messages.length === 0) {
    messagesInnerEl.innerHTML = renderEmptyState();
    bindSuggestionChips();
    if (chatTitleEl) chatTitleEl.textContent = '新对话';
    return;
  }

  if (chatTitleEl) chatTitleEl.textContent = session.title;

  let html = '';
  session.messages.forEach((msg, index) => {
    if (msg.role === 'user') {
      html += renderUserBubble(msg.content);
    } else if (msg.role === 'assistant') {
      const isLast = index === session.messages.length - 1;
      const streaming = isLast && isGenerating && !msg.content;
      const bubbleHtml = streaming
        ? ''
        : parseMarkdown(msg.content);
      html += renderAssistantBubble(
        bubbleHtml,
        isLast && isGenerating && msg.content ? 'streaming' : ''
      );
    }
  });

  messagesInnerEl.innerHTML = html;
  wrapCodeBlocks(messagesInnerEl);
  bindMessageActions();
  scrollToBottom();
}

function bindSuggestionChips() {
  messagesInnerEl?.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const text = chip.getAttribute('data-suggestion');
      if (text && chatInputEl) {
        chatInputEl.value = text;
        autoResizeInput();
        updateSendButton();
        chatInputEl.focus();
        sendMessage();
      }
    });
  });
}

function bindMessageActions() {
  const session = getCurrentSession();
  if (!session) return;

  messagesInnerEl?.querySelectorAll('[data-action="copy-user"]').forEach((btn, i) => {
    const userMsgs = session.messages.filter((m) => m.role === 'user');
    const msg = userMsgs[i];
    if (!msg) return;
    btn.addEventListener('click', () => copyText(msg.content));
  });

  const assistantRows = messagesInnerEl?.querySelectorAll('.message-row.assistant');
  assistantRows?.forEach((row, i) => {
    const assistantMsgs = session.messages.filter((m) => m.role === 'assistant');
    const msg = assistantMsgs[i];
    if (!msg) return;

    row.querySelector('[data-action="copy-assistant"]')?.addEventListener('click', () => {
      copyText(msg.content);
    });

    row.querySelector('[data-action="regenerate"]')?.addEventListener('click', () => {
      if (isGenerating) return;
      regenerateFromAssistantIndex(session, i);
    });
  });
}

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function regenerateFromAssistantIndex(session, assistantIndex) {
  const assistantMsgs = session.messages.filter((m) => m.role === 'assistant');
  const target = assistantMsgs[assistantIndex];
  if (!target) return;

  const pos = session.messages.lastIndexOf(target);
  session.messages = session.messages.slice(0, pos);
  sendMessage(true);
}

function scrollToBottom(force) {
  if (!chatMessagesEl) return;
  const nearBottom =
    chatMessagesEl.scrollHeight - chatMessagesEl.scrollTop - chatMessagesEl.clientHeight < 120;
  if (force || nearBottom) {
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
}

function autoResizeInput() {
  if (!chatInputEl) return;
  chatInputEl.style.height = 'auto';
  chatInputEl.style.height = `${Math.min(chatInputEl.scrollHeight, 200)}px`;
}

function updateSendButton() {
  if (!btnSendEl || !chatInputEl) return;
  if (isGenerating) {
    btnSendEl.disabled = false;
    btnSendEl.textContent = '停止';
    btnSendEl.classList.add('stop-mode');
    return;
  }
  btnSendEl.classList.remove('stop-mode');
  btnSendEl.textContent = '发送';
  btnSendEl.disabled = !chatInputEl.value.trim();
}

async function streamChatCompletion(messages, onDelta, signal) {
  // 通过自己的后端代理请求，不暴露 API Key
  const response = await fetch(API_CONFIG.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`请求失败 (${response.status})${errText ? `: ${errText.slice(0, 200)}` : ''}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch {
        /* 忽略非 JSON 行 */
      }
    }
  }
}

async function sendMessage(isRegenerate = false) {
  if (isGenerating) return;

  const session = ensureSession();
  let userText = chatInputEl?.value.trim() || '';

  if (!isRegenerate) {
    if (!userText) return;
    session.messages.push({ role: 'user', content: userText });
    if (session.title === '新对话') {
      session.title = truncateTitle(userText);
    }
    chatInputEl.value = '';
    autoResizeInput();
  } else {
    userText = [...session.messages].reverse().find((m) => m.role === 'user')?.content || '';
    if (!userText) return;
  }

  session.messages.push({ role: 'assistant', content: '' });
  renderSessionList();
  renderMessages();

  isGenerating = true;
  updateSendButton();
  abortController = new AbortController();

  const history = session.messages.slice(0, -1);
  const apiMessages = [
    { role: 'system', content: API_CONFIG.systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const assistantMsg = session.messages[session.messages.length - 1];

  try {
    if (!isApiReady()) {
      throw new Error('API_NOT_CONFIGURED');
    }

    await streamChatCompletion(
      apiMessages,
      (chunk) => {
        assistantMsg.content += chunk;
        const rows = messagesInnerEl?.querySelectorAll('.message-row.assistant');
        const lastRow = rows?.[rows.length - 1];
        const bubble = lastRow?.querySelector('.message-bubble');
        if (bubble) {
          bubble.classList.add('streaming');
          bubble.innerHTML = parseMarkdown(assistantMsg.content);
          wrapCodeBlocks(bubble);
        }
        scrollToBottom();
      },
      abortController.signal
    );

    if (!assistantMsg.content) {
      assistantMsg.content = '（未收到回复内容）';
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      if (!assistantMsg.content) {
        assistantMsg.content = '（已停止生成）';
      }
    } else if (err.message === 'API_NOT_CONFIGURED') {
      assistantMsg.content =
        '**AI 接口尚未配置**\n\n请先将网站部署到 Vercel，并在 Vercel 后台 → Settings → Environment Variables 中添加 `KIMI_API_KEY` 环境变量（值为你的 Moonshot API Key）。\n\n配置完成后重新部署即可开始对话。';
    } else {
      assistantMsg.content = `**出错了：** ${err.message}\n\n请检查网络与 API 配置后重试。`;
    }
  } finally {
    isGenerating = false;
    abortController = null;
    updateSendButton();
    renderSessionList();
    renderMessages();
  }
}

function stopGeneration() {
  abortController?.abort();
}

function startNewChat() {
  if (isGenerating) stopGeneration();
  createSession();
  renderSessionList();
  renderMessages();
  chatInputEl?.focus();
  closeSidebarMobile();
}

function openSidebarMobile() {
  chatSidebarEl?.classList.add('open');
  sidebarOverlayEl?.classList.add('visible');
}

function closeSidebarMobile() {
  chatSidebarEl?.classList.remove('open');
  sidebarOverlayEl?.classList.remove('visible');
}

btnNewChatEl?.addEventListener('click', startNewChat);

btnSidebarToggleEl?.addEventListener('click', () => {
  if (chatSidebarEl?.classList.contains('open')) {
    closeSidebarMobile();
  } else {
    openSidebarMobile();
  }
});

sidebarOverlayEl?.addEventListener('click', closeSidebarMobile);

chatInputEl?.addEventListener('input', () => {
  autoResizeInput();
  updateSendButton();
});

chatInputEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (isGenerating) return;
    sendMessage();
  }
});

btnSendEl?.addEventListener('click', () => {
  if (isGenerating) {
    stopGeneration();
    return;
  }
  sendMessage();
});

createSession();
renderSessionList();
renderMessages();
updateSendButton();
