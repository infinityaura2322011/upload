// perchance-universal.js
// Smart Perchance routing + brain icon auto-enhance + multi-result display
// Covers: image, audio, animation, 3D, video, scene, sprite, voice, music

const PERCHANCE_API = 'http://127.0.0.1:4319';

// ── Extension → Generator routing ────────────────────────────────────────────
const EXT_TO_GENERATOR = {
  // Images
  jpg:'ai-image', jpeg:'ai-image', png:'ai-image', webp:'ai-image',
  bmp:'ai-image', tiff:'ai-image', svg:'ai-image',
  // Audio
  mp3:'music', wav:'sound-fx', ogg:'music', flac:'music', m4a:'music', aac:'music',
  // Video
  mp4:'video', webm:'video', mov:'video', avi:'video', mkv:'video',
  // 3D
  obj:'3d', fbx:'3d', gltf:'3d', glb:'3d', blend:'3d', stl:'3d',
  // Animation
  gif:'animation', apng:'animation', lottie:'animation',
  // Sprite
  sprite:'sprite', tileset:'sprite',
};

// Keyword → Generator routing (for text prompts)
const KEYWORD_GENERATORS = [
  { keys:['3d model','3d character','3d object','make 3d','create 3d','3d version'], gen:'3d' },
  { keys:['animation','animated','animate','gif','motion','moving'], gen:'animation' },
  { keys:['sprite sheet','sprite','tileset','game asset','pixel art','pixel','8bit','16bit','retro'], gen:'pixel' },
  { keys:['background','scene','landscape','environment','level','room','outdoor','sky'], gen:'background' },
  { keys:['portrait','face','headshot','bust','selfie'], gen:'portrait' },
  { keys:['texture','seamless','tileable','material','surface'], gen:'texture' },
  { keys:['music','bgm','soundtrack','melody','loop','ambient','song','beat'], gen:'music' },
  { keys:['sound effect','sfx','sound','noise','click','boom','explosion','footstep'], gen:'sound-fx' },
  { keys:['voice','speech','narration','dialogue','talk','tts','speak'], gen:'voice' },
  { keys:['video','clip','movie','footage','cinematic','film'], gen:'video' },
  { keys:['anime','manga','waifu','cartoon','japanese','chibi'], gen:'anime' },
  { keys:['hentai','ecchi','lewd','nsfw anime'], gen:'hentai' },
  { keys:['nsfw','nude','naked','sexy','adult','18+','explicit','erotic'], gen:'nsfw-image' },
  { keys:['photo','realistic','photograph','real person','real life'], gen:'photo' },
  { keys:['character','npc','hero','villain','person','girl','boy','woman','man','warrior','mage'], gen:'ai-image' },
  { keys:['image','picture','art','illustration','drawing','painting','artwork'], gen:'ai-image' },
];

const GENERATORS = {
  'ai-image':   { url:'https://perchance.org/ai-text-to-image-generator',        label:'AI Image Generator',    type:'image' },
  'nsfw-image': { url:'https://perchance.org/nsfw-ai-image-generator',            label:'NSFW Image Generator',  type:'image' },
  'anime':      { url:'https://perchance.org/ai-anime-generator',                 label:'Anime Generator',       type:'image' },
  'hentai':     { url:'https://perchance.org/ai-hentai-generator',                label:'Hentai Generator',      type:'image' },
  'photo':      { url:'https://perchance.org/ai-photo-generator',                 label:'Photo Generator',       type:'image' },
  'portrait':   { url:'https://perchance.org/ai-portrait-generator',              label:'Portrait Generator',    type:'image' },
  'pixel':      { url:'https://perchance.org/ai-pixel-art-generator',             label:'Pixel Art Generator',   type:'image' },
  'background': { url:'https://perchance.org/ai-background-generator',            label:'Background Generator',  type:'image' },
  'texture':    { url:'https://perchance.org/ai-texture-generator',               label:'Texture Generator',     type:'image' },
  'sprite':     { url:'https://perchance.org/ai-sprite-sheet-generator',          label:'Sprite Sheet Generator',type:'image' },
  'game-asset': { url:'https://perchance.org/ai-game-asset-generator',            label:'Game Asset Generator',  type:'image' },
  '3d':         { url:'https://perchance.org/ai-3d-model-generator',              label:'3D Model Generator',    type:'3d'    },
  'animation':  { url:'https://perchance.org/ai-animation-generator',             label:'Animation Generator',   type:'animation' },
  'music':      { url:'https://perchance.org/ai-music-generator',                 label:'Music Generator',       type:'audio' },
  'sound-fx':   { url:'https://perchance.org/ai-sound-effect-generator',          label:'Sound FX Generator',    type:'audio' },
  'voice':      { url:'https://perchance.org/ai-voice-generator',                 label:'Voice Generator',       type:'audio' },
  'video':      { url:'https://perchance.org/ai-video-generator',                 label:'Video Generator',       type:'video' },
  'scene':      { url:'https://perchance.org/ai-scene-generator',                 label:'Scene Generator',       type:'image' },
  'text-to-video':{ url:'https://perchance.org/ai-text-to-video',                 label:'Text-to-Video',         type:'video' },
};

