"use strict";
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
exports.getAllEnvPaths = getAllEnvPaths;
exports.findDeviceEnvPath = findDeviceEnvPath;
exports.parseEnvFile = parseEnvFile;
exports.loadAllEnv = loadAllEnv;
exports.checkDeviceEnv = checkDeviceEnv;
exports.updateDeviceEnv = updateDeviceEnv;
exports.disableOrRemoveKeyFromEnv = disableOrRemoveKeyFromEnv;
exports.buildRegistryFromEnv = buildRegistryFromEnv;
exports.registerManualProvider = registerManualProvider;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const registry_1 = require("./registry");
const groq_1 = require("./groq");
const gemini_1 = require("./gemini");
const mistral_1 = require("./mistral");
const deepseek_1 = require("./deepseek");
const ollama_1 = require("./ollama");
const manual_1 = require("./manual");
/** Locates candidate .env files in the workspace and parent directories */
function getAllEnvPaths() {
    const candidates = [
        path.join(process.cwd(), ".env"),
        path.join(process.cwd(), "..", ".env"),
        "D:\\autonomus\\.env",
        "d:\\autonomus\\.env",
        path.join(__dirname, "..", "..", ".env"),
        path.join(__dirname, "..", "..", "..", ".env"),
        path.join(__dirname, "..", ".env"),
    ];
    const seen = new Set();
    const paths = [];
    for (const c of candidates) {
        try {
            const p = path.resolve(c);
            if (fs.existsSync(p) && !seen.has(p)) {
                seen.add(p);
                paths.push(p);
            }
        }
        catch { }
    }
    return paths;
}
/** Locates primary .env file */
function findDeviceEnvPath() {
    const all = getAllEnvPaths();
    return all[0] ?? null;
}
/** Parses key-value pairs from .env on disk */
function parseEnvFile(filePath) {
    const result = {};
    if (!fs.existsSync(filePath))
        return result;
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            result[key] = val;
        }
    }
    return result;
}
/** Merges environment variables from all discovered .env files */
function loadAllEnv() {
    const merged = {};
    const paths = getAllEnvPaths();
    // Reverse so primary paths take precedence
    for (const p of [...paths].reverse()) {
        Object.assign(merged, parseEnvFile(p));
    }
    return merged;
}
function envValue(env, ...names) {
    const wanted = new Set(names.map((name) => name.toUpperCase()));
    for (const [key, value] of Object.entries(env)) {
        if (wanted.has(key.toUpperCase()) && value?.trim())
            return value.trim();
    }
    return "";
}
/** Checks whether .env exists on device and contains non-empty API keys */
function checkDeviceEnv() {
    const envPath = findDeviceEnvPath();
    const merged = loadAllEnv();
    const keys = {
        gemini: Boolean(envValue(merged, "GEMINI_API_KEY")),
        groq: Boolean(envValue(merged, "GROQ_API_KEY")),
        deepseek: Boolean(envValue(merged, "DEEPSEEK_API_KEY")),
        mistral: Boolean(envValue(merged, "MISTRAL_API_KEY")),
        openrouter: Boolean(envValue(merged, "OPENROUTER_API_KEY")),
        cerebras: Boolean(envValue(merged, "CEREBRAS_API_KEY")),
        sambanova: Boolean(envValue(merged, "SAMBANOVA_API_KEY")),
        together: Boolean(envValue(merged, "TOGETHER_API_KEY", "TOGATHER_API_KEY")),
        google_cse: Boolean(envValue(merged, "GOOGLE_CSE_KEY") && envValue(merged, "GOOGLE_CSE_CX")),
    };
    const hasApiKeys = Object.values(keys).some(Boolean);
    return {
        envFileFound: Boolean(envPath),
        envPath,
        hasApiKeys,
        keys,
    };
}
/** Writes or updates keys in .env on disk without erasing other configuration */
function updateDeviceEnv(updates) {
    let envPath = findDeviceEnvPath();
    if (!envPath) {
        envPath = path.join(process.cwd(), ".env");
    }
    let lines = [];
    if (fs.existsSync(envPath)) {
        lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
    }
    const keysToSet = {};
    for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined)
            keysToSet[k] = v;
    }
    const updatedLines = [];
    const handledKeys = new Set();
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            updatedLines.push(line);
            continue;
        }
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            if (key in keysToSet) {
                updatedLines.push(`${key}=${keysToSet[key]}`);
                handledKeys.add(key);
                process.env[key] = keysToSet[key];
                continue;
            }
        }
        updatedLines.push(line);
    }
    // Append new keys that were not present in file
    for (const [k, v] of Object.entries(keysToSet)) {
        if (!handledKeys.has(k)) {
            updatedLines.push(`${k}=${v}`);
            process.env[k] = v;
        }
    }
    fs.writeFileSync(envPath, updatedLines.join("\n"), "utf-8");
    return envPath;
}
/**
 * Removes or comments out an invalid/exhausted API key from all .env files on disk
 * and deletes it from process.env.
 */
