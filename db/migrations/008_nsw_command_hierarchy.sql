-- 008 — NSW global command hierarchy, DDIL snapshots and custody transfer
--
-- Command tree (seeded in demo; real commands onboard via /api/commands):
--   WARCOM (HQ — Coronado, CA)
--     ├── NSWG-1 (TYPE_COMMAND — Coronado, CA)
--     │     ├── LOGSU-1 (Coronado, CA)
--     │     │     ├── ST-1, ST-3, SBT-12, TU-FALLON-01 (rotating)
--     ├── NSWG-2 (TYPE_COMMAND — Little Creek, VA)
--     │     ├── LOGSU-2 (Little Creek, VA)
--     │     │     ├── ST-2, ST-4, SBT-20, TU-STUTTGART-01 (EU forward)
--     ├── NSWG-4 (TYPE_COMMAND — SBT / riverine)
--     │     ├── NSWU-4-SOUTH (SOUTHCOM / SOCSOUTH forward support)
--     │     │     ├── SBT-22, DET-SOUTH-COLOMBIA, DET-SOUTH-PERU, TU-PANAMA-01
--     ├── NSWCEN (NSW Center / Training Command)
--           ├── DET-FALLON (NAS Fallon, NV — desert / air-ground)
--           ├── DET-KODIAK (Kodiak, AK — cold weather maritime)
--
-- jurisdiction_tag and unit_type on commands let host-nation and environmental
-- rules be tracked per site. Custody transfers record source/destination and
-- jurisdiction, and every movement is appended to the SHA-256 audit bus.

ALTER TABLE commands ADD COLUMN jurisdiction_tag TEXT;
ALTER TABLE commands ADD COLUMN unit_type TEXT; -- HOMEPORT | TRAINING_DET | FORWARD_HUB | DEPLOYED_TU

CREATE INDEX IF NOT EXISTS idx_commands_jurisdiction
  ON commands(jurisdiction_tag, unit_type);

CREATE TABLE IF NOT EXISTS custody_transfers (
  id TEXT PRIMARY KEY,
  transfer_group TEXT NOT NULL,
  container_id TEXT NOT NULL REFERENCES containers(id),
  source_command_id TEXT NOT NULL REFERENCES commands(id),
  destination_command_id TEXT NOT NULL REFERENCES commands(id),
  custodian_id TEXT,
  jurisdiction_tag TEXT,
  packed_at TEXT NOT NULL,
  transferred_at TEXT,
  due_at TEXT,
  deployment_order TEXT,
  status TEXT NOT NULL DEFAULT 'PACKED',      -- PACKED | TRANSFERRED | RETURNED_UNUSED | UNKNOWN
  returned_unused_quantity TEXT,
  returned_unused_unit TEXT,
  reconciliation_notes TEXT,
  notes TEXT,
  correlation_id TEXT,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_custody_transfers_group
  ON custody_transfers(transfer_group);
CREATE INDEX IF NOT EXISTS idx_custody_transfers_container
  ON custody_transfers(container_id);
CREATE INDEX IF NOT EXISTS idx_custody_transfers_destination
  ON custody_transfers(destination_command_id, status);

-- DDIL snapshots: a detached unit exports inventory + audit evidence as a
-- signed JSON bundle; the receiving command merges it without breaking the
-- hash chain (the merge itself is recorded on the bus).
CREATE TABLE IF NOT EXISTS sync_snapshots (
  id TEXT PRIMARY KEY,
  source_command_id TEXT REFERENCES commands(id),
  target_command_id TEXT REFERENCES commands(id),
  exported_at TEXT NOT NULL,
  merged_at TEXT,
  direction TEXT NOT NULL DEFAULT 'EXPORT',  -- EXPORT | IMPORT
  snapshot_hash TEXT NOT NULL,
  prev_head TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  container_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'EXPORTED',   -- EXPORTED | IMPORTED | REJECTED | UNKNOWN
  notes TEXT,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_snapshots_direction
  ON sync_snapshots(direction, exported_at DESC);
