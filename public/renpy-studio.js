// Coding Monster — Built-in Ren'Py Studio & Live Playable Visual Novel Runtime
(function () {
  'use strict';

  const API_BASE = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:'
    ? 'http://127.0.0.1:3000'
    : '';

  function studioFetch(url, init) {
    if (typeof window !== 'undefined' && window.ProxyGuard && typeof window.ProxyGuard.apiFetch === 'function') {
      return window.ProxyGuard.apiFetch(url, init);
    }
    return fetch(url, init);
  }

  async function studioJson(res) {
    const text = await res.text();
    if (typeof window !== 'undefined' && window.ProxyGuard && typeof window.ProxyGuard.parseJsonResponsePayload === 'function') {
      return window.ProxyGuard.parseJsonResponsePayload({
        url: res.url,
        status: res.status,
        ok: res.ok,
        contentType: res.headers && res.headers.get ? res.headers.get('content-type') : '',
        text,
      });
    }
    return text ? JSON.parse(text) : {};
  }

  function studioToast(type, title, message, id) {
    if (typeof window !== 'undefined' && window.ToastManager && typeof window.ToastManager.show === 'function') {
      window.ToastManager.show({ id: id || 'renpy-studio', type, title, message });
    }
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Client-side lightweight Ren'Py script helpers (mirrors dist/renpy/renpyEngine.js)
  function evalExpr(rawExpr, vars) {
    const expr = String(rawExpr || '').trim();
    if (!expr) return undefined;
    if (expr === 'True') return true;
    if (expr === 'False') return false;
    if (expr === 'None') return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
      return expr.slice(1, -1);
    }
    try {
      const normalized = expr
        .replace(/\band\b/g, '&&')
        .replace(/\bor\b/g, '||')
        .replace(/\bnot\b/g, '!')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null');
      const keys = Object.keys(vars);
      const vals = keys.map((k) => vars[k]);
      const fn = new Function(...keys, `return (${normalized});`);
      return fn(...vals);
    } catch {
      return false;
    }
  }

  function runPyLine(code, vars) {
    const stmt = String(code || '').trim();
    if (!stmt) return;
    const aug = stmt.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=|\*=)\s*(.+)$/);
    if (aug) {
      const name = aug[1];
      const op = aug[2];
      const rhs = Number(evalExpr(aug[3], vars) || 0);
      const cur = Number(vars[name] || 0);
      if (op === '+=') vars[name] = cur + rhs;
      else if (op === '-=') vars[name] = cur - rhs;
      else if (op === '*=') vars[name] = cur * rhs;
      return;
    }
    const assign = stmt.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
    if (assign) {
      vars[assign[1]] = evalExpr(assign[2], vars);
    }
  }

  function interpolateText(text, vars) {
    return String(text || '').replace(/\[([a-zA-Z_][a-zA-Z0-9_]*)\]/g, (_, name) => {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `[${name}]`;
    });
  }

  const state = {
    project: null,
    activeFile: 'game/script.rpy',
    ast: null,
    vars: {},
    callStack: [],
    blockQueue: [],
    currentBg: '',
    sprites: {},
    musicPath: '',
    musicEl: null,
    voiceEl: null,
    muted: false,
    dialogue: null,
    menu: null,
    ended: false,
    history: [],
    rollback: [],
    autoMode: false,
    skipMode: false,
    autoTimer: null,
    typeTimer: null,
    typedFull: '',
    typedIdx: 0,
    showHistoryDrawer: false,
    weatherEffect: 'none',
    hudStats: [],
    fxParticles: [],
    fxRafId: null,
  };

  function isVideoMediaUrl(url) {
    try {
      const dec = decodeURIComponent(String(url || ''));
      return /\.(webm|mp4)(?:[?#&]|$)/i.test(dec);
    } catch {
      return /\.(webm|mp4)(?:[?#&]|$)/i.test(String(url || ''));
    }
  }

  function resolveMediaUrl(renpyPath) {
    const clean = String(renpyPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!clean) return '';
    if (/^(https?:|data:|blob:)/i.test(clean)) return clean;
    if (clean.startsWith('/api/')) return API_BASE + clean;
    const wsPath = clean.startsWith('game/') || clean.startsWith('Assets/') ? clean : `game/${clean}`;
    return `${API_BASE}/api/workspace/raw?path=${encodeURIComponent(wsPath)}`;
  }

  function stopAudioPlayback() {
    if (state.musicEl) {
      try { state.musicEl.pause(); } catch {}
      state.musicEl = null;
    }
    if (state.voiceEl) {
      try { state.voiceEl.pause(); } catch {}
      state.voiceEl = null;
    }
    state.musicPath = '';
  }

  function playMusicTrack(renpyPath, loop) {
    const url = resolveMediaUrl(renpyPath);
    if (!url || state.musicPath === url) return;
    if (state.musicEl) {
      try { state.musicEl.pause(); } catch {}
    }
    const audio = new Audio(url);
    audio.loop = loop !== false;
    audio.volume = state.muted ? 0 : 0.35;
    audio.muted = state.muted;
    state.musicPath = url;
    state.musicEl = audio;
    audio.play().catch(() => {});
  }

  function playSfxTrack(renpyPath) {
    if (state.muted) return;
    const url = resolveMediaUrl(renpyPath);
    if (!url) return;
    const sfx = new Audio(url);
    sfx.volume = 0.72;
    sfx.play().catch(() => {});
  }

  function playVoiceTrack(renpyPath) {
    if (state.voiceEl) {
      try { state.voiceEl.pause(); } catch {}
      state.voiceEl = null;
    }
    if (state.muted) return;
    const url = resolveMediaUrl(renpyPath);
    if (!url) return;
    const v = new Audio(url);
    v.volume = 0.92;
    state.voiceEl = v;
    v.play().catch(() => {});
  }

  function triggerStageEffect(effectName) {
    const stage = document.getElementById('renpy-stage');
    if (!stage || !effectName) return;
    stage.classList.remove('fx-fade', 'fx-dissolve', 'fx-vpunch', 'fx-hpunch');
    void stage.offsetWidth;
    if (/vpunch/i.test(effectName)) stage.classList.add('fx-vpunch');
    else if (/hpunch/i.test(effectName)) stage.classList.add('fx-hpunch');
    else if (/fade/i.test(effectName)) stage.classList.add('fx-fade');
    else stage.classList.add('fx-dissolve');
  }

  function stopFxLoop() {
    if (state.fxRafId) {
      cancelAnimationFrame(state.fxRafId);
      state.fxRafId = null;
    }
  }

  function initWeatherParticles(preset) {
    state.fxParticles = [];
    const count = preset === 'rain' || preset === 'storm' ? 75 : preset === 'fog' ? 18 : 42;
    for (let i = 0; i < count; i++) {
      state.fxParticles.push({
        x: Math.random() * 960,
        y: Math.random() * 540,
        r: preset === 'fog' ? 50 + Math.random() * 70 : (preset === 'embers' || preset === 'sparkles' ? 1.5 + Math.random() * 3 : 2 + Math.random() * 3),
        vx: preset === 'rain' || preset === 'storm' ? -2.2 : (Math.random() - 0.5) * 1.1,
        vy: preset === 'rain' || preset === 'storm' ? 11 + Math.random() * 6 : (preset === 'embers' ? -(1.2 + Math.random() * 2) : 0.9 + Math.random() * 1.4),
        alpha: 0.25 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function startFxLoop() {
    const canvas = document.getElementById('renpy-fx-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const preset = String(state.weatherEffect || 'none').toLowerCase();
    if (preset === 'none') {
      stopFxLoop();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (!state.fxParticles.length) initWeatherParticles(preset);
    if (state.fxRafId) return;

    const tick = () => {
      const pType = String(state.weatherEffect || 'none').toLowerCase();
      if (pType === 'none') {
        stopFxLoop();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const t = performance.now() * 0.002;
      for (const p of state.fxParticles) {
        p.x += p.vx + (pType === 'petals' || pType === 'snow' ? Math.sin(t + p.phase) * 0.6 : 0);
        p.y += p.vy;
        if (p.y > 560) { p.y = -15; p.x = Math.random() * 960; }
        if (p.y < -20) { p.y = 550; p.x = Math.random() * 960; }
        if (p.x < -60) p.x = 1000;
        if (p.x > 1020) p.x = -40;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        if (pType === 'rain' || pType === 'storm') {
          ctx.strokeStyle = pType === 'storm' ? 'rgba(196, 181, 253, 0.72)' : 'rgba(147, 197, 253, 0.65)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 1.4, p.y + p.vy * 1.5);
          ctx.stroke();
        } else if (pType === 'embers') {
          ctx.fillStyle = p.alpha > 0.55 ? '#fb923c' : '#f43f5e';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else if (pType === 'petals') {
          ctx.fillStyle = '#f9a8d4';
          ctx.translate(p.x, p.y);
          ctx.rotate(t + p.phase);
          ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
        } else if (pType === 'fog') {
          const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, p.r);
          grad.addColorStop(0, 'rgba(203, 213, 225, 0.14)');
          grad.addColorStop(1, 'rgba(203, 213, 225, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else if (pType === 'snow') {
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // sparkles / magic default
          ctx.fillStyle = p.alpha > 0.55 ? '#e879f9' : '#a855f7';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (0.7 + 0.4 * Math.sin(t * 2 + p.phase)), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      state.fxRafId = requestAnimationFrame(tick);
    };
    state.fxRafId = requestAnimationFrame(tick);
  }

  function snapshotRuntime() {
    return {
      vars: JSON.parse(JSON.stringify(state.vars)),
      callStack: JSON.parse(JSON.stringify(state.callStack)),
      blockQueue: JSON.parse(JSON.stringify(state.blockQueue)),
      currentBg: state.currentBg,
      sprites: JSON.parse(JSON.stringify(state.sprites)),
      musicPath: state.musicPath,
      weatherEffect: state.weatherEffect,
      dialogue: state.dialogue ? { ...state.dialogue } : null,
      menu: state.menu ? JSON.parse(JSON.stringify(state.menu)) : null,
      ended: state.ended,
    };
  }

  function restoreSnapshot(snap) {
    if (!snap) return;
    clearTimers();
    state.vars = JSON.parse(JSON.stringify(snap.vars || {}));
    state.callStack = JSON.parse(JSON.stringify(snap.callStack || []));
    state.blockQueue = JSON.parse(JSON.stringify(snap.blockQueue || []));
    state.currentBg = snap.currentBg || '';
    state.sprites = JSON.parse(JSON.stringify(snap.sprites || {}));
    state.weatherEffect = snap.weatherEffect || 'none';
    state.dialogue = snap.dialogue ? { ...snap.dialogue } : null;
    state.menu = snap.menu ? JSON.parse(JSON.stringify(snap.menu)) : null;
    state.ended = Boolean(snap.ended);
    if (snap.musicPath && snap.musicPath !== state.musicPath) {
      playMusicTrack(snap.musicPath, true);
    }
    state.typedFull = state.dialogue?.text || '';
    state.typedIdx = state.typedFull.length;
    initWeatherParticles(state.weatherEffect);
    renderStage();
  }

  function clearTimers() {
    if (state.autoTimer) { clearTimeout(state.autoTimer); state.autoTimer = null; }
    if (state.typeTimer) { clearInterval(state.typeTimer); state.typeTimer = null; }
  }

  function startRuntime(labelName = 'start') {
    clearTimers();
    stopAudioPlayback();
    stopFxLoop();
    const ast = state.ast;
    if (!ast || !ast.labels || !ast.labels[labelName]) {
      state.dialogue = { speaker: 'System', speakerColor: '#c084fc', text: 'No playable `label start:` loaded yet. Describe a story, adventure, or visual novel in Command Center chat.' };
      state.menu = null;
      state.ended = true;
      state.weatherEffect = 'none';
      renderStage();
      return;
    }

    state.vars = {};
    for (const [k, expr] of Object.entries(ast.defaults || {})) {
      state.vars[k] = evalExpr(expr, state.vars);
    }
    state.callStack = [];
    state.blockQueue = JSON.parse(JSON.stringify(ast.labels[labelName] || []));
    state.currentBg = '';
    state.sprites = {};
    state.dialogue = null;
    state.menu = null;
    state.ended = false;
    state.history = [];
    state.rollback = [];
    state.pendingVoice = '';
    state.weatherEffect = state.project?.manifest?.weatherEffect || 'sparkles';
    initWeatherParticles(state.weatherEffect);
    stepForward(false);
  }

  function stepForward(recordRollback = true) {
    if (state.ended) return;

    // If still typing current dialogue, finish revealing text first
    if (state.dialogue && state.typedIdx < state.typedFull.length && !state.skipMode) {
      clearInterval(state.typeTimer);
      state.typeTimer = null;
      state.typedIdx = state.typedFull.length;
      renderDialogueBox();
      return;
    }

    if (recordRollback && (state.dialogue || state.menu)) {
      state.rollback.push(snapshotRuntime());
      if (state.rollback.length > 40) state.rollback.shift();
    }

    clearTimers();
    state.dialogue = null;
    state.menu = null;

    let guard = 0;
    while (guard++ < 350) {
      while (state.blockQueue.length === 0 && state.callStack.length > 0) {
        state.blockQueue = state.callStack.pop();
      }
      if (state.blockQueue.length === 0) {
        state.ended = true;
        state.dialogue = { speaker: 'End of Scene', speakerColor: '#34d399', text: 'Story execution finished (`return`). Click Restart or edit game/script.rpy to extend!' };
        state.typedFull = state.dialogue.text;
        state.typedIdx = state.typedFull.length;
        renderStage();
        return;
      }

      const step = state.blockQueue.shift();
      if (!step) continue;

      if (step.type === 'default' || step.type === 'pyline') {
        runPyLine(step.code || `${step.name} = ${step.expr}`, state.vars);
        continue;
      }

      if (step.type === 'scene') {
        state.sprites = {};
        const resolved = state.ast.images?.[step.image] || state.ast.images?.[step.image.split(/\s+/)[0]] || step.image;
        state.currentBg = resolveMediaUrl(resolved);
        triggerStageEffect(step.transition);
        continue;
      }

      if (step.type === 'show') {
        const resolved = state.ast.images?.[step.image] || state.ast.images?.[step.tag] || '';
        if (resolved) {
          state.sprites[step.tag] = {
            url: resolveMediaUrl(resolved),
            position: step.position || 'center',
            name: step.image,
            transition: step.transition || 'dissolve',
          };
        }
        triggerStageEffect(step.transition);
        continue;
      }

      if (step.type === 'hide') {
        delete state.sprites[step.tag];
        triggerStageEffect(step.transition);
        continue;
      }

      if (step.type === 'effect') {
        triggerStageEffect(step.effect);
        continue;
      }

      if (step.type === 'weather') {
        state.weatherEffect = String(step.preset || 'none').toLowerCase();
        initWeatherParticles(state.weatherEffect);
        continue;
      }

      if (step.type === 'movie') {
        state.currentBg = resolveMediaUrl(step.path);
        continue;
      }

      if (step.type === 'play') {
        if (step.channel === 'music') playMusicTrack(step.path, step.loop);
        else playSfxTrack(step.path);
        continue;
      }

      if (step.type === 'stop') {
        if (step.channel === 'music' && state.musicEl) {
          try { state.musicEl.pause(); } catch {}
          state.musicEl = null;
          state.musicPath = '';
        }
        continue;
      }

      if (step.type === 'voice') {
        state.pendingVoice = step.path;
        continue;
      }

      if (step.type === 'jump') {
        const targetSteps = state.ast.labels?.[step.target];
        if (targetSteps) {
          state.blockQueue = JSON.parse(JSON.stringify(targetSteps));
          continue;
        }
        state.ended = true;
        state.dialogue = { speaker: 'Runtime Error', speakerColor: '#ef4444', text: `Missing label "${step.target}" for jump.` };
        state.typedFull = state.dialogue.text;
        state.typedIdx = state.typedFull.length;
        renderStage();
        return;
      }

      if (step.type === 'call') {
        const targetSteps = state.ast.labels?.[step.target];
        if (targetSteps) {
          state.callStack.push(state.blockQueue);
          state.blockQueue = JSON.parse(JSON.stringify(targetSteps));
          continue;
        }
        continue;
      }

      if (step.type === 'return') {
        if (state.callStack.length > 0) {
          state.blockQueue = state.callStack.pop();
          continue;
        }
        state.ended = true;
        state.dialogue = { speaker: 'Ending Reached', speakerColor: '#4ade80', text: 'You reached an ending (`return`). Click Restart or pick another branch!' };
        state.typedFull = state.dialogue.text;
        state.typedIdx = state.typedFull.length;
        renderStage();
        return;
      }

      if (step.type === 'if') {
        for (const br of (step.branches || [])) {
          if (br.condition === null || evalExpr(br.condition, state.vars)) {
            state.blockQueue = [...JSON.parse(JSON.stringify(br.steps || [])), ...state.blockQueue];
            break;
          }
        }
        continue;
      }

      if (step.type === 'menu') {
        state.skipMode = false;
        const available = (step.choices || []).filter((c) => !c.condition || evalExpr(c.condition, state.vars));
        state.menu = {
          prompt: interpolateText(step.prompt || '', state.vars),
          choices: available,
        };
        if (state.menu.prompt) {
          state.dialogue = { speaker: '', speakerColor: '#c084fc', text: state.menu.prompt };
          state.typedFull = state.dialogue.text;
          state.typedIdx = state.typedFull.length;
        }
        renderStage();
        return;
      }

      if (step.type === 'say') {
        const charDef = (!step.speakerQuoted && step.speaker && state.ast.characters?.[step.speaker])
          ? state.ast.characters[step.speaker]
          : null;
        const speakerName = charDef ? charDef.name : (step.speaker || '');
        const speakerColor = charDef ? charDef.color : '#c084fc';
        const resolvedText = interpolateText(step.text || '', state.vars);
        state.dialogue = {
          speaker: speakerName,
          speakerId: (!step.speakerQuoted && step.speaker) ? step.speaker : '',
          speakerColor,
          text: resolvedText,
          hasVoice: Boolean(state.pendingVoice),
        };
        state.history.push({ speaker: speakerName || 'Narrator', text: resolvedText });
        if (state.history.length > 80) state.history.shift();
        if (state.pendingVoice) {
          playVoiceTrack(state.pendingVoice);
          state.pendingVoice = '';
        }

        state.typedFull = resolvedText;
        state.typedIdx = state.skipMode ? resolvedText.length : 0;
        renderStage();

        if (!state.skipMode && state.typedFull.length > 0) {
          state.typeTimer = setInterval(() => {
            state.typedIdx = Math.min(state.typedFull.length, state.typedIdx + 2);
            renderDialogueBox();
            if (state.typedIdx >= state.typedFull.length) {
              clearInterval(state.typeTimer);
              state.typeTimer = null;
              if (state.autoMode && !state.menu && !state.ended) {
                state.autoTimer = setTimeout(() => stepForward(true), 2400);
              }
            }
          }, 22);
        } else if (state.skipMode) {
          state.autoTimer = setTimeout(() => stepForward(true), 140);
        }
        return;
      }
    }
  }

  function pickMenuChoice(choiceIdx) {
    if (!state.menu || !state.menu.choices[choiceIdx]) return;
    state.rollback.push(snapshotRuntime());
    const chosen = state.menu.choices[choiceIdx];
    state.history.push({ speaker: 'Choice', text: `> ${chosen.text}` });
    state.menu = null;
    state.dialogue = null;
    state.blockQueue = [...JSON.parse(JSON.stringify(chosen.steps || [])), ...state.blockQueue];
    stepForward(false);
  }

  function renderDialogueBox() {
    const speakerEl = document.getElementById('renpy-speaker');
    const textEl = document.getElementById('renpy-dialogue-text');
    const dlgBox = document.getElementById('renpy-dialogue-box');
    const hintEl = dlgBox?.querySelector('.renpy-advance-hint');
    if (!dlgBox || !speakerEl || !textEl) return;

    if (hintEl) {
      hintEl.textContent = state.menu ? '▲ Choose an option above' : '▼ Click to continue';
    }

    if (!state.dialogue) {
      dlgBox.style.display = 'none';
      return;
    }
    dlgBox.style.display = 'flex';
    if (state.dialogue.speaker) {
      speakerEl.style.display = 'inline-flex';
      speakerEl.textContent = (state.dialogue.hasVoice ? '🎙 ' : '') + state.dialogue.speaker;
      speakerEl.style.color = state.dialogue.speakerColor || '#c084fc';
      speakerEl.style.borderColor = state.dialogue.speakerColor || '#c084fc';
    } else {
      speakerEl.style.display = 'none';
    }
    textEl.textContent = state.typedFull.slice(0, state.typedIdx);
  }

  function renderStage() {
    const bgEl = document.getElementById('renpy-stage-bg');
    const bgVideo = document.getElementById('renpy-stage-video');
    const spritesEl = document.getElementById('renpy-stage-sprites');
    const menuEl = document.getElementById('renpy-menu-overlay');
    const varsEl = document.getElementById('renpy-vars-pill');
    const hudOverlay = document.getElementById('renpy-hud-overlay');

    if (bgEl && bgVideo) {
      if (state.currentBg && isVideoMediaUrl(state.currentBg)) {
        bgEl.style.backgroundImage = '';
        bgEl.classList.remove('has-image');
        bgEl.style.display = 'none';
        if (bgVideo.dataset.src !== state.currentBg) {
          bgVideo.dataset.src = state.currentBg;
          bgVideo.src = state.currentBg;
        }
        bgVideo.style.display = 'block';
        bgVideo.play().catch(() => {});
      } else if (state.currentBg) {
        bgVideo.style.display = 'none';
        try { bgVideo.pause(); } catch {}
        bgEl.style.display = 'block';
        bgEl.style.backgroundImage = `url("${state.currentBg}")`;
        bgEl.classList.add('has-image');
      } else {
        bgVideo.style.display = 'none';
        try { bgVideo.pause(); } catch {}
        bgEl.style.display = 'block';
        bgEl.style.backgroundImage = '';
        bgEl.classList.remove('has-image');
      }
    } else if (bgEl) {
      if (state.currentBg) {
        bgEl.style.backgroundImage = `url("${state.currentBg}")`;
        bgEl.classList.add('has-image');
      } else {
        bgEl.style.backgroundImage = '';
        bgEl.classList.remove('has-image');
      }
    }

    if (spritesEl) {
      spritesEl.innerHTML = '';
      const activeSpeakerId = state.dialogue?.speakerId || '';
      for (const [tag, spr] of Object.entries(state.sprites)) {
        const isVideo = isVideoMediaUrl(spr.url);
        const node = document.createElement(isVideo ? 'video' : 'img');
        const tr = String(spr.transition || '').toLowerCase();
        const fxClass = tr === 'easeinleft' ? 'fx-easeinleft' : tr === 'easeinright' ? 'fx-easeinright' : tr === 'zoomin' ? 'fx-zoomin' : '';
        const speakerFocus = activeSpeakerId
          ? (tag === activeSpeakerId ? 'speaking' : 'dimmed')
          : '';
        node.className = `renpy-sprite pos-${spr.position || 'center'} anim-breathe ${fxClass} ${speakerFocus}`.trim();
        node.src = spr.url;
        if (isVideo) {
          node.autoplay = true;
          node.loop = true;
          node.muted = true;
          node.playsInline = true;
        } else {
          node.alt = tag;
        }
        spritesEl.appendChild(node);
        if (isVideo) node.play().catch(() => {});
      }
    }

    startFxLoop();

    if (menuEl) {
      if (state.menu && state.menu.choices && state.menu.choices.length > 0) {
        menuEl.style.display = 'flex';
        menuEl.innerHTML = state.menu.choices.map((ch, idx) =>
          `<button type="button" class="renpy-choice-btn" data-choice-idx="${idx}">${esc(ch.text)}</button>`
        ).join('');
        menuEl.querySelectorAll('.renpy-choice-btn').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            pickMenuChoice(Number(btn.dataset.choiceIdx));
          });
        });
      } else {
        menuEl.style.display = 'none';
        menuEl.innerHTML = '';
      }
    }

    const varEntries = Object.entries(state.vars).filter(([k]) => !k.includes('.'));
    if (varsEl) {
      varsEl.textContent = varEntries.length ? varEntries.map(([k, v]) => `${k}=${v}`).join(' · ') : 'ready';
    }
    if (hudOverlay) {
      hudOverlay.innerHTML = varEntries.length
        ? varEntries.slice(0, 4).map(([k, v]) => `<span class="renpy-hud-chip">${esc(k.toUpperCase())}: ${esc(v)}</span>`).join('')
        : '';
    }

    renderDialogueBox();
    renderQuickMenuState();
    renderHistoryDrawer();
  }

  function renderQuickMenuState() {
    const autoBtn = document.getElementById('renpy-qm-auto');
    const skipBtn = document.getElementById('renpy-qm-skip');
    const muteBtn = document.getElementById('renpy-qm-mute');
    if (autoBtn) autoBtn.classList.toggle('active', state.autoMode);
    if (skipBtn) skipBtn.classList.toggle('active', state.skipMode);
    if (muteBtn) muteBtn.textContent = state.muted ? '🔇 Muted' : '🔊 Audio';
  }

  function renderHistoryDrawer() {
    const drawer = document.getElementById('renpy-history-drawer');
    if (!drawer) return;
    drawer.style.display = state.showHistoryDrawer ? 'flex' : 'none';
    if (!state.showHistoryDrawer) return;
    const list = drawer.querySelector('.renpy-history-list');
    if (!list) return;
    list.innerHTML = state.history.length
      ? state.history.map((h) => `<div class="renpy-history-row"><strong>${esc(h.speaker)}:</strong> ${esc(h.text)}</div>`).join('')
      : '<div style="color:var(--dim);font:11px var(--mono)">Dialogue log is empty.</div>';
    list.scrollTop = list.scrollHeight;
  }

  function renderLintDiagnostics(lint) {
    const box = document.getElementById('renpy-lint-bar');
    if (!box || !lint) return;
    if (lint.errorCount === 0 && lint.warningCount === 0) {
      box.className = 'renpy-lint-bar ok';
      box.textContent = `✓ Valid Ren'Py project · ${lint.labelCount} labels · ${lint.characterCount} characters · ${lint.imageCount} images`;
    } else if (lint.errorCount === 0) {
      box.className = 'renpy-lint-bar warn';
      box.textContent = `⚠ ${lint.warningCount} warning(s): ${lint.diagnostics[0]?.message || ''}`;
    } else {
      box.className = 'renpy-lint-bar err';
      box.textContent = `✗ ${lint.errorCount} syntax error(s) — Line ${lint.diagnostics[0]?.line || '?'}: ${lint.diagnostics[0]?.message || ''}`;
    }
  }

  function renderProjectFiles(project) {
    state.project = project;
    state.ast = project?.lint?.ast || null;
    const titleEl = document.getElementById('renpy-inline-title');
    if (titleEl) {
      titleEl.textContent = project?.manifest?.title || 'Generated Visual Novel';
    }
    const sel = document.getElementById('renpy-file-select');
    const editor = document.getElementById('renpy-code-editor');
    const mediaList = document.getElementById('renpy-media-list');

    if (sel) {
      const names = project?.fileNames || [];
      sel.innerHTML = names.length
        ? names.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('')
        : '<option value="game/script.rpy">game/script.rpy (empty)</option>';
      if (names.includes(state.activeFile)) sel.value = state.activeFile;
      else if (names.length > 0) state.activeFile = names[0];
    }

    if (editor) {
      editor.value = project?.files?.[state.activeFile] || '# Write or edit your .rpy script here\n';
    }

    if (mediaList) {
      const items = project?.mediaFiles || [];
      if (!items.length) {
        mediaList.innerHTML = '<div style="color:var(--dim);font:11px var(--mono);padding:8px">No game/images, animations or audio assets yet — forge below!</div>';
      } else {
        mediaList.innerHTML = items.map((m) => `
          <div class="renpy-media-item">
            <span class="renpy-media-icon">${m.kind === 'audio' ? '🔊' : m.kind === 'video' ? '🎬' : '🖼'}</span>
            <span class="renpy-media-path" title="${esc(m.relativePath)}">${esc(m.renpyPath)}</span>
            ${m.kind === 'audio'
              ? `<button type="button" class="btn-ghost small renpy-play-media" data-url="${esc(API_BASE + m.rawUrl)}">▶</button>`
              : ''}
            <button type="button" class="btn-ghost small renpy-insert-media" data-renpy-path="${esc(m.renpyPath)}" data-kind="${esc(m.kind)}">+ Insert</button>
          </div>
        `).join('');
        mediaList.querySelectorAll('.renpy-play-media').forEach((b) => {
          b.addEventListener('click', () => {
            const a = new Audio(b.dataset.url);
            a.play().catch(() => {});
          });
        });
        mediaList.querySelectorAll('.renpy-insert-media').forEach((b) => {
          b.addEventListener('click', () => {
            const rp = b.dataset.renpyPath;
            const snippet = b.dataset.kind === 'audio'
              ? (rp.includes('bgm') || rp.includes('music') ? `\n    play music "${rp}" loop` : `\n    play sound "${rp}"`)
              : b.dataset.kind === 'video'
                ? `\n    movie "${rp}"`
                : `\n    show "${rp}"`;
            insertSnippetAtCursor(snippet);
          });
        });
      }
    }

    renderLintDiagnostics(project?.lint);
  }

  function insertSnippetAtCursor(snippet) {
    const editor = document.getElementById('renpy-code-editor');
    if (!editor) return;
    const start = editor.selectionStart ?? editor.value.length;
    const end = editor.selectionEnd ?? editor.value.length;
    editor.value = editor.value.slice(0, start) + snippet + editor.value.slice(end);
    editor.focus();
    const pos = start + snippet.length;
    editor.setSelectionRange(pos, pos);
  }

  async function refreshProject(autoPlay = true) {
    try {
      const res = await studioFetch(`${API_BASE}/api/renpy/project`);
      const project = await studioJson(res);
      renderProjectFiles(project);
      if (autoPlay && project.hasProject) {
        startRuntime('start');
      } else {
        renderStage();
      }
      return project;
    } catch (err) {
      studioToast('error', 'Ren\'Py Project Load Failed', err.message, 'renpy-studio');
      return null;
    }
  }

  async function openInlinePlayer() {
    const host = document.getElementById('chat-renpy-player');
    if (!host) return null;
    host.style.display = 'flex';
    const drawer = document.getElementById('renpy-inline-drawer');
    const toggleBtn = document.getElementById('btn-renpy-toggle-code');
    if (drawer && drawer.style.display !== 'none') {
      drawer.style.display = 'none';
    }
    if (toggleBtn) toggleBtn.textContent = '📝 View/Edit .rpy & SFX';
    const proj = await refreshProject(true);
    try {
      host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch {}
    return proj;
  }

  function closeInlinePlayer() {
    clearTimers();
    stopAudioPlayback();
    stopFxLoop();
    const bgVideo = document.getElementById('renpy-stage-video');
    if (bgVideo) { try { bgVideo.pause(); } catch {} }
    const host = document.getElementById('chat-renpy-player');
    if (host) host.style.display = 'none';
  }

  async function saveActiveFile() {
    const editor = document.getElementById('renpy-code-editor');
    if (!editor) return;
    const relPath = state.activeFile || 'game/script.rpy';
    const content = editor.value;
    try {
      const res = await studioFetch(`${API_BASE}/api/renpy/save-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relPath, content }),
      });
      const data = await studioJson(res);
      if (!res.ok) throw new Error(data.error || 'Save failed');
      if (data.project) {
        renderProjectFiles(data.project);
        startRuntime('start');
      }
      if (typeof window.loadWorkspaceTree === 'function') window.loadWorkspaceTree();
      studioToast('success', 'Saved & Hot-Reloaded', `${relPath} compiled and restarted on stage.`, 'renpy-save');
    } catch (err) {
      studioToast('error', 'Save Failed', err.message, 'renpy-save');
    }
  }

  async function lintActiveEditor() {
    const editor = document.getElementById('renpy-code-editor');
    if (!editor) return;
    const files = Object.assign({}, state.project?.files || {}, { [state.activeFile || 'game/script.rpy']: editor.value });
    try {
      const res = await studioFetch(`${API_BASE}/api/renpy/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      const lint = await studioJson(res);
      renderLintDiagnostics(lint);
      if (lint.ast) {
        state.ast = lint.ast;
      }
      studioToast(lint.ok ? 'success' : 'warning', lint.ok ? 'Ren\'Py Syntax Valid' : 'Syntax Issues Found', `Errors: ${lint.errorCount}, Warnings: ${lint.warningCount}`, 'renpy-lint');
    } catch (err) {
      studioToast('error', 'Lint Failed', err.message, 'renpy-lint');
    }
  }

  async function forgeAndInsertAsset() {
    const kind = document.getElementById('renpy-forge-kind')?.value || 'sfx';
    const prompt = document.getElementById('renpy-forge-prompt')?.value.trim();
    if (!prompt) {
      document.getElementById('renpy-forge-prompt')?.focus();
      return;
    }
    const adultMode = Boolean(document.getElementById('chat-adult-mode')?.checked);
    const btn = document.getElementById('btn-renpy-forge-asset');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Forging…'; }
    studioToast('loading', `Forging Ren'Py ${kind.toUpperCase()}…`, prompt, 'renpy-forge');
    try {
      const res = await studioFetch(`${API_BASE}/api/renpy/generate-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, prompt, adultMode }),
      });
      const data = await studioJson(res);
      if (!res.ok) throw new Error(data.error || 'Forge failed');
      insertSnippetAtCursor(`\n    ${data.snippet}\n`);
      await refreshProject(false);
      studioToast('success', `${kind.toUpperCase()} Added & Inserted`, `Saved ${data.relativePath} and inserted snippet into script.`, 'renpy-forge');
    } catch (err) {
      studioToast('error', 'Forge Failed', err.message, 'renpy-forge');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⚡ Forge & Insert'; }
    }
  }

  function init() {
    document.getElementById('btn-renpy-toggle-code')?.addEventListener('click', () => {
      const drawer = document.getElementById('renpy-inline-drawer');
      const btn = document.getElementById('btn-renpy-toggle-code');
      if (!drawer) return;
      const opening = drawer.style.display === 'none' || !drawer.style.display;
      drawer.style.display = opening ? 'flex' : 'none';
      if (btn) btn.textContent = opening ? '📝 Hide .rpy & SFX' : '📝 View/Edit .rpy & SFX';
    });
    document.getElementById('btn-renpy-close-inline')?.addEventListener('click', closeInlinePlayer);
    document.getElementById('btn-renpy-save')?.addEventListener('click', saveActiveFile);
    document.getElementById('btn-renpy-lint')?.addEventListener('click', lintActiveEditor);
    document.getElementById('btn-renpy-forge-asset')?.addEventListener('click', forgeAndInsertAsset);

    document.getElementById('renpy-file-select')?.addEventListener('change', (e) => {
      state.activeFile = e.target.value;
      const editor = document.getElementById('renpy-code-editor');
      if (editor && state.project?.files) {
        editor.value = state.project.files[state.activeFile] || '';
      }
    });

    document.querySelectorAll('.renpy-snippet-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        insertSnippetAtCursor(btn.dataset.snippet || '');
      });
    });

    // Stage click / dialogue advance
    document.getElementById('renpy-stage')?.addEventListener('click', (e) => {
      if (e.target.closest('.renpy-choice-btn') || e.target.closest('.renpy-quick-menu')) return;
      if (!state.menu) stepForward(true);
    });

    // Quick Menu controls
    document.getElementById('renpy-qm-back')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const prev = state.rollback.pop();
      if (prev) restoreSnapshot(prev);
    });
    document.getElementById('renpy-qm-history')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.showHistoryDrawer = !state.showHistoryDrawer;
      renderHistoryDrawer();
    });
    document.getElementById('renpy-qm-auto')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.autoMode = !state.autoMode;
      renderQuickMenuState();
      if (state.autoMode && !state.menu && !state.ended) {
        state.autoTimer = setTimeout(() => stepForward(true), 1200);
      } else {
        clearTimeout(state.autoTimer);
      }
    });
    document.getElementById('renpy-qm-skip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.skipMode = !state.skipMode;
      renderQuickMenuState();
      if (state.skipMode && !state.menu && !state.ended) stepForward(true);
    });
    document.getElementById('renpy-qm-qsave')?.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        localStorage.setItem('cm_renpy_qsave', JSON.stringify(snapshotRuntime()));
        studioToast('success', 'Quick Saved', 'Story state saved to browser slot.', 'renpy-qsave');
      } catch {}
    });
    document.getElementById('renpy-qm-qload')?.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        const raw = localStorage.getItem('cm_renpy_qsave');
        if (raw) {
          restoreSnapshot(JSON.parse(raw));
          studioToast('success', 'Quick Loaded', 'Restored saved Ren\'Py checkpoint.', 'renpy-qsave');
        }
      } catch {}
    });
    document.getElementById('renpy-qm-restart')?.addEventListener('click', (e) => {
      e.stopPropagation();
      startRuntime('start');
    });
    document.getElementById('renpy-qm-mute')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.muted = !state.muted;
      if (state.musicEl) {
        state.musicEl.muted = state.muted;
        state.musicEl.volume = state.muted ? 0 : 0.35;
      }
      renderQuickMenuState();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  window.RenpyStudio = {
    refreshProject,
    openInlinePlayer,
    closeInlinePlayer,
    saveActiveFile,
    lintActiveEditor,
    startRuntime,
    stepForward,
    pickMenuChoice,
    getState: () => state,
  };
})();
