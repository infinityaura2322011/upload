// Coding Monster — frontend app.js
// All API calls go to the local backend (127.0.0.1:4319). No keys in this file.

const API = 'http://127.0.0.1:4319';
let currentTaskId = null;
let currentEventSource = null;
let autoMode = true;
let workspaceRoot = '';
let cachedProviders = [];
let cachedModels = [];
let activePositions = [];
let taskAttachments = [];

// ── State machine display map ──────────────────────────────────────────────
const STATE_PROGRESS = {
  IDLE: 0, ANALYZING: 8, PLANNING: 16, CONTEXT_GATHERING: 24,
  IMPLEMENTING: 36, ENGINEERING_REVIEW: 50, REFACTORING: 58,
  DEBUGGING: 68, TEST_GENERATION: 74, TESTING: 80,
  BUILDING: 88, FIXING: 72, FINAL_REVIEW: 94,
  WAITING_FOR_APPROVAL: 96, COMPLETED: 100, FAILED: 100, CANCELLED: 0
};
const STATE_MONSTER = {
  IDLE: 'idle', ANALYZING: 'thinking', PLANNING: 'thinking',
  CONTEXT_GATHERING: 'thinking', IMPLEMENTING: 'coding',
  ENGINEERING_REVIEW: 'thinking', REFACTORING: 'coding',
  DEBUGGING: 'thinking', TEST_GENERATION: 'coding',
  TESTING: 'coding', BUILDING: 'coding', FIXING: 'angry',
  FINAL_REVIEW: 'thinking', WAITING_FOR_APPROVAL: 'idle',
  COMPLETED: 'success', FAILED: 'angry', CANCELLED: 'idle'
};

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btn-add-position')?.addEventListener('click', addPositionPrompt);

  // Titlebar window controls
  document.getElementById('btn-minimize')?.addEventListener('click', () => {
    if (window.electronAPI) window.electronAPI.minimize();
  });
  const btnMax = document.getElementById('btn-maximize');
  if (btnMax) {
    btnMax.addEventListener('click', async () => {
      if (window.electronAPI) {
        await window.electronAPI.maximize();
      } else {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    });
  }
  document.getElementById('btn-close')?.addEventListener('click', () => {
    if (window.electronAPI) {
      window.electronAPI.close();
    } else {
      window.close();
    }
  });

  setupNav();
  setupTaskBox();
  setupModeToggle();
  setupBottomTabs();
  setupComposerChips();
  // Sync URL bar when webview navigates internally
  setTimeout(function() {
    _showCorrectFrame();
    var wv = document.getElementById('asset-webview');
    if (wv && wv.tagName === 'WEBVIEW') {
      wv.addEventListener('load-commit', function(e) {
        if (e.isMainFrame) {
          var input = document.getElementById('browser-url-input');
          if (input) input.value = e.url;

        }
      });
    }
  }, 500);
  await loadPositionsData();
  renderCrew();
  await loadProviders();
  updateRoutingDeck();
  await loadUsage();
  await loadGitStatus();
  await loadSessions();
  loadWorkspaceTree();
  loadProjectProfile();

  // Get workspace info from Electron if available
  if (window.electronAPI) {
    const env = await window.electronAPI.getEnv().catch(() => ({}));
    if (env.WORKSPACE_ROOT) {
      workspaceRoot = env.WORKSPACE_ROOT;
      document.getElementById('workspace-name').textContent = workspaceRoot.split(/[\\/]/).pop() || workspaceRoot;
      document.getElementById('stat-project').textContent = workspaceRoot.split(/[\\/]/).pop() || workspaceRoot;
      document.getElementById('titleProject').textContent = '/ ' + (workspaceRoot.split(/[\\/]/).pop() || '');
    }
  }

  document.getElementById('btn-open-folder').addEventListener('click', openFolder);
  document.getElementById('btn-open-file')?.addEventListener('click', openProjectFile);
  document.getElementById('btn-add-file')?.addEventListener('click', addProjectFiles);
  document.getElementById('btn-add-folder')?.addEventListener('click', addProjectFolder);
  document.getElementById('btn-run-code')?.addEventListener('click', runWorkspaceCode);
  document.getElementById('btn-open-explorer')?.addEventListener('click', openWorkspaceInExplorer);
  document.getElementById('run-cmd-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runWorkspaceCode(); });
  document.getElementById('btn-refresh-models').addEventListener('click', async () => {
    await loadEnvStatus();
    await loadModels();
  });
  document.getElementById('btn-git-refresh').addEventListener('click', loadGitStatus);
  document.getElementById('btn-clear-log').addEventListener('click', clearLog);
  document.getElementById('btn-save-keys')?.addEventListener('click', saveApiKeys);
  document.getElementById('btn-save-settings')?.addEventListener('click', saveSettings);
  document.getElementById('btn-add-manual')?.addEventListener('click', addManualProvider);
  document.getElementById('btn-stop').addEventListener('click', stopTask);
  document.getElementById('btn-positions-save')?.addEventListener('click', savePositions);
  document.getElementById('btn-positions-reset')?.addEventListener('click', resetPositions);
  document.getElementById('btn-usage-refresh')?.addEventListener('click', loadUsage);
  document.getElementById('btn-usage-autorefresh')?.addEventListener('click', () => {
    usageAutoRefresh = !usageAutoRefresh;
    const btn = document.getElementById('btn-usage-autorefresh');
    btn.textContent = `Auto-refresh: ${usageAutoRefresh ? 'ON' : 'OFF'}`;
    btn.style.color = usageAutoRefresh ? 'var(--lime)' : '';
    if (usageAutoRefresh) usageAutoRefreshTimer = setInterval(loadUsage, 30_000);
    else clearInterval(usageAutoRefreshTimer);
  });
  startUsageTelemetryStream();
  document.getElementById('btn-clear-sessions')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all sessions?')) return;
    try {
      await fetch(`${API}/api/tasks`, { method: 'DELETE' });
      await loadSessions();
    } catch (err) {
      alert('Failed to clear sessions: ' + err.message);
    }
  });
  document.getElementById('btn-close-session-detail')?.addEventListener('click', () => {
    document.getElementById('session-detail').hidden = true;
  });
  document.getElementById('btn-run-session')?.addEventListener('click', () => {
    const button = document.getElementById('btn-run-session');
    if (button.dataset.task) rerunSession(button.dataset.task);
  });

  // Asset Discovery panel
  document.getElementById('btn-asset-search')?.addEventListener('click', searchAssets);
  document.getElementById('asset-query')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchAssets(); });
  document.getElementById('btn-asset-scaffold')?.addEventListener('click', scaffoldProject);
  document.getElementById('btn-asset-validate')?.addEventListener('click', validateProject);
  document.getElementById('btn-asset-cache-refresh')?.addEventListener('click', loadAssetCache);
  document.getElementById('btn-asset-import')?.addEventListener('click', promptImportAsset);

  // Audio panel (merged into Assets)
  document.getElementById('btn-audio-search')?.addEventListener('click', searchAudio);
  document.getElementById('audio-query')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchAudio(); });
  document.getElementById('btn-audio-cache-refresh')?.addEventListener('click', loadAudioCache);

  // Project Memory panel
  document.getElementById('btn-memory-refresh')?.addEventListener('click', loadMemory);
  document.getElementById('btn-memory-add')?.addEventListener('click', addMemoryEntry);
});

// ── Navigation ─────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const view = document.getElementById('view-' + btn.dataset.view);
      if (view) {
        view.classList.add('active');
        if (btn.dataset.view === 'models') {
          loadEnvStatus();
          loadModels();
        }
        if (btn.dataset.view === 'git') loadGitStatus();
        if (btn.dataset.view === 'sessions') loadSessions();
        if (btn.dataset.view === 'usage') loadUsage();
        if (btn.dataset.view === 'files') loadFileTreeMain();
        if (btn.dataset.view === 'positions') loadPositions();
        if (btn.dataset.view === 'settings') loadSettingsView();
        if (btn.dataset.view === 'assets')  loadAssetCache();
        if (btn.dataset.view === 'memory')  loadMemory();
      }
    });
  });
}

// ── Mode toggle ────────────────────────────────────────────────────────────
function setupModeToggle() {
  document.getElementById('btn-auto').addEventListener('click', () => {
    autoMode = true;
    document.getElementById('btn-auto').classList.add('active');
    document.getElementById('btn-manual').classList.remove('active');
    addEvent('MODE', 'AUTO routing selected');
  });
  document.getElementById('btn-manual').addEventListener('click', () => {
    autoMode = false;
    document.getElementById('btn-manual').classList.add('active');
    document.getElementById('btn-auto').classList.remove('active');
    addEvent('MODE', 'MANUAL routing selected');
  });
}

// ── Task box ───────────────────────────────────────────────────────────────
function setupTaskBox() {
  document.getElementById('btn-start').addEventListener('click', startTask);
  document.getElementById('btn-start-inline') && document.getElementById('btn-start-inline').addEventListener('click', startTask);
  document.getElementById('prompt').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startTask(); }
  });
}

