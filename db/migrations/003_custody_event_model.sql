-- 003 — custody and the shared audit / event bus
--
-- Custody is a relationship between a container and a responsible party, with
-- an acceptance time and a due time. The audit bus is the append-only layer
-- shared by all three planes; every row carries the hash of its predecessor.

CREATE TABLE IF NOT EXISTS custody_assignments (
  id TEXT PRIMARY KEY,
  container_id TEXT NOT NULL REFERENCES containers(id),
  custodian_id TEXT,
  custodian_label TEXT,
  facility_id TEXT,
  accepted_at TEXT NOT NULL,
  due_at TEXT,
  released_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE|RELEASED|OVERDUE|UNKNOWN
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_custody_container
  ON custody_assignments(container_id, accepted_at);
CREATE INDEX IF NOT EXISTS idx_custody_active
  ON custody_assignments(status, due_at);

CREATE TABLE IF NOT EXISTS audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  plane TEXT NOT NULL,              -- OPERATIONAL|CYBERSECURITY|ASSURANCE|GOVERNANCE|TRUSTED_DATA
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  subject_id TEXT,
  resource_type TEXT,
  resource_id TEXT,
  correlation_id TEXT,
  severity TEXT,
  outcome TEXT,
  payload TEXT,                     -- canonical JSON
  prev_hash TEXT,
  hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_plane ON audit_events(plane, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(resource_type, resource_id);
