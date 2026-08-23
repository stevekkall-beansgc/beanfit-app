-- beanfit-app schema 0001
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,       -- sha256(raw token); raw only in cookie
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,       -- unix seconds
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- A device row is born as status='pending' when the CLI starts pairing and
-- becomes 'approved'/'denied' when a signed-in user acts on /pair/<code>.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id), -- null until claimed
  label TEXT NOT NULL,
  pair_code TEXT UNIQUE,
  pair_id TEXT UNIQUE,               -- pollable id given to the CLI
  pair_expires_at INTEGER,
  device_token_hash TEXT,            -- lookup key for check-in auth
  device_token TEXT,                 -- revealed to the owning CLI; delete after first read client-side
  os TEXT, arch TEXT, backend TEXT,
  chip TEXT, family TEXT, variant TEXT,
  ram_gib REAL, metal_cap_gib REAL, model_budget_gib REAL,
  mem_bandwidth_gbs REAL, bw_source TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|denied|revoked
  last_seen_at TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_devices_user ON devices(user_id);

CREATE TABLE recommendations (
  device_id TEXT PRIMARY KEY REFERENCES devices(id),
  use_case TEXT NOT NULL,
  engine_version TEXT,
  payload_json TEXT NOT NULL,        -- full ranked snapshot from the CLI at pair time
  catalog_version TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE catalog_models (
  ollama_tag TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  params_b REAL, mem_q4 REAL, mem_q8 REAL, kv32k REAL,
  qual_coding INTEGER, qual_reasoning INTEGER, qual_chat INTEGER,
  mlx_repo TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Drift-watch outbox: rows written when a better fit appears; sent later.
CREATE TABLE outbound_updates (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  type TEXT NOT NULL,                -- better_model | config_tip
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
