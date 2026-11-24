"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    PERCHANCE_GENERATOR_CATALOG,
    PERCHANCE_PAINTING_STYLES,
    IMAGE_GENERATION_SITES,
    buildGoogleAssetQueries,
    classifyAssetFormat,
    resolveAssetCategoryFolder,
    resolvePaintingStyle,
    chooseBestImageSite,
    buildPerchancePromptBundle,
    generateProceduralSvgAsset,
    listWorkspaceAssets,
    tokenizeMeaningfulQuery,
    computeAssetRelevance,
    buildProjectAssetPlan,
} = require("../dist/assets/assetStudioLogic");

test("PERCHANCE_GENERATOR_CATALOG exposes all 19 Perchance generators with adult flags", () => {
    assert.equal(PERCHANCE_GENERATOR_CATALOG.length, 19);
    const ids = new Set(PERCHANCE_GENERATOR_CATALOG.map((g) => g.id));
    for (const req of ["ai-image", "nsfw-image", "anime", "hentai", "pixel", "3d", "sound-fx", "music", "text-to-video"]) {
        assert.ok(ids.has(req), `Missing generator ${req}`);
    }
    assert.equal(PERCHANCE_GENERATOR_CATALOG.find((g) => g.id === "nsfw-image")?.adult, true);
    assert.equal(PERCHANCE_GENERATOR_CATALOG.find((g) => g.id === "hentai")?.adult, true);
    assert.equal(PERCHANCE_GENERATOR_CATALOG.find((g) => g.id === "anime")?.adult, false);
});

test("PERCHANCE_PAINTING_STYLES and IMAGE_GENERATION_SITES expose rich style & multi-site routing catalogs", () => {
    assert.equal(PERCHANCE_PAINTING_STYLES.length, 11);
    assert.ok(PERCHANCE_PAINTING_STYLES.every((s) => s.id && s.label && s.perchanceMatch && s.suffix));
    const styleIds = new Set(PERCHANCE_PAINTING_STYLES.map((s) => s.id));
    for (const req of ["digital-painting", "oil-painting", "watercolor", "painted-anime", "concept-art", "dark-fantasy"]) {
        assert.ok(styleIds.has(req), `Missing painting style ${req}`);
    }

    assert.equal(IMAGE_GENERATION_SITES.length, 6);
    const siteIds = new Set(IMAGE_GENERATION_SITES.map((s) => s.id));
    for (const req of ["auto", "perchance", "pollinations-flux", "pollinations-turbo", "vector-forge", "open-3d-vrm"]) {
        assert.ok(siteIds.has(req), `Missing site ${req}`);
    }
});

test("resolvePaintingStyle honors explicit style and infers style automatically from prompt", () => {
    const explicit = resolvePaintingStyle("robot cat", "character", "ai-image", "oil-painting");
    assert.equal(explicit.id, "oil-painting");
    assert.equal(explicit.label, "Oil Painting");

    assert.equal(resolvePaintingStyle("castle watercolor illustration", "", "", "auto").id, "watercolor");
    assert.equal(resolvePaintingStyle("retro 16bit dungeon hero", "", "pixel", "auto").id, "pixel-art");
    assert.equal(resolvePaintingStyle("obsidian gothic dragon fortress", "", "", "auto").id, "dark-fantasy");
});

test("chooseBestImageSite picks optimal generation engine per project need", () => {
    assert.equal(chooseBestImageSite("hud emblem badge button", "icon", "game-asset", "auto", false).siteId, "vector-forge");
    assert.equal(chooseBestImageSite("haunted amethyst forest backdrop", "background", "background", "auto", false).siteId, "pollinations-flux");
    assert.equal(chooseBestImageSite("seamless cobblestone floor", "texture", "texture", "auto", false).siteId, "pollinations-turbo");
    assert.equal(chooseBestImageSite("a sexy naked girl", "character", "nsfw-image", "auto", true).siteId, "perchance");
    assert.equal(chooseBestImageSite("dungeon knight", "character", "ai-image", "pollinations-turbo", false).siteId, "pollinations-turbo");
});

