-- 007 — command hierarchy for NAVSUP installations, type commands and HQ
--
-- H-LIFT must reflect how NAVSUP actually runs its installations: a tenant
-- unit sits inside an installation, which sits inside a type command, which
-- sits inside NAVSUP HQ. Oversight and audit at a higher level observe the
-- subordinate commands without being able to write into them.

CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  level TEXT NOT NULL,                       -- HQ | TYPE_COMMAND | INSTALLATION | TENANT | UNIT
  parent_id TEXT REFERENCES commands(id),
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commands_parent ON commands(parent_id, level);
CREATE INDEX IF NOT EXISTS idx_commands_level ON commands(level);

-- Extend policies with a command scope, parallel to facility_scope.
ALTER TABLE policies ADD COLUMN command_scope TEXT NOT NULL DEFAULT 'MATCH';
-- MATCH = same command only; SELF = same; DESCENDANTS = this command or below;
-- ANY = any command; NONE = no command context required.