async function startTask() {
  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) { document.getElementById('prompt').focus(); return; }

  setBusy(true);
  hideTaskPausedBanner();
  addEvent('TASK', 'Task accepted — connecting to orchestrator');
  setMonsterState('PLANNING', 'Planner', 'Planner is drafting a strategy…');
  setActiveAgent('planner', 'WORKING');

  try {
    const pipeline = document.getElementById('composer-pipeline')?.value || 'full-autonomous';
    const adultMode = Boolean(document.getElementById('chat-adult-mode')?.checked);
    const taskPrompt = taskAttachments.length
      ? `${prompt}\n\n[Attached files and folders]\n${taskAttachments.map((item) => '- ' + item).join('\n')}`
      : prompt;
    const res = await fetch(`${API}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: taskPrompt, pipeline, autoMode, adultMode })
    });
    if (!res.ok) throw new Error('Backend rejected task: ' + await res.text());
    const { taskId } = await res.json();
    currentTaskId = taskId;
    streamTask(taskId);
  } catch (err) {
    addEvent('ERROR', err.message, true);
    setBusy(false);
    showTaskPausedBanner(err.message);
  }
}

function streamTask(taskId) {
  if (currentEventSource) currentEventSource.close();
  const es = new EventSource(`${API}/api/tasks/${taskId}/stream`);
  currentEventSource = es;

  es.onmessage = e => {
    const data = JSON.parse(e.data);
    handleTaskEvent(data);
    if (data.stage === 'COMPLETED' || data.stage === 'FAILED' || data.stage === 'CANCELLED') {
      es.close();
      currentEventSource = null;
      setBusy(false);
      loadSessions();
    }
  };
  es.onerror = () => {
    addEvent('ERROR', 'Lost connection to backend', true);
    es.close();
    currentEventSource = null;
    setBusy(false);
  };
}

function stopTask() {
  if (currentEventSource) { currentEventSource.close(); currentEventSource = null; }
  setBusy(false);
  addEvent('CANCELLED', 'Task stopped by user');
  setMonsterState('CANCELLED');
}

// ── Task event handler ─────────────────────────────────────────────────────
function handleTaskEvent(data) {
  const { stage, message, agent, at } = data;
  const failed = stage === 'FAILED';
  const success = stage === 'COMPLETED';

  addEvent(stage, message, failed, success);
  setMonsterState(stage, agent, message);
  setProgress(STATE_PROGRESS[stage] ?? 0);
  setStateBadge(stage);

  if (agent) setActiveAgent(agent, failed ? 'FAILED' : (success ? 'DONE' : 'WORKING'));
  if (message) setMonsterMessage(message);

  // Route to bottom panels
  if (stage === 'TESTING') appendTestOutput(message);
  if (stage === 'BUILDING') appendBuildOutput(message);
  if (message && message.startsWith('[terminal]')) appendTerminalOutput(message);
  appendTaskLog(stage, message, failed);

  if (failed) {
    showTaskPausedBanner(message);
  }
}

// ── AI Workforce Crew & Status ─────────────────────────────────────────────
const CREW_ROLES = [
  { id: 'planner', name: 'Planner' },
  { id: 'designer', name: 'Designer' },
  { id: 'architect', name: 'Architect' },
  { id: 'frontendCoder', name: 'Frontend Coder' },
  { id: 'backendCoder', name: 'Backend Coder' },
  { id: 'engineeringReviewer', name: 'Eng. Reviewer' },
  { id: 'refactorer', name: 'Refactorer' },
  { id: 'debugger', name: 'Debugger' },
  { id: 'tester', name: 'Tester' },
  { id: 'finalJudge', name: 'Final Judge' }
];

function renderCrew(activeAgentId = null, activeStatus = 'WORKING') {
  const deck = document.getElementById('agent-list');
  if (!deck) return;
  deck.innerHTML = '';

  CREW_ROLES.forEach(role => {
    const pos = activePositions.find(p => p.role.toLowerCase() === role.id.toLowerCase());
    const provText = (pos && pos.providerId && pos.providerId !== 'auto')
      ? pos.providerId.toUpperCase()
      : 'Auto';
    const modelText = (pos && pos.modelId && pos.modelId !== 'auto')
      ? pos.modelId
      : 'AUTO-BEST';

    const isActive = activeAgentId && (
      role.id.toLowerCase() === activeAgentId.toLowerCase() ||
      role.name.toLowerCase().replace(/[^a-z]/g, '').includes(activeAgentId.toLowerCase().replace(/[^a-z]/g, ''))
    );

    let statusText = 'QUEUED';
    let cardClass = 'crew-card';
    let dotClass = 'crew-dot';

    if (isActive) {
      statusText = activeStatus;
      cardClass = `crew-card ${activeStatus === 'WORKING' ? 'working' : (activeStatus === 'DONE' ? 'done' : '')}`;
      dotClass = `crew-dot ${activeStatus === 'WORKING' ? 'working' : (activeStatus === 'DONE' ? 'done' : '')}`;
    }

    const card = document.createElement('div');
    card.className = cardClass;
    card.dataset.agent = role.id;
    card.innerHTML = `
      <div class="crew-card-row-top">
        <span class="crew-role"><span class="${dotClass}"></span>${role.name}</span>
        <span class="crew-state-tag">${statusText}</span>
      </div>
      <div class="crew-card-row-sub">
        <span class="crew-prov">${escHtml(provText)}</span>
        <span>·</span>
        <span class="crew-model-mode">${escHtml(modelText)}</span>
      </div>
    `;
    deck.appendChild(card);
  });
}

function setMonsterState(stage, agent = null, message = '') {
  const roleEl = document.getElementById('wf-active-role');
  const dotEl = document.getElementById('wf-active-dot');
  const stateEl = document.getElementById('wf-active-state');
  const provEl = document.getElementById('wf-active-prov');
  const modelEl = document.getElementById('wf-active-model');

  if (!roleEl) return;

  if (stage === 'IDLE' || stage === 'CANCELLED') {
    roleEl.textContent = 'STANDBY';
    dotEl.textContent = '○';
    dotEl.className = 'wf-dot';
    stateEl.textContent = 'IDLE';
    stateEl.className = 'wf-state-pill';
    provEl.textContent = 'System Ready';
    modelEl.textContent = autoMode ? 'AUTO-BEST' : 'MANUAL';
  } else if (stage === 'COMPLETED') {
    roleEl.textContent = 'ALL DONE';
    dotEl.textContent = '✓';
    dotEl.className = 'wf-dot';
    stateEl.textContent = 'COMPLETE';
    stateEl.className = 'wf-state-pill working';
    provEl.textContent = 'All Agents';
    modelEl.textContent = 'Finished';
  } else if (stage === 'FAILED') {
    roleEl.textContent = 'PAUSED';
    dotEl.textContent = '⚠';
    dotEl.className = 'wf-dot';
    stateEl.textContent = 'PAUSED';
    stateEl.className = 'wf-state-pill paused';
    provEl.textContent = 'Interrupted';
    modelEl.textContent = 'Needs Attention';
  } else {
    // Active stage
    const displayName = agent || stage.replace(/_/g, ' ');
    roleEl.textContent = displayName;
    dotEl.textContent = '●';
    dotEl.className = 'wf-dot working';
    stateEl.textContent = 'PROCESSING';
    stateEl.className = 'wf-state-pill working';

    // Find assigned provider / model for this agent or top model
    const pos = activePositions.find(p => agent && p.role.toLowerCase() === agent.toLowerCase());
    if (pos && pos.providerId !== 'auto') {
      provEl.textContent = pos.providerId.toUpperCase();
      modelEl.textContent = pos.modelId !== 'auto' ? pos.modelId : 'AUTO-BEST';
    } else {
      const topModel = cachedModels.find(m => m.capabilities?.chat && !m.health?.blacklisted);
      provEl.textContent = topModel ? topModel.providerId.toUpperCase() : 'AUTO';
      modelEl.textContent = topModel ? topModel.modelId : 'AUTO-BEST';
    }
  }
}

function setProgress(pct) {
  const el = document.getElementById('progress-fill');
  if (el) el.style.width = pct + '%';
}

function setMonsterMessage(msg) {
  const el = document.getElementById('monster-message');
  if (el) {
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }
}

function setActiveAgent(agentName, status = 'WORKING') {
  renderCrew(agentName, status);
}

function setStateBadge(state) {
  const badge = document.getElementById('task-state-badge');
  if (badge) {
    badge.textContent = state;
    badge.className = 'state-badge';
    if (state === 'COMPLETED') badge.classList.add('done');
    else if (state === 'FAILED') badge.classList.add('failed');
    else if (state !== 'IDLE') badge.classList.add('running');
  }
  const stat = document.getElementById('stat-state');
  if (stat) stat.textContent = state;
}

// ── Busy state ─────────────────────────────────────────────────────────────
function setBusy(busy) {
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  if (btnStart) {
    btnStart.disabled = busy;
    btnStart.style.display = busy ? 'none' : 'inline-flex';
  }
  if (btnStop) {
    btnStop.style.display = busy ? 'inline-flex' : 'none';
  }
  if (!busy) {
    setProgress(0);
    renderCrew();
  }
}

// ── Event log ──────────────────────────────────────────────────────────────
function addEvent(stage, message, failed = false, success = false) {
  const log = document.getElementById('event-log');
  const item = document.createElement('div');
  item.className = 'event-item';
  const now = new Date();
  const time = now.toTimeString().slice(0, 8);
  const stageClass = failed ? 'failed' : success ? 'success' : '';
  item.innerHTML = `<span class="event-time">${time}</span><span class="event-stage ${stageClass}">${stage}</span><span class="event-msg">${escHtml(message)}</span>`;
  log.prepend(item);
}

function clearLog() {
  document.getElementById('event-log').innerHTML = '';
  addEvent('READY', 'Log cleared');
}

// ── Bottom panels & Workstation Tabs ─────────────────────────────────────────
function setupBottomTabs() {
  const tabBtns = document.querySelectorAll('.bottom-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.bottom-tab-content').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPane = document.getElementById(`tab-pane-${btn.dataset.tab}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  document.getElementById('btn-clear-bottom')?.addEventListener('click', () => {
    const activePane = document.querySelector('.bottom-tab-content.active');
    if (activePane) {
      const output = activePane.querySelector('.terminal-output');
      if (output) output.innerHTML = '';
    }
  });

  const toggleBtn = document.getElementById('btn-toggle-bottom');
  if (toggleBtn) {
    let collapsed = false;
    toggleBtn.addEventListener('click', () => {
      const bottomBar = document.getElementById('bottom-bar');
      const app = document.getElementById('app');
      collapsed = !collapsed;
      if (collapsed) {
        bottomBar.style.height = '34px';
        app.style.height = 'calc(100vh - 38px - 34px)';
        toggleBtn.textContent = '▲';
      } else {
        bottomBar.style.height = '180px';
        app.style.height = 'calc(100vh - 38px - 180px)';
        toggleBtn.textContent = '▼';
      }
    });
  }

  document.getElementById('btn-paused-retry')?.addEventListener('click', () => {
    hideTaskPausedBanner();
    startTask();
  });

  document.getElementById('btn-paused-settings')?.addEventListener('click', () => {
    document.querySelector('.nav-btn[data-view="settings"]')?.click();
  });
}

function showTaskPausedBanner(msg) {
  const banner = document.getElementById('task-paused-banner');
  if (banner) {
    banner.style.display = 'flex';
    if (msg) {
      const desc = banner.querySelector('.paused-desc');
      if (desc) desc.textContent = msg;
    }
    const logTabBtn = document.querySelector('.bottom-tab-btn[data-tab="task-log"]');
    if (logTabBtn) logTabBtn.click();
  }
}

function hideTaskPausedBanner() {
  const banner = document.getElementById('task-paused-banner');
  if (banner) banner.style.display = 'none';
}

function setupComposerChips() {
  const chipWs = document.getElementById('chip-workspace');
  if (chipWs) {
    chipWs.addEventListener('click', () => {
      document.querySelector('.nav-btn[data-view="files"]')?.click();
    });
  }

  const chipAdd = document.getElementById('chip-add-files');
  if (chipAdd) {
    chipAdd.addEventListener('click', async () => {
      if (window.electronAPI?.selectFilesAndFolders) {
        const selected = await window.electronAPI.selectFilesAndFolders();
        if (Array.isArray(selected)) {
          taskAttachments = [...new Set([...taskAttachments, ...selected])];
          renderTaskAttachments();
          // Auto-analyze images for vision context
          for (const f of selected) {
            if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f) && window.PerchanceUniversal) {
              const desc = await window.PerchanceUniversal.analyzeImageForContext(f);
              if (desc) {
                const promptEl = document.getElementById('prompt');
                if (promptEl && !promptEl.value.includes('[Image:')) {
                  promptEl.value += `\n\n[Image: ${f.split(/[\\/]/).pop()}]\n${desc}`;
                }
              }
            }
          }
        }
      } else {
        document.getElementById('input-add-files').click();
      }
    });
  }

  renderTaskAttachments();

  const chipContext = document.getElementById('chip-context');
  if (chipContext) {
    chipContext.addEventListener('click', () => {
      const promptEl = document.getElementById('prompt');
      const snippet = '\n\n[Context: Project Architecture & Dependencies]\n';
      if (!promptEl.value.includes('[Context:')) {
        promptEl.value += snippet;
      }
      promptEl.focus();
    });
  }

  // Expose captureAndDisplayResults globally for HTML onclick
  window.captureAndDisplayResults = async (prompt, genId) => {
    if (window.PerchanceUniversal) {
      await window.PerchanceUniversal.captureAndDisplayResults(prompt, genId);
    }
  };

  // Check vision status on load
  if (window.PerchanceUniversal) {
    window.PerchanceUniversal.checkVisionStatus().then(status => {
      if (status.hasVision) {
        addEvent('VISION', `👁 Vision model ready: ${[...status.ollamaModels, ...status.cloudModels].slice(0,2).join(', ')}`);
      } else {
        addEvent('VISION', `⚠ No vision model — run: ollama pull llava:7b`);
      }
    });
  }
}

function renderTaskAttachments() {
  const container = document.getElementById('task-attachments');
  if (!container) return;
  container.innerHTML = taskAttachments.map((item, index) => `
    <span class="task-attachment" title="${escHtml(item)}">
      <span>📎 ${escHtml(item.split(/[\\/]/).pop() || item)}</span>
      <button type="button" data-attachment-index="${index}" title="Remove attachment" aria-label="Remove attachment">×</button>
    </span>`).join('');
  container.querySelectorAll('[data-attachment-index]').forEach((button) => {
    button.addEventListener('click', () => {
      taskAttachments.splice(Number(button.dataset.attachmentIndex), 1);
      renderTaskAttachments();
    });
  });
}

function appendTerminalOutput(msg) {
  const el = document.getElementById('terminal-output');
  if (!el) return;
  // Strip the [terminal] prefix and format as a proper terminal line
  const clean = msg.replace(/^\[terminal\]\s*/, '');
  el.innerHTML += `<div class="cmd">${escHtml(clean)}</div>`;
  el.scrollTop = el.scrollHeight;
}

function appendTestOutput(msg) {
  const el = document.getElementById('test-output');
  if (!el) return;
  el.innerHTML += `<div>${escHtml(msg)}</div>`;
  el.scrollTop = el.scrollHeight;
}

function appendBuildOutput(msg) {
  const el = document.getElementById('build-output');
  if (!el) return;
  el.innerHTML += `<div>${escHtml(msg)}</div>`;
  el.scrollTop = el.scrollHeight;
}