test("tokenizeMeaningfulQuery and computeAssetRelevance reject unrelated results", () => {
    const tokens = tokenizeMeaningfulQuery("medieval obsidian sword game asset");
    assert.deepEqual(tokens, ["medieval", "obsidian", "sword"]);

    const irrelevant = computeAssetRelevance("Low-Poly Animated Fox 3D Model character GLB", "medieval obsidian sword", "model", "model");
    assert.equal(irrelevant.isRelevant, false);
    assert.equal(irrelevant.matchedTokens, 0);

    const relevant = computeAssetRelevance("Obsidian Medieval Blade & Sword Spritesheet", "medieval obsidian sword", "character", "character");
    assert.equal(relevant.isRelevant, true);
    assert.ok(relevant.matchedTokens >= 2);
    assert.ok(relevant.scoreDelta > 30);
});

test("buildProjectAssetPlan chooses 3D GLB/VRM, environment, HUD emblem slots with site and painting style", () => {
    const plan3d = buildProjectAssetPlan("Make a 3D crystal dodge game with an animated fox", false);
    assert.equal(plan3d.wants3D, true);
    assert.equal(plan3d.wantsAdult, false);
    assert.ok(plan3d.recommendedStyleId);
    assert.ok(plan3d.slots.some((s) => s.id === "slot-3d-hero" && s.category === "model" && s.preferredSiteId && s.perchanceStyleId));
    assert.ok(plan3d.slots.some((s) => s.category === "texture" && s.preferredSiteId === "pollinations-turbo"));
    assert.ok(plan3d.slots.some((s) => s.category === "icon" && s.preferredSiteId === "vector-forge"));

    const planAdultVrm = buildProjectAssetPlan("Create an 18+ cyberpunk VRM anime showcase", true);
    assert.equal(planAdultVrm.wantsVrm, true);
    assert.equal(planAdultVrm.wantsAdult, true);
    assert.ok(planAdultVrm.slots.some((s) => s.id === "slot-vrm-avatar" && s.perchanceGeneratorId === "nsfw-image" && s.preferredSiteId === "perchance"));
});

test("classifyAssetFormat identifies VRM, 3D models, images, and audio", () => {
    assert.equal(classifyAssetFormat("https://example.com/avatar.vrm?token=123"), "VRM");
    assert.equal(classifyAssetFormat("knight.glb"), "GLB");
    assert.equal(classifyAssetFormat("scene.gltf"), "GLTF");
    assert.equal(classifyAssetFormat("sprite.png"), "PNG");
    assert.equal(classifyAssetFormat("theme.ogg", "audio/ogg"), "OGG");
});

test("resolveAssetCategoryFolder routes VRM and 3D models into dedicated workspace folders", () => {
    assert.equal(resolveAssetCategoryFolder("vrm", "VRM"), "Assets/Characters/VRM");
    assert.equal(resolveAssetCategoryFolder("other", "VRM"), "Assets/Characters/VRM");
    assert.equal(resolveAssetCategoryFolder("model", "GLB"), "Assets/Models");
    assert.equal(resolveAssetCategoryFolder("generated", "SVG"), "Assets/Generated");
});

test("buildGoogleAssetQueries builds Google Web, Images, and VRM search queries", () => {
    const res = buildGoogleAssetQueries("cyberpunk anime girl", "vrm");
    assert.equal(res.intent, "VRM_MODEL");
    assert.ok(res.googleWebUrl.startsWith("https://www.google.com/search?q="));
    assert.ok(res.googleImagesUrl.includes("tbm=isch"));
    assert.ok(res.googleVrmUrl.includes("filetype%3Avrm"));
});