// ── Smart routing ─────────────────────────────────────────────────────────────
function detectGeneratorFromPrompt(prompt) {
  const q = prompt.toLowerCase();
  for (const { keys, gen } of KEYWORD_GENERATORS) {
    if (keys.some(k => q.includes(k))) return gen;
  }
  return 'ai-image';
}

function detectGeneratorFromExtension(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return EXT_TO_GENERATOR[ext] || 'ai-image';
}

function detectGenerator(promptOrFile) {
  // If it looks like a filename with extension
  if (/\.[a-z0-9]{2,5}$/i.test(promptOrFile)) {
    return detectGeneratorFromExtension(promptOrFile);
  }
  return detectGeneratorFromPrompt(promptOrFile);
}

// ── Perchance webview injection ───────────────────────────────────────────────
const PC_PROMPT_SELS = [
  'textarea#promptTextarea',
  'textarea.prompt-textarea',
  'textarea[name="prompt"]',
  '#promptTextarea',
  'textarea[placeholder*="prompt" i]',
  'textarea[placeholder*="describe" i]',
  'textarea[placeholder*="enter" i]',
  'textarea[placeholder*="type" i]',
  '.prompt-input textarea',
  '.prompt-box textarea',
  '#userPrompt',
  'textarea'
];
const PC_BRAIN_SELS = [
  '#enhancePromptButton',
  'button#enhanceButton',
  'button[title*="enhance" i]',
  'button[title*="brain" i]',
  'button[title*="improve" i]',
  'button[aria-label*="enhance" i]',
  'button[aria-label*="brain" i]',
  '.enhance-btn',
  '#brainButton',
  'button.brain',
  'button[onclick*="enhance" i]'
];
const PC_GEN_SELS = [
  '#generateButton',
  'button#generateBtn',
  'button[onclick*="generate" i]',
  'button[title*="generate" i]',
  'button[aria-label*="generate" i]',
  'button[title*="create" i]',
  '.generate-btn',
  '#createButton',
  'button.generate',
  'button[type="submit"]'
];

async function clickVisibleWebviewElement(wv, api, webContentsId, selectors, labelPattern) {
  if (!wv?.executeJavaScript || !api?.webviewClick || !webContentsId) return null;

  const script = `(function() {
    var selectors = ${JSON.stringify(selectors)};
    var matches = function(el) {
      if (!el || el.offsetParent === null) return false;
      var rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      return rect.bottom > 0 && rect.right > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
    };
    var find = function() {
      for (var i = 0; i < selectors.length; i++) {
        try {
          var el = document.querySelector(selectors[i]);
          if (matches(el)) return el;
        } catch (e) {}
      }
      var buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]');
      for (var j = 0; j < buttons.length; j++) {
        var text = (buttons[j].innerText || buttons[j].value || buttons[j].getAttribute('aria-label') || buttons[j].title || '').toLowerCase();
        if (matches(buttons[j]) && ${labelPattern ? `/${labelPattern}/.test(text)` : 'true'}) return buttons[j];
      }
      return null;
    };
    var el = find();
    if (!el) return { found: false };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    var rect = el.getBoundingClientRect();
    return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, label: el.innerText || el.value || el.getAttribute('aria-label') || '' };
  })()`;

  try {
    const point = await wv.executeJavaScript(script);
    if (!point?.found) return null;
    await api.webviewClick(webContentsId, point.x, point.y);
    return point;
  } catch (e) {
    return null;
  }
}

function buildInjectionScript(safePrompt, doBrain, brainDelay, genDelay, writePrompt = true) {
  return `(function(){
  var pSel=${JSON.stringify(PC_PROMPT_SELS)};
  var bSel=${JSON.stringify(PC_BRAIN_SELS)};
  var gSel=${JSON.stringify(PC_GEN_SELS)};

  function find(sels) {
    for (var i = 0; i < sels.length; i++) {
      try {
        var el = document.querySelector(sels[i]);
        if (el) return el;
        // also search inside shadow roots
        var hosts = document.querySelectorAll('*');
        for (var h = 0; h < hosts.length; h++) {
          if (hosts[h].shadowRoot) {
            var se = hosts[h].shadowRoot.querySelector(sels[i]);
            if (se) return se;
          }
        }
      } catch(x) {}
    }
    if (sels === gSel) {
      var buttons = document.querySelectorAll('button,input[type="button"],input[type="submit"]');
      for (var i = 0; i < buttons.length; i++) {
        var label = (buttons[i].innerText || buttons[i].value || buttons[i].getAttribute('aria-label') || '').toLowerCase();
        if (/generate|create/.test(label)) return buttons[i];
      }
    }
    return null;
  }

  function setv(el, val) {
    // Native setter — works for React/Vue controlled inputs
    var nativeTA = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    var nativeIN = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    var desc = (el.tagName === 'TEXTAREA' ? nativeTA : nativeIN);
    if (desc && desc.set) desc.set.call(el, val);
    else el.value = val;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown',  { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup',    { bubbles: true }));
  }

  var r = { p: false, b: false, g: false };
  var pe = find(pSel);
  if (${writePrompt} && pe) { setv(pe, '${safePrompt}'); pe.focus(); r.p = true; }

  if (${doBrain}) {
    setTimeout(function() {
      var be = find(bSel);
      if (be) {
        be.click(); r.b = true;
        setTimeout(function() {
          var modalInput = document.querySelector('textarea:focus, input:focus, textarea[placeholder*="prompt" i], input[placeholder*="prompt" i], [contenteditable="true"]');
          if (modalInput && modalInput !== pe) {
            setv(modalInput, '${safePrompt}');
            var modalButtons = document.querySelectorAll('button,input[type="button"],input[type="submit"]');
            for (var mi = 0; mi < modalButtons.length; mi++) {
              var modalLabel = (modalButtons[mi].innerText || modalButtons[mi].value || modalButtons[mi].getAttribute('aria-label') || '').toLowerCase();
              if (/submit|ok|enhance|continue/.test(modalLabel)) { modalButtons[mi].click(); break; }
            }
          }
        }, ${brainDelay});
      }
    }, ${brainDelay});
  }

  setTimeout(function() {
    var ge = find(gSel);
    if (ge) { ge.scrollIntoView({block:'center'}); ge.click(); r.g = true; }
  }, ${genDelay});

  return JSON.stringify(r);
})();`;
}