function appendTaskLog(stage, msg, failed = false) {
  const el = document.getElementById('task-log-output');
  if (!el) return;
  const now = new Date();
  const time = now.toTimeString().slice(0, 8);
  const color = failed ? 'var(--red)' : (stage === 'COMPLETED' ? 'var(--lime)' : (msg.includes('fallback') || msg.includes('warn') ? 'var(--amber)' : 'var(--cyan)'));

  const div = document.createElement('div');
  div.innerHTML = `<span style="color:var(--dim)">[${time}]</span> <span style="color:${color};font-weight:600">[${escHtml(stage)}]</span> <span style="color:var(--ink)">${escHtml(msg)}</span>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function updateRoutingDeck() {
  const statsEl = document.getElementById('routing-stats');
  const currentValEl = document.getElementById('routing-current-val');
  const fallbackValEl = document.getElementById('routing-fallback-val');
  const healthListEl = document.getElementById('provider-health-list');

  if (statsEl) {
    const totalModels = cachedModels.length;
    const totalProv = cachedProviders.length;
    statsEl.textContent = totalModels > 0 ? `${totalModels} models · ${totalProv} providers` : 'Catalog ready';
  }

  const eligible = cachedModels.filter(m => m.capabilities?.chat && !m.health?.blacklisted);
  if (currentValEl) {
    if (eligible.length > 0) {
      currentValEl.innerHTML = `<span class="prov">${escHtml(eligible[0].providerId.toUpperCase())}</span> <span class="model">${escHtml(eligible[0].modelId)}</span>`;
    } else {
      currentValEl.innerHTML = `<span class="prov">Auto</span> <span class="model">selecting…</span>`;
    }
  }

  if (fallbackValEl) {
    if (eligible.length > 1) {
      fallbackValEl.innerHTML = `<span class="prov">${escHtml(eligible[1].providerId.toUpperCase())}</span> <span class="model">${escHtml(eligible[1].modelId)}</span>`;
    } else if (eligible.length === 1) {
      fallbackValEl.innerHTML = `<span class="prov">Backup</span> <span class="model">available</span>`;
    } else {
      fallbackValEl.innerHTML = `<span class="prov">None</span> <span class="model">add keys</span>`;
    }
  }

  if (healthListEl) {
    healthListEl.innerHTML = '';
    if (cachedProviders.length === 0) {
      healthListEl.innerHTML = '<span class="prov-health-pill dead"><span class="dot"></span> No providers</span>';
      return;
    }

    cachedProviders.forEach(p => {
      const pill = document.createElement('span');
      const isHealthy = Boolean(p.healthy);
      const label = (p.displayName || p.name || p.id || 'Provider').toString();
      pill.className = `prov-health-pill ${isHealthy ? 'healthy' : 'dead'}`;
      pill.innerHTML = `<span class="dot"></span> ${escHtml(label)}`;
      pill.title = `${p.id || label}: ${isHealthy ? 'Healthy' : 'Unavailable/Offline'}`;
      healthListEl.appendChild(pill);
    });
  }
}

async function loadPositionsData() {
  try {
    const res = await fetch(`${API}/api/routing`);
    if (res.ok) {
      activePositions = await res.json();
    }
  } catch {}
}

// ── Providers ──────────────────────────────────────────────────────────────
async function loadProviders() {
  try {
    const res = await fetch(`${API}/api/providers`);
    const providers = await res.json();
    cachedProviders = providers;
    const healthy = providers.filter(p => p.healthy).length;
    document.getElementById('stat-providers').textContent = `${healthy} / ${providers.length} online`;
    document.getElementById('stat-providers').className = 'stat-value ' + (healthy > 0 ? 'good' : 'dim');
    addEvent('PROVIDERS', `${healthy}/${providers.length} providers online`);
    updateRoutingDeck();
    renderCrew();
    // If no providers healthy yet, retry in 4s to pick up background refresh
    if (healthy === 0 && providers.length > 0) {
      setTimeout(loadProviders, 4000);
    }
  } catch {
    document.getElementById('stat-providers').textContent = 'Backend offline';
    document.getElementById('stat-providers').className = 'stat-value dim';
    addEvent('ERROR', 'Backend is offline — start the server', true);
    setTimeout(loadProviders, 3000);
  }
}

// ── Models ─────────────────────────────────────────────────────────────────
async function loadModels() {
  try {
    const res = await fetch(`${API}/api/models`);
    const models = await res.json();
    cachedModels = models;
    const tbody = document.getElementById('models-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!models.length) {
      tbody.innerHTML = '<tr><td colspan="14" style="color:var(--dim);text-align:center;padding:24px">No models loaded. Add API keys in Settings or connect your own endpoint.</td></tr>';
      return;
    }

    const displayModels = models
      .filter(m => {
        const cap = m.capabilities || {};
        return Boolean(cap.chat || cap.coding || cap.reasoning || cap.toolUse || cap.structuredOutput || cap.vision || cap.embedding || cap.streaming || cap.audioInput || cap.speechToText || cap.imageGeneration);
      })
      .sort((a, b) => {
        const rankA = Number(Boolean((a.capabilities || {}).chat)) + Number(Boolean((a.capabilities || {}).coding));
        const rankB = Number(Boolean((b.capabilities || {}).chat)) + Number(Boolean((b.capabilities || {}).coding));
        if (rankB !== rankA) return rankB - rankA;
        return String(a.modelId || '').localeCompare(String(b.modelId || ''));
      });

    const maxRender = 220;
    const visibleModels = displayModels.slice(0, maxRender);
    const fragment = document.createDocumentFragment();

    visibleModels.forEach(m => {
      const cap = m.capabilities || {};
      const badge = `<span class="provider-badge ${m.providerId}">${escHtml(m.providerId)}</span>`;
      const yes = '<span class="cap-yes" title="Supported">✓</span>';
      const no  = '<span class="cap-no"  title="Not supported">—</span>';
      const healthScore = m.health?.healthScore ?? 100;
      const healthClass = healthScore >= 70 ? 'good' : healthScore >= 40 ? 'warning' : 'danger';
      const blacklisted = m.health?.blacklisted ? '<span style="color:var(--red);font:9px var(--mono)">BLACKLISTED</span>' : '';
      const healthBar = `<div class="health-bar-wrap"><div class="health-bar-fill ${healthClass}" style="width:${healthScore}%"></div></div>`;
      const rowStyle = !cap.chat ? 'style="opacity:.45"' : '';

      const tr = document.createElement('tr');
      tr.setAttribute('style', rowStyle.replace(/^style="|"$/g, ''));
      tr.innerHTML = `
        <td>${badge}</td>
        <td style="color:var(--ink);font:11px var(--mono)">${escHtml(m.modelId)}</td>
        <td>${m.contextLength ? (m.contextLength/1000).toFixed(0)+'k' : '—'}</td>
        <td>${cap.chat ? yes : no}</td>
        <td>${cap.coding ? yes : no}</td>
        <td>${cap.reasoning ? yes : no}</td>
        <td>${cap.toolUse ? yes : no}</td>
        <td>${cap.structuredOutput ? yes : no}</td>
        <td>${cap.vision ? yes : no}</td>
        <td>${cap.audioInput ? yes : no}</td>
        <td>${cap.speechToText ? yes : no}</td>
        <td>${cap.imageGeneration ? yes : no}</td>
        <td>${cap.embedding ? yes : no}</td>
        <td>${cap.streaming ? yes : no}</td>
        <td class="health-bar-cell">${healthBar}${blacklisted}</td>
      `;
      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);

    if (displayModels.length > maxRender) {
      const summaryRow = document.createElement('tr');
      summaryRow.innerHTML = `<td colspan="14" style="color:var(--dim);text-align:center;padding:14px 12px;font:11px var(--mono)">Showing ${maxRender} of ${displayModels.length} eligible models for faster rendering.</td>`;
      tbody.appendChild(summaryRow);
    }

    const modelDisp = document.getElementById('active-model-display');
    if (modelDisp) {
      modelDisp.innerHTML = `AUTO ROUTING<br><span class="dim">${models.length} models available</span>`;
    }
    updateRoutingDeck();
    renderCrew();
  } catch (err) {
    const tbody = document.getElementById('models-tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="14" style="color:var(--red)">Failed to load models</td></tr>';
    }
  }
}

// ── Git ────────────────────────────────────────────────────────────────────
async function loadGitStatus() {
  try {
    const [statusRes, diffRes, logRes] = await Promise.all([
      fetch(`${API}/api/git/status`),
      fetch(`${API}/api/git/diff`),
      fetch(`${API}/api/git/log`)
    ]);
    const status = await statusRes.json();
    const diff = await diffRes.json();
    const log = await logRes.json();

    document.getElementById('stat-branch').textContent = status.isRepo ? status.branch : 'No repo';
    document.getElementById('stat-branch').className = 'stat-value ' + (status.isRepo ? '' : 'dim');

    const statusEl = document.getElementById('git-status-body');
    if (status.isRepo) {
      statusEl.innerHTML = `<span style="color:var(--lime)">branch: ${escHtml(status.branch)}</span>\n` +
        (status.staged.map(f => `<span style="color:var(--lime)">staged: ${escHtml(f)}</span>`).join('\n') || '') +
        (status.modified.map(f => `<span style="color:var(--orange)">modified: ${escHtml(f)}</span>`).join('\n') || '') +
        (status.untracked.map(f => `<span style="color:var(--muted)">untracked: ${escHtml(f)}</span>`).join('\n') || '') ||
        '<span style="color:var(--dim)">Clean working tree</span>';
    } else {
      statusEl.innerHTML = '<span style="color:var(--dim)">Not a git repository</span>';
    }

    const diffEl = document.getElementById('git-diff-body');
    if (diff.diff) {
      diffEl.innerHTML = diff.diff.split('\n').map(line => {
        if (line.startsWith('+') && !line.startsWith('+++')) return `<span class="add">${escHtml(line)}</span>`;
        if (line.startsWith('-') && !line.startsWith('---')) return `<span class="remove">${escHtml(line)}</span>`;
        if (line.startsWith('@@')) return `<span class="hunk">${escHtml(line)}</span>`;
        return escHtml(line);
      }).join('\n');
    } else {
      diffEl.textContent = 'No diff';
    }

    document.getElementById('git-log-body').textContent = log.log || 'No commits';
  } catch {
    document.getElementById('git-status-body').textContent = 'Git unavailable';
  }
}

// ── Circle Percentage Component ───────────────────────────────────────────
function renderCircleProgress(pct, size = 56, strokeWidth = 4.5) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const validPct = pct !== null && !isNaN(pct) ? Math.max(0, Math.min(100, pct)) : null;
  const offset = validPct !== null ? circumference - (validPct / 100) * circumference : circumference;

  let color = 'var(--lime)';
  if (validPct !== null) {
    if (validPct < 20) color = 'var(--red)';
    else if (validPct < 50) color = 'var(--orange)';
    else color = 'var(--lime)';
  } else {
    color = 'var(--dim)';
  }

  const label = validPct !== null ? `${Math.round(validPct)}%` : '—';
  const sub = validPct !== null ? 'LEFT' : 'N/A';

  return `
    <div class="circle-progress" style="width:${size}px; height:${size}px;" title="${validPct !== null ? `${Math.round(validPct)}% quota remaining` : 'Quota metric unavailable'}">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle class="circle-bg" cx="${size/2}" cy="${size/2}" r="${radius}" stroke-width="${strokeWidth}" />
        <circle class="circle-bar" cx="${size/2}" cy="${size/2}" r="${radius}" stroke-width="${strokeWidth}"
          stroke="${color}"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${offset}"
          stroke-linecap="round"
          transform="rotate(-90 ${size/2} ${size/2})" />
      </svg>
      <div class="circle-text">
        <span class="circle-pct" style="color:${color};font-size:${Math.max(9, Math.round(size*0.22))}px">${label}</span>
        <span class="circle-sub" style="font-size:${Math.max(6, Math.round(size*0.11))}px">${sub}</span>
      </div>
    </div>
  `;
}

// ── Sessions ───────────────────────────────────────────────────────────────
async function loadSessions() {
  try {
    const res = await fetch(`${API}/api/tasks`);
    const tasks = await res.json();
    const list = document.getElementById('sessions-list');
    list.innerHTML = '';
    if (!tasks.length) {
      list.innerHTML = '<div style="color:var(--dim);font:12px var(--mono);padding:20px">No sessions yet</div>';
      return;
    }
    tasks.forEach(t => {
      const card = document.createElement('div');
      card.className = 'session-card';
      const date = new Date(t.created_at).toLocaleString();
      card.innerHTML = `
        <button class="btn-session-delete" title="Delete this session" data-id="${t.id}">✕</button>
        <div class="session-prompt">${escHtml(t.prompt.slice(0, 160))}${t.prompt.length > 160 ? '…' : ''}</div>
        <div class="session-meta">
          <span>${date}</span>
          <span class="session-state ${t.state}">${t.state}</span>
          <span style="font:10px var(--mono);color:var(--dim)">ID: ${escHtml(t.id.slice(0, 8))}</span>
        </div>`;

      card.addEventListener('click', () => loadSessionDetail(t.id));

      card.querySelector('.btn-session-delete')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        card.style.opacity = '0.3';
        card.style.transform = 'scale(0.98)';
        try {
          const delRes = await fetch(`${API}/api/tasks/${t.id}`, { method: 'DELETE' });
          if (!delRes.ok) throw new Error('Delete failed');
          card.remove();
          if (!list.children.length) {
            list.innerHTML = '<div style="color:var(--dim);font:12px var(--mono);padding:20px">No sessions yet</div>';
          }
          addEvent('SESSION', `Deleted session ${t.id.slice(0, 8)}`);
        } catch (err) {
          card.style.opacity = '1';
          card.style.transform = 'none';
          alert('Failed to delete session: ' + err.message);
        }
      });

      list.appendChild(card);
    });
  } catch {
    document.getElementById('sessions-list').innerHTML = '<div style="color:var(--red)">Failed to load sessions</div>';
  }
}

function formatSessionDuration(startAt, endAt = Date.now()) {
  const seconds = Math.max(0, Math.floor((endAt - startAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function sessionProgress(state) {
  return Number(STATE_PROGRESS[state] ?? 0);
}

async function loadSessionDetail(taskId) {
  const detail = document.getElementById('session-detail');
  const title = document.getElementById('session-detail-title');
  const summary = document.getElementById('session-detail-summary');
  const eventsEl = document.getElementById('session-detail-events');
  const progressEl = document.getElementById('session-detail-progress');
  const rerunButton = document.getElementById('btn-run-session');
  detail.hidden = false;
  eventsEl.innerHTML = '<div class="session-detail-loading">Loading session transcript…</div>';

  try {
    const [taskRes, eventsRes] = await Promise.all([
      fetch(`${API}/api/tasks/${taskId}`),
      fetch(`${API}/api/tasks/${taskId}/events`),
    ]);
    if (!taskRes.ok || !eventsRes.ok) throw new Error('Session data unavailable');
    const task = await taskRes.json();
    const events = await eventsRes.json();
    const latest = events[events.length - 1];
    const progress = sessionProgress(task.state);
    const endAt = task.completed_at || Date.now();
    const folder = task.root_path || 'Workspace path unavailable';
    title.textContent = task.project_name || task.prompt.slice(0, 80);
    rerunButton.dataset.task = taskId;
    rerunButton.hidden = task.state === 'COMPLETED';
    summary.innerHTML = `
      <div class="session-summary-item"><span>STATUS</span><strong class="session-state ${escHtml(task.state)}">${escHtml(task.state)}</strong></div>
      <div class="session-summary-item"><span>PROGRESS</span><strong>${progress}%</strong></div>
      <div class="session-summary-item"><span>TIME</span><strong>${formatSessionDuration(task.created_at, endAt)}</strong></div>
      <div class="session-summary-item session-summary-folder"><span>WORKSPACE / FOLDER</span><strong title="${escHtml(folder)}">${escHtml(folder)}</strong></div>`;
    progressEl.style.width = `${progress}%`;
    progressEl.className = `session-progress-fill ${task.state === 'FAILED' ? 'failed' : task.state === 'COMPLETED' ? 'completed' : ''}`;

    const eventRows = events.map((event) => {
      const provider = event.provider_id ? `${event.provider_id}${event.model_id ? ` / ${event.model_id}` : ''}` : '';
      const agent = event.agent ? `<span class="session-event-agent">${escHtml(event.agent)}</span>` : '';
      const meta = [agent, provider ? `<span>${escHtml(provider)}</span>` : ''].filter(Boolean).join(' · ');
      return `<article class="session-event ${event.to_state === 'FAILED' ? 'failed' : ''}">
        <div class="session-event-time">${new Date(Number(event.at)).toLocaleTimeString()}</div>
        <div class="session-event-body"><div class="session-event-stage">${escHtml(event.to_state || event.from_state || 'EVENT')}</div>
        <div class="session-event-note">${escHtml(event.note || '')}</div>${meta ? `<div class="session-event-meta">${meta}</div>` : ''}</div>
      </article>`;
    }).join('');
    eventsEl.innerHTML = `<div class="session-chat-prompt"><span class="session-chat-label">TASK PROMPT</span>${escHtml(task.prompt)}</div>${eventRows || '<div class="session-detail-loading">No activity recorded yet.</div>'}`;
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    eventsEl.innerHTML = `<div class="session-detail-error">Failed to load session: ${escHtml(err.message)}</div>`;
  }
}

async function rerunSession(taskId) {
  const button = document.getElementById('btn-run-session');
  button.disabled = true;
  button.textContent = 'Opening workspace…';

  try {
    const taskRes = await fetch(`${API}/api/tasks/${taskId}`);
    if (!taskRes.ok) throw new Error('Session not found');
    const task = await taskRes.json();
    const targetWorkspace = task.root_path || workspaceRoot;
    if (!targetWorkspace) throw new Error('No workspace folder is currently open');

    const switchRes = await fetch(`${API}/api/workspace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: targetWorkspace }),
    });
    if (!switchRes.ok) throw new Error((await switchRes.text()) || 'Could not open workspace');
    const workspace = await switchRes.json();
    workspaceRoot = workspace.root;
    const workspaceName = workspace.name || workspaceRoot.split(/[\\/]/).pop() || workspaceRoot;
    document.getElementById('workspace-name').textContent = workspaceName;
    document.getElementById('stat-project').textContent = workspaceName;
    document.getElementById('titleProject').textContent = '/ ' + workspaceName;
    document.getElementById('prompt').value = task.prompt;
    document.getElementById('session-detail').hidden = true;
    document.querySelector('.nav-btn[data-view="home"]')?.click();
    button.textContent = 'Run Task Again';
    button.disabled = false;
    await startTask();
  } catch (err) {
    button.disabled = false;
    button.textContent = 'Run Task Again';
    alert('Could not restart task: ' + err.message);
  }
}

// ── Usage Center — Telemetry System ──────────────────────────────────────────
let usageAutoRefresh = false;
let usageAutoRefreshTimer = null;
let usageTelemetryStream = null;

async function loadUsage() {
  await Promise.all([loadUsageSummary(), loadUsageProviders(), loadUsageModels()]);
  const el = document.getElementById('tel-last-updated');
  if (el) el.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

async function loadUsageSummary() {
  try {
    const res = await fetch(`${API}/api/usage/summary`);
    if (!res.ok) return;
    const d = await res.json();
    const g = d.global || {};
    setEl('tel-sum-providers', `${d.providersOnline ?? '—'} / ${d.providers ?? '—'}`);
    setEl('tel-sum-requests', g.requests > 0 ? g.requests.toLocaleString() : (g.requests === 0 && d.global ? 'NO DATA YET' : '—'));
    const totalTok = (g.inputTokens != null && g.outputTokens != null) ? (g.inputTokens + g.outputTokens) : null;
    setEl('tel-sum-tokens',  totalTok != null ? totalTok.toLocaleString() : '—');
    setEl('tel-sum-errors',  g.errors  != null ? g.errors.toLocaleString() : '—');
    const t = d.today || {};
    renderTodayVal('tel-today-requests', t.requests);
    renderTodayVal('tel-today-input',    t.inputTokens);
    renderTodayVal('tel-today-output',   t.outputTokens);
    const todayTotal = (t.inputTokens != null && t.outputTokens != null) ? t.inputTokens + t.outputTokens : null;
    renderTodayVal('tel-today-total', todayTotal);
  } catch {}
}

function renderTodayVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val == null) { el.textContent = 'NO DATA YET'; el.className = 'tel-today-val no-data'; }
  else             { el.textContent = val.toLocaleString(); el.className = 'tel-today-val'; }
}

