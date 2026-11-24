// ============================================================
// perchance-coords.js
// COORDINATE ROADMAP — No Vision Needed
// AI follows these pixel coordinates blindly inside the webview.
//
// How Perchance pages are structured (900 x ~2000px scroll):
//
//  y=0   ┌──────────────────────────────────────────────┐
//        │         PERCHANCE HEADER                     │  (~50px)
//  y=50  ├──────────────────────────────────────────────┤
//        │  [── Prompt Textarea ──────────────] [🧠]    │  y=90–170, brain at x=828
//        │                                              │
//  y=218 │            [  Generate ▶  ]                  │
//  y=240 ├──────────────────────────────────────────────┤
//        │       Generated Output / Result Area         │  y=320+
//  y=700 └──────────────────────────────────────────────┘
//
// BRAIN MODAL (appears after clicking 🧠 icon):
//
//        ┌──────────────────────────────── [✕ x=650,y=252] ─┐  y=248
//        │         Enhance Your Prompt                       │
//        │  ┌────────────────────────────────────────────┐  │  y=290
//        │  │  [Prompt input textarea — x=450, y=315]    │  │
//        │  └────────────────────────────────────────────┘  │  y=350
//        │        [ Enhance  x=450, y=380 ]                  │
//        └───────────────────────────────────────────────────┘  y=410
//
// All X coordinates assume webview is ~900px wide.
// All Y coordinates are relative to the webview top (not page scroll).
// ============================================================

'use strict';

// Webview assumed dimensions
var WV_W = 900;
var WV_H = 700;

// Standard Perchance Layout:
//   Page content centred in ~760px column
//   Left margin = (900 - 760) / 2 = 70px
//   Prompt textarea: full column width, ~120px tall, starts at y=90
//   Brain/Enhance icon: top-right of textarea box, y=90, x=830
//   Generate button: centred below textarea, y=220
//   Results: below generate, y=320+
//
// BRAIN MODAL — appears after clicking 🧠. Same dimensions for ALL generators:
//   modal.input  — center of the prompt input inside the modal
//   modal.submit — center of the "Enhance" / "Submit" button inside the modal
//   modal.close  — center of the "✕" close button (top-right of modal)
//
// Each coord is the CENTER POINT for clicking.

// Shared brain modal coordinates (same popup across all generators)
var BRAIN_MODAL = {
  // Wait this many ms after clicking brain icon before interacting with modal
  waitMs:  800,
  // The prompt input box inside the modal (textarea or input)
  input:   { x: 450, y: 315 },
  // The "Enhance" / submit button at the bottom of the modal
  submit:  { x: 450, y: 378 },
  // The ✕ close button (top-right corner of modal)
  close:   { x: 650, y: 252 }
};

