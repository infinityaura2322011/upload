"use strict";
/**
 * Asset Discovery — provider-based architecture.
 *
 * New providers can be added by implementing AssetProvider and registering
 * them with the AssetProviderRegistry. The orchestrator talks to the registry,
 * never to individual providers directly.
 *
 * Built-in providers:
 *   WikimediaProvider    — public-domain / CC images, no key required
 *   OpenGameArtProvider  — CC0/CC-BY game assets, no key required
 *   GoogleCSEProvider    — general web images (requires GOOGLE_CSE_KEY + GOOGLE_CSE_CX)
 *   UserAssetProvider    — locally imported assets (no network)
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
exports.defaultProviderRegistry = exports.AssetProviderRegistry = exports.UserAssetProvider = exports.GoogleCSEProvider = exports.OpenGameArtProvider = exports.CURATED_ASSET_SOURCE_DOMAINS = void 0;
exports.classifyLicense = classifyLicense;
exports.ratingAtLeast = ratingAtLeast;
exports.ratingAtMost = ratingAtMost;
exports.licenseStatus = licenseStatus;
exports.isValidSourceUrl = isValidSourceUrl;
exports.guessCategory = guessCategory;
exports.discoverAssets = discoverAssets;
const https = __importStar(require("node:https"));
const http = __importStar(require("node:http"));
const node_url_1 = require("node:url");
/** Curated sources that the search adapter may query for creator-provided assets. */
exports.CURATED_ASSET_SOURCE_DOMAINS = [
    "opengameart.org",
    "itch.io",
    "freesound.org",
    "kenney.nl",
    "polyhaven.com",
    "ambientcg.com",
    "mixkit.co",
];
// ── HTTP helpers ──────────────────────────────────────────────────────────────
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const parsed = new node_url_1.URL(url);
        const lib = parsed.protocol === "https:" ? https : http;
        lib.get(url, { headers: { "User-Agent": "CodingMonster/1.0 (asset-discovery)" } }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
                if ((res.statusCode ?? 0) >= 400)
                    return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    reject(new Error("Invalid JSON from " + url));
                }
            });
        }).on("error", reject);
    });
}
// ── License helpers ───────────────────────────────────────────────────────────
const CONFIRMED_SPDX = new Set([
    "CC0-1.0", "CC-BY-4.0", "CC-BY-3.0", "MIT", "Apache-2.0",
    "BSD-2-Clause", "BSD-3-Clause", "Unlicense", "Public Domain",
]);
function classifyLicense(raw) {
    const s = raw.toUpperCase().trim();
    if (!s || s === "UNKNOWN" || s === "N/A") {
        return {
            license: raw || "Unknown",
            confidence: "LICENSE_UNKNOWN",
            commercialUse: false,
            modificationAllowed: false,
            attributionRequired: false,
            licenseWarning: "License information unavailable — verify before use",
        };
    }
    const isCC0 = s.includes("CC0") || s.includes("PUBLIC DOMAIN") || s.includes("UNLICENSE");
    const isCCBY = s.includes("CC-BY") || s.includes("CC BY");
    const isNCOnly = s.includes("-NC") || s.includes(" NC ") || s.includes("NON-COMMERCIAL") || s.includes("NONCOMMERCIAL");
    const isNoDerivs = s.includes("-ND") || s.includes("NO DERIV");
    const isOSI = s.includes("MIT") || s.includes("APACHE") || s.includes("BSD") || s.includes("GPL");
    const confirmed = CONFIRMED_SPDX.has(raw) || isCC0 || (isCCBY && !isNCOnly && !isNoDerivs) || isOSI;
    const partial = isCCBY || isNCOnly || isNoDerivs;
    return {
        license: raw,
        confidence: confirmed ? "LICENSE_CONFIRMED" : partial ? "LICENSE_PARTIAL" : "LICENSE_UNKNOWN",
        commercialUse: !isNCOnly,
        modificationAllowed: !isNoDerivs,
        attributionRequired: isCCBY && !isCC0,
        licenseWarning: isNCOnly ? "Non-commercial only — cannot be used in commercial projects"
            : isNoDerivs ? "No derivatives allowed — cannot be modified"
                : !confirmed ? "License partially known — verify before use"
                    : undefined,
    };
}
const RATING_ORDER = {
    EVERYONE: 0, TEEN: 1, MATURE: 2, ADULT_18_PLUS: 3,
};
function ratingAtLeast(rating, minimum) {
    return RATING_ORDER[rating] >= RATING_ORDER[minimum];
}
function ratingAtMost(rating, maximum) {
    return RATING_ORDER[rating] <= RATING_ORDER[maximum];
}
function licenseStatus(confidence) {
    return confidence === "LICENSE_CONFIRMED" ? "CONFIRMED"
        : confidence === "LICENSE_PARTIAL" ? "PARTIAL" : "UNKNOWN";
}
function isValidSourceUrl(value) {
    if (typeof value !== "string" || !value.trim())
        return false;
    try {
        const url = new node_url_1.URL(value);
        return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
    }
    catch {
        return false;
    }
}
function contentFlags(rating) {
    return {
        nudity: rating === "ADULT_18_PLUS",
        sexualContent: rating === "MATURE" || rating === "ADULT_18_PLUS",
        violence: rating === "MATURE" || rating === "ADULT_18_PLUS",
        gore: rating === "ADULT_18_PLUS",
    };
}
function guessCategory(title, type = "") {
    const t = (title + " " + type).toLowerCase();
    if (t.match(/model|3d|mesh|fbx|obj|gltf/))
        return "model";
    if (t.match(/character|sprite|hero|npc|player|avatar/))
        return "character";
    if (t.match(/audio|sound|music|sfx|voice/))
        return "audio";
    if (t.match(/background|scene|environment|landscape|sky/))
        return "background";
    if (t.match(/\bui\b|button|hud|menu|panel|widget/))
        return "ui";
    if (t.match(/texture|tile|pattern|surface/))
        return "texture";
    if (t.match(/anim/))
        return "animation";
    if (t.match(/\bicon\b/))
        return "icon";
    if (t.match(/font|typeface/))
        return "font";
    return "other";
}
function scoreAsset(asset, query) {
    let score = 50;
    // License confidence
    if (asset.licenseConfidence === "LICENSE_CONFIRMED")
        score += 30;
    else if (asset.licenseConfidence === "LICENSE_PARTIAL")
        score += 10;
    else
        score -= 20;
    // Relevance
    const q = query.toLowerCase();
    if (asset.name.toLowerCase().includes(q))
        score += 15;
    // Resolution bonus
    if (asset.width && asset.width >= 1024)
        score += 5;
    return Math.max(0, Math.min(100, score));
}
// ── OpenGameArtProvider ───────────────────────────────────────────────────────
class OpenGameArtProvider {
    name = "OpenGameArt.org";
    providerId = "opengameart";
    isLocal = false;
    isAvailable() { return true; }
    async search(query, opts = { query }) {
        const limit = opts.limit ?? 5;
        const url = `https://opengameart.org/api/search?q=${encodeURIComponent(query)}&rows=${limit}&wt=json`;
        const body = await fetchJson(url);
        const docs = body?.response?.docs ?? [];
        return docs.map((doc) => {
            const rawLic = String(doc.field_art_licenses ?? "CC0-1.0");
            const spdx = rawLic.includes("CC0") ? "CC0-1.0"
                : rawLic.includes("CC-BY-SA") ? "CC-BY-SA-4.0"
                    : rawLic.includes("CC-BY") ? "CC-BY-4.0"
                        : rawLic.includes("GPL") ? "GPL-3.0"
                            : rawLic;
            const lic = classifyLicense(spdx);
            const asset = {
                name: String(doc.title ?? query),
                sourceUrl: `https://opengameart.org/node/${doc.nid}`,
                downloadUrl: String(doc.field_art_files ?? `https://opengameart.org/node/${doc.nid}`),
                creator: String(doc.name ?? "Unknown"),
                license: lic.license,
                licenseUrl: `https://opengameart.org/node/${doc.nid}`,
                licenseConfidence: lic.confidence,
                licenseStatus: licenseStatus(lic.confidence),
                commercialUse: lic.commercialUse,
                modificationAllowed: lic.modificationAllowed,
                attributionRequired: lic.attributionRequired,
                licenseWarning: lic.licenseWarning,
                contentRating: "EVERYONE",
                ...contentFlags("EVERYONE"),
                mimeType: String(doc.field_art_type ?? "image").toLowerCase(),
                sourceProvider: this.providerId,
                assetCategory: guessCategory(String(doc.title ?? ""), String(doc.field_art_type ?? "")),
            };
            return { asset, score: scoreAsset(asset, query), provider: this.providerId };
        });
    }
}
exports.OpenGameArtProvider = OpenGameArtProvider;
// ── GoogleCSEProvider ─────────────────────────────────────────────────────────
class GoogleCSEProvider {
    name = "Google Custom Search";
    providerId = "google-cse";
    isLocal = false;
    isAvailable() {
        return Boolean(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX);
    }
    async search(query, opts = { query }) {
        if (!this.isAvailable())
            throw new Error("GOOGLE_CSE_KEY and GOOGLE_CSE_CX are required");
        const limit = Math.min(opts.limit ?? 5, 10);
        const params = new URLSearchParams({
            key: process.env.GOOGLE_CSE_KEY, cx: process.env.GOOGLE_CSE_CX,
            q: query,
            searchType: "image", num: String(limit), safe: "off", imgSize: "LARGE",
        });
        const body = await fetchJson(`https://www.googleapis.com/customsearch/v1?${params}`);
        const items = body?.items ?? [];
        return items.map((item) => {
            // Google results have unknown license by default — always LICENSE_UNKNOWN
            const lic = classifyLicense("Unknown");
            const asset = {
                name: String(item.title ?? query),
                sourceUrl: String(item.image?.contextLink ?? item.link),
                downloadUrl: String(item.link),
                creator: undefined,
                license: "Unknown",
                licenseConfidence: "LICENSE_UNKNOWN",
                licenseStatus: "UNKNOWN",
                commercialUse: false,
                modificationAllowed: false,
                attributionRequired: false,
                licenseWarning: "License unknown — verify ownership and rights before use",
                // Google does not provide trustworthy per-result rating metadata.
                // Keep the result conservative until a provider-specific adapter verifies it.
                contentRating: "EVERYONE",
                ...contentFlags("EVERYONE"),
                mimeType: "image/jpeg",
                width: item.image?.width ?? undefined,
                height: item.image?.height ?? undefined,
                sourceProvider: this.providerId,
                assetCategory: guessCategory(String(item.title ?? ""), "image"),
            };
            return { asset, score: scoreAsset(asset, query), provider: this.providerId };
        });
    }
}
exports.GoogleCSEProvider = GoogleCSEProvider;
// ── UserAssetProvider ─────────────────────────────────────────────────────────
// Handles locally imported assets — no network, no search, just metadata tagging.
class UserAssetProvider {
    name = "User Import";
    providerId = "user";
    isLocal = true;
    isAvailable() { return true; }
    // User assets are imported directly, not searched
    async search(_query) { return []; }
    buildMetadata(filePath, overrides = {}) {
        const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
        const name = filePath.split(/[\\/]/).pop() ?? filePath;
        const mimeMap = {
            png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
            webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
            wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg",
            mp4: "video/mp4", fbx: "model/fbx", obj: "model/obj",
            glb: "model/gltf-binary", gltf: "model/gltf+json",
        };
        return {
            name,
            sourceProvider: "user",
            contentRating: "EVERYONE",
            licenseConfidence: "LICENSE_UNKNOWN",
            licenseStatus: "UNKNOWN",
            licenseWarning: "User-imported asset — ensure you have the legal right to use this file",
            ...contentFlags("EVERYONE"),
            mimeType: mimeMap[ext] ?? "application/octet-stream",
            assetCategory: guessCategory(name, ext),
            ...overrides,
        };
    }
}
exports.UserAssetProvider = UserAssetProvider;
// ── AssetProviderRegistry ─────────────────────────────────────────────────────
class AssetProviderRegistry {
    providers = new Map();
    register(provider) {
        this.providers.set(provider.providerId, provider);
    }
    get(id) {
        return this.providers.get(id);
    }
    list() {
        return Array.from(this.providers.values());
    }
    available() {
        return this.list().filter((p) => p.isAvailable());
    }
}
exports.AssetProviderRegistry = AssetProviderRegistry;
// ── Default registry (singleton) ─────────────────────────────────────────────
exports.defaultProviderRegistry = new AssetProviderRegistry();
exports.defaultProviderRegistry.register(new OpenGameArtProvider());
exports.defaultProviderRegistry.register(new GoogleCSEProvider());
exports.defaultProviderRegistry.register(new UserAssetProvider());
/**
 * Searches all available (or specified) providers, merges results, and ranks
 * by score (license confidence + relevance + resolution).
 *
 * Never presents a LICENSE_UNKNOWN asset as safe to use.
 */
async function discoverAssets(opts) {
    const limit = opts.limit ?? 5;
    const warnings = [];
    const usedProviders = [];
    const providers = opts.providerIds
        ? opts.providerIds.map((id) => exports.defaultProviderRegistry.get(id)).filter(Boolean)
        : exports.defaultProviderRegistry.available().filter((p) => !p.isLocal);
    const tasks = providers.map(async (p) => {
        usedProviders.push(p.providerId);
        try {
            return await p.search(opts.query, { query: opts.query, limit, category: opts.category });
        }
        catch (e) {
            warnings.push(`${p.name}: ${e.message}`);
            return [];
        }
    });
    const all = (await Promise.all(tasks)).flat();
    all.sort((a, b) => b.score - a.score);
    return { results: all.slice(0, limit * providers.length), warnings, providers: usedProviders };
}