function disableOrRemoveKeyFromEnv(keyName, reason) {
    delete process.env[keyName];
    for (const envPath of getAllEnvPaths()) {
        if (!fs.existsSync(envPath))
            continue;
        try {
            const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
            let modified = false;
            const newLines = lines.map((line) => {
                const trimmed = line.trim();
                const eqIdx = trimmed.indexOf("=");
                const lineKey = eqIdx >= 0 ? trimmed.slice(0, eqIdx).trim() : "";
                if (lineKey.toUpperCase() === keyName.toUpperCase()) {
                    modified = true;
                    return `# REMOVED_KEY (${reason}): ${line}`;
                }
                return line;
            });
            if (modified) {
                fs.writeFileSync(envPath, newLines.join("\n"), "utf-8");
                console.log(`[bootstrap] Removed non-working key ${keyName} in ${envPath} (${reason})`);
            }
        }
        catch { }
    }
}
/**
 * Tests an AIProvider candidate to determine if its API key is valid and working.
 * If invalid (401, 403, 404, or 402 Insufficient Balance), returns { ok: false, error }.
 * If valid, returns { ok: true, models }.
 */
async function probeCandidate(provider, providerName) {
    try {
        const models = await provider.listModels();
        if (!models || models.length === 0) {
            return { ok: false, modelCount: 0, error: "No models returned" };
        }
        // Provider-specific probe for quota/balance (e.g. DeepSeek returns 200 on /models even with 0 balance)
        if (provider.id === "deepseek") {
            const ok = await provider.testConnection();
            if (!ok) {
                return { ok: false, modelCount: models.length, error: "Insufficient balance (HTTP 402) or unready" };
            }
        }
        return { ok: true, modelCount: models.length };
    }
    catch (err) {
        const msg = String(err?.message ?? err);
        return { ok: false, modelCount: 0, error: msg };
    }
}
/**
 * Loads models from .env, tests all API keys, registers ONLY working providers,
 * and automatically disables non-working keys.
 * Ollama is always auto-detected locally.
 */