function updateGenResultsStatus(msg, isError) {
  const area = document.getElementById('gen-results-area');
  if (!area) return;
  let grid = document.getElementById('gen-results-grid');
  if (!grid) {
    area.innerHTML = '<div id="gen-results-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px"></div>';
    grid = document.getElementById('gen-results-grid');
  }
  const color = isError ? 'var(--coral)' : 'var(--lime)';
  grid.innerHTML = `<div style="color:${color};font:12px var(--mono);padding:14px;grid-column:1/-1;background:var(--panel);border:1px solid var(--line);border-radius:6px">${escHtml(msg)}</div>`;
}

// ── Step 1: Keep the existing prompt or sync provided prompt ──────────────────
async function getOrSyncPrompt(wv, userPrompt) {
  if (!wv || wv.tagName !== 'WEBVIEW') return { prompt: userPrompt || '', updated: false };
  const hasUserPrompt = Boolean(userPrompt && userPrompt.trim());
  const safe = hasUserPrompt
    ? userPrompt.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')
    : '';

  const syncScript = `(function(){
    var sels = ${JSON.stringify(PC_PROMPT_SELS)};
    function findTA() {
      for (var i = 0; i < sels.length; i++) {
        try {
          var el = document.querySelector(sels[i]);
          if (el) return el;
        } catch(e) {}
      }
      var all = document.querySelectorAll('textarea, input[type="text"]');
      for (var j = 0; j < all.length; j++) {
        var p = (all[j].placeholder || all[j].name || all[j].id || '').toLowerCase();
        if (/prompt|describe/.test(p)) return all[j];
      }
      return document.querySelector('textarea');
    }
    var pe = findTA();
    if (!pe) return { prompt: '${safe}', updated: false, existing: false };

    var currentVal = pe.value || pe.textContent || '';
    if (${hasUserPrompt}) {
      var proto = pe.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(pe, '${safe}');
      else pe.value = '${safe}';
      pe.dispatchEvent(new Event('input', { bubbles: true }));
      pe.dispatchEvent(new Event('change', { bubbles: true }));
      return { prompt: '${safe}', updated: true, existing: Boolean(currentVal) };
    }
    // KEEP THE EXISTING PROMPT
    return { prompt: currentVal, updated: false, existing: Boolean(currentVal) };
  })()`;

  try {
    const res = await wv.executeJavaScript(syncScript);
    return res || { prompt: userPrompt || '', updated: false };
  } catch (e) {
    return { prompt: userPrompt || '', updated: false };
  }
}

