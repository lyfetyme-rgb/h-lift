-- 005 — cybersecurity plane records
--
-- The existing security_events table is extended rather than replaced. Events
-- arrive from independent sources (IdP, API gateway, host telemetry, scanner,
-- configuration monitor, integrity monitor) and feed one normalization and
-- correlation pipeline. Every count on the SOC console is a COUNT of these
-- rows; nothing is decorative.

ALTER TABLE security_events ADD COLUMN event_type TEXT;
ALTER TABLE security_events ADD COLUMN outcome TEXT;
ALTER TABLE security_events ADD COLUMN subject_id TEXT;
ALTER TABLE security_events ADD COLUMN source_ip TEXT;
ALTER TABLE security_events ADD COLUMN resource_type TEXT;
ALTER TABLE security_events ADD COLUMN resource_id TEXT;
ALTER TABLE security_events ADD COLUMN correlation_id TEXT;
ALTER TABLE security_events ADD COLUMN normalized INTEGER NOT NULL DEFAULT 0;
ALTER TABLE security_events ADD COLUMN ingested_at TEXT;
ALTER TABLE security_events ADD COLUMN asset_id TEXT;

CREATE INDEX IF NOT EXISTS idx_security_events_type
  ON security_events(event_type, outcome, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_correlation
  ON security_events(correlation_id);

CREATE TABLE IF NOT EXISTS security_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,                 -- API|HOST|CONTAINER|ENDPOINT|DATABASE|IDP
  environment TEXT NOT NULL DEFAULT 'PRODUCTION',
  owner_command TEXT,
  facility_id TEXT,
  criticality TEXT NOT NULL DEFAULT 'MEDIUM',
  exposure TEXT NOT NULL DEFAULT 'INTERNAL', -- INTERNAL|PARTNER|INTERNET
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS security_ingest_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                       -- IDP|API_GATEWAY|HOST_TELEMETRY|VULNERABILITY_SCANNER|CONFIG_MONITOR|INTEGRITY|SENSOR
  status TEXT NOT NULL DEFAULT 'ACTIVE',    -- ACTIVE|STALE|DISABLED|UNKNOWN
  last_ingest_at TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS security_incidents (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',      -- OPEN|INVESTIGATING|CONTAINED|CLOSED|UNKNOWN
  category TEXT,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  owner_subject TEXT,
  correlated_event_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  containment TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_status
  ON security_incidents(status, opened_at DESC);

CREATE TABLE IF NOT EXISTS incident_actions (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES security_incidents(id),
  action TEXT NOT NULL,
  actor_subject TEXT,
  at TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS security_event_links (
  event_id TEXT NOT NULL REFERENCES security_events(id),
  incident_id TEXT NOT NULL REFERENCES security_incidents(id),
  linked_at TEXT NOT NULL,
  PRIMARY KEY (event_id, incident_id)
);

CREATE TABLE IF NOT EXISTS vulnerabilities (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  cve_id TEXT,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',      -- OPEN|TRIAGED|MITIGATED|REMEDIATED|ACCEPTED|UNKNOWN
  asset_id TEXT REFERENCES security_assets(id),
  discovered_at TEXT NOT NULL,
  due_at TEXT,
  remediated_at TEXT,
  cvss TEXT,                                -- decimal text, never REAL
  source TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_vulnerabilities_status
  ON vulnerabilities(status, severity);

CREATE TABLE IF NOT EXISTS configuration_checks (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES security_assets(id),
  check_code TEXT NOT NULL,
  baseline TEXT NOT NULL,
  observed TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',   -- PASS|DRIFT|FAIL|UNKNOWN
  checked_at TEXT NOT NULL,
  drift_detail TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_configuration_checks_status
  ON configuration_checks(status, checked_at DESC);

CREATE TABLE IF NOT EXISTS integrity_checks (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES security_assets(id),
  target TEXT NOT NULL,
  expected_hash TEXT NOT NULL,
  observed_hash TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',   -- MATCH|MISMATCH|UNKNOWN
  checked_at TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_integrity_checks_status
  ON integrity_checks(status, checked_at DESC);