test("buildPerchancePromptBundle auto-selects NSFW/pixel/background/3D, applies painting style, and picks best site", () => {
    const pixel = buildPerchancePromptBundle("dungeon knight pixel art", "character", "");
    assert.equal(pixel.generatorId, "pixel");
    assert.ok(pixel.generatorUrl.includes("perchance.org/ai-pixel-art-generator"));
    assert.ok(pixel.enhancedPrompt.includes("dungeon knight pixel art"));

    const nsfw = buildPerchancePromptBundle("a sexy naked girl", "", "auto", "oil-painting", "auto", false);
    assert.equal(nsfw.generatorId, "nsfw-image");
    assert.equal(nsfw.isAdult, true);
    assert.equal(nsfw.siteId, "perchance");
    assert.equal(nsfw.styleId, "oil-painting");
    assert.ok(nsfw.enhancedPrompt.includes("oil painting"));

    const bg = buildPerchancePromptBundle("obsidian castle sky", "background");
    assert.equal(bg.generatorId, "background");
    assert.equal(bg.siteId, "pollinations-flux");

    const vrm = buildPerchancePromptBundle("vtuber fox girl", "vrm");
    assert.equal(vrm.generatorId, "3d");
});

test("generateProceduralSvgAsset emits valid SVG for background, texture, ui, and character", () => {
    for (const cat of ["background", "texture", "ui", "character"]) {
        const svg = generateProceduralSvgAsset("Purple Hero", cat, "obsidian knight");
        assert.ok(svg.startsWith("<svg "));
        assert.ok(svg.includes("</svg>"));
    }
    const citadelOil = generateProceduralSvgAsset("Amethyst Citadel", "generated", "amethyst dragon citadel", "oil-painting");
    assert.ok(citadelOil.includes("oil-painting"));
    assert.ok(citadelOil.includes("#1a0b2e"));
    assert.ok(citadelOil.includes("viewBox=\"0 0 1280 720\""));
});

test("listWorkspaceAssets recursively lists VRM, images, and 3D assets from Assets/", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cm-assets-"));
    fs.mkdirSync(path.join(tmp, "Assets", "Characters", "VRM"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "Assets", "Generated"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "Assets", "Characters", "VRM", "hero.vrm"), "vrm-data");
    fs.writeFileSync(path.join(tmp, "Assets", "Generated", "emblem.svg"), "<svg/>");

    const found = listWorkspaceAssets(tmp);
    assert.equal(found.length, 2);
    const vrm = found.find((f) => f.format === "VRM");
    const svg = found.find((f) => f.format === "SVG");
    assert.ok(vrm && vrm.is3D && vrm.relativePath === "Assets/Characters/VRM/hero.vrm");
    assert.ok(svg && svg.isImage && svg.relativePath === "Assets/Generated/emblem.svg");

    fs.rmSync(tmp, { recursive: true, force: true });
});

test("OpenVRMAssetProvider returns downloadable VRM and GLB models for matching queries and excludes non-matching ones", async () => {
    const { OpenVRMAssetProvider } = require("../dist/assets/assetDiscovery");
    const prov = new OpenVRMAssetProvider();
    const res = await prov.search("anime avatar", { query: "anime avatar", category: "vrm", limit: 5 });
    assert.ok(res.length >= 1);
    assert.ok(res.some((r) => r.asset.format === "VRM" && r.asset.downloadUrl.endsWith(".vrm")));

    const none = await prov.search("zxqvunrelatedsword99", { query: "zxqvunrelatedsword99", category: "model", limit: 5 });
    assert.equal(none.length, 0);
});

test("getPerchanceConsent and setPerchanceConsent persist one-time 18+ approval on disk", () => {
    const { getPerchanceConsent, setPerchanceConsent } = require("../dist/assets/perchanceService");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cm-consent-"));
    assert.equal(getPerchanceConsent(tmp).adultConsentGranted, false);

    const saved = setPerchanceConsent(tmp, true);
    assert.equal(saved.adultConsentGranted, true);
    assert.ok(saved.grantedAt);

    // Must remain true on subsequent reads so user is never prompted twice
    assert.equal(getPerchanceConsent(tmp).adultConsentGranted, true);
    fs.rmSync(tmp, { recursive: true, force: true });
});