// ── Main: 6-step Vision-guided Perchance generation ───────────────────────────
async function sendToPerchance(userPrompt, options = {}) {
  const {
    generatorId = detectGenerator(userPrompt || ''),
    enhance = true,
    brainDelay = 3500,
  } = options;

  const gen = GENERATORS[generatorId] || GENERATORS['ai-image'];
  const wv = document.getElementById('asset-webview');
  const api = window.electronAPI;
  const isElectron = Boolean(api && wv && wv.tagName === 'WEBVIEW');

  // Navigate to generator only if not already there
  const currentUrl = wv?.src || '';
  const targetBase = gen.url.split('?')[0].replace(/\/$/, '');
  const isAlreadyLoaded = currentUrl.replace(/\/$/, '').startsWith(targetBase);

  if (!isAlreadyLoaded) {
    navigateBrowserTo(gen.url);
    addEvent('GENERATOR', `🧠 ${gen.label} — opening generator...`);
    updateGenResultsStatus(`🧠 Opening ${gen.label}...`);
    await sleep(4000);
  }

  // ── Step 1: Keep the existing prompt ──────────────────────────────────────
  let activePrompt = (userPrompt || '').trim();
  if (wv && wv.tagName === 'WEBVIEW') {
    const syncRes = await getOrSyncPrompt(wv, activePrompt);
    if (!activePrompt && syncRes.prompt) {
      activePrompt = syncRes.prompt;
      addEvent('GENERATOR', `📝 Kept existing prompt: "${activePrompt.slice(0, 60)}${activePrompt.length > 60 ? '...' : ''}"`);
    } else if (syncRes.updated) {
      addEvent('GENERATOR', `📝 Set prompt: "${activePrompt.slice(0, 60)}${activePrompt.length > 60 ? '...' : ''}"`);
    }
  }

  if (!isElectron) {
    fallbackCopyToClipboard(activePrompt);
    updateGenResultsStatus('📋 Prompt copied to clipboard — paste into Perchance browser frame');
    return { generatorId, gen, finalPrompt: activePrompt };
  }

  const webContentsId = wv.getWebContentsId?.();

  // ── Step 2+3: Click Brain icon → fill modal → click Enhance ─────────────
  let brainClicked = false;
  if (enhance) {
    const coordMap = window.PerchanceCoords?.getCoordsFor(generatorId);
    const modal    = coordMap?.modal || window.PerchanceCoords?.BRAIN_MODAL;

    // ── 2a: Click the brain icon ─────────────────────────────────────────
    const liveBrain = await clickVisibleWebviewElement(wv, api, webContentsId, PC_BRAIN_SELS, 'brain|enhance|improve');
    if (liveBrain) {
      brainClicked = true;
      addEvent('GENERATOR', `🧠 Brain located at (${Math.round(liveBrain.x)}, ${Math.round(liveBrain.y)})`);
    }

    if (!brainClicked && coordMap && api?.webviewClick && webContentsId) {
      addEvent('GENERATOR', `🧠 Clicking fallback Brain coordinate (${coordMap.brain.x}, ${coordMap.brain.y})`);
      updateGenResultsStatus('🧠 Opening enhance modal...');
      await api.webviewClick(webContentsId, coordMap.brain.x, coordMap.brain.y);
      brainClicked = true;
    }

    // DOM fallback — click brain by selector if coord click wasn't available
    if (!brainClicked && wv && wv.executeJavaScript) {
      const clickBrainScript = `(function() {
        var sels = ${JSON.stringify(PC_BRAIN_SELS)};
        for (var i = 0; i < sels.length; i++) {
          try {
            var el = document.querySelector(sels[i]);
            if (el && el.offsetParent !== null) { el.click(); return { clicked: true, method: sels[i] }; }
          } catch(x) {}
        }
        var btns = document.querySelectorAll('button, [role="button"], a');
        for (var j = 0; j < btns.length; j++) {
          var t = (btns[j].innerText || btns[j].getAttribute('aria-label') || btns[j].title || '').toLowerCase();
          if (/brain|enhance|improve/.test(t)) { btns[j].click(); return { clicked: true, method: 'text' }; }
        }
        return { clicked: false };
      })()`;
      try {
        const domRes = await wv.executeJavaScript(clickBrainScript);
        if (domRes?.clicked) {
          brainClicked = true;
          addEvent('GENERATOR', '🧠 Brain icon clicked (DOM fallback)');
        }
      } catch (e) {}
    }

    // ── 2b: Wait for the modal popup to appear ───────────────────────────
    const modalWait = modal?.waitMs || 800;
    addEvent('GENERATOR', `⏳ Waiting ${modalWait}ms for enhance modal...`);
    updateGenResultsStatus('⏳ Waiting for enhance modal to open...');
    await sleep(modalWait);

    // ── 2c: Fill the modal input with the user's prompt ──────────────────
    addEvent('GENERATOR', '📝 Filling modal input with prompt...');
    updateGenResultsStatus('📝 Typing prompt into enhance modal...');

    const safeModalPrompt = (activePrompt || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r?\n/g, '\\n');

    // Modal input selectors — the popup always has one of these patterns
    const MODAL_INPUT_SELS = [
      'dialog textarea', 'dialog input[type="text"]',
      '.modal textarea', '.modal input[type="text"]',
      '[role="dialog"] textarea', '[role="dialog"] input[type="text"]',
      '.overlay textarea', '.overlay input[type="text"]',
      '.popup textarea', '.popup input[type="text"]',
      '.enhance-modal textarea', '.enhance-modal input',
      '#enhanceDialog textarea', '#enhanceModal textarea',
      // Generic: any newly focused input / textarea that is NOT the main prompt
      'textarea:focus', 'input[type="text"]:focus'
    ];

    // Try coordinate click on modal input first, then inject via DOM
    const liveModalInput = await clickVisibleWebviewElement(wv, api, webContentsId, [
      'dialog textarea', 'dialog input[type="text"]', '.modal textarea', '.modal input[type="text"]',
      '[role="dialog"] textarea', '[role="dialog"] input[type="text"]', '.overlay textarea', '.popup textarea',
      '.enhance-modal textarea', '#enhanceDialog textarea', '#enhanceModal textarea',
      'textarea:focus', 'input[type="text"]:focus'
    ]);
    if (!liveModalInput && modal?.input && api?.webviewClick && webContentsId) {
      await api.webviewClick(webContentsId, modal.input.x, modal.input.y);
      await sleep(150);
    }

    // DOM injection into modal input — tries selectors + focused-element fallback
    const fillModalScript = `(function(){
      var sels = ${JSON.stringify(MODAL_INPUT_SELS)};
      function findModalInput() {
        // 1. Try each selector
        for (var i = 0; i < sels.length; i++) {
          try {
            var el = document.querySelector(sels[i]);
            if (el && el.offsetParent !== null) return el;
          } catch(e) {}
        }
        // 2. Fallback: any visible textarea/input that is NOT the main prompt textarea
        var all = document.querySelectorAll('textarea, input[type="text"]');
        var mainSels = ['textarea#promptTextarea','textarea.prompt-textarea','#userPrompt'];
        var mainEls = mainSels.map(function(s){ try{ return document.querySelector(s); }catch(e){return null;} }).filter(Boolean);
        for (var j = 0; j < all.length; j++) {
          if (all[j].offsetParent !== null && mainEls.indexOf(all[j]) === -1) return all[j];
        }
        return null;
      }
      var el = findModalInput();
      if (!el) return { ok: false, reason: 'no modal input found' };
      // Native setter to bypass React/Vue
      var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, '${safeModalPrompt}');
      else el.value = '${safeModalPrompt}';
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true }));
      el.focus();
      return { ok: true, tag: el.tagName, sel: el.id || el.className };
    })()`;

    try {
      const fillRes = await wv.executeJavaScript(fillModalScript);
      if (fillRes?.ok) {
        addEvent('GENERATOR', `✏️ Prompt typed into modal (${fillRes.tag})`);
      } else {
        addEvent('GENERATOR', `⚠️ Modal input fill: ${fillRes?.reason || 'unknown'}`);
      }
    } catch (e) {
      addEvent('GENERATOR', `⚠️ Modal fill error: ${e.message}`);
    }

    await sleep(200);

    // ── 2d: Click the Enhance/Submit button inside the modal ─────────────
    addEvent('GENERATOR', '✨ Clicking Enhance button in modal...');
    updateGenResultsStatus('✨ Submitting enhance request...');

    let modalSubmitted = false;

    // Coordinate click on modal submit button
    const liveModalSubmit = await clickVisibleWebviewElement(wv, api, webContentsId, [
      'dialog button', '.modal button', '[role="dialog"] button', '.overlay button', '.popup button',
      '.enhance-modal button', '#enhanceDialog button', '#enhanceModal button'
    ], 'enhance|submit|ok|confirm|improve|apply|go');
    if (liveModalSubmit) {
      modalSubmitted = true;
      addEvent('GENERATOR', `✅ Enhance located at (${Math.round(liveModalSubmit.x)}, ${Math.round(liveModalSubmit.y)})`);
    }
    if (!liveModalSubmit && modal?.submit && api?.webviewClick && webContentsId) {
      await api.webviewClick(webContentsId, modal.submit.x, modal.submit.y);
      modalSubmitted = true;
      addEvent('GENERATOR', `✅ Clicked Enhance at (${modal.submit.x}, ${modal.submit.y})`);
    }

    // DOM fallback — find and click the submit button inside the modal
    if (!modalSubmitted && wv && wv.executeJavaScript) {
      const clickModalSubmitScript = `(function(){
        // Look inside any modal/dialog/overlay for an enhance or submit button
        var containers = document.querySelectorAll(
          'dialog, .modal, [role="dialog"], .overlay, .popup, .enhance-modal, #enhanceDialog, #enhanceModal'
        );
        for (var c = 0; c < containers.length; c++) {
          var btns = containers[c].querySelectorAll('button, input[type="button"], input[type="submit"]');
          for (var i = 0; i < btns.length; i++) {
            var label = (btns[i].innerText || btns[i].value || btns[i].getAttribute('aria-label') || '').toLowerCase();
            if (/enhance|submit|ok|confirm|improve|apply|go/.test(label)) {
              btns[i].click();
              return { clicked: true, label: label };
            }
          }
        }
        // Fallback: any button whose text matches enhance/submit that became visible
        var allBtns = document.querySelectorAll('button');
        for (var j = 0; j < allBtns.length; j++) {
          var t = (allBtns[j].innerText || '').toLowerCase().trim();
          if (/^(enhance|submit|ok|confirm|improve|apply)$/.test(t) && allBtns[j].offsetParent !== null) {
            allBtns[j].click();
            return { clicked: true, label: t };
          }
        }
        return { clicked: false };
      })()`;
      try {
        const mRes = await wv.executeJavaScript(clickModalSubmitScript);
        if (mRes?.clicked) {
          modalSubmitted = true;
          addEvent('GENERATOR', `✅ Modal Enhance button clicked (DOM): "${mRes.label}"`);
        }
      } catch (e) {}
    }

    // ── Step 3: Wait for enhancement ──────────────────────────────────────
    addEvent('GENERATOR', '⏳ Waiting for enhancement...');
    updateGenResultsStatus('⏳ Waiting for prompt enhancement...');
    await sleep(brainDelay);

    // Read the (now enhanced) prompt from the page
    if (wv && wv.executeJavaScript) {
      try {
        const readEnhancedScript = `(function(){
          var sels = ${JSON.stringify(PC_PROMPT_SELS)};
          for (var i = 0; i < sels.length; i++) {
            try {
              var el = document.querySelector(sels[i]);
              if (el && el.value) return el.value;
            } catch(e) {}
          }
          return '';
        })()`;
        const newPrompt = await wv.executeJavaScript(readEnhancedScript);
        if (newPrompt) {
          activePrompt = newPrompt;
          addEvent('GENERATOR', `✨ Enhanced prompt: "${activePrompt.slice(0, 70)}${activePrompt.length > 70 ? '...' : ''}"`);
        }
      } catch (e) {}
    }
  }

  // ── Step 4: (No vision rescan needed — coords already known) ──────────────
  addEvent('GENERATOR', '📍 Using hardcoded coordinates for Generate button...');
  updateGenResultsStatus('📍 Locating Generate button via coordinate map...');

  // ── Step 5: Click Generate using HARDCODED COORDINATES ───────────────────
  addEvent('GENERATOR', '▶ Clicking Generate...');
  updateGenResultsStatus('▶ Clicking Generate...');

  let generateClicked = false;

  const liveGenerate = await clickVisibleWebviewElement(wv, api, webContentsId, PC_GEN_SELS, 'generate|create');
  if (liveGenerate) {
    generateClicked = true;
    addEvent('GENERATOR', `✅ Generate located at (${Math.round(liveGenerate.x)}, ${Math.round(liveGenerate.y)})`);
  }

  // Last resort: hardcoded coordinate map
  const coordMapGen = window.PerchanceCoords?.getCoordsFor(generatorId);
  if (!generateClicked && coordMapGen && api?.webviewClick && webContentsId) {
    await api.webviewClick(webContentsId, coordMapGen.generate.x, coordMapGen.generate.y);
    generateClicked = true;
    addEvent('GENERATOR', `✅ Clicked Generate at (${coordMapGen.generate.x}, ${coordMapGen.generate.y}) [coord map]`);
  }

  // FALLBACK: DOM selector click
  if (!generateClicked && wv && wv.executeJavaScript) {
    const domGenScript = `(function() {
      var sels = ${JSON.stringify(PC_GEN_SELS)};
      for (var i = 0; i < sels.length; i++) {
        try {
          var el = document.querySelector(sels[i]);
          if (el && el.offsetParent !== null) {
            el.scrollIntoView({ block: 'center' });
            el.click();
            return { clicked: true, method: sels[i] };
          }
        } catch(x) {}
      }
      var btns = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
      for (var j = 0; j < btns.length; j++) {
        var label = (btns[j].innerText || btns[j].value || btns[j].getAttribute('aria-label') || '').toLowerCase();
        if (/generate|create/.test(label)) {
          btns[j].scrollIntoView({ block: 'center' });
          btns[j].click();
          return { clicked: true, method: 'text' };
        }
      }
      return { clicked: false };
    })()`;
    try {
      const gRes = await wv.executeJavaScript(domGenScript);
      if (gRes?.clicked) {
        generateClicked = true;
        addEvent('GENERATOR', '✅ Generate button clicked (DOM fallback)');
      }
    } catch (e) {}
  }

  // ── Step 6: Poll for generated results ────────────────────────────────────
  addEvent('GENERATOR', '⏳ Polling for generated results...');
  updateGenResultsStatus('⏳ Polling for generated results...');

  let resultsFound = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    await sleep(attempt === 0 ? 5000 : 2000);
    resultsFound = await captureAndDisplayResults(activePrompt, generatorId);
    if (resultsFound) break;
  }

  if (!resultsFound) {
    addEvent('GENERATOR', '⚠️ Generation in progress — check the browser view below');
  }

  return { generatorId, gen, finalPrompt: activePrompt };
}

