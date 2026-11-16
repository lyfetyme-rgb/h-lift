-- 006 — assurance / RMF evidence repository
--
-- Every number in the assurance plane is derived from these tables. A control
-- is only IMPLEMENTED when recorded evidence supports it and an assessment
-- exists. Evidence ages, stale evidence, missing evidence, findings and POA&M
-- entries are first-class rows, not a manufactured percentage.

CREATE TABLE IF NOT EXISTS controls (
  id TEXT PRIMARY KEY,
  control_id TEXT NOT NULL UNIQUE,          -- e.g. AC-2
  family TEXT NOT NULL,                     -- AC|IA|AU|CM|IR|SC|SI|RA|CP|CA
  family_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  baseline TEXT NOT NULL DEFAULT 'MODERATE',-- LOW|MODERATE|HIGH
  applicability TEXT NOT NULL DEFAULT 'APPLICABLE', -- APPLICABLE|NOT_APPLICABLE
  implementation_status TEXT NOT NULL DEFAULT 'NOT_ASSESSED',
    -- IMPLEMENTED|PARTIAL|NOT_IMPLEMENTED|NOT_ASSESSED|NOT_APPLICABLE
  owner_subject TEXT,
  assessed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_controls_family ON controls(family, control_id);
CREATE INDEX IF NOT EXISTS idx_controls_status ON controls(implementation_status);

CREATE TABLE IF NOT EXISTS control_evidence (
  id TEXT PRIMARY KEY,
  control_id TEXT NOT NULL REFERENCES controls(id),
  evidence_type TEXT NOT NULL,              -- CONFIG|LOG|TEST|SCAN|POLICY|RECORD|ATTESTATION
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',   -- CURRENT|STALE|MISSING|REJECTED|UNKNOWN
  collected_at TEXT,
  valid_until TEXT,
  artifact_url TEXT,
  digest TEXT,
  object_ref TEXT,                          -- pointer into trusted data / audit bus
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_control_evidence_control
  ON control_evidence(control_id, status);
CREATE INDEX IF NOT EXISTS idx_control_evidence_status
  ON control_evidence(status, valid_until);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  control_id TEXT NOT NULL REFERENCES controls(id),
  assessor_subject TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'EXAMINE',   -- EXAMINE|INTERVIEW|TEST
  result TEXT NOT NULL DEFAULT 'UNKNOWN',   -- SATISFIED|PARTIAL|NOT_SATISFIED|UNKNOWN
  assessed_at TEXT NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_assessments_control
  ON assessments(control_id, assessed_at DESC);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  control_id TEXT REFERENCES controls(id),
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',      -- OPEN|REMEDIATION|CLOSED|ACCEPTED|UNKNOWN
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  owner_subject TEXT,
  description TEXT,
  risk TEXT,
  due_at TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status, severity, opened_at DESC);

CREATE TABLE IF NOT EXISTS poam_entries (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  finding_id TEXT REFERENCES findings(id),
  control_id TEXT REFERENCES controls(id),
  milestone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',      -- OPEN|IN_PROGRESS|COMPLETED|DELAYED|UNKNOWN
  scheduled_at TEXT,
  completed_at TEXT,
  owner_subject TEXT,
  residual_risk TEXT NOT NULL DEFAULT 'UNKNOWN', -- HIGH|MODERATE|LOW|UNKNOWN
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_poam_status ON poam_entries(status, scheduled_at);

CREATE TABLE IF NOT EXISTS assessment_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                       -- ASSESSMENT|FINDING|POAM|EVIDENCE
  subject_id TEXT,
  at TEXT NOT NULL,
  summary TEXT,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_assessment_events_time
  ON assessment_events(at DESC);