test("saveGeneratedBuffer stores SVG/VRM in appropriate workspace folders and indexes metadata", () => {
    const { saveGeneratedBuffer, getCacheIndex } = require("../dist/assets/assetCache");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cm-cache-"));
    const svgRes = saveGeneratedBuffer(tmp, {
        filename: "crystal.svg",
        buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
        category: "generated",
        prompt: "amethyst crystal",
    });
    assert.equal(svgRes.relativePath, "Assets/Generated/crystal.svg");

    const vrmRes = saveGeneratedBuffer(tmp, {
        filename: "heroine.vrm",
        buffer: Buffer.from("glTF-vrm-mock"),
        category: "vrm",
    });
    assert.equal(vrmRes.relativePath, "Assets/Characters/VRM/heroine.vrm");

    const index = getCacheIndex(tmp);
    assert.equal(Object.keys(index).length, 2);
    fs.rmSync(tmp, { recursive: true, force: true });
});

test("buildAudioGoogleQueries includes Google multi-site free sound sources and Perchance Voice/SFX/Music links", () => {
    const { buildAudioGoogleQueries } = require("../dist/assets/assetStudioLogic");
    const links = buildAudioGoogleQueries("door creak");
    assert.ok(links.googleMultiSiteUrl.includes("freesound.org"));
    assert.ok(links.googleMultiSiteUrl.includes("pixabay.com"));
    assert.ok(links.googleMultiSiteUrl.includes("mixkit.co"));
    assert.ok(links.googleMultiSiteUrl.includes("opengameart.org"));
    assert.ok(links.googleMultiSiteUrl.includes("soundbible.com"));
    assert.ok(links.googleMultiSiteUrl.includes("kenney.nl"));
    assert.equal(links.perchanceVoiceUrl, "https://perchance.org/ai-voice-generator");
    assert.equal(links.perchanceSfxUrl, "https://perchance.org/ai-sound-effect-generator");
    assert.equal(links.perchanceMusicUrl, "https://perchance.org/ai-music-generator");
});

test("generateProceduralWavBuffer produces valid 16-bit PCM RIFF WAVE audio across sound types", () => {
    const { generateProceduralWavBuffer } = require("../dist/assets/assetStudioLogic");
    for (const [prompt, cat] of [["rain ambience", "sfx"], ["door creak", "sfx"], ["boss synthwave", "music"], ["robot voice", "voice"]]) {
        const buf = generateProceduralWavBuffer(prompt, cat);
        assert.equal(buf.toString("ascii", 0, 4), "RIFF");
        assert.equal(buf.toString("ascii", 8, 12), "WAVE");
        assert.equal(buf.readUInt16LE(20), 1);
        assert.equal(buf.readUInt16LE(22), 1);
        assert.equal(buf.readUInt32LE(24), 22050);
        assert.ok(buf.length > 20000);
    }
});

test("saveAudioEntry persists a playable WAV file into Assets/Audio/ and discoverAudio guarantees free CC0 audio", async () => {
    const { saveAudioEntry, getAudioCacheIndex } = require("../dist/assets/assetCache");
    const { discoverAudio } = require("../dist/assets/assetDiscovery");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cm-audio-"));
    const saved = await saveAudioEntry(tmp, {
        title: "Door Creak Synth",
        category: "sfx",
        format: "WAV",
        downloadUrl: "/api/audio/synthesize?prompt=door+creak&category=sfx",
    });
    assert.equal(saved.ok, true);
    assert.ok(saved.relativePath.startsWith("Assets/Audio/"));
    assert.ok(fs.existsSync(saved.targetPath));
    assert.equal(fs.readFileSync(saved.targetPath).toString("ascii", 0, 4), "RIFF");
    assert.equal(Object.keys(getAudioCacheIndex(tmp)).length, 1);
    fs.rmSync(tmp, { recursive: true, force: true });

    const fallbackDisc = await discoverAudio({ query: "nonexistent_xyzzy_sound_999", limit: 6 });
    assert.ok(fallbackDisc.results.length >= 1);
    assert.ok(fallbackDisc.results.some((r) => r.audio.licenseConfidence === "LICENSE_CONFIRMED" && r.audio.downloadUrl));
    assert.ok(fallbackDisc.audioLinks.perchanceVoiceUrl.includes("perchance.org/ai-voice-generator"));
});