function fallbackCopyToClipboard(prompt) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(prompt).then(() => {
      addEvent('GENERATOR', '📋 Prompt copied — paste into Perchance and click brain icon');
    });
  }
}

// ── 3D workflow: generate image first, then send to 3D generator ──────────────
async function generateImageThen3D(userPrompt) {
  addEvent('GENERATOR', '🎨 Step 1/2: Generating image first...');

  // Step 1: Generate image
  await sendToPerchance(userPrompt, { generatorId: 'ai-image', enhance: true });

  // Wait for image generation
  addEvent('GENERATOR', '⏳ Waiting for image generation (15s)...');
  await sleep(15000);

  // Step 2: Capture generated image
  const wv = document.getElementById('asset-webview');
  let imageUrl = null;

  if (wv && wv.tagName === 'WEBVIEW') {
    try {
      const grabScript = `(function(){
        var sels=['#outputImage','#generatedImage','#resultImage','.output-image img','.generated-image img','.result img','canvas'];
        for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(el){if(el.tagName==='CANVAS')return JSON.stringify({src:el.toDataURL('image/png')});if(el.src&&el.src.indexOf('http')===0)return JSON.stringify({src:el.src});}}
        var imgs=document.querySelectorAll('img');
        for(var j=0;j<imgs.length;j++){var im=imgs[j];if(im.naturalWidth>200&&im.naturalHeight>200&&im.src&&im.src.indexOf('logo')===-1)return JSON.stringify({src:im.src});}
        return JSON.stringify({src:null});
      })();`;
      const res = JSON.parse(await wv.executeJavaScript(grabScript));
      imageUrl = res.src;
    } catch (e) { /* continue */ }
  }

  // Step 3: Send to 3D generator
  addEvent('GENERATOR', '🧊 Step 2/2: Converting to 3D model...');
  const prompt3d = imageUrl
    ? `Create a detailed 3D model based on this concept: ${userPrompt}. High quality, game-ready, detailed mesh.`
    : `3D model of: ${userPrompt}. Detailed, game-ready, high quality.`;

  await sendToPerchance(prompt3d, { generatorId: '3d', enhance: true });
  addEvent('GENERATOR', '✅ 3D generation started!');
}

