"use strict";
/**
 * Web Search Layer — provider-agnostic interface + adapters.
 * Add providers by implementing WebSearchProvider and registering with
 * SearchProviderRegistry. The orchestrator never calls providers directly.
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
exports.defaultSearchRegistry = exports.SearchProviderRegistry = exports.DuckDuckGoSearchProvider = exports.GoogleCSESearchProvider = void 0;
exports.classifySearchIntent = classifySearchIntent;
exports.webSearch = webSearch;
const https = __importStar(require("node:https"));
const http = __importStar(require("node:http"));
const node_url_1 = require("node:url");
// ── Intent classifier ─────────────────────────────────────────────────────────
const INTENT_PATTERNS = [
    ["MUSIC", /\b(music|soundtrack|bgm|background music|loop|ambient track)\b/i],
    ["SOUND_EFFECT", /\b(sound effect|sfx|footstep|gunshot|explosion|door|impact)\b/i],
    ["TEXTURE", /\b(texture|tileset|seamless|normal map|roughness|pbr)\b/i],
    ["3D_MODEL", /\b(3d model|mesh|fbx|obj|gltf|glb|rigged|low poly)\b/i],
    ["CHARACTER", /\b(character|sprite|hero|npc|player|avatar|humanoid)\b/i],
    ["ENVIRONMENT", /\b(environment|background|scene|landscape|level|terrain|sky)\b/i],
    ["UI", /\b(ui|hud|button|menu|panel|widget|icon set|interface)\b/i],
    ["ICON", /\b(\bicon\b|glyph|symbol|badge)\b/i],
    ["GAME_ASSET", /\b(game asset|sprite sheet|asset pack|pixel art|game art)\b/i],
    ["CODE", /\b(code|implementation|snippet|library|npm|github|stackoverflow)\b/i],
    ["DOCUMENTATION", /\b(docs|documentation|api reference|manual|guide)\b/i],
    ["TUTORIAL", /\b(tutorial|learn|course|step by step|walkthrough)\b/i],
    ["TECHNICAL_RESEARCH", /\b(research|paper|algorithm|architecture|design pattern)\b/i],
];
function classifySearchIntent(query) {
    for (const [intent, pattern] of INTENT_PATTERNS) {
        if (pattern.test(query))
            return intent;
    }
    return "REFERENCE";
}
// ── HTTP helper ───────────────────────────────────────────────────────────────
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const parsed = new node_url_1.URL(url);
        const lib = parsed.protocol === "https:" ? https : http;
        lib.get(url, { headers: { "User-Agent": "CodingMonster/1.0 (web-search)" } }, (res) => {
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
// ── Google CSE adapter ────────────────────────────────────────────────────────
class GoogleCSESearchProvider {
    id = "google-cse";
    name = "Google Custom Search";
    isAvailable() {
        return Boolean(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX);
    }
    async search(query, opts = {}) {
        if (!this.isAvailable())
            throw new Error("GOOGLE_CSE_KEY and GOOGLE_CSE_CX required");
        const limit = Math.min(opts.limit ?? 5, 10);
        const safe = opts.safeSearch === false ? "off" : "active";
        const params = new URLSearchParams({
            key: process.env.GOOGLE_CSE_KEY, cx: process.env.GOOGLE_CSE_CX,
            q: query, num: String(limit), safe,
            ...(opts.fileType ? { fileType: opts.fileType } : {}),
            ...(opts.site ? { siteSearch: opts.site } : {}),
        });
        const body = await fetchJson(`https://www.googleapis.com/customsearch/v1?${params}`);
        return (body?.items ?? []).map((item) => ({
            title: String(item.title ?? ""),
            url: String(item.link ?? ""),
            snippet: String(item.snippet ?? ""),
            imageUrl: item.pagemap?.cse_image?.[0]?.src,
            provider: this.id,
            intent: opts.intent ?? classifySearchIntent(query),
        }));
    }
}
exports.GoogleCSESearchProvider = GoogleCSESearchProvider;
// ── DuckDuckGo Instant Answer adapter (no key required) ──────────────────────
class DuckDuckGoSearchProvider {
    id = "duckduckgo";
    name = "DuckDuckGo Instant Answer";
    isAvailable() { return true; }
    async search(query, opts = {}) {
        const params = new URLSearchParams({ q: query, format: "json", no_html: "1", skip_disambig: "1" });
        const body = await fetchJson(`https://api.duckduckgo.com/?${params}`);
        const results = [];
        const intent = opts.intent ?? classifySearchIntent(query);
        if (body?.AbstractURL) {
            results.push({ title: body.Heading ?? query, url: body.AbstractURL, snippet: body.AbstractText ?? "", provider: this.id, intent });
        }
        for (const r of (body?.RelatedTopics ?? []).slice(0, (opts.limit ?? 5) - 1)) {
            if (r.FirstURL) {
                results.push({ title: r.Text?.split(" - ")[0] ?? "", url: r.FirstURL, snippet: r.Text ?? "", provider: this.id, intent });
            }
        }
        return results;
    }
}
exports.DuckDuckGoSearchProvider = DuckDuckGoSearchProvider;
// ── Registry ──────────────────────────────────────────────────────────────────
class SearchProviderRegistry {
    providers = new Map();
    register(p) { this.providers.set(p.id, p); }
    get(id) { return this.providers.get(id); }
    list() { return [...this.providers.values()]; }
    available() { return this.list().filter((p) => p.isAvailable()); }
}
exports.SearchProviderRegistry = SearchProviderRegistry;
exports.defaultSearchRegistry = new SearchProviderRegistry();
exports.defaultSearchRegistry.register(new GoogleCSESearchProvider());
exports.defaultSearchRegistry.register(new DuckDuckGoSearchProvider());
async function webSearch(opts) {
    const intent = opts.intent ?? classifySearchIntent(opts.query);
    const warnings = [];
    const usedProviders = [];
    const providers = opts.providerIds
        ? opts.providerIds.map((id) => exports.defaultSearchRegistry.get(id)).filter(Boolean)
        : exports.defaultSearchRegistry.available();
    if (providers.length === 0) {
        return { results: [], intent, providers: [], warnings: ["No search providers available"] };
    }
    const tasks = providers.map(async (p) => {
        usedProviders.push(p.id);
        try {
            return await p.search(opts.query, { limit: opts.limit ?? 5, safeSearch: opts.safeSearch, intent });
        }
        catch (e) {
            warnings.push(`${p.name}: ${e.message}`);
            return [];
        }
    });
    const all = (await Promise.all(tasks)).flat().slice(0, (opts.limit ?? 5) * providers.length);
    return { results: all, intent, providers: usedProviders, warnings };
}
