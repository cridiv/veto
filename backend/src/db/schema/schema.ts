export const SCHEMA_SQL = `
-- 1. AGENTS: API key authentication & policy mapping
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. ACTIONS: Audit log of every check
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_goal TEXT NOT NULL,
  tool TEXT NOT NULL,
  args TEXT NOT NULL,            -- JSON string
  source TEXT NOT NULL,          -- 'agent' | 'human'
  untrusted TEXT,                -- JSON string of taint excerpts
  verdict TEXT NOT NULL,         -- 'allow' | 'block' | 'needs_approval'
  layer TEXT NOT NULL,           -- 'rule' | 'quota' | 'risk' | 'taint' | 'judge' | 'timeout' | 'off'
  risk_score REAL NOT NULL,      -- 0.0 to 1.0
  reason TEXT NOT NULL,
  matched_rule TEXT,
  approval_id TEXT,
  judge_aligned INTEGER,         -- 0 or 1
  judge_confidence REAL,
  judge_explanation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- High-performance compound index for sliding-window quota queries
CREATE INDEX IF NOT EXISTS idx_actions_quota 
ON actions (agent_id, tool, verdict, created_at);

-- Index for timeline and agent filtering in audit log
CREATE INDEX IF NOT EXISTS idx_actions_created_agent 
ON actions (created_at DESC, agent_id);

-- 3. APPROVALS: Human-in-the-loop pending queue
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  args TEXT NOT NULL,            -- JSON string
  user_goal TEXT NOT NULL,
  reason TEXT NOT NULL,
  state TEXT NOT NULL,           -- 'pending' | 'approved' | 'denied'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (request_id) REFERENCES actions(id)
);

CREATE INDEX IF NOT EXISTS idx_approvals_state 
ON approvals (state, created_at DESC);
`;
