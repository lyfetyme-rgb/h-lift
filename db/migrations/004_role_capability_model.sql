-- 004 — identity, role, capability and policy model
--
-- H-LIFT is not a credential authority. A DoD-approved identity service
-- authenticates the principal; this migration stores the adapter result
-- (subject, organizational attributes, credential assurance) and the local
-- mapping from organizational roles to canonical capabilities.
--
-- Business rules reference capabilities, never role names, so a command can
-- map its own job titles without rewriting the application.

CREATE TABLE IF NOT EXISTS principals (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL UNIQUE,          -- stable subject from the identity service
  display_name TEXT NOT NULL,
  email TEXT,
  command_id TEXT,
  facility_id TEXT,
  credential_assurance TEXT NOT NULL DEFAULT 'UNKNOWN', -- HIGH|MODERATE|LOW|UNKNOWN
  idp_issuer TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',    -- ACTIVE|SUSPENDED|REVOKED|UNKNOWN
  attributes TEXT,                          -- canonical JSON: organizational claims
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_principals_command ON principals(command_id, facility_id);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_command_defined INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS principal_roles (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  command_id TEXT,
  facility_id TEXT,
  assigned_at TEXT NOT NULL,
  assigned_by TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'     -- ACTIVE|REVOKED
);

CREATE INDEX IF NOT EXISTS idx_principal_roles_principal
  ON principal_roles(principal_id, status);

CREATE TABLE IF NOT EXISTS capability_catalog (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plane TEXT NOT NULL,                      -- OPERATIONAL|CYBERSECURITY|ASSURANCE|GOVERNANCE
  description TEXT,
  is_write INTEGER NOT NULL DEFAULT 0       -- 1 mutates state, 0 read-only
);

CREATE TABLE IF NOT EXISTS role_capabilities (
  role_id TEXT NOT NULL REFERENCES roles(id),
  capability_code TEXT NOT NULL REFERENCES capability_catalog(code),
  constraint_scope TEXT,                    -- optional local constraint, e.g. FACILITY
  PRIMARY KEY (role_id, capability_code)
);

CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  plane TEXT NOT NULL,
  capability_code TEXT NOT NULL REFERENCES capability_catalog(code),
  effect TEXT NOT NULL DEFAULT 'PERMIT',    -- PERMIT|DENY
  requires_assurance TEXT NOT NULL DEFAULT 'LOW', -- HIGH|MODERATE|LOW
  facility_scope TEXT NOT NULL DEFAULT 'MATCH',   -- MATCH|ANY|NONE
  allowed_states TEXT,                      -- canonical JSON array, null = any state
  require_valid_expiry INTEGER NOT NULL DEFAULT 0, -- 1 = block EXPIRED and UNKNOWN
  obligations TEXT,                         -- canonical JSON array
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (version, capability_code)
);

CREATE INDEX IF NOT EXISTS idx_policies_capability ON policies(capability_code, active);

CREATE TABLE IF NOT EXISTS authorization_decisions (
  id TEXT PRIMARY KEY,
  decided_at TEXT NOT NULL,
  principal_id TEXT,
  subject_id TEXT NOT NULL,
  roles TEXT,                               -- canonical JSON array
  command_id TEXT,
  facility_id TEXT,
  resource_type TEXT,
  resource_id TEXT,
  action TEXT NOT NULL,
  capability_code TEXT,
  lifecycle_state TEXT,
  credential_assurance TEXT,
  policy_id TEXT,
  permitted INTEGER NOT NULL,
  reason_code TEXT NOT NULL,
  obligations TEXT,                         -- canonical JSON array
  correlation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_authz_decisions_time
  ON authorization_decisions(decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_authz_decisions_subject
  ON authorization_decisions(subject_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_authz_decisions_resource
  ON authorization_decisions(resource_type, resource_id, decided_at DESC);