async function loadUsageProviders() {
  try {
    const res = await fetch(`${API}/api/usage/providers`);
    if (!res.ok) return;
    const providers = await res.json();
    const grid = document.getElementById('tel-provider-grid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!providers.length) { grid.innerHTML = '<div class="tel-no-data">No providers configured.</div>'; return; }
    providers.forEach(p => grid.appendChild(buildProviderCard(p)));
  } catch {}
}

function buildProviderCard(p) {
  const card = document.createElement('div');
  const isLocal = p.isLocal;
  const isRL    = p.isRateLimited;
  card.className = 'tel-prov-card' + (isLocal ? ' local-provider' : '') + (isRL ? ' rate-limited' : '');
  let statusDotClass = p.online ? 'online' : 'offline';
  let statusText     = p.online ? 'ONLINE' : 'OFFLINE';
  if (isLocal) { statusDotClass = 'local';    statusText = 'LOCAL'; }
  if (isRL)    { statusDotClass = 'ratelimit'; statusText = 'RATE LIMITED'; }
  card.innerHTML = `<div class="tel-prov-header">
    <span class="tel-prov-name">${escHtml(p.name || p.id)}</span>
    <span class="tel-prov-status"><span class="tel-status-dot ${statusDotClass}"></span>${statusText}</span>
  </div>`;
  if (isLocal)      card.innerHTML += buildLocalBody(p);
  else if (!p.online) card.innerHTML += `<div class="tel-no-data" style="margin:0">Provider offline.</div>`;
  else              card.innerHTML += buildCloudBody(p);
  const updatedAgo = p.lastUpdatedAt ? timeAgo(p.lastUpdatedAt) : null;
  const isStale    = p.lastUpdatedAt ? (Date.now() - p.lastUpdatedAt) > (p.staleThresholdMs || 300000) : true;
  const updClass   = !p.lastUpdatedAt ? '' : (isStale ? 'stale' : 'fresh');
  const updText    = p.lastUpdatedAt ? (isStale ? `Last known: ${updatedAgo}` : `Updated ${updatedAgo}`) : 'No telemetry captured yet';
  card.innerHTML += `<div class="tel-prov-footer">
    <span class="tel-prov-source">${escHtml(sourceLabel(p.quotaSource))}</span>
    <span class="tel-prov-updated ${updClass}">${escHtml(updText)}</span>
  </div>`;
  card.querySelectorAll('[data-reset-at]').forEach(el => tickCountdown(el));
  return card;
}

function buildCloudBody(p) {
  const req = p.requests; const tok = p.tokens;
  const reqPct = calcPct(req); const tokPct = calcPct(tok);
  let html = `<div class="tel-circles-row">${buildCircle(reqPct,'REQUESTS',req?.confidence)}${buildCircle(tokPct,'TOKENS',tok?.confidence)}</div>`;
  if (p.isRateLimited && p.rateLimitResetAt) {
    html += `<div class="tel-quota-row" style="border-color:rgba(239,68,68,.3);margin-bottom:10px">
      <div class="tel-quota-row-left"><span class="tel-quota-metric">RATE LIMITED</span>
      <span class="tel-quota-reset countdown" data-reset-at="${p.rateLimitResetAt}">Retry in ${countdown(p.rateLimitResetAt)}</span></div>
      <span class="tel-badge ratelimit">429</span></div>`;
  }
  html += `<div class="tel-quota-rows">${buildQuotaRow('REQUESTS / MIN', req, p)}${buildQuotaRow('TOKENS / MIN', tok, p)}</div>`;
  return html;
}

function buildLocalBody(p) {
  return `<div class="tel-local-body">
    <div class="tel-local-row"><span>QUOTA</span><span>LOCAL / N/A</span></div>
    <div class="tel-local-row"><span>RESET</span><span>N/A</span></div>
  </div><div class="tel-local-note">${escHtml(p.quotaNote || 'Local provider — no cloud quota.')}</div>`;
}

function buildQuotaRow(label, snap, p) {
  if (!snap) {
    return `<div class="tel-quota-row"><div class="tel-quota-row-left">
      <span class="tel-quota-metric">${escHtml(label)}</span>
      <span class="tel-quota-values na">N/A</span>
      <span class="tel-quota-reset">${escHtml(p.quotaNote || 'Provider does not expose this metric.')}</span>
    </div><span class="tel-badge na">N/A</span></div>`;
  }
  const lim = snap.limit_val; const rem = snap.remaining; const conf = snap.confidence;
  let valHtml = lim != null && rem != null ? `${rem.toLocaleString()} / ${lim.toLocaleString()}`
    : rem != null ? `${rem.toLocaleString()} remaining`
    : lim != null ? `limit: ${lim.toLocaleString()}` : 'N/A';
  const resetHtml = snap.reset_at
    ? `<span class="tel-quota-reset countdown" data-reset-at="${snap.reset_at}">Reset in ${countdown(snap.reset_at)}</span>`
    : `<span class="tel-quota-reset">Reset: N/A</span>`;
  const bc = conf === 'exact' ? 'exact' : conf === 'estimated' ? 'estimated' : 'na';
  const bt = conf === 'exact' ? 'EXACT' : conf === 'estimated' ? 'EST' : 'N/A';
  return `<div class="tel-quota-row"><div class="tel-quota-row-left">
    <span class="tel-quota-metric">${escHtml(label)}</span>
    <span class="tel-quota-values">${escHtml(valHtml)}</span>${resetHtml}
  </div><span class="tel-badge ${bc}">${bt}</span></div>`;
}

function buildCircle(pct, label, confidence) {
  const size = 72; const sw = 5.5;
  const radius = (size - sw) / 2;
  const circ   = 2 * Math.PI * radius;
  const hasData = pct != null;
  const offset  = hasData ? circ - (pct / 100) * circ : circ;
  let color = hasData ? (pct < 20 ? 'var(--red)' : pct < 50 ? 'var(--amber)' : 'var(--lime)') : 'var(--dim)';
  const pctText = hasData ? `${Math.round(pct)}%` : 'N/A';
  const bc = confidence === 'exact' ? 'exact' : confidence === 'estimated' ? 'estimated' : 'na';
  const bt = confidence === 'exact' ? 'EXACT' : confidence === 'estimated' ? 'EST' : 'N/A';
  return `<div class="tel-circle-wrap">
    <div class="tel-circle" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle class="tel-circle-bg" cx="${size/2}" cy="${size/2}" r="${radius}" stroke-width="${sw}"/>
        <circle class="tel-circle-bar" cx="${size/2}" cy="${size/2}" r="${radius}" stroke-width="${sw}"
          stroke="${color}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>
      </svg>
      <div class="tel-circle-text">
        <span class="tel-circle-pct" style="color:${color};font-size:${hasData?'13px':'11px'}">${pctText}</span>
        <span class="tel-circle-sub">REMAIN</span>
      </div>
    </div>
    <span class="tel-circle-label">${label}</span>
    <span class="tel-badge ${bc} tel-circle-badge">${bt}</span>
  </div>`;
}

async function loadUsageModels() {
  try {
    const res = await fetch(`${API}/api/usage/models`);
    if (!res.ok) return;
    const rows = await res.json();
    const tbody = document.getElementById('tel-model-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="color:var(--dim);text-align:center;padding:24px;font:11px var(--mono)">No usage recorded yet. Run a task to begin collecting telemetry.</td></tr>`;
      return;
    }
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const badge = `<span class="provider-badge ${row.provider}">${escHtml(row.provider)}</span>`;
      const remaining = buildRemainingCell(row);
      const inp  = row.total_input  != null ? Number(row.total_input).toLocaleString()  : '<span class="na-cell">N/A</span>';
      const out  = row.total_output != null ? Number(row.total_output).toLocaleString() : '<span class="na-cell">N/A</span>';
      const lat  = row.avg_latency  != null ? Math.round(row.avg_latency) + 'ms'        : '<span class="na-cell">N/A</span>';
      const errs = row.errors != null ? row.errors : '<span class="na-cell">—</span>';
      const last = row.last_used ? new Date(Number(row.last_used)).toLocaleTimeString() : '<span class="na-cell">—</span>';
      tr.innerHTML = `<td>${badge}</td>
        <td style="font:11px var(--mono);color:var(--ink)">${escHtml(row.model)}</td>
        <td>${remaining}</td><td>${row.requests ?? 0}</td>
        <td>${inp}</td><td>${out}</td><td>${lat}</td>
        <td style="color:${row.errors>0?'var(--red)':'var(--dim)'}">${errs}</td>
        <td>${last}</td>`;
      tbody.appendChild(tr);
    });
  } catch {}
}

function buildRemainingCell(row) {
  if (row.isLocal) return '<span class="tel-badge local">LOCAL</span>';
  const snap = row.quotaRequests || row.quotaTokens;
  if (!snap) return '<span class="na-cell">N/A</span>';
  const pct = calcPct(snap);
  if (pct == null) return '<span class="na-cell">N/A</span>';
  const conf = snap.confidence;
  const cls  = conf === 'exact' ? 'exact-cell' : 'estimated-cell';
  const bc   = conf === 'exact' ? 'exact' : 'estimated';
  const bt   = conf === 'exact' ? 'EXACT' : 'EST';
  return `<span class="${cls}">${Math.round(pct)}%</span> <span class="tel-badge ${bc}">${bt}</span>`;
}

function calcPct(snap) {
  if (!snap) return null;
  const lim = snap.limit_val ?? snap.limitVal;
  const rem = snap.remaining;
  if (lim == null || rem == null || lim <= 0) return null;
  return Math.max(0, Math.min(100, (rem / lim) * 100));
}