// ── Smart generate: entry point from UI ───────────────────────────────────────
async function smartGenerate(userPrompt) {
  // If userPrompt wasn't provided or is not a string, read from input element
  if (typeof userPrompt !== 'string') {
    const inputEl = document.getElementById('gen-prompt-input');
    userPrompt = inputEl ? inputEl.value.trim() : '';
  }

  const wv = document.getElementById('asset-webview');
  let genId = 'ai-image';

  if (userPrompt && userPrompt.trim()) {
    genId = detectGenerator(userPrompt);
  } else if (wv && wv.src) {
    // Detect active generator from current webview URL if already navigated
    for (const [id, g] of Object.entries(GENERATORS)) {
      if (wv.src.includes(id) || wv.src.startsWith(g.url.split('?')[0])) {
        genId = id;
        break;
      }
    }
  }

  const q = (userPrompt || '').toLowerCase();
  if (genId === '3d' || q.includes('3d model') || q.includes('make 3d') || q.includes('3d version')) {
    await generateImageThen3D(userPrompt || '3d game asset');
    return;
  }

  const gen = GENERATORS[genId] || GENERATORS['ai-image'];
  updateGenResultsStatus(`🧠 ${gen.label} — starting Vision workflow...`);

  await sendToPerchance(userPrompt, { generatorId: genId, enhance: true });
}

