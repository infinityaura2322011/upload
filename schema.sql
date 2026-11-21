-- Coding Monster — SQLite schema

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('builtin', 'manual')),
  base_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS models (
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  display_name TEXT,
  context_length INTEGER,
  capabilities_json TEXT NOT NULL,
  avg_latency_ms REAL,
  reliability REAL DEFAULT 1.0,
  user_score REAL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (provider_id, model_id)
);

CREATE TABLE IF NOT EXISTS role_routing (
  role TEXT NOT NULL,
  priority INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  PRIMARY KEY (role, priority)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  adult_mode INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'IDLE',
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  note TEXT,
  agent TEXT,
  provider_id TEXT,
  model_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_ms INTEGER,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  task_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_ms INTEGER,
  success INTEGER NOT NULL DEFAULT 1,
  at INTEGER NOT NULL
);

-- Extended telemetry event log (replaces usage_log going forward)
CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  agent TEXT,
  task_id TEXT,
  input_tokens INTEGER,        -- NULL = unavailable, NOT 0
  output_tokens INTEGER,       -- NULL = unavailable, NOT 0
  total_tokens INTEGER,        -- NULL = unavailable, NOT 0
  latency_ms INTEGER,
  success INTEGER NOT NULL DEFAULT 1,
  error_code TEXT,
  error_message TEXT,
  http_status INTEGER,
  request_id TEXT
);

-- Quota snapshots from provider responses
CREATE TABLE IF NOT EXISTS quota_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  metric TEXT NOT NULL,        -- e.g. requests_per_minute, tokens_per_minute
  scope TEXT NOT NULL DEFAULT 'provider', -- provider | model | account
  limit_val INTEGER,           -- NULL = unknown
  remaining INTEGER,           -- NULL = unknown
  reset_at INTEGER,            -- epoch ms, NULL = unknown
  source TEXT NOT NULL,        -- provider_header | provider_endpoint | documented_limit | local_provider
  confidence TEXT NOT NULL     -- exact | estimated | unavailable
);

CREATE TABLE IF NOT EXISTS project_memory (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, key)
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  git_commit_sha TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