test("normalizeAndExpandAudioQuery corrects vocal typos, detects female/male voice intent, and builds voice audition lineup", () => {
    const { VOICE_STYLES, AUDIO_GENERATION_SITES, normalizeAndExpandAudioQuery } = require("../dist/assets/assetStudioLogic");
    const { buildVoiceAuditionCards } = require("../dist/assets/audioVoiceService");

    assert.ok(VOICE_STYLES.length >= 9);
    assert.ok(AUDIO_GENERATION_SITES.some((s) => s.id === "multi-voice"));

    const expanded = normalizeAndExpandAudioQuery("a girl sreamming dramatic cry");
    assert.equal(expanded.category, "voice");
    assert.equal(expanded.genderHint, "female");
    assert.ok(expanded.normalizedQuery.includes("screaming"));
    assert.ok(expanded.searchQueries.some((q) => /woman scream|female scream|anime girl voice/i.test(q)));

    const cards = buildVoiceAuditionCards({ query: "anime heroine battle voice", speakText: "Watch out!", styleId: "auto", limit: 6 });
    assert.ok(cards.length >= 5);
    assert.ok(cards.every((c) => c.audio.category === "voice" && c.audio.downloadUrl.startsWith("/api/audio/tts?")));
    assert.ok(new Set(cards.map((c) => c.audio.styleId)).size >= 5);
});

test("isNonsenseArchiveTitle rejects ancient tomb murals and archaeological noise unless requested", () => {
    const { isNonsenseArchiveTitle } = require("../dist/assets/assetStudioLogic");
    assert.equal(isNonsenseArchiveTitle("Yanju's tomb, naked girl and monkey in orchard", "naked girl"), true);
    assert.equal(isNonsenseArchiveTitle("Roman fresco from Pompeii 2nd century A.D.", "cyberpunk girl"), true);
    assert.equal(isNonsenseArchiveTitle("Obsidian Knight Character Portrait", "knight"), false);
    assert.equal(isNonsenseArchiveTitle("Yanju's tomb mural", "ancient tomb mural"), false);
});

test("hasAdultIntent, buildBooruTagCandidates, and safe=off Google URLs honor allowAdult", () => {
    const { hasAdultIntent, buildBooruTagCandidates, buildGoogleAssetQueries, buildAudioGoogleQueries } = require("../dist/assets/assetStudioLogic");
    assert.equal(hasAdultIntent("naked girl"), true);
    assert.equal(hasAdultIntent("girl moaning voice"), true);
    assert.equal(hasAdultIntent("stone wall texture"), false);

    const sfwTags = buildBooruTagCandidates("naked girl", false);
    assert.ok(sfwTags.some((t) => t.includes("rating:general")));
    assert.ok(!sfwTags.some((t) => /\bnude\b/.test(t)));

    const nsfwTags = buildBooruTagCandidates("naked girl", true);
    assert.ok(nsfwTags.some((t) => t.includes("nude") && t.includes("1girl")));

    const adultImgLinks = buildGoogleAssetQueries("anime girl", "character", true);
    assert.ok(adultImgLinks.googleImagesUrl.includes("safe=off"));
    assert.ok(adultImgLinks.googleCuratedUrl.includes("civitai.com"));

    const adultAudioLinks = buildAudioGoogleQueries("female moan", true);
    assert.ok(adultAudioLinks.googleMultiSiteUrl.includes("safe=off"));
    assert.ok(adultAudioLinks.googleMultiSiteUrl.includes("soundgasm.net"));
});