var PERCHANCE_COORDS = {

  // AI Image Generator
  // URL: https://perchance.org/ai-text-to-image-generator
  'ai-image': {
    url:      'https://perchance.org/ai-text-to-image-generator',
    label:    'AI Image Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 140 },
    brain:    { x: 828, y: 108 },
    modal:    BRAIN_MODAL,           // popup that opens after clicking brain
    generate: { x: 440, y: 218 },
    result:   { x: 440, y: 340 },
    extras: {
      aspectRatio:   { x: 620, y: 218 },
      numberImages:  { x: 700, y: 218 }
    }
  },

  // NSFW Image Generator
  // URL: https://perchance.org/nsfw-ai-image-generator
  'nsfw-image': {
    url:      'https://perchance.org/nsfw-ai-image-generator',
    label:    'NSFW Image Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 140 },
    brain:    { x: 828, y: 108 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 218 },
    result:   { x: 440, y: 340 },
    extras: {}
  },

  // Anime Generator
  // URL: https://perchance.org/ai-anime-generator
  'anime': {
    url:      'https://perchance.org/ai-anime-generator',
    label:    'Anime Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 140 },
    brain:    { x: 828, y: 108 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 218 },
    result:   { x: 440, y: 350 },
    extras: {}
  },

  // Hentai Generator
  // URL: https://perchance.org/ai-hentai-generator
  'hentai': {
    url:      'https://perchance.org/ai-hentai-generator',
    label:    'Hentai Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 140 },
    brain:    { x: 828, y: 108 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 218 },
    result:   { x: 440, y: 350 },
    extras: {}
  },

  // Photo Generator
  // URL: https://perchance.org/ai-photo-generator
  'photo': {
    url:      'https://perchance.org/ai-photo-generator',
    label:    'Photo Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 140 },
    brain:    { x: 828, y: 108 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 218 },
    result:   { x: 440, y: 340 },
    extras: {}
  },

  // Portrait Generator
  // URL: https://perchance.org/ai-portrait-generator
  'portrait': {
    url:      'https://perchance.org/ai-portrait-generator',
    label:    'Portrait Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 150 },
    brain:    { x: 828, y: 110 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 230 },
    result:   { x: 440, y: 360 },
    extras: {}
  },

  // Pixel Art Generator
  // URL: https://perchance.org/ai-pixel-art-generator
  'pixel': {
    url:      'https://perchance.org/ai-pixel-art-generator',
    label:    'Pixel Art Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 145 },
    brain:    { x: 828, y: 110 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 222 },
    result:   { x: 440, y: 345 },
    extras: {
      resolution: { x: 620, y: 222 }
    }
  },

  // Background Generator
  // URL: https://perchance.org/ai-background-generator
  'background': {
    url:      'https://perchance.org/ai-background-generator',
    label:    'Background Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 140 },
    brain:    { x: 828, y: 108 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 218 },
    result:   { x: 440, y: 340 },
    extras: {}
  },

  // Texture Generator
  // URL: https://perchance.org/ai-texture-generator
  'texture': {
    url:      'https://perchance.org/ai-texture-generator',
    label:    'Texture Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 140 },
    brain:    { x: 828, y: 108 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 218 },
    result:   { x: 440, y: 340 },
    extras: {
      seamless: { x: 700, y: 218 }
    }
  },

  // Sprite Sheet Generator
  // URL: https://perchance.org/ai-sprite-sheet-generator
  'sprite': {
    url:      'https://perchance.org/ai-sprite-sheet-generator',
    label:    'Sprite Sheet Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 150 },
    brain:    { x: 828, y: 112 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 228 },
    result:   { x: 440, y: 360 },
    extras: {
      gridSize: { x: 650, y: 228 }
    }
  },

  // Game Asset Generator
  // URL: https://perchance.org/ai-game-asset-generator
  'game-asset': {
    url:      'https://perchance.org/ai-game-asset-generator',
    label:    'Game Asset Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 145 },
    brain:    { x: 828, y: 110 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 222 },
    result:   { x: 440, y: 350 },
    extras: {}
  },

  // 3D Model Generator
  // URL: https://perchance.org/ai-3d-model-generator
  // NOTE: Generate button is labelled "Generate 3D" — slightly lower Y
  '3d': {
    url:      'https://perchance.org/ai-3d-model-generator',
    label:    '3D Model Generator',
    type:     '3d',
    scroll:   0,
    prompt:   { x: 440, y: 148 },
    brain:    { x: 828, y: 112 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 225 },
    result:   { x: 440, y: 370 },
    extras: {
      uploadImage: { x: 700, y: 225 },
      style:       { x: 580, y: 225 }
    }
  },

  // Animation Generator
  // URL: https://perchance.org/ai-animation-generator
  // Generates animated GIF/WebP. Result area has video/canvas.
  'animation': {
    url:      'https://perchance.org/ai-animation-generator',
    label:    'Animation Generator',
    type:     'animation',
    scroll:   0,
    prompt:   { x: 440, y: 148 },
    brain:    { x: 828, y: 112 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 228 },
    result:   { x: 440, y: 380 },
    extras: {
      fps:    { x: 640, y: 228 },
      frames: { x: 720, y: 228 }
    }
  },

  // Music Generator
  // URL: https://perchance.org/ai-music-generator
  // Audio output — result area has an audio player
  'music': {
    url:      'https://perchance.org/ai-music-generator',
    label:    'Music Generator',
    type:     'audio',
    scroll:   0,
    prompt:   { x: 440, y: 132 },
    brain:    { x: 828, y: 100 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 210 },
    result:   { x: 440, y: 330 },
    extras: {
      genre:  { x: 580, y: 170 },
      mood:   { x: 680, y: 170 },
      tempo:  { x: 760, y: 170 },
      length: { x: 840, y: 170 }
    }
  },

  // Sound FX Generator
  // URL: https://perchance.org/ai-sound-effect-generator
  'sound-fx': {
    url:      'https://perchance.org/ai-sound-effect-generator',
    label:    'Sound FX Generator',
    type:     'audio',
    scroll:   0,
    prompt:   { x: 440, y: 132 },
    brain:    { x: 828, y: 100 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 205 },
    result:   { x: 440, y: 320 },
    extras: {
      duration: { x: 640, y: 205 }
    }
  },

  // Voice / TTS Generator
  // URL: https://perchance.org/ai-voice-generator
  // Prompt textarea = TEXT TO SPEAK (not a description)
  'voice': {
    url:      'https://perchance.org/ai-voice-generator',
    label:    'Voice Generator',
    type:     'audio',
    scroll:   0,
    prompt:   { x: 440, y: 148 },
    brain:    { x: 828, y: 112 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 235 },
    result:   { x: 440, y: 360 },
    extras: {
      voiceStyle: { x: 580, y: 198 },
      language:   { x: 700, y: 198 },
      speed:      { x: 800, y: 198 }
    }
  },

  // Video Generator
  // URL: https://perchance.org/ai-video-generator
  'video': {
    url:      'https://perchance.org/ai-video-generator',
    label:    'Video Generator',
    type:     'video',
    scroll:   0,
    prompt:   { x: 440, y: 148 },
    brain:    { x: 828, y: 112 },
    modal:    BRAIN_MODAL,
    generate: { x: 440, y: 228 },
    result:   { x: 440, y: 380 },
    extras: {
      duration: { x: 640, y: 228 },
      style:    { x: 740, y: 228 }
    }
  },

  // Text-to-Video
  // URL: https://perchance.org/ai-text-to-video
  'text-to-video': {
    url:      'https://perchance.org/ai-text-to-video',
    label:    'Text-to-Video',
    type:     'video',
    scroll:   0,
    prompt:   { x: 440, y: 155 },
    brain:    { x: 828, y: 118 },
    generate: { x: 440, y: 238 },
    result:   { x: 440, y: 390 },
    extras: {}
  },

  // Scene Generator
  // URL: https://perchance.org/ai-scene-generator
  'scene': {
    url:      'https://perchance.org/ai-scene-generator',
    label:    'Scene Generator',
    type:     'image',
    scroll:   0,
    prompt:   { x: 440, y: 145 },
    brain:    { x: 828, y: 110 },
    generate: { x: 440, y: 225 },
    result:   { x: 440, y: 355 },
    extras: {
      lighting: { x: 620, y: 225 },
      weather:  { x: 720, y: 225 }
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SCALE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function scaleCoord(coord, actualW, actualH) {
  return {
    x: Math.round(coord.x * (actualW / WV_W)),
    y: Math.round(coord.y * (actualH / WV_H))
  };
}

function getCoordsFor(genId, actualW, actualH) {
  actualW = actualW || WV_W;
  actualH = actualH || WV_H;
  var base = PERCHANCE_COORDS[genId];
  if (!base) return null;
  var s = function(c) { return scaleCoord(c, actualW, actualH); };
  var scaledExtras = {};
  Object.keys(base.extras || {}).forEach(function(k) {
    scaledExtras[k] = s(base.extras[k]);
  });
  return {
    url:      base.url,
    label:    base.label,
    type:     base.type,
    scroll:   base.scroll,
    prompt:   s(base.prompt),
    brain:    s(base.brain),
    modal: {
      waitMs:  BRAIN_MODAL.waitMs,
      input:   s(BRAIN_MODAL.input),
      submit:  s(BRAIN_MODAL.submit),
      close:   s(BRAIN_MODAL.close)
    },
    generate: s(base.generate),
    result:   s(base.result),
    extras:   scaledExtras
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COORDINATE-ONLY WORKFLOW (no vision required)
// ─────────────────────────────────────────────────────────────────────────────

// Steps:
//  1. Navigate to generator URL
//  2. Wait for page load
//  3. Click prompt textarea at coords.prompt
//  4. Inject prompt text via DOM
//  5. Click Brain icon at coords.brain (if enhance=true)
//  6. Wait for enhancement (brainDelay ms)
//  7. Click Generate button at coords.generate
//  8. Poll for results in result area

async function coordGenerateWorkflow(genId, prompt, opts) {
  opts = opts || {};
  var enhance    = opts.enhance    !== false;  // default true
  var brainDelay = opts.brainDelay || 3500;
  var loadDelay  = opts.loadDelay  || 4000;
  var actualW    = opts.actualW    || WV_W;
  var actualH    = opts.actualH    || WV_H;

  var coords = getCoordsFor(genId, actualW, actualH);
  if (!coords) {
    console.error('[coords] Unknown generator: ' + genId);
    return false;
  }

  var wv  = document.getElementById('asset-webview');
  var api = window.electronAPI;
  if (!wv || !api) {
    console.warn('[coords] No webview or electronAPI');
    return false;
  }

  var wcId = wv.getWebContentsId ? wv.getWebContentsId() : null;
  if (!wcId) {
    console.warn('[coords] No webContentsId');
    return false;
  }

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
  function click(c)  { return api.webviewClick(wcId, c.x, c.y); }

  // STEP 1: Navigate if needed
  var currentUrl = (wv.src || '').replace(/\/$/, '');
  var targetBase = coords.url.replace(/\/$/, '');
  if (!currentUrl.startsWith(targetBase)) {
    if (typeof addEvent === 'function') addEvent('GENERATOR', 'Navigating to ' + coords.label + '...');
    if (typeof updateGenResultsStatus === 'function') updateGenResultsStatus('Opening ' + coords.label + '...');
    wv.src = coords.url;
    await sleep(loadDelay);
  }

  // STEP 2: Scroll to top if needed
  if (coords.scroll > 0) {
    try { await wv.executeJavaScript('window.scrollTo(0,' + coords.scroll + ')'); await sleep(300); } catch(e) {}
  }

  // STEP 3 + 4: Click textarea and inject prompt
  if (typeof addEvent === 'function') addEvent('GENERATOR', 'Setting prompt at (' + coords.prompt.x + ',' + coords.prompt.y + ')');
  if (typeof updateGenResultsStatus === 'function') updateGenResultsStatus('Setting prompt...');
  await click(coords.prompt);
  await sleep(200);

  var safePrompt = prompt
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, '\\n');

  var injectScript = "(function(){" +
    "var sels=['textarea#promptTextarea','textarea.prompt-textarea','textarea[name=\"prompt\"]'," +
    "'#promptTextarea','textarea[placeholder*=\"prompt\" i]','textarea[placeholder*=\"describe\" i]'," +
    "'textarea[placeholder*=\"enter\" i]','textarea[placeholder*=\"type\" i]'," +
    "'.prompt-input textarea','.prompt-box textarea','#userPrompt','textarea'];" +
    "function findTA(){for(var i=0;i<sels.length;i++){try{var el=document.querySelector(sels[i]);if(el)return el;}catch(e){}}return null;}" +
    "var el=findTA();" +
    "if(!el)return false;" +
    "var d=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')||Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');" +
    "if(d&&d.set)d.set.call(el,'" + safePrompt + "');" +
    "else el.value='" + safePrompt + "';" +
    "el.dispatchEvent(new Event('input',{bubbles:true}));" +
    "el.dispatchEvent(new Event('change',{bubbles:true}));" +
    "el.focus();" +
    "return true;" +
    "})()";
  try { await wv.executeJavaScript(injectScript); } catch(e) {}

  // STEP 5: Click Brain icon → fill modal → click Enhance
  if (enhance) {
    var modal = coords.modal || BRAIN_MODAL;

    // 5a: Click the brain icon
    if (typeof addEvent === 'function') addEvent('GENERATOR', 'Clicking Brain at (' + coords.brain.x + ',' + coords.brain.y + ')');
    if (typeof updateGenResultsStatus === 'function') updateGenResultsStatus('Opening enhance modal...');
    await click(coords.brain);
    await sleep(300);

    // DOM fallback for brain
    var brainScript = "(function(){" +
      "var sels=['#enhancePromptButton','button#enhanceButton','button[title*=\"enhance\" i]','button[title*=\"brain\" i]'," +
      "'button[title*=\"improve\" i]','button[aria-label*=\"enhance\" i]','button[aria-label*=\"brain\" i]'," +
      "'.enhance-btn','#brainButton','button.brain','button[onclick*=\"enhance\" i]'];" +
      "for(var i=0;i<sels.length;i++){try{var el=document.querySelector(sels[i]);if(el&&el.offsetParent!==null){el.click();return true;}}catch(x){}}" +
      "var btns=document.querySelectorAll('button,[role=\"button\"],a');" +
      "for(var j=0;j<btns.length;j++){var t=(btns[j].innerText||btns[j].getAttribute('aria-label')||btns[j].title||'').toLowerCase();if(/brain|enhance|improve/.test(t)){btns[j].click();return true;}}" +
      "return false;" +
      "})()";
    try { await wv.executeJavaScript(brainScript); } catch(e) {}

    // 5b: Wait for modal to appear
    if (typeof addEvent === 'function') addEvent('GENERATOR', 'Waiting for enhance modal...');
    if (typeof updateGenResultsStatus === 'function') updateGenResultsStatus('Waiting for enhance modal...');
    await sleep(modal.waitMs || 800);

    // 5c: Click inside modal input + inject the prompt
    if (typeof addEvent === 'function') addEvent('GENERATOR', 'Filling modal input with prompt...');
    await click(modal.input); // coordinate click on modal input box
    await sleep(150);

    var safeModalP = prompt
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r?\n/g, '\\n');

    var fillModalScript = "(function(){" +
      "var sels=['dialog textarea','dialog input[type=\"text\"]','.modal textarea','.modal input[type=\"text\"]'," +
      "'[role=\"dialog\"] textarea','[role=\"dialog\"] input[type=\"text\"]','.overlay textarea','.popup textarea'," +
      "'.enhance-modal textarea','#enhanceDialog textarea','#enhanceModal textarea','textarea:focus','input[type=\"text\"]:focus'];" +
      "function findModalInput(){" +
        "for(var i=0;i<sels.length;i++){try{var el=document.querySelector(sels[i]);if(el&&el.offsetParent!==null)return el;}catch(e){}}" +
        "var all=document.querySelectorAll('textarea,input[type=\"text\"]');" +
        "var mainSels=['textarea#promptTextarea','textarea.prompt-textarea','#userPrompt'];" +
        "var mainEls=mainSels.map(function(s){try{return document.querySelector(s);}catch(e){return null;}}).filter(Boolean);" +
        "for(var j=0;j<all.length;j++){if(all[j].offsetParent!==null&&mainEls.indexOf(all[j])===-1)return all[j];}" +
        "return null;" +
      "}" +
      "var el=findModalInput();" +
      "if(!el)return false;" +
      "var proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;" +
      "var desc=Object.getOwnPropertyDescriptor(proto,'value');" +
      "if(desc&&desc.set)desc.set.call(el,'" + safeModalP + "');" +
      "else el.value='" + safeModalP + "';" +
      "el.dispatchEvent(new Event('input',{bubbles:true}));" +
      "el.dispatchEvent(new Event('change',{bubbles:true}));" +
      "el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true}));" +
      "el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}));" +
      "el.focus();" +
      "return true;" +
      "})()";
    try { await wv.executeJavaScript(fillModalScript); } catch(e) {}
    await sleep(200);

    // 5d: Click the Enhance / Submit button inside the modal
    if (typeof addEvent === 'function') addEvent('GENERATOR', 'Clicking Enhance in modal at (' + modal.submit.x + ',' + modal.submit.y + ')');
    if (typeof updateGenResultsStatus === 'function') updateGenResultsStatus('Submitting enhance...');
    await click(modal.submit); // coordinate click on Enhance button
    await sleep(300);

    // DOM fallback for modal submit button
    var modalSubmitScript = "(function(){" +
      "var containers=document.querySelectorAll('dialog,.modal,[role=\"dialog\"],.overlay,.popup,.enhance-modal,#enhanceDialog,#enhanceModal');" +
      "for(var c=0;c<containers.length;c++){" +
        "var btns=containers[c].querySelectorAll('button,input[type=\"button\"],input[type=\"submit\"]');" +
        "for(var i=0;i<btns.length;i++){" +
          "var label=(btns[i].innerText||btns[i].value||btns[i].getAttribute('aria-label')||'').toLowerCase();" +
          "if(/enhance|submit|ok|confirm|improve|apply|go/.test(label)){btns[i].click();return true;}" +
        "}" +
      "}" +
      "var allBtns=document.querySelectorAll('button');" +
      "for(var j=0;j<allBtns.length;j++){" +
        "var t=(allBtns[j].innerText||'').toLowerCase().trim();" +
        "if(/^(enhance|submit|ok|confirm|improve|apply)$/.test(t)&&allBtns[j].offsetParent!==null){allBtns[j].click();return true;}" +
      "}" +
      "return false;" +
      "})()";
    try { await wv.executeJavaScript(modalSubmitScript); } catch(e) {}

    // 5e: Wait for enhancement to complete
    if (typeof addEvent === 'function') addEvent('GENERATOR', 'Waiting for enhancement (' + brainDelay + 'ms)...');
    if (typeof updateGenResultsStatus === 'function') updateGenResultsStatus('Enhancing prompt...');
    await sleep(brainDelay);
  }

  // STEP 6 + 7: Click Generate (coordinate click + DOM fallback)
  if (typeof addEvent === 'function') addEvent('GENERATOR', 'Clicking Generate at (' + coords.generate.x + ',' + coords.generate.y + ')');
  if (typeof updateGenResultsStatus === 'function') updateGenResultsStatus('Clicking Generate...');
  await click(coords.generate);
  await sleep(300);

  var genScript = "(function(){" +
    "var sels=['#generateButton','button#generateBtn','button[onclick*=\"generate\" i]'," +
    "'button[title*=\"generate\" i]','button[aria-label*=\"generate\" i]','button[title*=\"create\" i]'," +
    "'.generate-btn','#createButton','button.generate','button[type=\"submit\"]'];" +
    "for(var i=0;i<sels.length;i++){try{var el=document.querySelector(sels[i]);if(el&&el.offsetParent!==null){el.scrollIntoView({block:'center'});el.click();return true;}}catch(x){}}" +
    "var btns=document.querySelectorAll('button,input[type=\"button\"],input[type=\"submit\"]');" +
    "for(var j=0;j<btns.length;j++){var label=(btns[j].innerText||btns[j].value||btns[j].getAttribute('aria-label')||'').toLowerCase();if(/generate|create/.test(label)){btns[j].scrollIntoView({block:'center'});btns[j].click();return true;}}" +
    "return false;" +
    "})()";
  try { await wv.executeJavaScript(genScript); } catch(e) {}

  if (typeof addEvent === 'function') addEvent('GENERATOR', 'Polling for results...');
  if (typeof updateGenResultsStatus === 'function') updateGenResultsStatus('Waiting for results...');

  // STEP 8: Poll for results
  var found = false;
  for (var attempt = 0; attempt < 25; attempt++) {
    await sleep(attempt === 0 ? 5000 : 2000);
    if (typeof captureAndDisplayResults === 'function') {
      found = await captureAndDisplayResults(prompt, genId);
      if (found) break;
    }
  }

  if (!found) {
    if (typeof addEvent === 'function') addEvent('GENERATOR', 'Generation in progress — check browser view below');
    if (typeof updateGenResultsStatus === 'function') updateGenResultsStatus('Generation running — check browser panel below');
  }

  return found;
}

// Print coordinate table to console on load
function printCoordTable() {
  if (typeof console.table === 'function') {
    var table = {};
    Object.keys(PERCHANCE_COORDS).forEach(function(k) {
      var v = PERCHANCE_COORDS[k];
      table[k] = {
        'Prompt(x,y)':   v.prompt.x + ',' + v.prompt.y,
        'Brain(x,y)':    v.brain.x + ',' + v.brain.y,
        'Generate(x,y)': v.generate.x + ',' + v.generate.y,
        'Result Y':      v.result.y,
        'Type':          v.type
      };
    });
    console.group('[PerchanceCoords] Coordinate Roadmap (base 900x700)');
    console.table(table);
    console.groupEnd();
  }
}

window.PerchanceCoords = {
  PERCHANCE_COORDS: PERCHANCE_COORDS,
  getCoordsFor:     getCoordsFor,
  scaleCoord:       scaleCoord,
  coordGenerateWorkflow: coordGenerateWorkflow,
  printCoordTable:  printCoordTable,
  WV_W: WV_W,
  WV_H: WV_H
};

printCoordTable();