function countdown(epochMs) {
  const diff = epochMs - Date.now();
  if (diff <= 0) return '00:00';
  const s = Math.ceil(diff / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function tickCountdown(el) {
  const epoch = Number(el.dataset.resetAt);
  if (!epoch) return;
  const update = () => {
    if (!document.body.contains(el)) return;
    if (epoch - Date.now() <= 0) { el.textContent = 'Refreshing…'; loadUsageProviders(); return; }
    el.textContent = el.textContent.replace(/\d+:\d+|\d+h \d+m/, countdown(epoch));
    setTimeout(update, 1000);
  };
  setTimeout(update, 1000);
}

function timeAgo(epochMs) {
  const diff = Math.floor((Date.now() - epochMs) / 1000);
  if (diff < 5)    return 'just now';
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  return `${Math.floor(diff/3600)}h ago`;
}

function sourceLabel(src) {
  return { provider_header:'Provider response headers', provider_endpoint:'Provider API endpoint',
    documented_limit:'Documented provider limit', local_provider:'Local provider', unknown:'Source unknown' }[src] || src || '';
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function startUsageTelemetryStream() {
  if (usageTelemetryStream) return;
  usageTelemetryStream = new EventSource(`${API}/api/usage/stream`);
  usageTelemetryStream.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if ((data.type === 'usage' || data.type === 'quota') &&
          document.getElementById('view-usage')?.classList.contains('active')) {
        clearTimeout(window._usageRefreshDebounce);
        window._usageRefreshDebounce = setTimeout(loadUsage, 800);
      }
    } catch {}
  };
  usageTelemetryStream.onerror = () => {
    usageTelemetryStream?.close(); usageTelemetryStream = null;
    setTimeout(startUsageTelemetryStream, 10_000);
  };
}

// ── File tree ──────────────────────────────────────────────────────────────
async function loadWorkspaceTree() {
  try {
    const res = await fetch(`${API}/api/workspace/tree`);
    const data = await res.json();
    workspaceRoot = data.root;
    const name = workspaceRoot.split(/[\\/]/).pop() || workspaceRoot;
    document.getElementById('workspace-name').textContent = name;
    document.getElementById('stat-project').textContent = name;
    document.getElementById('titleProject').textContent = '/ ' + name;
    updateTerminalPrompt(data.root);
    renderFileTree(data.tree, document.getElementById('file-tree'));
  } catch { /* workspace may not be set */ }
}

async function loadFileTreeMain() {
  try {
    const res = await fetch(`${API}/api/workspace/tree`);
    const data = await res.json();
    renderFileTree(data.tree, document.getElementById('file-tree-main'), true);
  } catch { }
}

function renderFileTree(lines, container, clickable) {
  if (clickable === undefined) clickable = false;
  container.innerHTML = '';
  if (!lines || !lines.length) return;
  var FOLDER_CHAR = String.fromCodePoint(0x1F4C1);
  var FILE_CHAR   = String.fromCodePoint(0x1F4C4);
  var root = { children: [], path: '' };
  var stack = [{ node: root, depth: -1 }];
  lines.forEach(function(line) {
    var isFolder = line.indexOf(FOLDER_CHAR) !== -1;
    var isFile   = line.indexOf(FILE_CHAR)   !== -1;
    if (!isFolder && !isFile) return;
    var depth = (line.length - line.trimStart().length) / 2;
    var name = line.trim().replace(FOLDER_CHAR, '').replace(FILE_CHAR, '').replace(/\s+/, '').replace(/\/$/, '').trim();
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    var parent = stack[stack.length - 1].node;
    var fp = parent.path ? parent.path + '/' + name : name;
    var node = { name: name, isFolder: isFolder, path: fp, children: [], depth: depth };
    parent.children.push(node);
    if (isFolder) stack.push({ node: node, depth: depth });
  });
  function renderNode(node, cont, level) {
    node.children.forEach(function(child) {
      var row = document.createElement('div');
      row.className = 'tree-row' + (child.isFolder ? ' tree-folder' : ' tree-file');
      row.style.paddingLeft = (level * 14 + 6) + 'px';
      if (child.isFolder) {
        var expanded = false;
        var arrow = document.createElement('span');
        arrow.className = 'tree-arrow';
        arrow.textContent = '▶';
        var icon = document.createElement('span');
        icon.className = 'tree-icon';
        icon.textContent = String.fromCodePoint(0x1F4C1);
        var lbl = document.createElement('span');
        lbl.className = 'tree-label';
        lbl.textContent = child.name;
        row.appendChild(arrow); row.appendChild(icon); row.appendChild(lbl);
        cont.appendChild(row);
        var cc = document.createElement('div');
        cc.className = 'tree-children';
        cc.style.display = 'none';
        cont.appendChild(cc);
        renderNode(child, cc, level + 1);
        row.addEventListener('click', (function(a, ic, c2) {
          return function() {
            expanded = !expanded;
            c2.style.display = expanded ? 'block' : 'none';
            a.textContent  = expanded ? '▼' : '▶';
            ic.textContent = expanded ? String.fromCodePoint(0x1F4C2) : String.fromCodePoint(0x1F4C1);
            row.classList.toggle('expanded', expanded);
          };
        })(arrow, icon, cc));
      } else {
        var icon2 = document.createElement('span');
        icon2.className = 'tree-icon';
        icon2.textContent = getFileIcon(child.name);
        var lbl2 = document.createElement('span');
        lbl2.className = 'tree-label';
        lbl2.textContent = child.name;
        row.appendChild(icon2); row.appendChild(lbl2);
        cont.appendChild(row);
        if (clickable) {
          row.addEventListener('click', (function(p) { return function() { loadFileContent(p); }; })(child.path));
        }
      }
    });
  }
  renderNode(root, container, 0);
}

function getFileIcon(name) {
  var ext = (name.split('.').pop() || '').toLowerCase();
  var icons = {
    js: '[JS]', ts: '[TS]', py: '[PY]', html: '[HTML]', css: '[CSS]',
    json: '[JSON]', md: '[MD]', txt: '[TXT]', png: '[IMG]', jpg: '[IMG]',
    jpeg: '[IMG]', gif: '[IMG]', svg: '[SVG]', mp3: '[MP3]', wav: '[WAV]',
    ogg: '[OGG]', mp4: '[MP4]', sh: '[SH]', bat: '[BAT]', env: '[ENV]',
    rpy: '[RPY]', rpyc: '[RPYC]'
  };
  return icons[ext] || String.fromCodePoint(0x1F4C4);
}

async function loadFileContent(filePath) {
  try {
    const res = await fetch(`${API}/api/workspace/file?path=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    document.getElementById('file-content-path').textContent = data.path;
    document.getElementById('file-content-body').textContent = data.content;
  } catch (err) {
    document.getElementById('file-content-body').textContent = 'Error: ' + err.message;
  }
}

// ── Open folder ────────────────────────────────────────────────────────────
async function openFolder() {
  if (window.electronAPI?.openFolder) {
    const folder = await window.electronAPI.openFolder();
    if (folder) await switchWorkspace(folder, 'Opened project');
    return;
  }
  // Browser fallback
  document.getElementById('input-open-folder').click();
}

async function openProjectFile() {
  if (window.electronAPI?.openFile) {
    await attachSelectedPaths(await window.electronAPI.openFile(), 'Opened file');
    return;
  }
  document.getElementById('input-open-file').click();
}

async function addProjectFiles() {
  if (window.electronAPI?.addFiles) {
    await attachSelectedPaths(await window.electronAPI.addFiles(), 'Added files');
    return;
  }
  document.getElementById('input-add-files').click();
}

async function addProjectFolder() {
  if (window.electronAPI?.addFolder) {
    const folder = await window.electronAPI.addFolder();
    if (!folder) return;
    await switchWorkspace(folder, 'Added project folder');
    return;
  }
  document.getElementById('input-add-folder').click();
}

// Wire browser file input fallbacks
document.getElementById('input-open-folder')?.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || !files.length) return;
  // webkitRelativePath gives us "folderName/..."
  const folderName = files[0].webkitRelativePath.split('/')[0];
  addEvent('INFO', `Browser mode: folder "${folderName}" selected. Use Electron app for full workspace switching.`);
  // Attach all file paths as task context
  const paths = Array.from(files).map(f => f.webkitRelativePath);
  taskAttachments = [...new Set([...taskAttachments, ...paths])];
  renderTaskAttachments();
  e.target.value = '';
});

document.getElementById('input-open-file')?.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || !files.length) return;
  const paths = Array.from(files).map(f => f.name);
  await attachSelectedPaths(paths, 'Opened file');
  e.target.value = '';
});

document.getElementById('input-add-files')?.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || !files.length) return;
  const paths = Array.from(files).map(f => f.name);
  await attachSelectedPaths(paths, 'Added files');
  e.target.value = '';
});

document.getElementById('input-add-folder')?.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || !files.length) return;
  const folderName = files[0].webkitRelativePath.split('/')[0];
  addEvent('INFO', `Browser mode: folder "${folderName}" added as context.`);
  const paths = Array.from(files).map(f => f.webkitRelativePath);
  taskAttachments = [...new Set([...taskAttachments, ...paths])];
  renderTaskAttachments();
  e.target.value = '';
});

async function attachSelectedPaths(paths, label) {
  const selected = Array.isArray(paths) ? paths.filter(Boolean) : paths ? [paths] : [];
  if (!selected.length) return;
  taskAttachments = [...new Set([...taskAttachments, ...selected])];
  renderTaskAttachments();
  addEvent('PROJECT', `${label}: ${selected.join(', ')}`);
}

function updateTerminalPrompt(path) {
  const el = document.getElementById('terminal-cwd-prompt');
  if (!el || !path) return;
  // Show drive + last folder, e.g. D:\autonomus>
  const normalized = path.replace(/\/+/g, '\\');
  el.textContent = normalized + '>';
}

async function switchWorkspace(folder, eventLabel) {
  try {
    const res = await fetch(`${API}/api/workspace`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root: folder })
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not switch workspace');
    const data = await res.json();
    workspaceRoot = data.root;
    const name = data.name || folder.split(/[\\/]/).pop() || folder;
    document.getElementById('workspace-name').textContent = name;
    document.getElementById('stat-project').textContent = name;
    document.getElementById('titleProject').textContent = '/ ' + name;
    updateTerminalPrompt(data.root);
    addEvent('WORKSPACE', `${eventLabel}: ${folder}`);
    loadWorkspaceTree();
    loadProjectProfile();
    loadGitStatus();
    loadSessions();
    // Auto-suggest run command
    const cmdInput = document.getElementById('run-cmd-input');
    if (cmdInput && !cmdInput.value) cmdInput.placeholder = autoDetectRunCommand();
  } catch (err) {
    addEvent('ERROR', 'Could not switch workspace: ' + err.message, true);
  }
}

async function loadProjectProfile() {
  const el = document.getElementById('project-profile');
  if (!el) return;
  try {
    const profile = await (await fetch(`${API}/api/project/profile`)).json();
    el.textContent = `${profile.languages?.join(', ') || 'Unknown'} · ${profile.frameworks?.join(', ') || 'Project'} · ${profile.totalFiles ?? 0} files`;
  } catch { el.textContent = ''; }
}

// ── Run Code in workspace ───────────────────────────────────────────────────
async function runWorkspaceCode() {
  const cmdInput = document.getElementById('run-cmd-input');
  const cmd = cmdInput?.value.trim() || autoDetectRunCommand();
  if (!cmd) { addEvent('INFO', 'Enter a run command first'); return; }

  const tabBtn = document.querySelector('.bottom-tab-btn[data-tab="terminal"]');
  if (tabBtn) tabBtn.click();

  const termOut = document.getElementById('terminal-output');
  if (termOut) {
    termOut.innerHTML += `<div class="cmd">$ ${escHtml(cmd)}</div>`;
    termOut.scrollTop = termOut.scrollHeight;
  }

  // Use EventSource-style fetch with SSE to stream live output
  try {
    const res = await fetch(`${API}/api/workspace/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    });
    if (!res.body) throw new Error('No response body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const { type, data } = JSON.parse(line.slice(5).trim());
          if (type === 'stdout' || type === 'stderr') {
            const el = document.getElementById('terminal-output');
            if (el) {
              el.innerHTML += `<div class="${type === 'stderr' ? 'err' : ''}">${escHtml(data)}</div>`;
              el.scrollTop = el.scrollHeight;
            }
          } else if (type === 'exit') {
            const exitCode = Number(data);
            const el = document.getElementById('terminal-output');
            if (el) {
              el.innerHTML += `<div style="color:${exitCode === 0 ? 'var(--lime)' : 'var(--red)'};font:10px var(--mono)">Process exited with code ${exitCode}</div>`;
              el.scrollTop = el.scrollHeight;
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    appendTerminalOutput('Error: ' + err.message);
  }
}

function autoDetectRunCommand() {
  // Try to guess run command from project profile or workspace name
  const profile = document.getElementById('project-profile')?.textContent || '';
  if (profile.includes('python')) return 'python main.py';
  if (profile.includes('node') || profile.includes('javascript')) return 'npm start';
  if (profile.includes('renpy') || workspaceRoot.toLowerCase().includes('renpy')) return 'renpy.sh .';
  return 'npm start';
}

async function openWorkspaceInExplorer() {
  if (!workspaceRoot) { addEvent('INFO', 'No workspace open'); return; }
  if (window.electronAPI?.openInExplorer) {
    await window.electronAPI.openInExplorer(workspaceRoot);
  } else {
    addEvent('INFO', `Workspace path: ${workspaceRoot}`);
  }
}

// ── Settings ───────────────────────────────────────────────────────────────


// ── Utility ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Cache helper ───────────────────────────────────────────────────────────
async function ensureProviderAndModelCache() {
  if (!cachedProviders.length) {
    try {
      const res = await fetch(`${API}/api/providers`);
      cachedProviders = await res.json();
    } catch {}
  }
  if (!cachedModels.length) {
    try {
      const res = await fetch(`${API}/api/models`);
      cachedModels = await res.json();
    } catch {}
  }
}

// ── Set Position ───────────────────────────────────────────────────────────
async function loadPositions() {
  await ensureProviderAndModelCache();
  const tbody = document.getElementById('positions-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="color:var(--dim);text-align:center;padding:16px">Loading positions…</td></tr>';

  try {
    const res = await fetch(`${API}/api/routing`);
    const positions = await res.json();
    activePositions = positions;
    renderPositionsTable(positions);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red);padding:16px">Failed to load positions: ${escHtml(err.message)}</td></tr>`;
  }
}

function renderPositionsTable(positions) {
  const tbody = document.getElementById('positions-tbody');
  tbody.innerHTML = '';

  positions.forEach((pos, idx) => {
    const tr = createPositionRow(pos, idx);
    tbody.appendChild(tr);
  });
}

function createPositionRow(pos, idx) {
  const tr = document.createElement('tr');
  tr.dataset.role = pos.role;
  tr.dataset.display = pos.display || pos.role;

  // Position Column
  const tdPos = document.createElement('td');
  tdPos.className = 'col-pos';
  tdPos.innerHTML = `<span class="pos-name">${escHtml(pos.display || pos.role)}</span><span class="pos-id">${escHtml(pos.role)}</span>`;

  // Provider Column
  const tdProv = document.createElement('td');
  tdProv.className = 'col-prov';
  const selProv = document.createElement('select');
  selProv.className = 'pos-select pos-prov-select';
  selProv.dataset.role = pos.role;

  // AUTO option
  const optAuto = document.createElement('option');
  optAuto.value = 'auto';
  optAuto.textContent = 'AUTO';
  if (pos.providerId === 'auto' || !pos.providerId) optAuto.selected = true;
  selProv.appendChild(optAuto);

  // Providers list
  cachedProviders.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = (p.displayName || p.id).toUpperCase();
    if (pos.providerId === p.id) opt.selected = true;
    selProv.appendChild(opt);
  });
  tdProv.appendChild(selProv);

  // Model Column
  const tdModel = document.createElement('td');
  tdModel.className = 'col-model';
  const selModel = document.createElement('select');
  selModel.className = 'pos-select pos-model-select';
  selModel.dataset.role = pos.role;
  tdModel.appendChild(selModel);

  // Badge Column
  const tdBadge = document.createElement('td');
  tdBadge.className = 'col-badge';
  const badge = document.createElement('span');
  tdBadge.appendChild(badge);

  // Core 11 roles vs custom added position
  const CORE_ROLES = new Set([
    'planner', 'designer', 'architect', 'frontendCoder', 'backendCoder',
    'altCoder', 'engineeringReviewer', 'refactorer', 'debugger', 'tester', 'finalJudge'
  ]);
  if (!CORE_ROLES.has(pos.role)) {
    const btnDel = document.createElement('button');
    btnDel.className = 'pos-del-btn';
    btnDel.title = 'Remove position';
    btnDel.textContent = '✕';
    btnDel.addEventListener('click', () => {
      tr.remove();
      savePositions();
    });
    tdBadge.appendChild(btnDel);
  }

  // Update models and badge for this row
  function updateModelAndBadge() {
    const provVal = selProv.value;
    const currentModelVal = selModel.value || pos.modelId || 'auto';

    selModel.innerHTML = '';
    if (provVal === 'auto') {
      const optBest = document.createElement('option');
      optBest.value = 'auto';
      optBest.textContent = 'BEST';
      selModel.appendChild(optBest);
      selModel.value = 'auto';

      badge.className = 'pos-badge auto';
      badge.textContent = 'AUTO · BEST';
    } else {
      const optAutoModel = document.createElement('option');
      optAutoModel.value = 'auto';
      optAutoModel.textContent = 'BEST (Auto)';
      selModel.appendChild(optAutoModel);

      // Filter models for selected provider
      const provModels = cachedModels.filter(m => m.providerId === provVal);
      provModels.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.modelId;
        opt.textContent = m.displayName || m.modelId;
        if (currentModelVal === m.modelId) opt.selected = true;
        selModel.appendChild(opt);
      });

      if (currentModelVal !== 'auto' && !provModels.some(m => m.modelId === currentModelVal)) {
        selModel.value = 'auto';
      }

      badge.className = 'pos-badge custom';
      const mLabel = selModel.value === 'auto' ? 'BEST' : selModel.value;
      badge.textContent = `${provVal.toUpperCase()} · ${mLabel}`;
    }
  }

  selProv.addEventListener('change', () => {
    pos.providerId = selProv.value;
    pos.modelId = 'auto';
    updateModelAndBadge();
  });

  selModel.addEventListener('change', () => {
    pos.modelId = selModel.value;
    updateModelAndBadge();
  });

  // Initial population
  updateModelAndBadge();
  if (pos.modelId && pos.modelId !== 'auto') {
    selModel.value = pos.modelId;
    updateModelAndBadge();
  }

  tr.appendChild(tdPos);
  tr.appendChild(tdProv);
  tr.appendChild(tdModel);
  tr.appendChild(tdBadge);

  return tr;
}