test("parseBingImageAsyncHtml and parseFreesoundSearchHtml extract clean results", () => {
    const { parseBingImageAsyncHtml, parseFreesoundSearchHtml } = require("../dist/assets/assetStudioLogic");
    const bingHtml = `<a class="iusc" m="{&quot;murl&quot;:&quot;https://example.com/knight.png&quot;,&quot;turl&quot;:&quot;https://ts1.mm.bing.net/th?id=123&quot;,&quot;purl&quot;:&quot;https://example.com/page&quot;,&quot;desc&quot;:&quot;Cyberpunk Knight Concept&quot;}"></a>`;
    const imgs = parseBingImageAsyncHtml(bingHtml, "cyberpunk knight", false, 5);
    assert.equal(imgs.length, 1);
    assert.equal(imgs[0].imageUrl, "https://example.com/knight.png");
    assert.equal(imgs[0].title, "Cyberpunk Knight Concept");

    const fsHtml = `<div class="bw-player" data-sound-id="467293" data-username="XfiXy8" data-mp3="https://cdn.freesound.org/previews/467/467293_9895957-lq.mp3" data-title="Female Scream 2.wav" data-duration="4.0"></div>`;
    const sounds = parseFreesoundSearchHtml(fsHtml, "female scream", 5);
    assert.equal(sounds.length, 1);
    assert.equal(sounds[0].title, "Female Scream 2.wav");
    assert.equal(sounds[0].format, "MP3");
    assert.ok(sounds[0].sourceUrl.includes("freesound.org/people/XfiXy8/sounds/467293"));
});

test("parseDuckDuckGoImagesJson filters watermarked stock farms and extracts clean image results", () => {
    const { parseDuckDuckGoImagesJson } = require("../dist/assets/assetStudioLogic");
    const sample = {
        results: [
            { title: "iStock Watermark Knight", image: "https://media.istockphoto.com/knight.jpg", thumbnail: "https://t.com/1.jpg", url: "https://istockphoto.com/1", width: 800, height: 600 },
            { title: "Cyberpunk Knight Concept Art", image: "https://art.example.com/cyberpunk_knight.jpg", thumbnail: "https://t.com/2.jpg", url: "https://art.example.com/post/2", width: 1024, height: 768 },
            { title: "Yanju's tomb mural", image: "https://museum.example.com/tomb.jpg", thumbnail: "https://t.com/3.jpg", url: "https://museum.example.com/3", width: 600, height: 600 },
            { title: "Tiny thumb", image: "https://example.com/tiny.jpg", thumbnail: "https://t.com/4.jpg", url: "https://example.com/4", width: 64, height: 64 },
        ],
    };
    const parsed = parseDuckDuckGoImagesJson(sample, "cyberpunk knight", false, 8);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, "Cyberpunk Knight Concept Art");
    assert.equal(parsed[0].imageUrl, "https://art.example.com/cyberpunk_knight.jpg");
});

test("buildYandereTagCandidates uses indexed Yande.re tags without 1girl/sexy", () => {
    const { buildYandereTagCandidates } = require("../dist/assets/assetStudioLogic");
    const nsfw = buildYandereTagCandidates("naked sexy girl", true);
    assert.ok(nsfw.includes("nude"));
    assert.ok(!nsfw.includes("1girl"));
    assert.ok(!nsfw.includes("sexy"));

    const sfwKnight = buildYandereTagCandidates("cyberpunk knight", false);
    assert.ok(sfwKnight.some((t) => t.includes("cyberpunk") || t.includes("armor")));
});

test("normalizeAndExpandAudioQuery treats fucking sound as non-verbal adult audio without spoken TTS cards", () => {
    const { normalizeAndExpandAudioQuery, hasAdultIntent } = require("../dist/assets/assetStudioLogic");
    assert.equal(hasAdultIntent("fucking sound"), true);
    const fx = normalizeAndExpandAudioQuery("fucking sound");
    assert.equal(fx.wantsSpokenVoice, false);
    assert.ok(fx.searchQueries.some((q) => /moan|orgasm/i.test(q)));

    const spoken = normalizeAndExpandAudioQuery("anime girl voice", "auto", "Watch out!");
    assert.equal(spoken.wantsSpokenVoice, true);
});

test("synthesizeVoiceClip produces real Edge Neural TTS or WAV speech buffer without failing", async () => {
    const { synthesizeVoiceClip } = require("../dist/assets/audioVoiceService");
    const clip = await synthesizeVoiceClip({ text: "Hello warrior", styleId: "female-expressive" });
    assert.ok(Buffer.isBuffer(clip.buffer));
    assert.ok(clip.buffer.length > 2000);
    assert.ok(["audio/mpeg", "audio/wav"].includes(clip.mimeType));
});

