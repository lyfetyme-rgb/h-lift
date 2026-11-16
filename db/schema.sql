-- H-LIFT requirements-to-delivery traceability schema (SQLite).

PRAGMA journal_mode = WAL;

-- ----- traceability chain -------------------------------------------------
-- mission requirement -> operational need -> capability -> system requirement
-- -> design component -> issue -> code link -> evidence -> artifact
-- -> deployment approval -> operational validation -> release

CREATE TABLE IF NOT EXISTS mission_requirements (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  mission TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  owner TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operational_needs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  mission_requirement_id TEXT NOT NULL REFERENCES mission_requirements(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  owner TEXT
);

CREATE TABLE IF NOT EXISTS capabilities (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  operational_need_id TEXT NOT NULL REFERENCES operational_needs(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN'
);

CREATE TABLE IF NOT EXISTS system_requirements (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  capability_id TEXT NOT NULL REFERENCES capabilities(id),
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'functional', -- functional | security | policy | data
  status TEXT NOT NULL DEFAULT 'UNKNOWN'
);

CREATE TABLE IF NOT EXISTS design_components (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  system_requirement_id TEXT NOT NULL REFERENCES system_requirements(id),
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'service',
  status TEXT NOT NULL DEFAULT 'UNKNOWN'
);

CREATE TABLE IF NOT EXISTS engineering_issues (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,            -- Linear-style key, e.g. HL-104
  design_component_id TEXT REFERENCES design_components(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN', -- backlog|todo|in_progress|in_review|done|canceled|UNKNOWN
  priority TEXT NOT NULL DEFAULT 'normal',-- urgent|high|normal|low|UNKNOWN
  assignee TEXT,
  linear_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS code_links (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES engineering_issues(id),
  branch TEXT,
  commit_sha TEXT,
  pr_url TEXT,
  pr_state TEXT NOT NULL DEFAULT 'UNKNOWN',   -- open|merged|closed|draft|UNKNOWN
  checks_status TEXT NOT NULL DEFAULT 'UNKNOWN', -- passing|failing|pending|UNKNOWN
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                  -- test|security|policy
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN', -- VERIFIED|UNVERIFIED|FAILED|UNKNOWN
  issue_id TEXT REFERENCES engineering_issues(id),
  system_requirement_id TEXT REFERENCES system_requirements(id),
  artifact_url TEXT,
  collected_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS build_artifacts (
  id TEXT PRIMARY KEY,
  issue_id TEXT REFERENCES engineering_issues(id),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  container_image TEXT,
  digest TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN', -- built|failed|UNKNOWN
  built_at TEXT
);

CREATE TABLE IF NOT EXISTS deployment_approvals (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES build_artifacts(id),
  environment TEXT NOT NULL,           -- staging|production
  status TEXT NOT NULL DEFAULT 'UNKNOWN', -- pending|approved|rejected|expired|UNKNOWN
  requested_by TEXT,
  approver TEXT,
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS operational_validations (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES build_artifacts(id),
  status TEXT NOT NULL DEFAULT 'UNKNOWN', -- validated|failed|UNVERIFIED|UNKNOWN
  validated_by TEXT,
  validated_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES build_artifacts(id),
  validation_id TEXT REFERENCES operational_validations(id),
  status TEXT NOT NULL DEFAULT 'UNKNOWN', -- released|held|UNKNOWN
  released_at TEXT,
  notes TEXT
);

-- ----- hazmat: product identity -> container -> issue -> return ------------
--
-- Quantity discipline:
--   * Every quantity column is TEXT holding a canonical decimal string
--     ("5.000", "3.400"). No REAL columns for quantities: SQLite would store
--     IEEE-754 floats and 1.600 would not be exactly 1.600.
--   * Quantities are only ever summed within one unit of measure. 20 GAL of
--     hydraulic fluid and 192 OZ of lubricant are different dimensions and
--     must never be added together.
--   * current_quantity NULL means the remaining quantity is UNKNOWN. It is
--     never coerced to 0.

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  material_code TEXT NOT NULL UNIQUE,     -- internal catalogue id, e.g. MAT-LUB-001
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,                 -- lubricant|hydraulic_fluid|filter|cylinder|agent|breathing_tube|other
  nsn TEXT,                               -- NULL = not recorded; never invented
  manufacturer TEXT,
  manufacturer_part_no TEXT,
  unit_of_issue TEXT NOT NULL,            -- EA|BX|KT|DR|PA|CA
  package_description TEXT,               -- e.g. "16 oz aerosol can"
  measurement_basis TEXT NOT NULL,        -- VOLUME|MASS|COUNT|LENGTH|AREA|PRESSURE|SERVICE_HOURS
  unit_of_measure TEXT NOT NULL,          -- OZ|GAL|L|G|KG|EA|H|BAR
  nominal_quantity_per_container TEXT NOT NULL, -- decimal string
  hazard_class TEXT,
  storage_compatibility TEXT,
  shelf_life_days INTEGER,
  partial_container_accounting INTEGER NOT NULL DEFAULT 0, -- 1 = partial quantities permitted
  status TEXT NOT NULL DEFAULT 'UNKNOWN'  -- VERIFIED|UNVERIFIED|UNKNOWN
);

CREATE TABLE IF NOT EXISTS containers (
  id TEXT PRIMARY KEY,
  container_code TEXT NOT NULL UNIQUE,    -- human label, e.g. CT-LUB-0012
  material_id TEXT NOT NULL REFERENCES materials(id),
  lot TEXT,                               -- NULL = not recorded
  package_type TEXT NOT NULL,             -- aerosol_can|pail|cylinder|tube|box|cartridge|drum
  nominal_quantity TEXT NOT NULL,         -- decimal string
  current_quantity TEXT,                  -- decimal string; NULL = UNKNOWN
  unit_of_measure TEXT NOT NULL,
  seal_status TEXT NOT NULL DEFAULT 'UNKNOWN',   -- SEALED|OPENED|UNKNOWN
  manufactured_at TEXT,
  expires_at TEXT,                        -- NULL = UNKNOWN
  location TEXT,
  condition TEXT NOT NULL DEFAULT 'UNKNOWN',     -- SERVICEABLE|DAMAGED|SUSPECT|UNKNOWN
  state TEXT NOT NULL DEFAULT 'UNKNOWN',  -- see src/lib/lifecycle.ts
  state_reason TEXT,
  created_at TEXT NOT NULL
);

-- Request-side lifecycle: REQUESTED -> VALIDATED -> AUTHORIZED -> RESERVED
-- -> PICKUP_READY -> ISSUED (or CANCELLED before issue).
CREATE TABLE IF NOT EXISTS issue_requests (
  id TEXT PRIMARY KEY,
  request_code TEXT NOT NULL UNIQUE,
  material_id TEXT NOT NULL REFERENCES materials(id),
  authorized_containers INTEGER,          -- number of packages authorized
  authorized_quantity TEXT,               -- decimal string, total authorized quantity
  unit_of_measure TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'REQUESTED',
  requested_by TEXT,
  authorized_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  notes TEXT
);

-- Accountable movement of one container. Variance is not stored: it is
-- derived (issued - consumed - returned - disposed) so it cannot drift.
CREATE TABLE IF NOT EXISTS issue_transactions (
  id TEXT PRIMARY KEY,
  txn_code TEXT NOT NULL UNIQUE,
  request_id TEXT REFERENCES issue_requests(id),
  container_id TEXT NOT NULL REFERENCES containers(id),
  issued_quantity TEXT NOT NULL,          -- decimal string
  consumed_quantity TEXT,                 -- decimal string or NULL (UNKNOWN)
  returned_quantity TEXT,                 -- decimal string or NULL
  disposed_quantity TEXT,                 -- decimal string or NULL
  measurement_basis TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',    -- OPEN|CLOSED|UNVERIFIED|UNKNOWN
  issued_at TEXT NOT NULL,
  issued_to TEXT,
  returned_at TEXT,
  notes TEXT
);

-- Append-only state history for a container.
CREATE TABLE IF NOT EXISTS container_ledger (
  id TEXT PRIMARY KEY,
  container_id TEXT NOT NULL REFERENCES containers(id),
  occurred_at TEXT NOT NULL,
  event TEXT NOT NULL,                    -- lifecycle state or RECEIVED / QUANTITY_RECORDED
  actor TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN', -- VERIFIED|UNVERIFIED|UNKNOWN
  quantity_delta TEXT,                    -- decimal string, may be negative
  notes TEXT,
  payload TEXT
);

-- Eight-point return inspection. A container cannot rejoin AVAILABLE until an
-- ACCEPTED inspection exists with every check confirmed and a measured quantity.
CREATE TABLE IF NOT EXISTS return_inspections (
  id TEXT PRIMARY KEY,
  container_id TEXT NOT NULL REFERENCES containers(id),
  received_at TEXT NOT NULL,
  inspected_at TEXT,
  inspector TEXT,
  measurement_method TEXT NOT NULL DEFAULT 'UNKNOWN', -- MEASURED|ESTIMATED|DECLARED_UNVERIFIED|UNKNOWN
  declared_quantity TEXT,
  measured_quantity TEXT,
  identity_verified INTEGER,              -- 1 yes | 0 no | NULL unknown
  correct_material INTEGER,
  label_intact INTEGER,
  shelf_life_valid INTEGER,
  container_damaged INTEGER,
  contamination_suspected INTEGER,
  quantity_verified INTEGER,
  storage_compatibility_valid INTEGER,
  outcome TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|ACCEPT|RELABEL|QUARANTINE|DISPOSITION
  notes TEXT
);

CREATE TABLE IF NOT EXISTS container_checks (
  id TEXT PRIMARY KEY,
  container_id TEXT NOT NULL REFERENCES containers(id),
  quarter TEXT NOT NULL,                  -- e.g. 2026-Q4
  due_at TEXT NOT NULL,
  completed_at TEXT,
  inspector TEXT,
  result TEXT,                            -- pass|fail|inconclusive
  status TEXT NOT NULL DEFAULT 'UNKNOWN'  -- DUE|COMPLETE|OVERDUE|UNKNOWN
);

-- ----- operational control views -----------------------------------------

CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,                  -- duplicate_link|status_mismatch|ownership|stale_sync|other
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open', -- open|resolved|UNKNOWN
  entity_a TEXT,
  entity_b TEXT,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sync_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- tablet|edge_gateway|field_kit
  last_sync_at TEXT,
  pending_changes INTEGER,
  status TEXT NOT NULL DEFAULT 'UNKNOWN', -- synced|pending|conflict|offline|UNKNOWN
  detail TEXT
);

CREATE TABLE IF NOT EXISTS hitl_exceptions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  reason TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN|APPROVED|REJECTED|EXPIRED|UNKNOWN
  requested_by TEXT,
  created_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT,
  linked_kind TEXT,
  linked_id TEXT
);

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,              -- auth|supply_chain|vulnerability|policy|anomaly
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN|TRIAGED|MITIGATED|UNKNOWN
  source TEXT,
  occurred_at TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS blockers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN|RESOLVED|UNKNOWN
  linked_kind TEXT,
  linked_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_needs_mr ON operational_needs(mission_requirement_id);
CREATE INDEX IF NOT EXISTS idx_caps_need ON capabilities(operational_need_id);
CREATE INDEX IF NOT EXISTS idx_sysreq_cap ON system_requirements(capability_id);
CREATE INDEX IF NOT EXISTS idx_design_sysreq ON design_components(system_requirement_id);
CREATE INDEX IF NOT EXISTS idx_issues_design ON engineering_issues(design_component_id);
CREATE INDEX IF NOT EXISTS idx_codelinks_issue ON code_links(issue_id);
CREATE INDEX IF NOT EXISTS idx_evidence_issue ON evidence(issue_id);
CREATE INDEX IF NOT EXISTS idx_containers_material ON containers(material_id);
CREATE INDEX IF NOT EXISTS idx_containers_state ON containers(state);
CREATE INDEX IF NOT EXISTS idx_txns_container ON issue_transactions(container_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_ledger_container ON container_ledger(container_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_inspections_container ON return_inspections(container_id, received_at);
CREATE INDEX IF NOT EXISTS idx_checks_container ON container_checks(container_id, due_at);