// Called when user picks a generator from suggestion list
window._pcGenerate = async function(prompt, generatorId) {
  const gen = GENERATORS[generatorId] || GENERATORS['ai-image'];
  updateGenResultsStatus(`🧠 ${gen.label} — starting Vision workflow...`);
  await sendToPerchance(prompt, { generatorId, enhance: true });
};

// ── Capture results from webview ──────────────────────────────────────────────
async function captureAndDisplayResults(prompt, generatorId) {
  const wv = document.getElementById('asset-webview');
  const gen = GENERATORS[generatorId] || GENERATORS['ai-image'];
  let resultsGrid = document.getElementById('gen-results-grid');
  if (!resultsGrid) {
    const area = document.getElementById('gen-results-area');
    if (!area) return false;
    area.innerHTML = '<div id="gen-results-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px"></div>';
    resultsGrid = document.getElementById('gen-results-grid');
  }

  let results = [];

  if (wv && wv.tagName === 'WEBVIEW') {
    try {
      const script = `(function(){
        var out=[];
        var sels=[
          'img[src*="blob:"]',
          'img[src*="data:"]',
          '#outputImage',
          '#generatedImage',
          '.output-image img',
          '.generated-image img',
          '.result img',
          '.output-container img'
        ];
        sels.forEach(function(s){
          document.querySelectorAll(s).forEach(function(el){
            if(el.naturalWidth>100 && el.src && out.indexOf(el.src)===-1) out.push(el.src);
          });
        });
        document.querySelectorAll('canvas').forEach(function(canv){
          try {
            if(canv.width>150 && canv.height>150) {
              var d = canv.toDataURL('image/png');
              if(d && d.length>1000 && out.indexOf(d)===-1) out.push(d);
            }
          } catch(e) {}
        });
        if(!out.length){
          document.querySelectorAll('img').forEach(function(el){
            if(el.naturalWidth>180 && el.naturalHeight>180 && el.src && !/logo|icon|avatar|header/i.test(el.src) && out.indexOf(el.src)===-1) {
              out.push(el.src);
            }
          });
        }
        document.querySelectorAll('audio').forEach(function(a){
          var s = a.src || (a.querySelector('source') ? a.querySelector('source').src : '');
          if (s && out.indexOf(s) === -1) out.push(s);
        });
        document.querySelectorAll('video').forEach(function(v){
          var s = v.src || (v.querySelector('source') ? v.querySelector('source').src : '');
          if (s && out.indexOf(s) === -1) out.push(s);
        });
        return JSON.stringify(out.slice(0, 8));
      })();`;
      results = JSON.parse(await wv.executeJavaScript(script));
    } catch (e) { /* no results yet */ }
  }

  if (!results.length) {
    resultsGrid.innerHTML = `<div style="color:var(--amber);font:12px var(--mono);padding:16px;grid-column:1/-1;background:var(--panel);border:1px solid var(--line);border-radius:6px">
      ⏳ Generation in progress — polling webview for results...<br>
      <button class="btn-ghost small" style="margin-top:8px" onclick="window.PerchanceUniversal.captureAndDisplayResults('${escHtml(prompt)}','${generatorId}')">↻ Check again</button>
    </div>`;
    return false;
  }

  resultsGrid.innerHTML = '';
  results.forEach((src, idx) => {
    const card = document.createElement('div');
    card.style.cssText = 'border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel);transition:border-color .15s';
    card.onmouseenter = () => card.style.borderColor = 'var(--cyan)';
    card.onmouseleave = () => card.style.borderColor = 'var(--line)';

    const isAudio = gen.type === 'audio';
    const is3D    = gen.type === '3d';
    const isVideo = gen.type === 'video';

    let preview = '';
    if (isAudio) {
      preview = `<div style="padding:20px;text-align:center;background:var(--canvas)"><span style="font-size:32px">🔊</span><br><audio controls src="${src}" style="width:100%;margin-top:8px"></audio></div>`;
    } else if (isVideo) {
      preview = `<video controls src="${src}" style="width:100%;height:180px;object-fit:cover;display:block;background:#000"></video>`;
    } else if (is3D) {
      preview = `<div style="padding:20px;text-align:center;background:var(--canvas)"><span style="font-size:32px">🧊</span><br><div style="font:10px var(--mono);color:var(--dim);margin-top:8px">3D Model</div></div>`;
    } else {
      preview = `<img src="${src}" style="width:100%;height:200px;object-fit:cover;display:block" onerror="this.style.display='none'">`;
    }

    card.innerHTML = `
      ${preview}
      <div style="padding:10px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-primary small" onclick="saveResult('${src}','${gen.type}',${idx})">💾 Save</button>
        ${!is3D && !isAudio && !isVideo ? `<button class="btn-ghost small" onclick="sendResultTo3D('${src}','${escHtml(prompt)}')">🧊 Make 3D</button>` : ''}
        <button class="btn-ghost small" onclick="useResultInTask('${src}','${escHtml(prompt)}')">📋 Use</button>
      </div>
    `;
    resultsGrid.appendChild(card);
  });

  addEvent('GENERATOR', `✅ ${results.length} results captured from ${gen.label}`);
  return true;
}

