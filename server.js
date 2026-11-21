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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const node_crypto_1 = require("node:crypto");
const bootstrap_1 = require("./providers/bootstrap");
// Ensure process.env is fully populated from all discovered .env locations
for (const [k, v] of Object.entries((0, bootstrap_1.loadAllEnv)())) {
    if (!process.env[k] && v)
        process.env[k] = v;
}
const client_1 = require("./db/client");
const orchestrator_1 = require("./orchestrator/orchestrator");
const router_1 = require("./orchestrator/router");
const types_1 = require("./providers/types");
const manual_1 = require("./providers/manual");
const fs_1 = require("./tools/fs");
const git_1 = require("./tools/git");
const terminal_1 = require("./tools/terminal");
const permissions_1 = require("./tools/permissions");
const quotaEngine_1 = require("./usage/quotaEngine");
const telemetry_1 = require("./usage/telemetry");
const capabilities_1 = require("./models/capabilities");
const positions_1 = require("./models/positions");
const workflow_1 = require("./orchestrator/workflow");
const projectScanner_1 = require("./project/projectScanner");
const projectMemory_1 = require("./project/projectMemory");
const assetDiscovery_1 = require("./assets/assetDiscovery");
const assetCache_1 = require("./assets/assetCache");
const projectValidator_1 = require("./assets/projectValidator");
const webSearch_1 = require("./search/webSearch");
const audioDiscovery_1 = require("./audio/audioDiscovery");
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT ?? 4319);
const allowedOrigins = new Set([
    `http://127.0.0.1:${PORT}`,
    `http://localhost:${PORT}`,
    "null",
]);
app.use(express_1.default.json({ limit: "15mb" }));
app.use((req, res, next) => {
    const origin = req.get("Origin");
    if (origin && !allowedOrigins.has(origin)) {
        return res.status(403).json({ error: "Cross-origin access is not allowed." });
    }
    if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS")
        return res.sendStatus(204);
    next();
});
app.use(express_1.default.static(path.join(__dirname, "..", "public")));
let registry;
const DEFAULT_PROJECT_ID = "default";
const DEFAULT_WORKSPACE = path.resolve(__dirname, "..", "..", "workspace");
const TULSHI_PROJECT_ROOT = path.join(DEFAULT_WORKSPACE, "TulshiProjects");
let activeWorkspace = path.resolve(process.env.WORKSPACE_ROOT ?? DEFAULT_WORKSPACE);
let activeRouting = { ...router_1.DEFAULT_ROUTING };
let activeProjectSettings = { ...types_1.DEFAULT_PROJECT_SETTINGS };
let activeGeneration = { adultMode: false };
let taskRepo;
let database;
let usageRepo;
let settingsRepo;
let telemetryRepo;
let quotaRepo;
async function initDb() {
    registry = await (0, bootstrap_1.buildRegistryFromEnv)(process.env);
    database = await (0, client_1.openDb)(process.env.DB_PATH ?? "coding-monster.db");
    fs.mkdirSync(activeWorkspace, { recursive: true });
    taskRepo = new client_1.TaskRepository(database);
    usageRepo = new client_1.UsageRepository(database);
    settingsRepo = new client_1.SettingsRepository(database);
    telemetryRepo = new client_1.TelemetryRepository(database);
    quotaRepo = new client_1.QuotaRepository(database);
    (0, telemetry_1.initTelemetryService)(telemetryRepo, quotaRepo);
    (0, client_1.ensureProject)(database, DEFAULT_PROJECT_ID, path.basename(activeWorkspace) || "workspace", activeWorkspace);
    const saved = settingsRepo.get("routing", null);
    if (saved)
        activeRouting = { ...router_1.DEFAULT_ROUTING, ...saved };
    const savedProjectSettings = settingsRepo.get("projectSettings", null);
    if (savedProjectSettings)
        activeProjectSettings = { ...types_1.DEFAULT_PROJECT_SETTINGS, ...savedProjectSettings };
    const savedCustom = settingsRepo.get("custom_providers", []);
    for (const cfg of savedCustom)
        (0, bootstrap_1.registerManualProvider)(registry, cfg);
}
// ── Device Environment ────────────────────────────────────────────────────────
app.get("/api/env/status", (_req, res) => {
    const status = (0, bootstrap_1.checkDeviceEnv)();
    res.json({ ...status, activeProviders: registry.list().map((p) => p.id) });
});
app.post("/api/settings/keys", async (req, res) => {
    const updates = {};
    if (typeof req.body.gemini === "string" && req.body.gemini.trim())
        updates["GEMINI_API_KEY"] = req.body.gemini.trim();
    if (typeof req.body.groq === "string" && req.body.groq.trim())
        updates["GROQ_API_KEY"] = req.body.groq.trim();
    if (typeof req.body.mistral === "string" && req.body.mistral.trim())
        updates["MISTRAL_API_KEY"] = req.body.mistral.trim();
    if (typeof req.body.deepseek === "string" && req.body.deepseek.trim())
        updates["DEEPSEEK_API_KEY"] = req.body.deepseek.trim();
    if (typeof req.body.openrouter === "string" && req.body.openrouter.trim())
        updates["OPENROUTER_API_KEY"] = req.body.openrouter.trim();
    if (typeof req.body.cerebras === "string" && req.body.cerebras.trim())
        updates["CEREBRAS_API_KEY"] = req.body.cerebras.trim();
    if (typeof req.body.sambanova === "string" && req.body.sambanova.trim())
        updates["SAMBANOVA_API_KEY"] = req.body.sambanova.trim();
    if (typeof req.body.together === "string" && req.body.together.trim())
        updates["TOGETHER_API_KEY"] = req.body.together.trim();
    if (typeof req.body.google_cse_key === "string" && req.body.google_cse_key.trim())
        updates["GOOGLE_CSE_KEY"] = req.body.google_cse_key.trim();
    if (typeof req.body.google_cse_cx === "string" && req.body.google_cse_cx.trim())
        updates["GOOGLE_CSE_CX"] = req.body.google_cse_cx.trim();
    if (Object.keys(updates).length === 0)
        return res.status(400).json({ error: "No API keys provided to update" });
    const envPath = (0, bootstrap_1.updateDeviceEnv)(updates);
    registry = await (0, bootstrap_1.buildRegistryFromEnv)(process.env);
    await registry.refreshAll();
    res.json({ ok: true, envPath, activeProviders: registry.list().map((p) => p.id), totalModels: registry.allCachedModels().length });
});
// ── Providers ────────────────────────────────────────────────────────────────
/** Cache refreshAll results for 60s so clicking Models/Providers doesn't hammer every provider API */
let _lastRefreshAt = 0;
let _lastRefreshResult = null;
async function cachedRefreshAll(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && _lastRefreshResult && (now - _lastRefreshAt) < 60_000) {
        return _lastRefreshResult;
    }
    _lastRefreshResult = await registry.refreshAll();
    _lastRefreshAt = Date.now();
    return _lastRefreshResult;
}
// Kick off a background refresh so first load is instant
let _bgRefreshDone = false;
function kickBackgroundRefresh() {
    if (_bgRefreshDone)
        return;
    _bgRefreshDone = true;
    cachedRefreshAll(true).then(() => {
        for (const p of registry.list()) {
            if (registry.isHealthy(p.id))
                quotaEngine_1.quotaEngine.markOnline(p.id);
            else
                quotaEngine_1.quotaEngine.markOffline(p.id);
        }
    }).catch(() => { });
}
app.get("/api/providers", async (req, res) => {
    const force = req.query.refresh === "1";
    // On first call return cached immediately and refresh in background
    if (!force && !_lastRefreshResult) {
        kickBackgroundRefresh();
        // Return stub list so UI shows providers immediately
        const stub = registry.list().map((p) => ({
            id: p.id, name: p.name, kind: p.kind, healthy: false, modelCount: 0,
        }));
        return res.json(stub);
    }
    const results = await cachedRefreshAll(force);
    for (const p of registry.list()) {
        if (registry.isHealthy(p.id))
            quotaEngine_1.quotaEngine.markOnline(p.id);
        else
            quotaEngine_1.quotaEngine.markOffline(p.id);
    }
    const summary = registry.list().map((p) => {
        const r = results.get(p.id);
        return {
            id: p.id,
            name: p.name,
            kind: p.kind,
            healthy: registry.isHealthy(p.id),
            modelCount: Array.isArray(r) ? r.length : 0,
            error: !Array.isArray(r) ? r?.message : undefined,
        };
    });
    res.json(summary);
});
app.get("/api/providers/:id/models", (req, res) => {
    res.json(registry.getCachedModels(req.params.id));
});
app.get("/api/models", (_req, res) => {
    // Attach capability badges to each model for the UI
    const models = registry.allCachedModels().map((m) => ({
        ...m,
        capabilityBadges: (0, capabilities_1.getActiveBadges)(m.capabilities),
    }));
    res.json(models);
});
app.post("/api/providers/manual", async (req, res) => {
    const body = req.body;
    if (!body.baseUrl?.trim())
        return res.status(400).json({ error: "baseUrl is required" });
    const rawUrl = body.baseUrl.trim();
    let slug = body.id?.trim();
    if (!slug) {
        try {
            const parsed = new URL(rawUrl);
            slug = parsed.hostname.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
        }
        catch {
            slug = "custom-api-" + Date.now().toString().slice(-4);
        }
    }
    const name = body.name?.trim() || (slug.charAt(0).toUpperCase() + slug.slice(1));
    const cfg = { id: slug, name, baseUrl: rawUrl, apiKey: body.apiKey?.trim() || "" };
    const provider = new manual_1.ManualProvider(cfg);
    try {
        const models = await provider.listModels();
        if (models.length === 0)
            return res.status(400).json({ error: "Connected to endpoint but no models were detected." });
        registry.register(provider);
        await registry.refreshAll();
        if (settingsRepo) {
            const existing = settingsRepo.get("custom_providers", []);
            const filtered = existing.filter((p) => p.id !== cfg.id);
            filtered.push(cfg);
            settingsRepo.set("custom_providers", filtered);
        }
        res.status(201).json({ ok: true, registered: cfg.id, name: cfg.name, modelCount: models.length, models: models.map((m) => m.modelId) });
    }
    catch (err) {
        res.status(400).json({ error: err?.message || String(err) });
    }
});
app.post("/api/providers/:id/test", async (req, res) => {
    const provider = registry.get(req.params.id);
    if (!provider)
        return res.status(404).json({ error: "Provider not found" });
    const ok = await provider.testConnection();
    res.json({ healthy: ok });
});
// ── Tasks ────────────────────────────────────────────────────────────────────
function detectAdultMode(prompt, explicit) {
    if (typeof explicit === "boolean")
        return explicit;
    const requestSignal = /\b(18\+|adult|mature|nsfw|porn|sexual|erotic|xxx)\b/i.test(prompt);
    if (requestSignal)
        return true;
    const memorySignal = projectMemory_1.defaultProjectMemory.getEntriesByCategory(DEFAULT_PROJECT_ID, "content-rating")
        .some((entry) => /ADULT_18_PLUS|MATURE|adult|18\+/i.test(`${entry.title} ${entry.content}`));
    if (memorySignal)
        return true;
    const ratingFile = path.join(activeWorkspace, "ProjectData", "content-rating.json");
    const existingMatureDirectory = fs.existsSync(path.join(activeWorkspace, "Assets", "MatureContent"));
    try {
        return existingMatureDirectory || /ADULT_18_PLUS|MATURE/i.test(fs.readFileSync(ratingFile, "utf8"));
    }
    catch {
        return existingMatureDirectory;
    }
}
function generationPolicy(adultMode) {
    return {
        contentRating: adultMode ? "ADULT_18_PLUS" : "EVERYONE",
        minContentRating: "EVERYONE",
        maxContentRating: adultMode ? "ADULT_18_PLUS" : "EVERYONE",
        allowMatureAssets: adultMode,
        strictLicenseMode: !adultMode,
    };
}
app.post("/api/tasks", (req, res) => {
    const { prompt, projectId, adultMode: requestedAdultMode } = req.body;
    if (!prompt)
        return res.status(400).json({ error: "prompt is required" });
    const adultMode = detectAdultMode(prompt, requestedAdultMode);
    const taskId = (0, node_crypto_1.randomUUID)();
    taskRepo.create(taskId, projectId ?? DEFAULT_PROJECT_ID, prompt, adultMode);
    activeGeneration = { adultMode };
    if (adultMode) {
        projectMemory_1.defaultProjectMemory.addEntry(DEFAULT_PROJECT_ID, "content-rating", "Generation mode", "ADULT_18_PLUS");
        projectMemory_1.defaultProjectMemory.addEntry(DEFAULT_PROJECT_ID, "game-design", "Adult creative direction", "Preserve requested mechanics while allowing mature themes, characters, dialogue, assets, and audio.");
        projectMemory_1.defaultProjectMemory.addEntry(DEFAULT_PROJECT_ID, "asset", "Adult asset policy", "Use appropriately licensed mature-project assets and place them under Assets/MatureContent when appropriate.");
        projectMemory_1.defaultProjectMemory.addEntry(DEFAULT_PROJECT_ID, "license", "Adult asset licensing", "Never claim unknown licenses; retain source, creator, license URL, and checksum metadata.");
        projectMemory_1.defaultProjectMemory.addEntry(DEFAULT_PROJECT_ID, "audio", "Adult audio policy", "Use legitimate, license-aware audio providers and retain attribution metadata.");
    }
    res.status(201).json({ taskId, adultMode, contentRating: adultMode ? "ADULT_18_PLUS" : "EVERYONE" });
});
app.get("/api/tulshi/status", (_req, res) => {
    res.json({
        service: "coding-monster",
        tulshiProjectHandoff: true,
        projectRoot: TULSHI_PROJECT_ROOT,
    });
});
app.post("/api/tulshi/projects", (req, res) => {
    const rawName = req.body?.name;
    const rawPrompt = req.body?.prompt;
    if (typeof rawName !== "string" || rawName.trim().length < 2 || rawName.length > 80) {
        return res.status(400).json({ error: "Project name must contain 2-80 characters." });
    }
    if (typeof rawPrompt !== "string" || !rawPrompt.trim() || rawPrompt.length > 3_000) {
        return res.status(400).json({ error: "Project request must contain 1-3,000 characters." });
    }
    const slug = rawName
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
        .replace(/-+$/g, "");
    if (!slug || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug)) {
        return res.status(400).json({ error: "Project name cannot be used as a safe folder name." });
    }
    const projectPath = path.resolve(TULSHI_PROJECT_ROOT, slug);
    const relativePath = path.relative(TULSHI_PROJECT_ROOT, projectPath);
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return res.status(400).json({ error: "Project path escaped its approved output folder." });
    }
    try {
        fs.mkdirSync(TULSHI_PROJECT_ROOT, { recursive: true });
        fs.mkdirSync(projectPath, { recursive: false });
    }
    catch (error) {
        if (error.code === "EEXIST") {
            return res.status(409).json({ error: "A project with that name already exists; choose a different name." });
        }
        return res.status(500).json({ error: `Could not create project folder: ${String(error)}` });
    }
    try {
        const workspaceRealPath = fs.realpathSync(DEFAULT_WORKSPACE);
        const projectRootRealPath = fs.realpathSync(TULSHI_PROJECT_ROOT);
        const projectRealPath = fs.realpathSync(projectPath);
        const rootRelativePath = path.relative(workspaceRealPath, projectRootRealPath);
        if (rootRelativePath.startsWith("..") || path.isAbsolute(rootRelativePath) || path.dirname(projectRealPath) !== projectRootRealPath) {
            fs.rmSync(projectPath, { recursive: true, force: true });
            return res.status(400).json({ error: "Project folder resolved outside the approved workspace." });
        }
    }
    catch (error) {
        fs.rmSync(projectPath, { recursive: true, force: true });
        return res.status(500).json({ error: `Could not verify project folder: ${String(error)}` });
    }
    const taskId = (0, node_crypto_1.randomUUID)();
    const projectPrompt = [
        rawPrompt.trim(),
        "",
        "[Project requirements]",
        "Create a complete, playable browser app/game in this new project folder. Include a README with controls and run instructions, and add focused tests where practical.",
        "For games that need artwork, create Assets/PerchancePrompts.md with one useful prompt per needed asset for the existing Perchance AI Image Maker in the app. Do not claim Perchance generated files that are not present, do not call an undocumented Perchance API, and keep the game runnable with original CSS/SVG placeholders until the user generates and imports art.",
        "Use only files inside this project folder. Do not modify the Coding Monster app or other workspaces.",
    ].join("\n");
    try {
        (0, client_1.ensureProject)(database, taskId, slug, projectPath);
        taskRepo.create(taskId, taskId, projectPrompt, false);
    }
    catch (error) {
        fs.rmSync(projectPath, { recursive: true, force: true });
        console.error("[tulshi-project] Could not register project task:", error);
        return res.status(500).json({ error: "Could not register the project task in Coding Monster." });
    }
    void startTaskExecution(taskId).catch((error) => {
        console.error("[tulshi-project] Task start failed:", error);
    });
    res.status(202).json({
        taskId,
        projectName: slug,
        projectPath,
        status: taskRepo.get(taskId)?.state ?? "IDLE",
    });
});
app.get("/api/tasks", (_req, res) => {
    res.json(taskRepo.listAll().map((task) => ({
        ...task,
        root_path: task.root_path || activeWorkspace,
    })));
});
app.get("/api/tasks/:id", (req, res) => {
    const task = taskRepo.get(req.params.id);
    if (!task)
        return res.status(404).json({ error: "Task not found" });
    res.json({ ...task, root_path: task.root_path || activeWorkspace });
});
app.get("/api/tasks/:id/events", (req, res) => {
    res.json(taskRepo.getEvents(req.params.id));
});
app.delete("/api/tasks/:id", (req, res) => {
    taskRepo.delete(req.params.id);
    res.json({ ok: true, deleted: req.params.id });
});
app.delete("/api/tasks", (_req, res) => {
    taskRepo.deleteAll(DEFAULT_PROJECT_ID);
    res.json({ ok: true });
});
const runningTaskExecutions = new Map();
const taskEventSinks = new Map();
function publishTaskEvent(taskId, event) {
    for (const sink of taskEventSinks.get(taskId) ?? [])
        sink(event);
}
function startTaskExecution(taskId) {
    const active = runningTaskExecutions.get(taskId);
    if (active)
        return active;
    const task = taskRepo.get(taskId);
    if (!task)
        return Promise.reject(new Error("Task not found"));
    const execution = (async () => {
        try {
            await registry.refreshAll();
            const generation = { adultMode: Boolean(task.adult_mode) };
            activeGeneration = generation;
            const result = await (0, orchestrator_1.runTask)({
                taskId,
                prompt: task.prompt,
                workspaceRoot: task.root_path || activeWorkspace,
                registry,
                taskRepo,
                routing: activeRouting,
                autoMode: true,
                maxEngineeringIterations: Number(process.env.MAX_ENGINEERING_ITERATIONS ?? 3),
                onEvent: (event) => publishTaskEvent(taskId, event),
                requestApproval: async (_cmd, level) => level === "DANGEROUS" ? "deny" : "allow_once",
                generation,
            });
            publishTaskEvent(taskId, {
                stage: result.success ? "COMPLETED" : "FAILED",
                message: result.success ? "Task finished successfully" : "Task did not complete",
                at: Date.now(),
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            taskRepo.updateState(taskId, "FAILED");
            taskRepo.logEvent(taskId, "RUNNING", "FAILED", message);
            publishTaskEvent(taskId, { stage: "FAILED", message, at: Date.now() });
        }
        finally {
            runningTaskExecutions.delete(taskId);
        }
    })();
    runningTaskExecutions.set(taskId, execution);
    return execution;
}
app.get("/api/tasks/:id/stream", async (req, res) => {
    const task = taskRepo.get(req.params.id);
    if (!task)
        return res.status(404).end();
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (event) => {
        if (!res.destroyed)
            res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const state = task.state.toUpperCase();
    const terminalStates = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
    if (terminalStates.has(state) && !runningTaskExecutions.has(task.id)) {
        for (const event of taskRepo.getEvents(task.id)) {
            send({
                stage: event.to_state,
                message: event.note,
                agent: event.agent,
                at: event.at,
            });
        }
        send({
            stage: state,
            message: `Task ${state.toLowerCase()}`,
            at: task.completed_at ?? Date.now(),
        });
        return res.end();
    }
    const sinks = taskEventSinks.get(task.id) ?? new Set();
    sinks.add(send);
    taskEventSinks.set(task.id, sinks);
    const keepAlive = setInterval(() => {
        if (!res.destroyed)
            res.write(": ping\n\n");
    }, 15_000);
    res.on("close", () => {
        clearInterval(keepAlive);
        sinks.delete(send);
        if (sinks.size === 0)
            taskEventSinks.delete(task.id);
    });
    try {
        await startTaskExecution(task.id);
    }
    catch (error) {
        send({ stage: "FAILED", message: error instanceof Error ? error.message : String(error), at: Date.now() });
    }
    finally {
        clearInterval(keepAlive);
        sinks.delete(send);
        if (sinks.size === 0)
            taskEventSinks.delete(task.id);
        if (!res.destroyed)
            res.end();
    }
});
// ── Routing (Set Position) ────────────────────────────────────────────────────
app.get("/api/routing", (_req, res) => {
    const allRoles = Array.from(new Set([
        ...Object.keys(types_1.ROLE_DISPLAY),
        ...Object.keys(activeRouting),
    ]));
    const rows = allRoles.map((role) => {
        const candidates = activeRouting[role] ?? [];
        const first = candidates[0];
        const displayMap = types_1.ROLE_DISPLAY;
        return {
            role,
            display: displayMap[role] || (role.charAt(0).toUpperCase() + role.slice(1)),
            providerId: first?.providerId ?? "auto",
            modelId: first?.modelId ?? "auto",
        };
    });
    res.json(rows);
});
app.post("/api/routing", (req, res) => {
    const updates = req.body;
    if (!Array.isArray(updates))
        return res.status(400).json({ error: "Expected array of {role, providerId, modelId}" });
    for (const u of updates) {
        const role = u.role;
        if (u.providerId === "auto" || !u.providerId) {
            activeRouting[role] = [];
        }
        else {
            const candidate = { providerId: u.providerId, modelId: u.modelId || "auto" };
            activeRouting[role] = [candidate];
        }
    }
    if (settingsRepo)
        settingsRepo.set("routing", activeRouting);
    res.json({ ok: true, routing: activeRouting });
});
app.post("/api/routing/reset", (_req, res) => {
    activeRouting = JSON.parse(JSON.stringify(router_1.DEFAULT_ROUTING));
    if (settingsRepo)
        settingsRepo.set("routing", activeRouting);
    res.json({ ok: true, routing: activeRouting });
});
// ── Positions & Workflows ───────────────────────────────────────────────────
app.get("/api/positions", (_req, res) => {
    res.json(positions_1.BUILTIN_POSITIONS);
});
app.get("/api/workflows", (_req, res) => {
    res.json(workflow_1.BUILTIN_WORKFLOWS);
});
// ── Project Scanner & Memory ─────────────────────────────────────────────────
app.get("/api/project/profile", async (_req, res) => {
    const profile = await projectScanner_1.ProjectScanner.scan(activeWorkspace);
    res.json(profile);
});
app.get("/api/project/memory", (_req, res) => {
    res.json(projectMemory_1.defaultProjectMemory.getEntries(DEFAULT_PROJECT_ID));
});
app.post("/api/project/memory", (req, res) => {
    const { category, title, content } = req.body;
    if (!title || !content)
        return res.status(400).json({ error: "title and content are required" });
    const entry = projectMemory_1.defaultProjectMemory.addEntry(DEFAULT_PROJECT_ID, category || "architecture", title, content);
    res.status(201).json(entry);
});
// ── Workspace / Files ─────────────────────────────────────────────────────────
app.get("/api/workspace", (_req, res) => {
    res.json({ root: activeWorkspace, name: path.basename(activeWorkspace) || activeWorkspace });
});
app.post("/api/workspace", (req, res) => {
    const { root } = req.body;
    if (!root)
        return res.status(400).json({ error: "root is required" });
    if (!require("fs").existsSync(root))
        return res.status(400).json({ error: "Path does not exist" });
    activeWorkspace = root;
    taskRepo.updateProjectRoot(DEFAULT_PROJECT_ID, path.basename(root) || root, root);
    console.log(`Workspace switched to: ${activeWorkspace}`);
    res.json({ root: activeWorkspace, name: path.basename(activeWorkspace) || activeWorkspace });
});
app.get("/api/workspace/tree", async (_req, res) => {
    const ft = new fs_1.FileTools(activeWorkspace, () => { });
    const tree = await ft.buildFileTree();
    res.json({ root: activeWorkspace, tree });
});
app.get("/api/workspace/file", async (req, res) => {
    const filePath = req.query.path;
    if (!filePath)
        return res.status(400).json({ error: "path is required" });
    try {
        const ft = new fs_1.FileTools(activeWorkspace, () => { });
        const content = await ft.readFile(filePath);
        res.json({ path: filePath, content });
    }
    catch (err) {
        res.status(404).json({ error: String(err) });
    }
});
/** POST /api/workspace/run — run a shell command in the workspace, stream output via SSE */
app.post("/api/workspace/run", (req, res) => {
    const { command } = req.body;
    if (!command?.trim())
        return res.status(400).json({ error: "command is required" });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (type, data) => res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    const { spawn: spawnProc } = require("node:child_process");
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const shellArgs = isWin ? ["/c", command.trim()] : ["-c", command.trim()];
    const child = spawnProc(shell, shellArgs, {
        cwd: activeWorkspace,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d) => send("stdout", d.toString()));
    child.stderr?.on("data", (d) => send("stderr", d.toString()));
    child.on("close", (code) => {
        send("exit", String(code ?? 0));
        res.end();
    });
    child.on("error", (err) => {
        send("stderr", err.message);
        res.end();
    });
    req.on("close", () => { try {
        child.kill();
    }
    catch { } });
});
// ── Git ───────────────────────────────────────────────────────────────────────
app.get("/api/git/status", async (_req, res) => {
    const gate = new permissions_1.PermissionGate();
    const terminal = new terminal_1.TerminalTool(activeWorkspace, gate, () => { }, async () => "allow_once");
    const git = new git_1.GitTool(terminal);
    res.json(await git.status());
});
app.get("/api/git/diff", async (_req, res) => {
    const gate = new permissions_1.PermissionGate();
    const terminal = new terminal_1.TerminalTool(activeWorkspace, gate, () => { }, async () => "allow_once");
    const git = new git_1.GitTool(terminal);
    res.json({ diff: await git.diff() });
});
app.get("/api/git/log", async (_req, res) => {
    const gate = new permissions_1.PermissionGate();
    const terminal = new terminal_1.TerminalTool(activeWorkspace, gate, () => { }, async () => "allow_once");
    const git = new git_1.GitTool(terminal);
    res.json({ log: await git.log() });
});
// ── Usage / Telemetry / Quota ─────────────────────────────────────────────────
/** Legacy endpoint kept for backwards compat */
app.get("/api/usage", (_req, res) => {
    res.json({ today: usageRepo.today(), summary: usageRepo.summary() });
});
/** Global summary bar */
app.get("/api/usage/summary", (_req, res) => {
    const global = telemetryRepo.globalSummary();
    const today = telemetryRepo.todaySummary();
    const health = registry.getHealthSummary();
    res.json({
        global,
        today,
        providers: health.length,
        providersOnline: health.filter((h) => h.healthy).length,
    });
});
/** Per-model usage table */
app.get("/api/usage/models", (_req, res) => {
    const rows = telemetryRepo.modelSummary();
    const quotas = quotaRepo.latestByProvider();
    // Attach latest quota snapshot to each row
    const enriched = rows.map((row) => {
        const reqSnap = quotas.find((q) => q.provider === row.provider && q.metric === "requests_per_minute");
        const tokSnap = quotas.find((q) => q.provider === row.provider && q.metric === "tokens_per_minute");
        const caps = telemetry_1.PROVIDER_TELEMETRY_CAPS[row.provider];
        return {
            ...row,
            quotaRequests: reqSnap ?? null,
            quotaTokens: tokSnap ?? null,
            isLocal: caps?.isLocal ?? false,
        };
    });
    res.json(enriched);
});
/** Per-provider quota cards */
app.get("/api/usage/providers", (_req, res) => {
    const health = registry.getHealthSummary();
    const quotas = quotaRepo.latestByProvider();
    const now = Date.now();
    const cards = registry.list().map((p) => {
        const h = health.find((x) => x.providerId === p.id);
        const caps = telemetry_1.PROVIDER_TELEMETRY_CAPS[p.id] ?? { isLocal: false, hasExactQuota: false, hasTokenUsage: false, hasResetTime: false, quotaSource: "unknown", quotaNote: "" };
        const pQuotas = quotas.filter((q) => q.provider === p.id);
        const reqSnap = pQuotas.find((q) => q.metric === "requests_per_minute") ?? null;
        const tokSnap = pQuotas.find((q) => q.metric === "tokens_per_minute") ?? null;
        const rlSnap = pQuotas.find((q) => q.metric === "rate_limited") ?? null;
        const lastUpdated = pQuotas.length > 0 ? Math.max(...pQuotas.map((q) => q.timestamp)) : null;
        const isRateLimited = rlSnap && rlSnap.reset_at && rlSnap.reset_at > now;
        return {
            id: p.id,
            name: p.name,
            online: h?.healthy ?? false,
            isLocal: caps.isLocal,
            isRateLimited,
            rateLimitResetAt: isRateLimited ? rlSnap.reset_at : null,
            hasExactQuota: caps.hasExactQuota,
            hasTokenUsage: caps.hasTokenUsage,
            quotaNote: caps.quotaNote,
            quotaSource: caps.quotaSource,
            requests: reqSnap,
            tokens: tokSnap,
            lastUpdatedAt: lastUpdated,
            staleThresholdMs: 300_000, // 5 min
        };
    });
    res.json(cards);
});
/** Recent telemetry events for a provider */
app.get("/api/usage/history", (req, res) => {
    const provider = req.query.provider;
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    res.json(telemetryRepo.recentEvents(provider, limit));
});
/** SSE stream — pushes telemetry updates to Usage Center in real time */
app.get("/api/usage/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 20_000);
    const { getTelemetryService } = require("./usage/telemetry");
    const svc = getTelemetryService();
    const listener = (event) => send(event);
    svc.subscribe(listener);
    req.on("close", () => {
        clearInterval(keepAlive);
        svc.unsubscribe(listener);
    });
});
/** Force-refresh provider quota (only calls provider if it has a quota endpoint) */
app.post("/api/usage/refresh", async (_req, res) => {
    await registry.refreshAll();
    res.json({ ok: true, at: Date.now() });
});
// ── Project Settings (content rating etc.) ─────────────────────────────────────────
app.get("/api/project/settings", (_req, res) => {
    res.json(activeProjectSettings);
});
app.post("/api/project/settings", (req, res) => {
    const body = req.body;
    const allowed = [
        "contentRating", "minContentRating", "contentWarningText", "ageGateEnabled",
        "strictLicenseMode", "allowMatureAssets", "assetSearchEnabled", "automaticDownloads",
    ];
    for (const key of allowed) {
        if (key in body)
            activeProjectSettings[key] = body[key];
    }
    if (settingsRepo)
        settingsRepo.set("projectSettings", activeProjectSettings);
    res.json({ ok: true, settings: activeProjectSettings });
});
// ── Content Rating (dedicated endpoints per spec) ─────────────────────────────
app.get("/api/project/content-rating", (_req, res) => {
    res.json({
        contentRating: activeProjectSettings.contentRating,
        minContentRating: activeProjectSettings.minContentRating,
        ageGateEnabled: activeProjectSettings.ageGateEnabled,
        allowMatureAssets: activeProjectSettings.allowMatureAssets,
        strictLicenseMode: activeProjectSettings.strictLicenseMode,
        contentWarningText: activeProjectSettings.contentWarningText,
    });
});
app.put("/api/project/content-rating", (req, res) => {
    const { contentRating, minContentRating, ageGateEnabled, allowMatureAssets, strictLicenseMode, contentWarningText } = req.body;
    const VALID_RATINGS = ["EVERYONE", "TEEN", "MATURE", "ADULT_18_PLUS"];
    if (contentRating && !VALID_RATINGS.includes(contentRating)) {
        return res.status(400).json({ error: `Invalid contentRating. Must be one of: ${VALID_RATINGS.join(", ")}` });
    }
    if (minContentRating && !VALID_RATINGS.includes(minContentRating)) {
        return res.status(400).json({ error: `Invalid minContentRating. Must be one of: ${VALID_RATINGS.join(", ")}` });
    }
    if (contentRating)
        activeProjectSettings.contentRating = contentRating;
    if (minContentRating)
        activeProjectSettings.minContentRating = minContentRating;
    if (ageGateEnabled != null)
        activeProjectSettings.ageGateEnabled = Boolean(ageGateEnabled);
    if (allowMatureAssets != null)
        activeProjectSettings.allowMatureAssets = Boolean(allowMatureAssets);
    if (strictLicenseMode != null)
        activeProjectSettings.strictLicenseMode = Boolean(strictLicenseMode);
    if (contentWarningText != null)
        activeProjectSettings.contentWarningText = contentWarningText;
    if (settingsRepo)
        settingsRepo.set("projectSettings", activeProjectSettings);
    res.json({ ok: true, contentRating: activeProjectSettings.contentRating, settings: activeProjectSettings });
});
// ── Asset Discovery ───────────────────────────────────────────────────────────
/** List available asset providers */
app.get("/api/assets/providers", (_req, res) => {
    res.json(assetDiscovery_1.defaultProviderRegistry.list().map((p) => ({
        id: p.providerId,
        name: p.name,
        isLocal: p.isLocal,
        isAvailable: p.isAvailable(),
    })));
});
/**
 * POST /api/assets/search
 * Body: { query, limit?, providerIds?, category? }
 */
app.post("/api/assets/search", async (req, res) => {
    const { query, limit, providerIds, category } = req.body;
    if (!query?.trim())
        return res.status(400).json({ error: "query is required" });
    try {
        const result = await (0, assetDiscovery_1.discoverAssets)({
            query: query.trim(),
            limit: limit ?? 10,
            category: category,
            providerIds,
        });
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
/**
 * POST /api/assets/download
 * Body: AssetMetadata
 * Downloads, deduplicates, and places the asset in the correct project directory.
 * Blocked when licenseConfidence is LICENSE_UNKNOWN and strictLicenseMode is on.
 */
app.post("/api/assets/download", async (req, res) => {
    const asset = req.body;
    if (!asset?.downloadUrl)
        return res.status(400).json({ error: "downloadUrl is required" });
    if (!(0, assetDiscovery_1.isValidSourceUrl)(asset.sourceUrl)) {
        return res.status(400).json({ error: "A valid http(s) sourceUrl is required before downloading an asset" });
    }
    if (!(0, assetDiscovery_1.isValidSourceUrl)(asset.downloadUrl)) {
        return res.status(400).json({ error: "downloadUrl must be a valid http(s) URL" });
    }
    try {
        const result = await (0, assetCache_1.downloadAsset)(activeWorkspace, asset, "ADULT_18_PLUS");
        res.json({ ok: true, ...result });
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
/**
 * POST /api/assets/import
 * Body: { filePath, metadata? }
 * Imports a locally provided file into the project asset structure.
 */
app.post("/api/assets/import", (req, res) => {
    const { filePath, metadata = {} } = req.body;
    if (!filePath?.trim())
        return res.status(400).json({ error: "filePath is required" });
    try {
        const userProvider = assetDiscovery_1.defaultProviderRegistry.get("user");
        const enriched = userProvider.buildMetadata(filePath, metadata);
        const result = (0, assetCache_1.importLocalAsset)(activeWorkspace, filePath, enriched, "ADULT_18_PLUS");
        res.json({ ok: true, ...result, metadata: enriched });
    }
    catch (err) {
        res.status(err?.message?.includes("not found") ? 404 : 500).json({ error: err?.message || String(err) });
    }
});
/** GET /api/assets/:id — get a single cached asset by checksum */
app.get("/api/assets/:id", (req, res) => {
    const entry = (0, assetCache_1.getCacheEntryById)(activeWorkspace, req.params.id);
    if (!entry)
        return res.status(404).json({ error: "Asset not found in cache" });
    res.json(entry);
});
/** GET /api/assets/:id/license — get license details for a cached asset */
app.get("/api/assets/:id/license", (req, res) => {
    const entry = (0, assetCache_1.getCacheEntryById)(activeWorkspace, req.params.id);
    if (!entry)
        return res.status(404).json({ error: "Asset not found in cache" });
    const m = entry.metadata;
    res.json({
        license: m.license ?? "Unknown",
        licenseUrl: m.licenseUrl,
        licenseConfidence: m.licenseConfidence ?? "LICENSE_UNKNOWN",
        commercialUse: m.commercialUse,
        modificationAllowed: m.modificationAllowed,
        attributionRequired: m.attributionRequired,
        licenseWarning: m.licenseWarning,
        creator: m.creator,
        sourceUrl: m.sourceUrl,
    });
});
app.get("/api/assets/cache", (_req, res) => {
    res.json((0, assetCache_1.getCacheIndex)(activeWorkspace));
});
/** DELETE /api/assets/cache/:id — remove a cached asset entry (does not delete the file) */
app.delete("/api/assets/cache/:id", (req, res) => {
    const index = (0, assetCache_1.getCacheIndex)(activeWorkspace);
    if (!index[req.params.id])
        return res.status(404).json({ error: "Cache entry not found" });
    delete index[req.params.id];
    const fs = require("node:fs");
    const path = require("node:path");
    fs.writeFileSync(path.join(activeWorkspace, ".asset_cache", "metadata.json"), JSON.stringify(index, null, 2), "utf-8");
    res.json({ ok: true, deleted: req.params.id });
});
app.get("/api/assets/license-report", (_req, res) => {
    res.setHeader("Content-Type", "text/markdown");
    res.send((0, assetCache_1.generateLicenseReport)(activeWorkspace));
});
/** POST /api/assets/scaffold — create project directory structure */
app.post("/api/assets/scaffold", (_req, res) => {
    const contentRating = activeGeneration.adultMode ? "ADULT_18_PLUS" : "EVERYONE";
    const created = (0, assetCache_1.scaffoldProjectDirs)(activeWorkspace, contentRating);
    res.json({ ok: true, created, contentRating });
});
// ── Project Validation ────────────────────────────────────────────────────────
/** POST /api/project/validate — run all checks, return structured report */
app.post("/api/project/validate", (_req, res) => {
    const report = (0, projectValidator_1.validateProject)(activeWorkspace, {
        contentRating: activeGeneration.adultMode ? "ADULT_18_PLUS" : "EVERYONE",
        strictLicenseMode: true,
    });
    res.json(report);
});
/** GET /api/project/validation — alias for convenience */
app.get("/api/project/validation", (_req, res) => {
    const report = (0, projectValidator_1.validateProject)(activeWorkspace, {
        contentRating: activeGeneration.adultMode ? "ADULT_18_PLUS" : "EVERYONE",
        strictLicenseMode: true,
    });
    res.json(report);
});
// ── Web Search ───────────────────────────────────────────────────────────────
app.get("/api/search/providers", (_req, res) => {
    res.json(webSearch_1.defaultSearchRegistry.list().map((p) => ({
        id: p.id,
        name: p.name,
        isAvailable: p.isAvailable(),
    })));
});
app.post("/api/search", async (req, res) => {
    const { query, limit, safeSearch, providerIds, intent } = req.body;
    if (!query?.trim())
        return res.status(400).json({ error: "query is required" });
    try {
        const result = await (0, webSearch_1.webSearch)({ query: query.trim(), limit: limit ?? 5, safeSearch, providerIds, intent: intent });
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
app.get("/api/search/classify", (req, res) => {
    const query = req.query.q;
    if (!query)
        return res.status(400).json({ error: "q is required" });
    res.json({ intent: (0, webSearch_1.classifySearchIntent)(query) });
});
// ── Audio Discovery ───────────────────────────────────────────────────────────
app.post("/api/audio/search", async (req, res) => {
    const { query, limit, adultMode: requestedAdultMode } = req.body;
    if (!query?.trim())
        return res.status(400).json({ error: "query is required" });
    try {
        const adultMode = typeof requestedAdultMode === "boolean" ? requestedAdultMode : activeGeneration.adultMode;
        const result = await (0, audioDiscovery_1.discoverAudio)(query.trim(), limit ?? 5, adultMode);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
app.post("/api/audio/download", async (req, res) => {
    const audio = req.body;
    if (!audio?.downloadUrl)
        return res.status(400).json({ error: "downloadUrl is required" });
    try {
        const result = await (0, audioDiscovery_1.downloadAudio)(activeWorkspace, audio);
        res.json({ ok: true, ...result });
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
app.get("/api/audio/cache", (_req, res) => {
    res.json((0, audioDiscovery_1.getAudioCacheIndex)(activeWorkspace));
});
app.get("/api/audio/classify", (req, res) => {
    const title = req.query.title;
    if (!title)
        return res.status(400).json({ error: "title is required" });
    res.json({ category: (0, audioDiscovery_1.classifyAudioCategory)(title) });
});
// ── Project Memory (extended) ─────────────────────────────────────────────────
app.get("/api/project/memory/:category", (req, res) => {
    const category = req.params.category;
    res.json(projectMemory_1.defaultProjectMemory.getEntriesByCategory(DEFAULT_PROJECT_ID, category));
});
// ── Vision / Image Understanding ─────────────────────────────────────────────
app.post("/api/vision/analyze", async (req, res) => {
    const { imagePath, imageBase64, question } = req.body;
    if (!imagePath && !imageBase64)
        return res.status(400).json({ error: "imagePath or imageBase64 required" });
    let base64Data = imageBase64;
    // Read file from disk if path provided
    if (imagePath && !base64Data) {
        try {
            const absPath = path.isAbsolute(imagePath) ? imagePath : path.join(activeWorkspace, imagePath);
            const buf = fs.readFileSync(absPath);
            base64Data = buf.toString("base64");
        }
        catch (err) {
            return res.status(404).json({ error: `Cannot read image: ${err.message}` });
        }
    }
    const prompt = question || "Describe this image in detail. What do you see? List all elements, colors, style, mood, objects, characters, and any text visible.";
    // Try Ollama vision models first (llava, bakllava, etc.)
    const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
    const visionModels = ["llava:7b", "llava", "bakllava", "llava:13b", "llava:latest"];
    for (const model of visionModels) {
        try {
            const ollamaRes = await fetch(`${ollamaUrl}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model, prompt, images: [base64Data], stream: false }),
                signal: AbortSignal.timeout(30_000),
            });
            if (ollamaRes.ok) {
                const data = await ollamaRes.json();
                if (data.response?.trim()) {
                    return res.json({ ok: true, description: data.response.trim(), model, provider: "ollama" });
                }
            }
        }
        catch { /* try next model */ }
    }
    // Fallback: try any registered vision-capable model (Gemini, etc.)
    const visionCapable = registry.allCachedModels().filter(m => m.capabilities?.vision && !m.health?.blacklisted);
    for (const m of visionCapable) {
        try {
            const provider = registry.get(m.providerId);
            if (!provider)
                continue;
            const result = await provider.generate({
                model: m.modelId,
                messages: [{ role: "user", content: [
                            { type: "text", text: prompt },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                        ] }],
                maxTokens: 500,
            });
            if (result?.text?.trim()) {
                return res.json({ ok: true, description: result.text.trim(), model: m.modelId, provider: m.providerId });
            }
        }
        catch { /* try next */ }
    }
    res.status(503).json({ error: "No vision model available. Install Ollama and run: ollama pull llava:7b" });
});
// Check vision model availability
app.get("/api/vision/status", async (_req, res) => {
    const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
    const visionModels = [];
    try {
        const r = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
        if (r.ok) {
            const data = await r.json();
            for (const m of data.models ?? []) {
                if (/llava|bakllava|vision/i.test(m.name))
                    visionModels.push(m.name);
            }
        }
    }
    catch { /* ollama offline */ }
    const cloudVision = registry.allCachedModels().filter(m => m.capabilities?.vision && !m.health?.blacklisted).map(m => `${m.providerId}/${m.modelId}`);
    res.json({
        ollamaAvailable: visionModels.length > 0,
        ollamaModels: visionModels,
        cloudModels: cloudVision,
        hasVision: visionModels.length > 0 || cloudVision.length > 0,
        installCommand: "ollama pull llava:7b",
    });
});
// Save a generated asset (image/audio/video) from URL or base64
app.post("/api/assets/save-generated", async (req, res) => {
    const { url, base64, filename, type } = req.body;
    if (!url && !base64)
        return res.status(400).json({ error: "url or base64 required" });
    try {
        const ext = type || (url ? url.split(".").pop()?.split("?")[0] || "png" : "png");
        const name = filename || `generated_${Date.now()}.${ext}`;
        const dir = path.join(activeWorkspace, "Assets", "Generated");
        fs.mkdirSync(dir, { recursive: true });
        const dest = path.join(dir, name);
        if (url && url.startsWith("http")) {
            const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
            if (!r.ok)
                throw new Error(`Download failed: ${r.status}`);
            const buf = Buffer.from(await r.arrayBuffer());
            fs.writeFileSync(dest, buf);
        }
        else if (base64) {
            const data = base64.replace(/^data:[^;]+;base64,/, "");
            fs.writeFileSync(dest, Buffer.from(data, "base64"));
        }
        res.json({ ok: true, path: dest, name });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── Prompt Enhancer ─────────────────────────────────────────────────────────
app.post("/api/enhance-prompt", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt?.trim())
        return res.status(400).json({ error: "prompt is required" });
    const systemMsg = `You are a master prompt engineer. The user gives you a short prompt and you rewrite it into a rich, detailed, vivid prompt that will produce the best possible AI-generated image or asset. Add style, lighting, mood, camera angle, art style, quality tags. Keep the core subject. Return ONLY the enhanced prompt text, nothing else.`;
    try {
        const eligible = registry.allCachedModels().filter(m => m.capabilities?.chat && !m.health?.blacklisted);
        if (!eligible.length)
            return res.status(503).json({ error: "No AI models available to enhance prompt" });
        const model = eligible[0];
        const provider = registry.get(model.providerId);
        if (!provider)
            return res.status(503).json({ error: "Provider not found" });
        const result = await provider.generate({
            model: model.modelId,
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: prompt.trim() }
            ],
            maxTokens: 400,
            temperature: 0.9
        });
        const enhanced = result?.text?.trim() || prompt;
        res.json({ ok: true, enhanced, original: prompt, model: model.modelId, provider: model.providerId });
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
// ── Settings ──────────────────────────────────────────────────────────────────
app.get("/api/settings", (_req, res) => {
    res.json({
        maxEngineeringIterations: settingsRepo.get("maxEngineeringIterations", 3),
        autoMode: settingsRepo.get("autoMode", true),
        engineeringConstitution: settingsRepo.get("engineeringConstitution", defaultConstitution()),
    });
});
app.post("/api/settings", (req, res) => {
    for (const [key, value] of Object.entries(req.body)) {
        settingsRepo.set(key, value);
    }
    res.json({ ok: true });
});
function defaultConstitution() {
    return {
        prefer: ["simplicity", "explicitness", "modularity", "predictable behavior", "maintainability", "testability", "clear interfaces", "stable dependencies", "readable code"],
        avoid: ["unnecessary abstraction", "clever code", "framework worship", "dependency explosion", "premature optimization", "giant functions", "hidden side effects", "unnecessary rewrites"],
    };
}
function parseVisionTargets(text) {
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start)
        return null;
    try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        const targets = {};
        const resolveCoord = (val) => {
            if (!val || typeof val !== "object")
                return undefined;
            const x = typeof val.x === "number" ? val.x : typeof val.left === "number" ? val.left : undefined;
            const y = typeof val.y === "number" ? val.y : typeof val.top === "number" ? val.top : undefined;
            if (typeof x === "number" && typeof y === "number") {
                return {
                    x: Math.round(x),
                    y: Math.round(y),
                    ...(typeof val.confidence === "number" ? { confidence: val.confidence } : {}),
                };
            }
            return undefined;
        };
        // Check direct or alias keys
        targets.prompt = resolveCoord(parsed.prompt || parsed.promptInput || parsed.input);
        targets.brain = resolveCoord(parsed.brain || parsed.brainIcon || parsed.enhance || parsed.enhancePromptButton);
        targets.generate = resolveCoord(parsed.generate || parsed.generateButton || parsed.create || parsed.createButton);
        targets.enhancePrompt = resolveCoord(parsed.enhancePrompt);
        targets.submit = resolveCoord(parsed.submit || parsed.ok);
        // Clean undefined keys
        for (const k of Object.keys(targets)) {
            if (!targets[k])
                delete targets[k];
        }
        return Object.keys(targets).length > 0 ? targets : null;
    }
    catch {
        return null;
    }
}
async function findVisionTargets(imageBase64, question) {
    const prompt = question || [
        "Inspect this screenshot of a web page.",
        "Find the center coordinates in screenshot pixels for the visible prompt input, brain/enhance icon, and generate button.",
        "Return ONLY JSON with this shape: {\"prompt\":{\"x\":0,\"y\":0},\"brain\":{\"x\":0,\"y\":0},\"generate\":{\"x\":0,\"y\":0}}.",
        "Omit a target when it is not visible. Do not guess coordinates outside the screenshot.",
    ].join(" ");
    // 1. Try Gemini Vision if API key is available (fast and accurate)
    const geminiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (geminiKey) {
        const geminiModels = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
        for (const gm of geminiModels) {
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gm}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{
                                parts: [
                                    { text: prompt },
                                    { inlineData: { mimeType: "image/png", data: imageBase64 } }
                                ]
                            }],
                        generationConfig: {
                            temperature: 0.1,
                            responseMimeType: "application/json"
                        }
                    }),
                    signal: AbortSignal.timeout(15_000),
                });
                if (res.ok) {
                    const body = await res.json();
                    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        const targets = parseVisionTargets(text);
                        if (targets)
                            return { targets, model: gm };
                    }
                }
            }
            catch { /* continue to next model/fallback */ }
        }
    }
    // 2. Try Ollama local vision models
    const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
    const configured = process.env.OLLAMA_VISION_MODEL?.trim();
    const models = [...new Set([configured, "bakllava:latest", "bakllava", "llava:7b", "llava", "qwen2.5-vl:7b"].filter(Boolean))];
    for (const model of models) {
        try {
            const response = await fetch(`${ollamaUrl}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model, prompt, images: [imageBase64], stream: false, format: "json" }),
                signal: AbortSignal.timeout(45_000),
            });
            if (!response.ok)
                continue;
            const body = await response.json();
            const targets = body.response ? parseVisionTargets(body.response) : null;
            if (targets)
                return { targets, model };
        }
        catch { /* try the next installed vision model */ }
    }
    return null;
}
app.post("/api/vision/interact", async (req, res) => {
    const imageBase64 = String(req.body?.imageBase64 || req.body?.screenshotBase64 || "")
        .replace(/^data:image\/[^;]+;base64,/, "");
    if (!imageBase64)
        return res.status(400).json({ error: "imageBase64 is required" });
    const result = await findVisionTargets(imageBase64, typeof req.body?.question === "string" ? req.body.question : undefined);
    if (!result)
        return res.status(503).json({ error: "No vision model returned usable coordinate targets" });
    res.json({ ok: true, ...result });
});
// Browser clients may submit their own screenshot when Electron IPC is unavailable.
app.post("/api/vision/screenshot-webview", async (req, res) => {
    const imageBase64 = String(req.body?.imageBase64 || req.body?.screenshotBase64 || "");
    if (!imageBase64)
        return res.status(400).json({ error: "imageBase64 is required" });
    const result = await findVisionTargets(imageBase64, req.body?.question);
    if (!result)
        return res.status(503).json({ error: "No vision model returned usable coordinate targets" });
    res.json({ ok: true, ...result });
});
function killPortProcess(port) {
    try {
        if (process.platform === "win32") {
            const { execSync } = require("node:child_process");
            const out = execSync(`netstat -aon 2>nul | findstr :${port}`, { encoding: "utf8" });
            const currentPid = String(process.pid);
            const pids = new Set();
            for (const line of out.split("\n")) {
                const m = line.trim().match(/\s+(\d+)$/);
                if (m && m[1] !== "0" && m[1] !== currentPid)
                    pids.add(m[1]);
            }
            for (const pid of pids) {
                try {
                    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
                    console.log(`[server] Killed past backend process ${pid} on port ${port}`);
                }
                catch { }
            }
        }
    }
    catch {
        // Non-fatal — port was already free
    }
}
killPortProcess(PORT);
initDb().then(() => {
    app.listen(PORT, "127.0.0.1", () => {
        console.log(`\n🦖 Coding Monster running at http://127.0.0.1:${PORT}`);
        console.log(`   Workspace: ${activeWorkspace}`);
        console.log(`   Providers: ${registry.list().map((p) => p.name).join(", ") || "none configured"}\n`);
    });
}).catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
});
