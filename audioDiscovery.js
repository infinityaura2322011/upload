"use strict";
/**
 * Audio Discovery Engine — searches legitimate audio sources, classifies,
 * downloads, and integrates sound effects and music into the project.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyAudioCategory = classifyAudioCategory;
exports.downloadAudio = downloadAudio;
exports.getAudioCacheIndex = getAudioCacheIndex;
exports.discoverAudio = discoverAudio;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const https = __importStar(require("node:https"));
const http = __importStar(require("node:http"));
const crypto = __importStar(require("node:crypto"));
const node_url_1 = require("node:url");
// ── Category classifier ───────────────────────────────────────────────────────
const CATEGORY_PATTERNS = [
    ["FOOTSTEP", /footstep|step|walk|run|stomp/i],
    ["DOOR", /door|gate|creak|hinge|knock/i],
    ["GUNSHOT", /gun|shot|fire|bullet|pistol|rifle|bang/i],
    ["MONSTER", /monster|creature|growl|roar|beast|demon/i],
    ["WIND", /wind|breeze|gust|howl/i],
    ["RAIN", /rain|drizzle|downpour/i],
    ["THUNDER", /thunder|lightning|rumble/i],
    ["UI", /\bui\b|interface|notification|alert|ping/i],
    ["BUTTON", /button|click|select|confirm/i],
    ["IMPACT", /impact|hit|punch|crash|smash|thud/i],
    ["AMBIENCE", /ambience|ambient|atmosphere|background|nature|forest|city/i],
    ["HORROR", /horror|scary|creepy|eerie|suspense/i],
    ["MUSIC", /music|melody|soundtrack|bgm|loop|theme|song/i],
    ["VOICE", /voice|speech|dialogue|narration|vocal/i],
];
function classifyAudioCategory(title) {
    for (const [cat, pattern] of CATEGORY_PATTERNS) {
        if (pattern.test(title))
            return cat;
    }
    return "OTHER";
}
// ── HTTP helpers ──────────────────────────────────────────────────────────────
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const parsed = new node_url_1.URL(url);
        const lib = parsed.protocol === "https:" ? https : http;
        lib.get(url, { headers: { "User-Agent": "CodingMonster/1.0 (audio-discovery)" } }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
                if ((res.statusCode ?? 0) >= 400)
                    return reject(new Error(`HTTP ${res.statusCode}`));
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    reject(new Error("Invalid JSON"));
                }
            });
        }).on("error", reject);
    });
}
function downloadBuffer(url, redirects = 0) {
    if (redirects > 5)
        return Promise.reject(new Error("Too many redirects"));
    return new Promise((resolve, reject) => {
        const parsed = new node_url_1.URL(url);
        const lib = parsed.protocol === "https:" ? https : http;
        lib.get(url, { headers: { "User-Agent": "CodingMonster/1.0 (audio-cache)" } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return downloadBuffer(res.headers.location, redirects + 1).then(resolve).catch(reject);
            }
            if ((res.statusCode ?? 0) >= 400)
                return reject(new Error(`HTTP ${res.statusCode}`));
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks)));
        }).on("error", reject);
    });
}
// ── OpenGameArt audio provider ────────────────────────────────────────────────
class OpenGameArtAudioProvider {
    id = "opengameart-audio";
    name = "OpenGameArt.org (Audio)";
    isAvailable() { return true; }
    async search(query, limit = 5) {
        const url = `https://opengameart.org/api/search?q=${encodeURIComponent(query)}&rows=${limit}&wt=json&fq=type:audio`;
        const body = await fetchJson(url);
        const docs = body?.response?.docs ?? [];
        return docs.map((doc) => {
            const rawLic = String(doc.field_art_licenses ?? "CC0-1.0");
            const spdx = rawLic.includes("CC0") ? "CC0-1.0" : rawLic.includes("CC-BY") ? "CC-BY-4.0" : rawLic;
            const isCC0 = spdx.includes("CC0");
            const audio = {
                id: String(doc.nid),
                title: String(doc.title ?? query),
                sourceUrl: `https://opengameart.org/node/${doc.nid}`,
                downloadUrl: String(doc.field_art_files ?? `https://opengameart.org/node/${doc.nid}`),
                creator: String(doc.name ?? "Unknown"),
                license: spdx,
                licenseUrl: `https://opengameart.org/node/${doc.nid}`,
                licenseConfidence: isCC0 ? "LICENSE_CONFIRMED" : "LICENSE_PARTIAL",
                commercialUse: true,
                attributionRequired: !isCC0,
                category: classifyAudioCategory(String(doc.title ?? query)),
                format: "ogg",
                sourceProvider: this.id,
            };
            return { audio, score: isCC0 ? 85 : 65, provider: this.id };
        });
    }
}
// ── Freesound public search (no key — metadata only) ─────────────────────────
class FreesoundProvider {
    id = "freesound";
    name = "Freesound.org";
    isAvailable() { return true; }
    async search(query, limit = 5) {
        const params = new URLSearchParams({
            query, format: "json",
            fields: "id,name,url,license,username,duration,type,samplerate,channels,filesize",
            page_size: String(limit),
        });
        const body = await fetchJson(`https://freesound.org/apiv2/search/text/?${params}`);
        const results = body?.results ?? [];
        return results.map((r) => {
            const rawLic = String(r.license ?? "Unknown");
            const isCC0 = /cc0/i.test(rawLic);
            const isCCBY = /cc.*by/i.test(rawLic);
            const isNC = /nc/i.test(rawLic);
            const confidence = isCC0 ? "LICENSE_CONFIRMED" : isCCBY ? "LICENSE_PARTIAL" : "LICENSE_UNKNOWN";
            const audio = {
                id: String(r.id),
                title: String(r.name ?? query),
                sourceUrl: String(r.url ?? ""),
                creator: String(r.username ?? "Unknown"),
                license: rawLic,
                licenseConfidence: confidence,
                commercialUse: !isNC,
                attributionRequired: isCCBY && !isCC0,
                licenseWarning: isNC ? "Non-commercial only" : confidence === "LICENSE_UNKNOWN" ? "Verify license before use" : undefined,
                category: classifyAudioCategory(String(r.name ?? query)),
                durationSec: r.duration ?? undefined,
                format: String(r.type ?? "").toLowerCase() || undefined,
                sampleRate: r.samplerate ?? undefined,
                channels: r.channels ?? undefined,
                fileSize: r.filesize ?? undefined,
                sourceProvider: this.id,
            };
            return { audio, score: confidence === "LICENSE_CONFIRMED" ? 80 : confidence === "LICENSE_PARTIAL" ? 60 : 30, provider: this.id };
        });
    }
}
// ── Audio cache ───────────────────────────────────────────────────────────────
const AUDIO_CACHE_DIR = ".asset_cache/audio";
function audioCacheDir(root) { return path.join(root, AUDIO_CACHE_DIR); }
function audioIndexPath(root) { return path.join(audioCacheDir(root), "index.json"); }
function ensureAudioDirs(root) {
    for (const d of [
        audioCacheDir(root),
        path.join(root, "Assets/Audio/SFX"),
        path.join(root, "Assets/Audio/Music"),
        path.join(root, "Assets/Audio/Ambience"),
        path.join(root, "Assets/Audio/Voice"),
    ]) {
        if (!fs.existsSync(d))
            fs.mkdirSync(d, { recursive: true });
    }
}
function loadAudioIndex(root) {
    const p = audioIndexPath(root);
    if (!fs.existsSync(p))
        return {};
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
    catch {
        return {};
    }
}
function saveAudioIndex(root, index) {
    ensureAudioDirs(root);
    fs.writeFileSync(audioIndexPath(root), JSON.stringify(index, null, 2), "utf-8");
}
function categoryToAudioDir(cat) {
    if (cat === "MUSIC")
        return "Assets/Audio/Music";
    if (cat === "VOICE")
        return "Assets/Audio/Voice";
    if (cat === "AMBIENCE")
        return "Assets/Audio/Ambience";
    return "Assets/Audio/SFX";
}
async function downloadAudio(root, audio) {
    if (!audio.downloadUrl)
        throw new Error("No downloadUrl on audio metadata");
    const index = loadAudioIndex(root);
    const byUrl = Object.values(index).find((e) => e.metadata.downloadUrl === audio.downloadUrl);
    if (byUrl && fs.existsSync(byUrl.cachedPath)) {
        return { targetPath: byUrl.cachedPath, checksum: byUrl.checksum, fromCache: true, sizeBytes: fs.statSync(byUrl.cachedPath).size };
    }
    const buffer = await downloadBuffer(audio.downloadUrl);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    if (index[checksum] && fs.existsSync(index[checksum].cachedPath)) {
        return { targetPath: index[checksum].cachedPath, checksum, fromCache: true, sizeBytes: buffer.length };
    }
    ensureAudioDirs(root);
    const ext = path.extname(audio.downloadUrl.split("?")[0]) || "." + (audio.format ?? "ogg");
    const safe = (audio.title ?? "audio").replace(/[^a-zA-Z0-9_\-. ]/g, "_").replace(/\s+/g, "_").slice(0, 60);
    const dir = path.join(root, categoryToAudioDir(audio.category));
    const target = path.join(dir, safe + ext);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, buffer);
    const entry = {
        checksum,
        cachedPath: target,
        fetchedAt: Date.now(),
        metadata: { ...audio, checksum, fetchedAt: Date.now(), projectPath: target },
    };
    index[checksum] = entry;
    saveAudioIndex(root, index);
    return { targetPath: target, checksum, fromCache: false, sizeBytes: buffer.length };
}
function getAudioCacheIndex(root) {
    return loadAudioIndex(root);
}
const PROVIDERS = [new OpenGameArtAudioProvider(), new FreesoundProvider()];
async function discoverAudio(query, limit = 5, adultMode = false) {
    const warnings = [];
    const usedProviders = [];
    const tasks = PROVIDERS.map(async (p) => {
        usedProviders.push(p.id);
        try {
            return await p.search(query, limit);
        }
        catch (e) {
            warnings.push(`${p.name}: ${e.message}`);
            return [];
        }
    });
    const all = (await Promise.all(tasks)).flat().sort((a, b) => b.score - a.score);
    for (const r of all) {
        if (r.audio.licenseConfidence === "LICENSE_UNKNOWN") {
            warnings.push(`"${r.audio.title}" (${r.provider}): License unknown — verify before use`);
        }
    }
    if (adultMode)
        warnings.push("Adult mode enabled: use only appropriately licensed mature-project audio and record attribution.");
    return { results: all.slice(0, limit * PROVIDERS.length), warnings, providers: usedProviders };
}