// ── Result actions ────────────────────────────────────────────────────────────
window.saveResult = async function(src, type, idx) {
  try {
    const ext = type === 'audio' ? 'mp3' : type === 'video' ? 'mp4' : type === '3d' ? 'glb' : 'png';
    const r = await fetch(`${PERCHANCE_API}/api/assets/save-generated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: src.startsWith('data:') ? undefined : src, base64: src.startsWith('data:') ? src : undefined, type: ext })
    });
    const d = await r.json();
    if (r.ok) addEvent('ASSET', `💾 Saved → ${d.name}`);
    else throw new Error(d.error);
  } catch (e) {
    addEvent('ERROR', `Save failed: ${e.message}`, true);
  }
};

window.sendResultTo3D = async function(imageUrl, prompt) {
  if (!window.confirm('Convert this selected result to a 3D model?')) return;
  addEvent('GENERATOR', '🧊 Sending to 3D generator...');
  const prompt3d = `3D model of: ${prompt}. Detailed, game-ready, high quality mesh.`;
  await sendToPerchance(prompt3d, { generatorId: '3d', enhance: true });
};

window.useResultInTask = function(src, prompt) {
  const taskEl = document.getElementById('prompt');
  if (!taskEl) return;
  taskEl.value += (taskEl.value ? '\n\n' : '') + `[Generated Asset]\nPrompt: ${prompt}\nURL: ${src}`;
  document.querySelector('.nav-btn[data-view="home"]')?.click();
  addEvent('GENERATOR', '📋 Added to task prompt');
};

// ── Vision: analyze image for Ollama ─────────────────────────────────────────
async function analyzeImageForContext(imagePath) {
  try {
    const r = await fetch(`${PERCHANCE_API}/api/vision/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagePath })
    });
    const d = await r.json();
    if (r.ok && d.description) {
      addEvent('VISION', `👁 Image analyzed via ${d.model}`);
      return d.description;
    }
  } catch (e) {
    addEvent('VISION', `Vision unavailable: ${e.message}`);
  }
  return null;
}

async function checkVisionStatus() {
  try {
    const r = await fetch(`${PERCHANCE_API}/api/vision/status`);
    return await r.json();
  } catch { return { hasVision: false }; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Exports ───────────────────────────────────────────────────────────────────
window.PerchanceUniversal = {
  detectGenerator,
  detectGeneratorFromPrompt,
  detectGeneratorFromExtension,
  sendToPerchance,
  smartGenerate,
  generateImageThen3D,
  captureAndDisplayResults,
  analyzeImageForContext,
  checkVisionStatus,
  GENERATORS,
  EXT_TO_GENERATOR,
};