async function buildRegistryFromEnv(env) {
    const registry = new registry_1.ProviderRegistry();
    const mergedEnv = { ...loadAllEnv(), ...env };
    // ── 1. Auto-detect Ollama (local, no API key needed) ───────────────────────
    const ollamaUrl = envValue(mergedEnv, "OLLAMA_BASE_URL") || "http://127.0.0.1:11434";
    try {
        const ollama = new ollama_1.OllamaProvider(ollamaUrl);
        const connected = await ollama.testConnection();
        if (connected) {
            const models = await ollama.listModels();
            if (models.length > 0) {
                registry.register(ollama);
                console.log(`[bootstrap] ✓ Ollama (local) — ${models.length} model(s) auto-detected (${models.map(m => m.modelId).join(", ")})`);
            }
        }
        else {
            console.log("[bootstrap] Ollama not detected (not running on local ports)");
        }
    }
    catch (err) {
        console.log(`[bootstrap] Ollama local probe: ${String(err?.message ?? err).slice(0, 80)}`);
    }
    const candidates = [];
    // Built-in standard providers
    const groqKey = envValue(mergedEnv, "GROQ_API_KEY");
    const geminiKey = envValue(mergedEnv, "GEMINI_API_KEY");
    const mistralKey = envValue(mergedEnv, "MISTRAL_API_KEY");
    const deepseekKey = envValue(mergedEnv, "DEEPSEEK_API_KEY");
    if (groqKey)
        candidates.push({ provider: new groq_1.GroqProvider(groqKey), name: "Groq", envKey: "GROQ_API_KEY", keyVal: groqKey });
    if (geminiKey)
        candidates.push({ provider: new gemini_1.GeminiProvider(geminiKey), name: "Gemini", envKey: "GEMINI_API_KEY", keyVal: geminiKey });
    if (mistralKey)
        candidates.push({ provider: new mistral_1.MistralProvider(mistralKey), name: "Mistral", envKey: "MISTRAL_API_KEY", keyVal: mistralKey });
    if (deepseekKey)
        candidates.push({ provider: new deepseek_1.DeepSeekProvider(deepseekKey), name: "DeepSeek", envKey: "DEEPSEEK_API_KEY", keyVal: deepseekKey });
    // OpenRouter
    const openrouterKey = envValue(mergedEnv, "OPENROUTER_API_KEY");
    if (openrouterKey) {
        candidates.push({
            provider: new manual_1.ManualProvider({ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: openrouterKey }),
            name: "OpenRouter",
            envKey: "OPENROUTER_API_KEY",
            keyVal: openrouterKey,
        });
    }
    // Cerebras (OpenAI-compatible)
    const cerebrasKey = envValue(mergedEnv, "CEREBRAS_API_KEY");
    if (cerebrasKey) {
        candidates.push({
            provider: new manual_1.ManualProvider({ id: "cerebras", name: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", apiKey: cerebrasKey }),
            name: "Cerebras",
            envKey: "CEREBRAS_API_KEY",
            keyVal: cerebrasKey,
        });
    }
    // SambaNova (OpenAI-compatible)
    const sambanovaKey = envValue(mergedEnv, "SAMBANOVA_API_KEY");
    if (sambanovaKey) {
        candidates.push({
            provider: new manual_1.ManualProvider({ id: "sambanova", name: "SambaNova", baseUrl: "https://api.sambanova.ai/v1", apiKey: sambanovaKey }),
            name: "SambaNova",
            envKey: "SAMBANOVA_API_KEY",
            keyVal: sambanovaKey,
        });
    }
    // Together AI (OpenAI-compatible, handles TOGATHER typo as well)
    const togetherKey = envValue(mergedEnv, "TOGETHER_API_KEY", "TOGATHER_API_KEY");
    const togetherEnvKey = envValue(mergedEnv, "TOGETHER_API_KEY") ? "TOGETHER_API_KEY" : "TOGATHER_API_KEY";
    if (togetherKey) {
        candidates.push({
            provider: new manual_1.ManualProvider({ id: "together", name: "Together AI", baseUrl: "https://api.together.xyz/v1", apiKey: togetherKey }),
            name: "Together AI",
            envKey: togetherEnvKey,
            keyVal: togetherKey,
        });
    }
    // OpenAI (standard)
    const openaiKey = envValue(mergedEnv, "OPENAI_API_KEY");
    if (openaiKey) {
        candidates.push({
            provider: new manual_1.ManualProvider({ id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: openaiKey }),
            name: "OpenAI",
            envKey: "OPENAI_API_KEY",
            keyVal: openaiKey,
        });
    }
    // Custom endpoints: <PREFIX>_BASE_URL (+ optional <PREFIX>_API_KEY)
    const knownPrefixes = new Set(["GROQ", "GEMINI", "MISTRAL", "DEEPSEEK", "OLLAMA", "OPENROUTER", "CEREBRAS", "SAMBANOVA", "TOGETHER", "TOGATHER", "OPENAI"]);
    for (const [key, val] of Object.entries(mergedEnv)) {
        const m = key.match(/^([A-Z0-9_]+)_BASE_URL$/);
        if (!m)
            continue;
        const prefix = m[1];
        if (knownPrefixes.has(prefix))
            continue;
        const baseUrl = val?.trim();
        if (!baseUrl)
            continue;
        const apiKey = (mergedEnv[`${prefix}_API_KEY`] || "").trim();
        const name = prefix.charAt(0) + prefix.slice(1).toLowerCase().replace(/_/g, " ");
        const id = prefix.toLowerCase().replace(/_/g, "-");
        candidates.push({
            provider: new manual_1.ManualProvider({ id, name, baseUrl, apiKey }),
            name,
            envKey: `${prefix}_API_KEY`,
            keyVal: apiKey,
        });
    }
    // ── 3. Test each candidate: choose working ones, remove/disable broken ones ──
    console.log(`[bootstrap] Testing ${candidates.length} API key(s) across discovered providers…`);
    await Promise.all(candidates.map(async ({ provider, name, envKey, keyVal }) => {
        const result = await probeCandidate(provider, name);
        if (result.ok) {
            registry.register(provider);
            console.log(`[bootstrap] ✓ ${name} — key verified working (${result.modelCount} model(s) available)`);
        }
        else {
            const errDesc = result.error || "Unknown error";
            console.log(`[bootstrap] ✗ ${name} — key not working (${errDesc}). Removing from active pool.`);
            // Remove or comment out non-working key so it won't break subsequent tasks
            if (envKey && keyVal) {
                disableOrRemoveKeyFromEnv(envKey, errDesc);
            }
        }
    }));
    console.log(`[bootstrap] Active providers: ${registry.list().map((p) => p.name).join(", ") || "none"}`);
    return registry;
}
function registerManualProvider(registry, cfg) {
    registry.register(new manual_1.ManualProvider(cfg));
}
