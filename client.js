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
exports.SettingsRepository = exports.QuotaRepository = exports.TelemetryRepository = exports.UsageRepository = exports.TaskRepository = void 0;
exports.openDb = openDb;
exports.ensureProject = ensureProject;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
let _db = null;
let _dbPath = "";
async function openDb(dbPath) {
    if (_db && _dbPath === dbPath)
        return _db;
    _dbPath = dbPath;
    const initSqlJs = require("sql.js");
    const wasmPath = path.join(path.dirname(require.resolve("sql.js")), "sql-wasm.wasm");
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary });
    let data = null;
    if (fs.existsSync(dbPath))
        data = fs.readFileSync(dbPath);
    _db = data ? new SQL.Database(data) : new SQL.Database();
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    _db.run(schema);
    try {
        _db.run("ALTER TABLE tasks ADD COLUMN adult_mode INTEGER NOT NULL DEFAULT 0");
    }
    catch { /* existing database already migrated */ }
    persist();
    return _db;
}
function persist() {
    if (!_db || !_dbPath)
        return;
    try {
        fs.writeFileSync(_dbPath, Buffer.from(_db.export()));
    }
    catch { /* non-fatal */ }
}
function esc(s) { return String(s).replace(/'/g, "''"); }
function ensureProject(db, id, name, rootPath) {
    const rows = db.exec(`SELECT id FROM projects WHERE id = '${esc(id)}'`);
    if (!rows.length || !rows[0].values.length) {
        db.run("INSERT INTO projects (id, name, root_path, created_at) VALUES (?, ?, ?, ?)", [id, name, rootPath, Date.now()]);
        persist();
    }
}
class TaskRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    updateProjectRoot(projectId, name, rootPath) {
        this.db.run("UPDATE projects SET name = ?, root_path = ? WHERE id = ?", [name, rootPath, projectId]);
        persist();
    }
    create(id, projectId, prompt, adultMode = false) {
        this.db.run("INSERT INTO tasks (id, project_id, prompt, adult_mode, state, created_at) VALUES (?, ?, ?, ?, 'IDLE', ?)", [id, projectId, prompt, adultMode ? 1 : 0, Date.now()]);
        persist();
    }
    get(id) {
        const r = this.db.exec(`SELECT t.id, t.prompt, t.adult_mode, t.state, t.created_at, t.completed_at, p.name, p.root_path FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = '${esc(id)}'`);
        if (!r.length || !r[0].values.length)
            return undefined;
        const [tid, prompt, adultMode, state, createdAt, completedAt, projectName, rootPath] = r[0].values[0];
        return { id: String(tid), prompt: String(prompt), adult_mode: Boolean(adultMode), state: String(state), created_at: Number(createdAt), completed_at: completedAt == null ? undefined : Number(completedAt), project_name: projectName == null ? undefined : String(projectName), root_path: rootPath == null ? undefined : String(rootPath) };
    }
    list(projectId) {
        const r = this.db.exec(`SELECT t.id, t.prompt, t.adult_mode, t.state, t.created_at, t.completed_at, p.name, p.root_path FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.project_id = '${esc(projectId)}' ORDER BY t.created_at DESC LIMIT 50`);
        if (!r.length)
            return [];
        return r[0].values.map(([id, prompt, adultMode, state, created_at, completed_at, projectName, rootPath]) => ({
            id: String(id), prompt: String(prompt), adult_mode: Boolean(adultMode), state: String(state), created_at: Number(created_at), completed_at: completed_at == null ? undefined : Number(completed_at), project_name: projectName == null ? undefined : String(projectName), root_path: rootPath == null ? undefined : String(rootPath)
        }));
    }
    listAll() {
        const r = this.db.exec("SELECT t.id, t.prompt, t.adult_mode, t.state, t.created_at, t.completed_at, p.name, p.root_path FROM tasks t LEFT JOIN projects p ON p.id = t.project_id ORDER BY t.created_at DESC LIMIT 50");
        if (!r.length)
            return [];
        return r[0].values.map(([id, prompt, adultMode, state, created_at, completed_at, projectName, rootPath]) => ({
            id: String(id),
            prompt: String(prompt),
            adult_mode: Boolean(adultMode),
            state: String(state),
            created_at: Number(created_at),
            completed_at: completed_at == null ? undefined : Number(completed_at),
            project_name: projectName == null ? undefined : String(projectName),
            root_path: rootPath == null ? undefined : String(rootPath),
        }));
    }
    updateState(id, state) {
        this.db.run("UPDATE tasks SET state = ? WHERE id = ?", [state, id]);
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(state)) {
            this.db.run("UPDATE tasks SET completed_at = ? WHERE id = ?", [Date.now(), id]);
        }
        persist();
    }
    logEvent(taskId, fromState, toState, note, agent, providerId, modelId, inputTokens, outputTokens, durationMs) {
        this.db.run("INSERT INTO task_events (task_id, from_state, to_state, note, agent, provider_id, model_id, input_tokens, output_tokens, duration_ms, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [taskId, fromState, toState, note ?? null, agent ?? null, providerId ?? null, modelId ?? null, inputTokens ?? null, outputTokens ?? null, durationMs ?? null, Date.now()]);
        persist();
    }
    getEvents(taskId) {
        const r = this.db.exec(`SELECT * FROM task_events WHERE task_id = '${esc(taskId)}' ORDER BY at ASC`);
        if (!r.length)
            return [];
        const cols = r[0].columns;
        return r[0].values.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
    }
    delete(id) {
        this.db.run("DELETE FROM task_events WHERE task_id = ?", [id]);
        this.db.run("DELETE FROM tasks WHERE id = ?", [id]);
        persist();
    }
    deleteAll(projectId) {
        if (projectId) {
            this.db.run("DELETE FROM task_events WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)", [projectId]);
            this.db.run("DELETE FROM tasks WHERE project_id = ?", [projectId]);
        }
        else {
            this.db.run("DELETE FROM task_events");
            this.db.run("DELETE FROM tasks");
        }
        persist();
    }
}
exports.TaskRepository = TaskRepository;
class UsageRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    log(providerId, modelId, taskId, inputTokens, outputTokens, durationMs, success) {
        this.db.run("INSERT INTO usage_log (provider_id, model_id, task_id, input_tokens, output_tokens, duration_ms, success, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [providerId, modelId, taskId, inputTokens ?? null, outputTokens ?? null, durationMs, success ? 1 : 0, Date.now()]);
        persist();
    }
    summary() {
        const r = this.db.exec(`SELECT provider_id, model_id, COUNT(*) as requests, COALESCE(SUM(input_tokens),0) as total_input, COALESCE(SUM(output_tokens),0) as total_output, COALESCE(AVG(duration_ms),0) as avg_duration, SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as errors FROM usage_log GROUP BY provider_id, model_id ORDER BY requests DESC`);
        if (!r.length)
            return [];
        const cols = r[0].columns;
        return r[0].values.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
    }
    today() {
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        const r = this.db.exec(`SELECT COUNT(*) as requests, COALESCE(SUM(input_tokens),0) as input_tokens, COALESCE(SUM(output_tokens),0) as output_tokens FROM usage_log WHERE at >= ${midnight.getTime()}`);
        if (!r.length || !r[0].values.length)
            return { requests: 0, input_tokens: 0, output_tokens: 0 };
        const [requests, input_tokens, output_tokens] = r[0].values[0];
        return { requests: Number(requests), input_tokens: Number(input_tokens), output_tokens: Number(output_tokens) };
    }
}
exports.UsageRepository = UsageRepository;
class TelemetryRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    record(e) {
        const total = e.totalTokens ?? (e.inputTokens != null && e.outputTokens != null ? e.inputTokens + e.outputTokens : null);
        this.db.run(`INSERT INTO usage_events (timestamp,provider,model,agent,task_id,input_tokens,output_tokens,total_tokens,latency_ms,success,error_code,error_message,http_status,request_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [Date.now(), e.provider, e.model, e.agent ?? null, e.taskId ?? null,
            e.inputTokens ?? null, e.outputTokens ?? null, total,
            e.latencyMs ?? null, e.success ? 1 : 0,
            e.errorCode ?? null, e.errorMessage ?? null, e.httpStatus ?? null, e.requestId ?? null]);
        persist();
    }
    /** Summary grouped by provider+model — only real recorded values, never coerced to 0 */
    modelSummary() {
        const r = this.db.exec(`
      SELECT provider, model,
        COUNT(*) as requests,
        SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as errors,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        AVG(latency_ms) as avg_latency,
        MAX(timestamp) as last_used
      FROM usage_events
      GROUP BY provider, model
      ORDER BY requests DESC
    `);
        if (!r.length)
            return [];
        const cols = r[0].columns;
        return r[0].values.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
    }
    /** Today's totals — NULL sums stay NULL (not coerced to 0) */
    todaySummary() {
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        const r = this.db.exec(`
      SELECT COUNT(*) as requests, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens
      FROM usage_events WHERE timestamp >= ${midnight.getTime()}
    `);
        if (!r.length || !r[0].values.length)
            return { requests: null, inputTokens: null, outputTokens: null };
        const [req, inp, out] = r[0].values[0];
        return {
            requests: req != null ? Number(req) : null,
            inputTokens: inp != null ? Number(inp) : null,
            outputTokens: out != null ? Number(out) : null,
        };
    }
    /** Global totals for summary bar */
    globalSummary() {
        const r = this.db.exec(`SELECT COUNT(*), SUM(CASE WHEN success=0 THEN 1 ELSE 0 END), SUM(input_tokens), SUM(output_tokens) FROM usage_events`);
        if (!r.length || !r[0].values.length)
            return { requests: 0, errors: 0, inputTokens: null, outputTokens: null };
        const [req, err, inp, out] = r[0].values[0];
        return {
            requests: Number(req ?? 0),
            errors: Number(err ?? 0),
            inputTokens: inp != null ? Number(inp) : null,
            outputTokens: out != null ? Number(out) : null,
        };
    }
    recentEvents(provider, limit = 50) {
        const where = provider ? `WHERE provider = '${esc(provider)}'` : "";
        const r = this.db.exec(`SELECT * FROM usage_events ${where} ORDER BY timestamp DESC LIMIT ${limit}`);
        if (!r.length)
            return [];
        const cols = r[0].columns;
        return r[0].values.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
    }
}
exports.TelemetryRepository = TelemetryRepository;
class QuotaRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    upsert(s) {
        this.db.run(`INSERT INTO quota_snapshots (timestamp,provider,model,metric,scope,limit_val,remaining,reset_at,source,confidence) VALUES (?,?,?,?,?,?,?,?,?,?)`, [Date.now(), s.provider, s.model ?? null, s.metric, s.scope ?? "provider",
            s.limitVal ?? null, s.remaining ?? null, s.resetAt ?? null, s.source, s.confidence]);
        persist();
    }
    /** Latest snapshot per provider+metric */
    latestByProvider() {
        const r = this.db.exec(`
      SELECT qs.* FROM quota_snapshots qs
      INNER JOIN (
        SELECT provider, metric, MAX(timestamp) as mt FROM quota_snapshots GROUP BY provider, metric
      ) latest ON qs.provider = latest.provider AND qs.metric = latest.metric AND qs.timestamp = latest.mt
      ORDER BY qs.provider, qs.metric
    `);
        if (!r.length)
            return [];
        const cols = r[0].columns;
        return r[0].values.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
    }
}
exports.QuotaRepository = QuotaRepository;
class SettingsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    get(key, defaultValue) {
        const r = this.db.exec(`SELECT value_json FROM settings WHERE key = '${esc(key)}'`);
        if (!r.length || !r[0].values.length)
            return defaultValue;
        try {
            return JSON.parse(String(r[0].values[0][0]));
        }
        catch {
            return defaultValue;
        }
    }
    set(key, value) {
        this.db.run("INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)", [key, JSON.stringify(value)]);
        persist();
    }
}
exports.SettingsRepository = SettingsRepository;