test("normalizeCivitaiPreviewUrl downsizes original=true images and E621/TBIB tag builders filter human vs adult accurately", () => {
    const { normalizeCivitaiPreviewUrl, buildE621TagCandidates, buildTbibTagCandidates } = require("../dist/assets/assetStudioLogic");
    assert.equal(
        normalizeCivitaiPreviewUrl("https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/abc/original=true/123.jpeg"),
        "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/abc/width=512/123.jpeg"
    );

    const e6Human = buildE621TagCandidates("naked girl", true);
    assert.ok(e6Human[0].includes("female") && e6Human[0].includes("nude") && e6Human[0].includes("human"));

    const e6Sfw = buildE621TagCandidates("cyberpunk knight", false);
    assert.ok(e6Sfw[0].includes("rating:s") && e6Sfw[0].includes("cyberpunk"));

    const tbibNsfw = buildTbibTagCandidates("naked anime girl", true);
    assert.ok(tbibNsfw[0].includes("nude") && tbibNsfw[0].includes("1girl"));
});

test("parseMixkitAudioHtml, parseOpenGameArtAudioHtml, and parseOpenGameArtImageHtml extract clean entries", () => {
    const { parseMixkitAudioHtml, parseOpenGameArtAudioHtml, parseOpenGameArtImageHtml } = require("../dist/assets/assetStudioLogic");
    const mkHtml = `<div class="item-grid-card" data-audio-player-preview-url-value="https://assets.mixkit.co/active_storage/sfx/391/391-preview.mp3"><div></div><h2 class="item-grid-card__title"> Falling male scream </h2></div>`;
    const mk = parseMixkitAudioHtml(mkHtml, "scream", 5);
    assert.equal(mk.length, 1);
    assert.equal(mk[0].title, "Falling male scream");
    assert.equal(mk[0].format, "MP3");

    const ogaAudioHtml = `<div class="views-row"><span class="art-preview-title"><a href="/content/girly-scream">Girly Scream</a></span><div class="play-button" data-ogg-url="https://opengameart.org/sites/default/files/wscream.ogg" data-mp3-url="https://opengameart.org/sites/default/files/wscream.mp3"></div></div>`;
    const oa = parseOpenGameArtAudioHtml(ogaAudioHtml, "scream", 5);
    assert.equal(oa.length, 1);
    assert.equal(oa[0].title, "Girly Scream");
    assert.ok(oa[0].sourceUrl.includes("opengameart.org/content/girly-scream"));

    const ogaImgHtml = `<div class="views-row"><span class="art-preview-title"><a href="/content/knight-sprite">Knight sprite</a></span><img src="https://opengameart.org/sites/default/files/knight.png"></div>`;
    const oi = parseOpenGameArtImageHtml(ogaImgHtml, "knight", 5);
    assert.equal(oi.length, 1);
    assert.equal(oi[0].imageUrl, "https://opengameart.org/sites/default/files/knight.png");
});

test("parseDuckDuckGoImagesJson rejects tabloid celebrity and stock roundup spam", () => {
    const { parseDuckDuckGoImagesJson } = require("../dist/assets/assetStudioLogic");
    const sample = {
        results: [
            { title: "324 Hot Girls Sexy Stock Photos - Royalty-Free", image: "https://blog.example.com/stock.jpg", thumbnail: "https://t.com/1.jpg", url: "https://blog.example.com/1", width: 800, height: 600 },
            { title: "Cyberpunk Neon Valkyrie Illustration", image: "https://art.example.com/valkyrie.jpg", thumbnail: "https://t.com/2.jpg", url: "https://art.example.com/2", width: 900, height: 1200 },
        ],
    };
    const out = parseDuckDuckGoImagesJson(sample, "cyberpunk valkyrie", false, 6);
    assert.equal(out.length, 1);
    assert.equal(out[0].title, "Cyberpunk Neon Valkyrie Illustration");
});






