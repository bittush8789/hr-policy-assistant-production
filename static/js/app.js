/**
 * HR Policy Assistant - Client Application
 * ChatGPT-style responsive web UI
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // DOM Elements
  const sidebar = document.getElementById('sidebar');
  const openSidebarBtn = document.getElementById('openSidebarBtn');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const refreshChatBtn = document.getElementById('refreshChatBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const historyList = document.getElementById('historyList');

  const chatViewport = document.getElementById('chatViewport');
  const welcomeHero = document.getElementById('welcomeHero');
  const messagesContainer = document.getElementById('messagesContainer');
  const typingIndicator = document.getElementById('typingIndicator');
  const typingStatusText = document.getElementById('typingStatusText');

  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');

  const handbookModal = document.getElementById('handbookModal');
  const viewHandbookBtn = document.getElementById('viewHandbookBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalUnderstoodBtn = document.getElementById('modalUnderstoodBtn');

  // Application State
  const STORAGE_KEY = 'hr_policy_chat_sessions_v1';
  let sessions = loadSessions();
  let currentSessionId = sessions.length > 0 ? sessions[0].id : createNewSession().id;
  let isGenerating = false;

  // Initialize UI
  renderHistoryList();
  loadSession(currentSessionId);

  // ============================================================================
  // SIDEBAR & MODAL CONTROLS
  // ============================================================================

  openSidebarBtn.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  closeSidebarBtn.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('mobile-open');
    } else {
      sidebar.classList.add('collapsed');
    }
  });

  newChatBtn.addEventListener('click', () => {
    const newSession = createNewSession();
    currentSessionId = newSession.id;
    renderHistoryList();
    loadSession(currentSessionId);
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('mobile-open');
    }
  });

  refreshChatBtn.addEventListener('click', () => {
    if (confirm('Start a fresh conversation?')) {
      const newSession = createNewSession();
      currentSessionId = newSession.id;
      renderHistoryList();
      loadSession(currentSessionId);
    }
  });

  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Clear all conversation history?')) {
      sessions = [];
      saveSessions();
      const fresh = createNewSession();
      currentSessionId = fresh.id;
      renderHistoryList();
      loadSession(currentSessionId);
    }
  });

  // Modal Events
  viewHandbookBtn.addEventListener('click', () => {
    handbookModal.classList.add('active');
  });

  closeModalBtn.addEventListener('click', () => {
    handbookModal.classList.remove('active');
  });

  modalUnderstoodBtn.addEventListener('click', () => {
    handbookModal.classList.remove('active');
  });

  handbookModal.addEventListener('click', (e) => {
    if (e.target === handbookModal) {
      handbookModal.classList.remove('active');
    }
  });

  // ============================================================================
  // PROMPT CARDS & POLICY CHIPS CLICKS
  // ============================================================================

  document.querySelectorAll('.prompt-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) {
        sendMessage(prompt);
      }
    });
  });

  document.querySelectorAll('.policy-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const query = chip.getAttribute('data-query');
      if (query) {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('mobile-open');
        }
        sendMessage(query);
      }
    });
  });

  // ============================================================================
  // AUTO-RESIZING TEXTAREA & SEND BUTTON
  // ============================================================================

  userInput.addEventListener('input', () => {
    // Auto-grow textarea up to 200px
    userInput.style.height = 'auto';
    const newHeight = Math.min(userInput.scrollHeight, 200);
    userInput.style.height = `${newHeight}px`;

    // Toggle Send Button active state
    if (userInput.value.trim().length > 0 && !isGenerating) {
      sendBtn.classList.add('active');
      sendBtn.disabled = false;
    } else {
      sendBtn.classList.remove('active');
      sendBtn.disabled = true;
    }
  });

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        const text = userInput.value.trim();
        if (text) {
          sendMessage(text);
        }
      }
    }
  });

  sendBtn.addEventListener('click', () => {
    const text = userInput.value.trim();
    if (text && !isGenerating) {
      sendMessage(text);
    }
  });

  // ============================================================================
  // MESSAGE SENDING & API CALL
  // ============================================================================

  async function sendMessage(text) {
    if (isGenerating || !text) return;
    isGenerating = true;

    // Reset textarea
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.classList.remove('active');
    sendBtn.disabled = true;

    // Hide welcome hero
    welcomeHero.style.display = 'none';

    // Append User Message to UI
    appendMessageToUI('user', text);

    // Save to current session state
    const session = getSession(currentSessionId);
    session.messages.push({ role: 'user', content: text, timestamp: Date.now() });
    
    // Set session title from first message
    if (session.messages.length === 1) {
      session.title = text.length > 32 ? text.substring(0, 32) + '...' : text;
    }
    saveSessions();
    renderHistoryList();

    // Show Typing Indicator
    showTypingIndicator();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: session.messages.slice(-6)
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      hideTypingIndicator();

      const assistantReply = data.answer || "I could not find an answer in the policy handbook.";
      appendMessageToUI('assistant', assistantReply);

      // Save assistant message
      session.messages.push({ role: 'assistant', content: assistantReply, timestamp: Date.now() });
      saveSessions();

    } catch (err) {
      hideTypingIndicator();
      console.error('Chat error:', err);
      const errMsg = `⚠️ Unable to connect to assistant service (${err.message}). Please ensure the backend is running.`;
      appendMessageToUI('assistant', errMsg);
      session.messages.push({ role: 'assistant', content: errMsg, timestamp: Date.now() });
      saveSessions();
    } finally {
      isGenerating = false;
      userInput.focus();
    }
  }

  // Append a message row to DOM
  function appendMessageToUI(role, content) {
    const row = document.createElement('div');
    row.className = `message-row ${role}-row`;

    if (role === 'user') {
      const bubble = document.createElement('div');
      bubble.className = 'user-bubble';
      bubble.textContent = content;
      row.appendChild(bubble);
    } else {
      // Assistant avatar
      const avatar = document.createElement('div');
      avatar.className = 'assistant-avatar';
      avatar.innerHTML = '<i data-lucide="sparkles"></i>';

      // Assistant container
      const container = document.createElement('div');
      container.className = 'assistant-bubble-container';

      // Content (Markdown formatted)
      const contentDiv = document.createElement('div');
      contentDiv.className = 'assistant-content';
      
      if (window.marked) {
        contentDiv.innerHTML = marked.parse(content);
      } else {
        contentDiv.innerHTML = escapeHtml(content).replace(/\n/g, '<br>');
      }

      // Actions bar (Copy button)
      const actions = document.createElement('div');
      actions.className = 'message-actions';
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-msg-btn';
      copyBtn.innerHTML = '<i data-lucide="copy"></i><span>Copy</span>';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content).then(() => {
          copyBtn.innerHTML = '<i data-lucide="check"></i><span>Copied!</span>';
          if (window.lucide) lucide.createIcons();
          setTimeout(() => {
            copyBtn.innerHTML = '<i data-lucide="copy"></i><span>Copy</span>';
            if (window.lucide) lucide.createIcons();
          }, 2000);
        });
      });

      actions.appendChild(copyBtn);
      container.appendChild(contentDiv);
      container.appendChild(actions);

      row.appendChild(avatar);
      row.appendChild(container);
    }

    messagesContainer.appendChild(row);
    if (window.lucide) lucide.createIcons();
    scrollToBottom();
  }

  function scrollToBottom() {
    chatViewport.scrollTop = chatViewport.scrollHeight;
  }

  // Typing indicator
  let statusInterval = null;
  const statusPhrases = [
    "Consulting HR policy handbook...",
    "Searching policy vector database...",
    "Retrieving grounded policy clauses...",
    "Formulating verified answer..."
  ];

  function showTypingIndicator() {
    typingIndicator.classList.add('active');
    let idx = 0;
    typingStatusText.textContent = statusPhrases[idx];
    statusInterval = setInterval(() => {
      idx = (idx + 1) % statusPhrases.length;
      typingStatusText.textContent = statusPhrases[idx];
    }, 2200);
    scrollToBottom();
  }

  function hideTypingIndicator() {
    typingIndicator.classList.remove('active');
    if (statusInterval) clearInterval(statusInterval);
  }

  // ============================================================================
  // SESSION & HISTORY MANAGEMENT
  // ============================================================================

  function loadSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveSessions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  function createNewSession() {
    const session = {
      id: 'session_' + Date.now(),
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now()
    };
    sessions.unshift(session);
    saveSessions();
    return session;
  }

  function getSession(id) {
    let s = sessions.find(item => item.id === id);
    if (!s) {
      s = createNewSession();
    }
    return s;
  }

  function loadSession(id) {
    currentSessionId = id;
    messagesContainer.innerHTML = '';
    const session = getSession(id);

    if (session.messages.length === 0) {
      welcomeHero.style.display = 'flex';
    } else {
      welcomeHero.style.display = 'none';
      session.messages.forEach(msg => {
        appendMessageToUI(msg.role, msg.content);
      });
    }

    // Update active state in sidebar
    document.querySelectorAll('.history-item').forEach(item => {
      if (item.getAttribute('data-id') === id) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    scrollToBottom();
  }

  function renderHistoryList() {
    historyList.innerHTML = '';
    if (sessions.length === 0) {
      historyList.innerHTML = '<div class="history-empty">No previous chats yet</div>';
      return;
    }

    sessions.forEach(session => {
      const item = document.createElement('div');
      item.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;
      item.setAttribute('data-id', session.id);

      item.innerHTML = `
        <i data-lucide="message-square"></i>
        <span class="history-item-text">${escapeHtml(session.title || 'New Conversation')}</span>
      `;

      item.addEventListener('click', () => {
        loadSession(session.id);
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('mobile-open');
        }
      });

      historyList.appendChild(item);
    });

    if (window.lucide) lucide.createIcons();
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