// ── Save Positions ─────────────────────────────────────────────────────────
async function savePositions() {
  const tbody = document.getElementById('positions-tbody');
  const rows = tbody.querySelectorAll('tr[data-role]');
  const updates = [];

  rows.forEach(tr => {
    const role = tr.dataset.role;
    const providerId = tr.querySelector('.pos-prov-select')?.value || 'auto';
    const modelId = tr.querySelector('.pos-model-select')?.value || 'auto';
    updates.push({ role, providerId, modelId });
  });

  const saveStatus = document.getElementById('positions-saved');
  saveStatus.textContent = 'Saving…';

  try {
    const res = await fetch(`${API}/api/routing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error(await res.text());
    saveStatus.textContent = '✓ Saved';
    addEvent('ROUTING', `Saved ${updates.length} position assignments`);
    setTimeout(() => { saveStatus.textContent = ''; }, 2500);
    await loadPositionsData();
    renderCrew();
    updateRoutingDeck();
  } catch (err) {
    saveStatus.textContent = '✗ ' + err.message;
  }
}

// ── Reset Positions ────────────────────────────────────────────────────────
async function resetPositions() {
  const saveStatus = document.getElementById('positions-saved');
  saveStatus.textContent = 'Resetting…';

  try {
    const res = await fetch(`${API}/api/routing/reset`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    saveStatus.textContent = '✓ Defaults restored';
    setTimeout(() => { saveStatus.textContent = ''; }, 2500);
    await loadPositions();
    await loadPositionsData();
    renderCrew();
    updateRoutingDeck();
  } catch (err) {
    saveStatus.textContent = '✗ ' + err.message;
  }
}

// ── Add Position ───────────────────────────────────────────────────────────
function addPositionPrompt() {
  const addRow = document.querySelector('.positions-add-row');
  if (!addRow || addRow.querySelector('.position-add-form')) return;

  const form = document.createElement('div');
  form.className = 'position-add-form';
  form.innerHTML = `
    <input class="position-add-input" type="text" maxlength="60"
      placeholder="Position name, e.g. Security Auditor" aria-label="New position name">
    <button class="btn-primary small position-add-confirm" type="button">Add</button>
    <button class="btn-ghost small position-add-cancel" type="button">Cancel</button>
  `;

  const input = form.querySelector('.position-add-input');
  const close = () => form.remove();
  const submit = () => {
    const cleanName = input.value.trim();
    input.setCustomValidity('');
    if (!cleanName) {
      input.focus();
      return;
    }

    const roleKey = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const existing = [...document.querySelectorAll('#positions-tbody tr[data-role]')]
      .some((row) => row.dataset.role === roleKey);
    if (!roleKey || existing) {
      input.setCustomValidity(existing ? 'That position already exists.' : 'Enter a valid position name.');
      input.reportValidity();
      return;
    }

    const newPos = { role: roleKey, display: cleanName, providerId: 'auto', modelId: 'auto' };
    const tbody = document.getElementById('positions-tbody');
    tbody.appendChild(createPositionRow(newPos, tbody.children.length));
    close();
    savePositions();
  };

  form.querySelector('.position-add-confirm').addEventListener('click', submit);
  form.querySelector('.position-add-cancel').addEventListener('click', close);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
    if (event.key === 'Escape') close();
  });
  addRow.appendChild(form);
  input.focus();
}

// ── Device Environment (.env) & Settings ──────────────────────────────────
async function loadEnvStatus() {
  try {
    const res = await fetch(`${API}/api/env/status`);
    const data = await res.json();

    // Update Models view banner
    const banner = document.getElementById('env-status-banner');
    if (banner) {
      if (data.envFileFound && data.hasApiKeys) {
        const provList = data.activeProviders?.length
          ? data.activeProviders.map(p => p.toUpperCase()).join(', ')
          : 'Active';
        banner.className = 'env-banner success';
        banner.innerHTML = `<span class="env-badge-dot">●</span> <div><strong>.env file detected on device</strong> (${escHtml(provList)}) — models loaded dynamically from your accounts.</div>`;
      } else if (data.envFileFound) {
        banner.className = 'env-banner warning';
        banner.innerHTML = `<span class="env-badge-dot">⚠</span> <div><strong>.env file detected, but it contains no active API keys.</strong> The existing entries are disabled. Connect a provider in <button class="btn-link" id="link-goto-settings" style="text-decoration:underline;cursor:pointer;font-weight:700">Settings</button> or start Ollama locally.</div>`;
        document.getElementById('link-goto-settings')?.addEventListener('click', (e) => {
          e.preventDefault();
          document.querySelector('.nav-btn[data-view="settings"]')?.click();
        });
      } else {
        banner.className = 'env-banner warning';
        banner.innerHTML = `<span class="env-badge-dot">⚠</span> <div><strong>No .env file detected on this device.</strong> Connect a provider in <button class="btn-link" id="link-goto-settings" style="text-decoration:underline;cursor:pointer;font-weight:700">Settings</button> or start Ollama locally.</div>`;
        document.getElementById('link-goto-settings')?.addEventListener('click', (e) => {
          e.preventDefault();
          document.querySelector('.nav-btn[data-view="settings"]')?.click();
        });
      }
    }

    // Update Settings view banner
    const setBanner = document.getElementById('settings-env-banner');
    if (setBanner) {
      if (data.envFileFound && data.hasApiKeys) {
        setBanner.className = 'env-banner success';
        setBanner.innerHTML = `<span class="env-badge-dot">●</span> <div><strong>.env file active on device:</strong> <code>${escHtml(data.envPath || '.env')}</code> (${data.activeProviders?.join(', ') || 'ready'})</div>`;
      } else if (data.envFileFound) {
        setBanner.className = 'env-banner warning';
        setBanner.innerHTML = `<span class="env-badge-dot">⚠</span> <div><strong>.env file found, but no active API keys are configured.</strong> Enter new keys below or connect your own custom AI provider endpoint.</div>`;
      } else {
        setBanner.className = 'env-banner warning';
        setBanner.innerHTML = `<span class="env-badge-dot">⚠</span> <div><strong>No .env file detected.</strong> Enter keys below or connect your own custom AI provider endpoint.</div>`;
      }
    }

    // Update key pills
    const keys = data.keys || {};
    ['gemini', 'groq', 'deepseek', 'mistral'].forEach(prov => {
      const pill = document.getElementById(`status-key-${prov}`);
      if (pill) {
        if (keys[prov]) {
          pill.className = 'key-pill active';
          pill.textContent = 'ACTIVE IN .ENV';
        } else {
          pill.className = 'key-pill missing';
          pill.textContent = 'NOT SET';
        }
      }
    });
    // Google CSE pill
    const csePill = document.getElementById('status-key-google-cse');
    if (csePill) {
      const cseActive = Boolean(keys.google_cse);
      csePill.className = cseActive ? 'key-pill active' : 'key-pill missing';
      csePill.textContent = cseActive ? 'ACTIVE IN .ENV' : 'NOT SET';
    }

    return data;
  } catch (err) {
    console.error('Failed to load env status:', err);
  }
}

async function saveApiKeys() {
  const gemini = document.getElementById('key-gemini')?.value.trim();
  const groq = document.getElementById('key-groq')?.value.trim();
  const deepseek = document.getElementById('key-deepseek')?.value.trim();
  const mistral = document.getElementById('key-mistral')?.value.trim();
  const google_cse_key = document.getElementById('key-google-cse-key')?.value.trim();
  const google_cse_cx = document.getElementById('key-google-cse-cx')?.value.trim();

  const updates = {};
  if (gemini) updates.gemini = gemini;
  if (groq) updates.groq = groq;
  if (deepseek) updates.deepseek = deepseek;
  if (mistral) updates.mistral = mistral;
  if (google_cse_key) updates.google_cse_key = google_cse_key;
  if (google_cse_cx) updates.google_cse_cx = google_cse_cx;

  const status = document.getElementById('keys-saved-status');
  if (Object.keys(updates).length === 0) {
    status.textContent = 'Enter at least one key to save';
    status.style.color = 'var(--orange)';
    return;
  }

  status.textContent = 'Saving to .env & loading models…';
  status.style.color = 'var(--cyan)';

  try {
    const res = await fetch(`${API}/api/settings/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save keys');

    status.textContent = `✓ Saved to .env! Loaded ${data.totalModels} models`;
    status.style.color = 'var(--lime)';
    addEvent('SETTINGS', `Saved keys to .env — ${data.activeProviders?.join(', ')} online`);

    ['key-gemini', 'key-groq', 'key-deepseek', 'key-mistral', 'key-google-cse-key', 'key-google-cse-cx'].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });

    await loadEnvStatus();
    await loadProviders();
    await loadModels();
  } catch (err) {
    status.textContent = '✗ ' + err.message;
    status.style.color = 'var(--red)';
  }
}

async function addManualProvider() {
  const baseUrl = document.getElementById('manual-url')?.value.trim();
  const apiKey = document.getElementById('manual-key')?.value.trim();
  const name = document.getElementById('manual-name')?.value.trim();

  const status = document.getElementById('manual-result');
  const resultDiv = document.getElementById('manual-models-result');
  if (resultDiv) resultDiv.innerHTML = '';

  if (!baseUrl) {
    status.textContent = 'Base URL is required';
    status.style.color = 'var(--red)';
    return;
  }

  status.textContent = 'Connecting & auto-discovering models…';
  status.style.color = 'var(--cyan)';

  try {
    const res = await fetch(`${API}/api/providers/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, apiKey, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to connect');

    status.textContent = `✓ Connected to ${data.name}! Discovered ${data.modelCount} models.`;
    status.style.color = 'var(--lime)';
    addEvent('PROVIDER', `Connected custom API ${data.name} (${data.modelCount} models)`);

    if (resultDiv && Array.isArray(data.models) && data.models.length > 0) {
      resultDiv.innerHTML = `
        <div class="settings-note" style="margin-top:8px">
          <strong>Auto-discovered &amp; understood ${data.modelCount} models (no manual naming needed):</strong>
        </div>
        <div class="models-tag-cloud">
          ${data.models.slice(0, 25).map(m => `<span class="model-tag">${escHtml(m)}</span>`).join('')}
          ${data.models.length > 25 ? `<span class="model-tag">+${data.models.length - 25} more</span>` : ''}
        </div>
      `;
    }

    await loadProviders();
    await loadModels();
  } catch (err) {
    status.textContent = '✗ ' + err.message;
    status.style.color = 'var(--red)';
  }
}

async function saveSettings() {
  const maxEngineeringIterations = Number(document.getElementById('set-max-iter')?.value || 3);
  const status = document.getElementById('settings-saved');
  status.textContent = 'Saving…';

  try {
    const res = await fetch(`${API}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxEngineeringIterations })
    });
    if (!res.ok) throw new Error(await res.text());
    status.textContent = '✓ Saved';
    status.style.color = 'var(--lime)';
    setTimeout(() => { status.textContent = ''; }, 2500);
  } catch (err) {
    status.textContent = '✗ ' + err.message;
    status.style.color = 'var(--red)';
  }
}

async function loadSettingsView() {
  await loadEnvStatus();
  try {
    const res = await fetch(`${API}/api/settings`);
    if (res.ok) {
      const data = await res.json();
      if (data.maxEngineeringIterations) {
        document.getElementById('set-max-iter').value = data.maxEngineeringIterations;
      }
    }
  } catch {}
}



// ── Asset Discovery ────────────────────────────────────────────────────────
async function searchAssets() {
  const query    = document.getElementById('asset-query')?.value.trim();
  const category = document.getElementById('asset-category')?.value || 'image';
  const statusEl = document.getElementById('asset-search-status');
  const gridEl   = document.getElementById('asset-results');
  if (!query) return;
  
  const generator = getPerchanceGeneratorForAsset(query, category);
  const gen = PERCHANCE_GENERATORS.find(g => g.id === generator.id);
  
  if (!gen) { if (statusEl) statusEl.textContent = 'Generator not found'; return; }
  
  if (statusEl) statusEl.textContent = `Opening ${gen.label}…`;
  if (gridEl) gridEl.innerHTML = '';
  
  navigateBrowserTo(gen.url);
  setTimeout(() => {
    const promptEl = document.getElementById('gen-prompt-input');
    if (promptEl) promptEl.value = query;
    sendPromptToGenerator(true);
  }, 2000);
  
  if (statusEl) statusEl.textContent = `✓ ${gen.label} opened`;
  if (gridEl) gridEl.innerHTML = `<div style="color:var(--lime);font:12px var(--mono);padding:16px">🧠 AI enhancing prompt…<br><br>Generating ${category}…<br><br>Each result:<br>• <strong>💾 Save</strong> - Download<br>• <strong>🔄 Use in Chat</strong> - Add to AI</div>`;
  addEvent('ASSET', `🧠 ${gen.label}: "${query}"`);
}

function renderAssetResults(results, container) {
  if (!container) return;
  if (!results.length) { container.innerHTML = '<div style="color:var(--dim);font:11px var(--mono);padding:16px">No results found.</div>'; return; }
  container.innerHTML = '';
  results.forEach((r, idx) => {
    const a = r.asset;
    const licClass = a.licenseConfidence === 'LICENSE_CONFIRMED' ? 'license-confirmed'
                   : a.licenseConfidence === 'LICENSE_PARTIAL'   ? 'license-partial'
                   : 'license-unknown';
    const card = document.createElement('div');
    card.className = 'asset-card';
    card.dataset.assetIdx = String(idx);
    card.innerHTML = `
      <div class="asset-card-name" title="${escHtml(a.name)}">${escHtml(a.name)}</div>
      <div class="asset-card-meta">
        <span>Provider: ${escHtml(a.sourceProvider ?? r.provider)}</span>
        <span>Category: ${escHtml(a.assetCategory ?? '—')}</span>
        <span>Rating: ${escHtml(a.contentRating ?? 'EVERYONE')}</span>
        ${a.creator ? `<span>By: ${escHtml(a.creator)}</span>` : ''}
        ${a.width   ? `<span>${a.width}px</span>` : ''}
      </div>
      <span class="asset-card-license ${licClass}">${escHtml(a.licenseStatus ?? a.licenseConfidence?.replace('LICENSE_', '') ?? 'UNKNOWN')}</span>
      ${a.licenseWarning ? `<div style="font:10px var(--mono);color:var(--amber);margin-top:2px">⚠ ${escHtml(a.licenseWarning)}</div>` : ''}
      <div class="asset-card-actions">
        ${a.sourceUrl ? `<a href="${escHtml(a.sourceUrl)}" target="_blank" class="btn-link" style="font-size:10px">View source</a>` : '<span class="asset-card-license license-unknown">No source URL</span>'}
        ${a.downloadUrl ? `<button class="btn-ghost small btn-dl-asset">💾 Save</button>` : ''}
        <button class="btn-ghost small btn-make-3d" style="margin-left:4px">🎲 Make 3D</button>
        <span class="asset-card-score">Score: ${r.score}</span>
      </div>`;
    if (a.downloadUrl) {
      card.querySelector('.btn-dl-asset')?.addEventListener('click', () => downloadAssetCard(a));
    }
    card.querySelector('.btn-make-3d')?.addEventListener('click', () => sendImageTo3D());
    container.appendChild(card);
  });
}

