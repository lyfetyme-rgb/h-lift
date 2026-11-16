-- 009 — effectiveness feedback loop and policy-tuning recommendations
--
-- H-LIFT does not retrain itself. It measures what happened (decisions,
-- inspections, denials, remediations), proposes tuning recommendations, and a
-- named human decides. No recommendation is ever applied automatically.

CREATE TABLE IF NOT EXISTS effectiveness_metrics (
  id TEXT PRIMARY KEY,
  computed_at TEXT NOT NULL,
  metric TEXT NOT NULL,           -- e.g. AUTHZ_DENY_RATE, EXPIRY_BLOCKED_TOTAL
  value REAL NOT NULL,            -- ratio or count (documented per metric)
  context TEXT,                   -- canonical JSON: filter/scope
  sample_size INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_effectiveness_metrics_time
  ON effectiveness_metrics(computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_effectiveness_metrics_metric
  ON effectiveness_metrics(metric);

CREATE TABLE IF NOT EXISTS tuning_recommendations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  category TEXT NOT NULL,         -- AUTHZ | EXPIRY | INSPECTION | SECURITY | ASSURANCE
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  evidence TEXT,                  -- canonical JSON referencing records
  source TEXT NOT NULL DEFAULT 'MANUAL',  -- AUTO | MANUAL
  status TEXT NOT NULL DEFAULT 'PROPOSED',  -- PROPOSED | APPROVED | REJECTED | DISMISSED
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT,
  policy_id TEXT REFERENCES policies(id)
);

CREATE INDEX IF NOT EXISTS idx_tuning_recommendations_status
  ON tuning_recommendations(status, severity);
