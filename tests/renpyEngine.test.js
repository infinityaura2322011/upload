const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  isRenpyOrGamePrompt,
  decideShouldUseRenpy,
  parseRenpyScript,
  lintRenpyProject,
  planRenpyProjectFromWords,
  buildAutonomousRenpyGame,
} = require('../dist/renpy/renpyEngine');

test('isRenpyOrGamePrompt recognizes RenPy, visual novels, and story games', () => {
  assert.equal(isRenpyOrGamePrompt('make a renpy horror game with thunder sfx'), true);
  assert.equal(isRenpyOrGamePrompt('cyberpunk dating sim visual novel'), true);
  assert.equal(isRenpyOrGamePrompt('refactor database pooling middleware'), false);
});

test('decideShouldUseRenpy automatically selects RenPy when explicitly requested or ideal for story/VN prompts and skips arcade/utility apps', async () => {
  const explicit = await decideShouldUseRenpy('build a cafe adventure using renpy with espresso chime sfx');
  assert.equal(explicit.useRenpy, true);

  const implicitStory = await decideShouldUseRenpy('create a spooky haunted mansion mystery story game with thunder door sfx');
  assert.equal(implicitStory.useRenpy, true);

  const utilityApp = await decideShouldUseRenpy('build a rest api calculator with sql dashboard');
  assert.equal(utilityApp.useRenpy, false);

  const arcadeApp = await decideShouldUseRenpy('make a classic snake game in html canvas');
  assert.equal(arcadeApp.useRenpy, false);
});

test('parseRenpyScript parses characters, images, audio cues, menu branches, and conditionals', () => {
  const sample = `
define aria = Character("Aria", color="#c084fc")
image bg castle = "images/bg_castle.png"
image aria neutral = "images/aria.png"
default trust = 0

label start:
    play music "audio/bgm_theme.wav" fadein 1.0 loop
    scene bg castle with fade
    show aria neutral at left with dissolve
    voice "audio/voice_intro.mp3"
    aria "Welcome to the tower."
    menu:
        "Offer help":
            $ trust += 1
            play sound "audio/sfx_chime.wav"
            jump good_end
        "Walk away":
            jump bold_end

label good_end:
    if trust >= 1:
        aria "You earned my trust ([trust])."
    else:
        "Silence fell."
    return

label bold_end:
    with vpunch
    return
`;

  const ast = parseRenpyScript(sample);
  assert.equal(ast.characters.aria.name, 'Aria');
  assert.equal(ast.characters.aria.color, '#c084fc');
  assert.equal(ast.images['bg castle'], 'images/bg_castle.png');
  assert.equal(ast.defaults.trust, '0');
  assert.ok(ast.labels.start.length >= 6);
  const menuStep = ast.labels.start.find((s) => s.type === 'menu');
  assert.ok(menuStep);
  assert.equal(menuStep.choices.length, 2);
  assert.equal(ast.errors.length, 0);
});

test('lintRenpyProject catches broken jumps and missing label start', () => {
  const bad = {
    'game/script.rpy': 'label intro:\n    "Hi"\n    jump nonexistent\n',
  };
  const report = lintRenpyProject(bad);
  assert.equal(report.ok, false);
  assert.ok(report.errorCount >= 2);
});

test('planRenpyProjectFromWords adapts genre, characters, backgrounds, items, SFX, and voices from short prompt', () => {
  const plan = planRenpyProjectFromWords('cyberpunk hacker romance with laser gun and rain thunder sfx');
  assert.equal(plan.genre, 'cyberpunk');
  assert.equal(plan.characters.length, 2);
  assert.equal(plan.backgrounds.length, 2);
  assert.ok(Array.isArray(plan.items) && plan.items.length >= 1);
  assert.ok(plan.sfx.some((s) => /laser|cyber|thunder/i.test(s.key + ' ' + s.query)));
  assert.equal(plan.voices.length, 2);
});

test('buildAutonomousRenpyGame creates complete playable RenPy project with real media files, items, SFX and passes lint', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-renpy-'));
  try {
    const out = await buildAutonomousRenpyGame({
      prompt: 'gothic vampire castle mystery with thunder and sword sfx',
      workspaceRoot: tmpDir,
      useAI: false,
      generateImageFn: async () => ({ results: [] }),
      discoverAssetsFn: async () => ({ results: [] }),
      discoverAudioFn: async () => ({ results: [] }),
      synthesizeVoiceFn: async () => ({ buffer: Buffer.from('ID3dummyvoice'), format: 'MP3', provider: 'test-tts' }),
    });

    assert.equal(out.ok, true);
    assert.equal(out.lint.ok, true);
    assert.equal(out.lint.errorCount, 0);
    assert.equal(out.lint.warningCount, 0);
    assert.ok(fs.existsSync(path.join(tmpDir, 'game/script.rpy')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'game/options.rpy')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'game/gui.rpy')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'game/screens.rpy')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'renpy-manifest.json')));
    assert.ok(out.mediaManifest.backgrounds.every((b) => fs.existsSync(b.targetPath)));
    assert.ok(out.mediaManifest.characters.every((c) => fs.existsSync(c.targetPath)));
    assert.ok(Array.isArray(out.mediaManifest.items) && out.mediaManifest.items.length >= 1);
    assert.ok(out.mediaManifest.items.every((it) => fs.existsSync(it.targetPath)));
    assert.ok(out.mediaManifest.sfx.every((s) => fs.existsSync(s.targetPath)));
    assert.ok(fs.existsSync(out.mediaManifest.bgm.targetPath));
    assert.ok(out.mediaManifest.voices.every((v) => fs.existsSync(v.targetPath)));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