async function downloadAssetCard(asset) {
  try {
    const res  = await fetch(`${API}/api/assets/download`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(asset),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Download failed');
    addEvent('ASSET', `Downloaded: ${asset.name} → ${data.targetPath}`);
    loadAssetCache();
  } catch (err) {
    addEvent('ERROR', 'Asset download failed: ' + err.message, true);
  }
}

async function scaffoldProject() {
  try {
    const res  = await fetch(`${API}/api/assets/scaffold`, { method: 'POST' });
    const data = await res.json();
    addEvent('SCAFFOLD', `Created ${data.created?.length ?? 0} directories (${data.contentRating})`);
  } catch (err) {
    addEvent('ERROR', 'Scaffold failed: ' + err.message, true);
  }
}

async function validateProject() {
  const reportEl = document.getElementById('validation-report');
  try {
    const res  = await fetch(`${API}/api/project/validate`, { method: 'POST' });
    const data = await res.json();
    if (reportEl) {
      reportEl.style.display = 'block';
      const checksHtml = (data.checks ?? []).map(c =>
        `<div class="validation-check ${c.status}">
          <span>${c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '✗'}</span>
          <span>${escHtml(c.name)}</span>
          ${c.message ? `<span style="color:var(--dim)">— ${escHtml(c.message)}</span>` : ''}
        </div>`
      ).join('');
      reportEl.innerHTML = `
        <div class="panel-label">VALIDATION REPORT</div>
        <span class="validation-overall ${data.overall}">${data.overall}: ${escHtml(data.summary)}</span>
        <div class="validation-checks">${checksHtml}</div>`;
    }
    addEvent('VALIDATE', `Project validation: ${data.overall} — ${data.summary}`);
  } catch (err) {
    addEvent('ERROR', 'Validation failed: ' + err.message, true);
  }
}

async function loadAssetCache() {
  const listEl = document.getElementById('asset-cache-list');
  if (!listEl) return;
  try {
    const res  = await fetch(`${API}/api/assets/cache`);
    const data = await res.json();
    const entries = Object.values(data);
    if (!entries.length) { listEl.innerHTML = '<div style="color:var(--dim);font:11px var(--mono);padding:8px">Cache is empty.</div>'; return; }
    listEl.innerHTML = '';
    entries.forEach((e) => {
      const m    = e.metadata;
      const size = m.fileSize ? `${(m.fileSize / 1024).toFixed(1)} KB` : '—';
      const div  = document.createElement('div');
      div.className = 'cache-entry';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-link';
      delBtn.style.fontSize = '10px';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => deleteCacheEntry(e.checksum));
      div.innerHTML = `
        <span class="cache-entry-name" title="${escHtml(e.cachedPath)}">${escHtml(m.name ?? e.checksum.slice(0, 8))}</span>
        <span class="cache-entry-size">${size}</span>
        <span style="font:9px var(--mono);color:var(--dim)">${escHtml(m.licenseConfidence?.replace('LICENSE_','') ?? '?')}</span>`;
      div.appendChild(delBtn);
      listEl.appendChild(div);
    });
  } catch {}
}

async function deleteCacheEntry(checksum) {
  try {
    await fetch(`${API}/api/assets/cache/${checksum}`, { method: 'DELETE' });
    loadAssetCache();
  } catch {}
}

async function promptImportAsset() {
  const filePath = prompt('Enter the full path to the file you want to import:');
  if (!filePath?.trim()) return;
  try {
    const res  = await fetch(`${API}/api/assets/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: filePath.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Import failed');
    addEvent('IMPORT', `Imported: ${filePath} → ${data.targetPath}`);
    loadAssetCache();
  } catch (err) {
    addEvent('ERROR', 'Import failed: ' + err.message, true);
  }
}

// ── Audio Discovery ────────────────────────────────────────────────────────
async function searchAudio() {
  const query    = document.getElementById('audio-query')?.value.trim();
  const statusEl = document.getElementById('audio-search-status');
  const gridEl   = document.getElementById('audio-results');
  if (!query) return;
  if (statusEl) statusEl.textContent = 'Searching…';
  if (gridEl)   gridEl.innerHTML = '';
  try {
    const res  = await fetch(`${API}/api/audio/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 10 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');
    if (statusEl) statusEl.textContent = `${data.results?.length ?? 0} results from ${data.providers?.join(', ')}`;
    renderAudioResults(data.results ?? [], gridEl);
  } catch (err) {
    if (statusEl) statusEl.textContent = '✗ ' + err.message;
  }
}

function renderAudioResults(results, container) {
  if (!container) return;
  if (!results.length) { container.innerHTML = '<div style="color:var(--dim);font:11px var(--mono);padding:16px">No results found.</div>'; return; }
  container.innerHTML = '';
  results.forEach(r => {
    const a = r.audio;
    const licClass = a.licenseConfidence === 'LICENSE_CONFIRMED' ? 'license-confirmed'
                   : a.licenseConfidence === 'LICENSE_PARTIAL'   ? 'license-partial'
                   : 'license-unknown';
    const card = document.createElement('div');
    card.className = 'asset-card';
    card.innerHTML = `
      <div class="asset-card-name" title="${escHtml(a.title)}">${escHtml(a.title)}</div>
      <div class="asset-card-meta">
        <span>Category: ${escHtml(a.category)}</span>
        <span>Provider: ${escHtml(a.sourceProvider)}</span>
        ${a.creator    ? `<span>By: ${escHtml(a.creator)}</span>` : ''}
        ${a.durationSec ? `<span>${a.durationSec.toFixed(1)}s</span>` : ''}
        ${a.format     ? `<span>${escHtml(a.format.toUpperCase())}</span>` : ''}
      </div>
      <span class="asset-card-license ${licClass}">${escHtml(a.licenseConfidence?.replace('LICENSE_','') ?? 'UNKNOWN')}</span>
      ${a.licenseWarning ? `<div style="font:10px var(--mono);color:var(--amber);margin-top:2px">⚠ ${escHtml(a.licenseWarning)}</div>` : ''}
      <div class="asset-card-actions">
        ${a.sourceUrl ? `<a href="${escHtml(a.sourceUrl)}" target="_blank" class="btn-link" style="font-size:10px">View source</a>` : ''}
        ${a.downloadUrl ? `<button class="btn-ghost small btn-dl-audio">Download</button>` : ''}
        <span class="asset-card-score">Score: ${r.score}</span>
      </div>`;
    if (a.downloadUrl) {
      card.querySelector('.btn-dl-audio')?.addEventListener('click', () => downloadAudioCard(a));
    }
    container.appendChild(card);
  });
}

async function downloadAudioCard(audio) {
  try {
    const res  = await fetch(`${API}/api/audio/download`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audio),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Download failed');
    addEvent('AUDIO', `Downloaded: ${audio.title} → ${data.targetPath}`);
    loadAudioCache();
  } catch (err) {
    addEvent('ERROR', 'Audio download failed: ' + err.message, true);
  }
}

async function loadAudioCache() {
  const listEl = document.getElementById('audio-cache-list');
  if (!listEl) return;
  try {
    const res  = await fetch(`${API}/api/audio/cache`);
    const data = await res.json();
    const entries = Object.values(data);
    if (!entries.length) { listEl.innerHTML = '<div style="color:var(--dim);font:11px var(--mono);padding:8px">Audio cache is empty.</div>'; return; }
    listEl.innerHTML = '';
    entries.forEach((e) => {
      const m   = e.metadata;
      const div = document.createElement('div');
      div.className = 'cache-entry';
      div.innerHTML = `
        <span class="cache-entry-name">${escHtml(m.title ?? e.checksum.slice(0,8))}</span>
        <span style="font:9px var(--mono);color:var(--cyan)">${escHtml(m.category)}</span>
        <span style="font:9px var(--mono);color:var(--dim)">${escHtml(m.licenseConfidence?.replace('LICENSE_','') ?? '?')}</span>`;
      listEl.appendChild(div);
    });
  } catch {}
}

// ── Web Search ─────────────────────────────────────────────────────────────
async function loadSearchProviders() {
  const sel = document.getElementById('web-provider');
  const statusEl = document.getElementById('search-provider-status');
  if (!sel) return;
  try {
    const res  = await fetch(`${API}/api/search/providers`);
    const data = await res.json();
    sel.innerHTML = '<option value="">All providers</option>';
    let hasUnavailable = false;
    data.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + (p.isAvailable ? ' ✓' : ' (keys not set)');
      if (!p.isAvailable) { opt.disabled = true; hasUnavailable = true; }
      sel.appendChild(opt);
    });
    if (statusEl) {
      const unavailable = data.filter(p => !p.isAvailable);
      if (unavailable.length) {
        statusEl.innerHTML = `⚠ ${unavailable.map(p => p.name).join(', ')} — keys not configured. <a href="#" class="btn-link" id="link-search-settings">Add keys in Settings →</a>`;
        document.getElementById('link-search-settings')?.addEventListener('click', (e) => {
          e.preventDefault();
          document.querySelector('.nav-btn[data-view="settings"]')?.click();
        });
      } else {
        statusEl.textContent = '';
      }
    }
  } catch {}
}

async function runWebSearch() {
  const query      = document.getElementById('web-query')?.value.trim();
  const providerId = document.getElementById('web-provider')?.value;
  const intentEl   = document.getElementById('web-search-intent');
  const resultsEl  = document.getElementById('web-results');
  if (!query) return;
  if (intentEl)  intentEl.textContent = 'Searching…';
  if (resultsEl) resultsEl.innerHTML = '';
  try {
    const res  = await fetch(`${API}/api/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 10, providerIds: providerId ? [providerId] : undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');
    if (intentEl) intentEl.innerHTML = `Intent: <span class="intent-badge">${escHtml(data.intent)}</span> · ${data.results?.length ?? 0} results from ${data.providers?.join(', ')}`;
    renderWebResults(data.results ?? [], resultsEl);
  } catch (err) {
    if (intentEl) intentEl.textContent = '✗ ' + err.message;
  }
}

function renderWebResults(results, container) {
  if (!container) return;
  if (!results.length) { container.innerHTML = '<div style="color:var(--dim);font:11px var(--mono);padding:16px">No results.</div>'; return; }
  container.innerHTML = '';
  results.forEach(r => {
    const card = document.createElement('div');
    card.className = 'web-result-card';
    card.innerHTML = `
      <a class="web-result-title" href="${escHtml(r.url)}" target="_blank">${escHtml(r.title)}</a>
      <div class="web-result-url">${escHtml(r.url)}</div>
      ${r.snippet ? `<div class="web-result-snippet">${escHtml(r.snippet)}</div>` : ''}
      <div class="web-result-meta">
        <span class="intent-badge">${escHtml(r.intent ?? '—')}</span>
        <span style="font:10px var(--mono);color:var(--dim)">${escHtml(r.provider)}</span>
      </div>`;
    container.appendChild(card);
  });
}




// ── Generator Browser Panel ────────────────────────────────────────────────

// Curated Perchance generator map — best generators by category
// Perchance requires a real browser (Cloudflare protected), so we use
// Electron webview (full Chromium) or iframe fallback in browser mode.
var PERCHANCE_GENERATORS = [
  { id: 'ai-image',     url: 'https://perchance.org/ai-text-to-image-generator',       tags: ['image','art','general','photo','realistic'],          label: 'AI Image Generator',    nsfw: false },
  { id: 'nsfw-image',   url: 'https://perchance.org/nsfw-ai-image-generator',           tags: ['nsfw','adult','nude','sexy','explicit','18+'],         label: 'NSFW Image Generator',   nsfw: true  },
  { id: 'anime',        url: 'https://perchance.org/ai-anime-generator',                tags: ['anime','manga','waifu','cartoon','japanese'],          label: 'Anime Generator',        nsfw: false },
  { id: 'hentai',       url: 'https://perchance.org/ai-hentai-generator',               tags: ['hentai','nsfw','anime','adult','ecchi','lewd'],        label: 'Hentai Generator',       nsfw: true  },
  { id: 'photo',        url: 'https://perchance.org/ai-photo-generator',                tags: ['photo','realistic','portrait','person','face'],        label: 'Photo Generator',        nsfw: false },
  { id: 'character',    url: 'https://perchance.org/ai-character-description-generator',tags: ['character','npc','hero','person','description'],       label: 'Character Generator',    nsfw: false },
  { id: 'pixel',        url: 'https://perchance.org/ai-pixel-art-generator',            tags: ['pixel','sprite','retro','8bit','16bit','game'],        label: 'Pixel Art Generator',    nsfw: false },
  { id: 'background',   url: 'https://perchance.org/ai-background-generator',           tags: ['background','scene','landscape','environment','sky'],  label: 'Background Generator',   nsfw: false },
  { id: '3d',           url: 'https://perchance.org/ai-3d-model-generator',             tags: ['3d','model','mesh','object','render'],                 label: '3D Model Generator',     nsfw: false },
  { id: 'game-asset',   url: 'https://perchance.org/ai-game-asset-generator',           tags: ['game','asset','icon','item','weapon','ui'],            label: 'Game Asset Generator',   nsfw: false },
  { id: 'portrait',     url: 'https://perchance.org/ai-portrait-generator',             tags: ['portrait','face','headshot','bust'],                   label: 'Portrait Generator',     nsfw: false },
  { id: 'texture',      url: 'https://perchance.org/ai-texture-generator',              tags: ['texture','tileable','seamless','material','surface'],  label: 'Texture Generator',      nsfw: false },
  { id: 'animation',   url: 'https://perchance.org/ai-animation-generator',           tags: ['animation','gif','motion','frame','animated'],         label: 'Animation Generator',    nsfw: false },
  { id: 'sprite',      url: 'https://perchance.org/ai-sprite-sheet-generator',         tags: ['sprite','sheet','tileset','frames','game','character'], label: 'Sprite Sheet Generator', nsfw: false },
  { id: 'sound-fx',     url: 'https://perchance.org/ai-sound-effect-generator',          tags: ['sound','sfx','effect','audio','noise','click','boom'], label: 'Sound FX Generator',     nsfw: false },
  { id: 'music',        url: 'https://perchance.org/ai-music-generator',                 tags: ['music','bgm','soundtrack','melody','loop','ambient'],  label: 'Music Generator',        nsfw: false },
  { id: 'voice',        url: 'https://perchance.org/ai-voice-generator',                 tags: ['voice','speech','tts','narration','dialogue','talk'],  label: 'Voice Generator',        nsfw: false },
  { id: 'video',        url: 'https://perchance.org/ai-video-generator',                 tags: ['video','clip','movie','footage','cinematic'],          label: 'Video Generator',        nsfw: false },
  { id: 'scene',        url: 'https://perchance.org/ai-scene-generator',                 tags: ['scene','environment','level','room','outdoor','map'],  label: 'Scene Generator',        nsfw: false },
  { id: 'text-to-video',url: 'https://perchance.org/ai-text-to-video',                  tags: ['text','video','animate','render','generate','film'],   label: 'Text-to-Video',          nsfw: false },
  { id: 'itchio',       url: 'https://itch.io/game-assets/free',                        tags: ['free','download','pack','sprite','tileset','audio'],   label: 'itch.io Free Assets',    nsfw: false },
  { id: 'opengameart',  url: 'https://opengameart.org/',                                tags: ['free','cc','open','sprite','music','sound'],           label: 'OpenGameArt',            nsfw: false },
];

// Detect if running in Electron (webview available) or browser (iframe)
var _isElectron = typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';

function _getBrowserEl() {
  if (_isElectron) return document.getElementById('asset-webview');
  return document.getElementById('asset-browser-frame');
}

function _showCorrectFrame() {
  var wv = document.getElementById('asset-webview');
  var fr = document.getElementById('asset-browser-frame');
  if (!wv || !fr) return;
  if (_isElectron) {
    wv.style.display = 'block';
    fr.style.display = 'none';
  } else {
    wv.style.display = 'none';
    fr.style.display = 'block';
  }
}

function toggleBrowserPanels() {
  var panel = document.getElementById('browser-panels');
  var toggle = document.getElementById('browser-panels-toggle');
  if (!panel) return;
  var opening = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = opening ? 'flex' : 'none';
  toggle.textContent = opening
    ? String.fromCodePoint(0x25BC) + ' COLLAPSE'
    : String.fromCodePoint(0x25B6) + ' EXPAND';
  if (opening) _showCorrectFrame();
}


function navigateBrowserTo(url) {
  if (!url || !url.trim()) return;
  if (!url.startsWith('http')) url = 'https://' + url;
  var el = _getBrowserEl();
  var input = document.getElementById('browser-url-input');
  if (el) {
    if (_isElectron && el.tagName === 'WEBVIEW') {
      el.src = url;
    } else {
      el.src = url;
    }
  }
  if (input) input.value = url;
}

function reloadBrowserFrame() {
  var el = _getBrowserEl();
  if (!el) return;
  if (_isElectron && el.tagName === 'WEBVIEW') {
    el.reload();
  } else {
    el.src = el.src;
  }
}

function openBrowserExternal() {
  var el = _getBrowserEl();
  if (!el) return;
  var url = _isElectron && el.tagName === 'WEBVIEW' ? el.src : el.src;
  if (!url || url === 'about:blank') return;
  if (window.electronAPI) window.electronAPI.openExternal(url);
  else window.open(url, '_blank');
}

// ── Perchance Prompt Sender + Brain Auto-Enhance ──────────────────────────

var PC_PROMPT_SEL = [
  '#promptTextarea',
  'textarea[placeholder*="prompt" i]',
  'textarea[placeholder*="describe" i]',
  '.prompt-input textarea',
  '#userPrompt',
  'textarea'
];
var PC_BRAIN_SEL = [
  '#enhancePromptButton',
  'button[title*="enhance" i]',
  'button[title*="brain" i]',
  'button[aria-label*="enhance" i]',
  'button[aria-label*="brain" i]',
  '.enhance-btn',
  '#brainButton',
  'button.brain',
  'button[onclick*="enhance" i]'
];
var PC_GEN_SEL = [
  '#generateButton',
  'button[onclick*="generate" i]',
  'button[title*="generate" i]',
  'button[aria-label*="generate" i]',
  '.generate-btn',
  '#createButton',
  'button.generate'
];

function sendPromptToGenerator(withBrain) {
  var promptEl = document.getElementById('gen-prompt-input');
  var prompt = promptEl ? promptEl.value.trim() : '';

  if (window.PerchanceUniversal && typeof window.PerchanceUniversal.smartGenerate === 'function') {
    window.PerchanceUniversal.smartGenerate(prompt);
    return;
  }

  addEvent('GENERATOR', 'PerchanceUniversal not loaded yet — please wait');
}

// ── Image Confirm Before 3D ────────────────────────────────────────────────

var _confirmedImageUrl = null;
var _confirmedImagePrompt = '';

function confirmImageFor3D() {
  var wv = document.getElementById('asset-webview');
  var modal = document.getElementById('img-confirm-modal');
  var preview = document.getElementById('img-confirm-preview');
  var noneMsg = document.getElementById('img-confirm-none');
  var infoEl  = document.getElementById('img-confirm-info');
  if (!modal) return;

  if (_isElectron && wv && wv.tagName === 'WEBVIEW') {
    var grabLines = [
      '(function(){',
      '  var sels=["#outputImage","#generatedImage","#resultImage",".output-image img",".generated-image img",".result img","canvas"];',
      '  for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(el){if(el.tagName==="CANVAS")return JSON.stringify({src:el.toDataURL("image/png"),type:"canvas"});if(el.src&&el.src!==location.href)return JSON.stringify({src:el.src,type:"img"});}}',
      '  var imgs=document.querySelectorAll("img");',
      '  for(var j=0;j<imgs.length;j++){var im=imgs[j];if(im.naturalWidth>200&&im.naturalHeight>200&&im.src&&im.src.indexOf("logo")===-1&&im.src.indexOf("icon")===-1)return JSON.stringify({src:im.src,type:"img"});}',
      '  return JSON.stringify({src:null});',
      '})();'
    ];
    wv.executeJavaScript(grabLines.join('\n')).then(function(res) {
      try {
        var r = JSON.parse(res);
        if (r.src) {
          _confirmedImageUrl = r.src;
          _confirmedImagePrompt = document.getElementById('gen-prompt-input') ? document.getElementById('gen-prompt-input').value : '';
          if (preview) { preview.src = r.src; preview.style.display = 'block'; }
          if (noneMsg) noneMsg.style.display = 'none';
          if (infoEl) infoEl.textContent = 'Image captured. Ready to convert to 3D or use in task.';
        } else {
          if (preview) preview.style.display = 'none';
          if (noneMsg) noneMsg.style.display = 'block';
          if (infoEl) infoEl.textContent = 'No generated image found yet. Generate one first.';
        }
      } catch(e) {}
      modal.style.display = 'flex';
    }).catch(function() { modal.style.display = 'flex'; });
  } else {
    modal.style.display = 'flex';
  }
}

function closeImageConfirm() {
  var m = document.getElementById('img-confirm-modal');
  if (m) m.style.display = 'none';
}

function sendImageTo3D() {
  closeImageConfirm();
  var inp = document.getElementById('gen-prompt-input');
  var prompt = _confirmedImagePrompt || (inp ? inp.value : '');
  var gen3d = PERCHANCE_GENERATORS.find(function(g) { return g.id === '3d'; });
  if (gen3d) {
    navigateBrowserTo(gen3d.url);
    setTimeout(function() {
      var i2 = document.getElementById('gen-prompt-input');
      if (i2) i2.value = '3D model of: ' + prompt;
      sendPromptToGenerator(true);
    }, 3000);
    addEvent('GENERATOR', String.fromCodePoint(0x1F9CA) + ' Sending to 3D generator');
  }
}

function sendImageToTask() {
  closeImageConfirm();
  var prompt = _confirmedImagePrompt || '';
  var taskEl = document.getElementById('prompt');
  if (taskEl && prompt) {
    taskEl.value += (taskEl.value ? '\n\n' : '') + '[Generated Image Asset]\nPrompt: ' + prompt;
    if (_confirmedImageUrl) taskEl.value += '\nImage: ' + _confirmedImageUrl;
    var homeBtn = document.querySelector('.nav-btn[data-view="home"]');
    if (homeBtn) homeBtn.click();
    addEvent('GENERATOR', 'Image prompt added to task');
  }
}

// ── Project Memory ─────────────────────────────────────────────────────────
// ── Lightweight Image Understanding for Ollama ────────────────────────────────────
// When local Ollama models can't read images, use a lightweight vision model
// to extract image data and pass it to the local models

async function analyzeImageForOllama(imagePath) {
  try {
    const res = await fetch(`${API}/api/vision/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagePath })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Image analysis failed');
    return data.description || data.analysis || '';
  } catch (err) {
    addEvent('VISION', `Image analysis fallback: ${err.message}`);
    return null;
  }
}

// Auto-detect if image needs vision model and provide description to Ollama
async function processImageAttachment(filePath) {
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filePath);
  if (!isImage) return null;
  
  try {
    const localModels = cachedModels.filter(m => m.providerId === 'ollama' || m.isLocal);
    const hasVisionModel = localModels.some(m => m.capabilities?.vision);
    
    if (!hasVisionModel) {
      const description = await analyzeImageForOllama(filePath);
      if (description) {
        addEvent('VISION', `Image analyzed: ${filePath.split(/[\\/]/).pop()}`);
        return description;
      }
    }
  } catch (err) {
    // Silently fail - image will be attached as-is
  }
  return null;
}

// ── Enhance Prompt ────────────────────────────────────────────────────────────────

async function enhancePrompt() {
  var promptEl = document.getElementById('prompt');
  if (!promptEl) return;
  var original = promptEl.value.trim();
  if (!original) { promptEl.focus(); return; }

  var chipEnhance = document.getElementById('chip-enhance');
  if (chipEnhance) { chipEnhance.disabled = true; chipEnhance.innerHTML = '<span class="chip-icon">...</span> Enhancing'; }

  try {
    var res = await fetch(API + '/api/enhance-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: original })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Enhance failed');
    promptEl.value = data.enhanced || original;
    addEvent('ENHANCE', 'Prompt enhanced via ' + (data.model || 'AI'));
  } catch (err) {
    addEvent('ERROR', 'Enhance failed: ' + err.message, true);
  } finally {
    if (chipEnhance) {
      chipEnhance.disabled = false;
      chipEnhance.innerHTML = '<span class="chip-icon">&#x1F9E0;</span> Enhance Prompt';
    }
  }
}

// ── Save Audio from Webview ────────────────────────────────────────────────────

function saveAudioFromWebview() {
  var wv = document.getElementById('asset-webview');
  if (!_isElectron || !wv || wv.tagName !== 'WEBVIEW') {
    addEvent('AUDIO', 'Audio save only works in Electron desktop app');
    return;
  }
  var script = [
    '(function(){',
    '  var sels=["audio","audio source"];',
    '  for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(el){var s=el.src||el.currentSrc;if(s&&s.startsWith("http"))return JSON.stringify({src:s});}}',
    '  var all=document.querySelectorAll("a[href]");',
    '  for(var j=0;j<all.length;j++){var h=all[j].href;if(h&&/\.(mp3|wav|ogg|flac)(\?|$)/i.test(h))return JSON.stringify({src:h});}',
    '  return JSON.stringify({src:null});',
    '})();'
  ].join('');
  wv.executeJavaScript(script).then(function(res) {
    try {
      var r = JSON.parse(res);
      if (r.src) {
        var prompt = (document.getElementById('gen-prompt-input') || {}).value || 'audio';
        var taskEl = document.getElementById('prompt');
        if (taskEl) taskEl.value += (taskEl.value ? '\n\n' : '') + '[Generated Audio]\nPrompt: ' + prompt + '\nURL: ' + r.src;
        addEvent('AUDIO', 'Audio captured: ' + r.src.slice(0, 80));
        if (navigator.clipboard) navigator.clipboard.writeText(r.src);
      } else {
        addEvent('AUDIO', 'No audio found — generate one first');
      }
    } catch(e) {}
  }).catch(function(e) { addEvent('AUDIO', 'Script error: ' + e.message); });
}

// ── Save Video from Webview ────────────────────────────────────────────────────

function saveVideoFromWebview() {
  var wv = document.getElementById('asset-webview');
  if (!_isElectron || !wv || wv.tagName !== 'WEBVIEW') {
    addEvent('VIDEO', 'Video save only works in Electron desktop app');
    return;
  }
  var script = [
    '(function(){',
    '  var sels=["video","video source"];',
    '  for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(el){var s=el.src||el.currentSrc;if(s&&s.startsWith("http"))return JSON.stringify({src:s});}}',
    '  var all=document.querySelectorAll("a[href]");',
    '  for(var j=0;j<all.length;j++){var h=all[j].href;if(h&&/\.(mp4|webm|mov)(\?|$)/i.test(h))return JSON.stringify({src:h});}',
    '  return JSON.stringify({src:null});',
    '})();'
  ].join('');
  wv.executeJavaScript(script).then(function(res) {
    try {
      var r = JSON.parse(res);
      if (r.src) {
        var prompt = (document.getElementById('gen-prompt-input') || {}).value || 'video';
        var taskEl = document.getElementById('prompt');
        if (taskEl) taskEl.value += (taskEl.value ? '\n\n' : '') + '[Generated Video]\nPrompt: ' + prompt + '\nURL: ' + r.src;
        addEvent('VIDEO', 'Video captured: ' + r.src.slice(0, 80));
        if (navigator.clipboard) navigator.clipboard.writeText(r.src);
      } else {
        addEvent('VIDEO', 'No video found — generate one first');
      }
    } catch(e) {}
  }).catch(function(e) { addEvent('VIDEO', 'Script error: ' + e.message); });
}

async function loadMemory() {
  const listEl = document.getElementById('memory-list');
  if (!listEl) return;
  try {
    const res     = await fetch(`${API}/api/project/memory`);
    const entries = await res.json();
    if (!entries.length) { listEl.innerHTML = '<div style="color:var(--dim);font:11px var(--mono);padding:16px">No memory entries yet.</div>'; return; }
    listEl.innerHTML = '';
    [...entries].reverse().forEach(e => {
      const div = document.createElement('div');
      div.className = 'memory-entry';
      div.innerHTML = `
        <div class="memory-entry-header">
          <span class="memory-entry-cat">${escHtml(e.category)}</span>
          <span class="memory-entry-title">${escHtml(e.title)}</span>
          <span class="memory-entry-time">${new Date(e.createdAt).toLocaleString()}</span>
        </div>
        <div class="memory-entry-content">${escHtml(e.content)}</div>`;
      listEl.appendChild(div);
    });
  } catch {}
}

async function addMemoryEntry() {
  const category = document.getElementById('memory-category')?.value;
  const title    = document.getElementById('memory-title')?.value.trim();
  const content  = document.getElementById('memory-content')?.value.trim();
  if (!title || !content) return;
  try {
    const res = await fetch(`${API}/api/project/memory`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, title, content }),
    });
    if (!res.ok) throw new Error(await res.text());
    document.getElementById('memory-title').value   = '';
    document.getElementById('memory-content').value = '';
    loadMemory();
    addEvent('MEMORY', `Added [${category}] ${title}`);
  } catch (err) {
    addEvent('ERROR', 'Memory add failed: ' + err.message, true);
  }
}
