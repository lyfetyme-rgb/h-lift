-- 008 — NSW East/West command hierarchy and custody transfer pack-out
--
-- Command tree (seeded in demo; real commands onboard via /api/commands):
--   WARCOM (HQ)
--     ├── NSWG-1 (TYPE_COMMAND, West / Coronado)
--     │     ├── LOGSU-1 (INSTALLATION)
--     │     │     ├── ST-1, ST-3, SBT-12, TU-WEST-ALPHA (TENANT)
--     ├── NSWG-2 (TYPE_COMMAND, East / Little Creek)
--           ├── LOGSU-2 (INSTALLATION)
--                 ├── ST-2, ST-4, SBT-20, TU-EAST-BRAVO (TENANT)
--
-- This migration records the pack-out / custody-transfer workflow for
-- deploying task units. A transfer is only valid with a named source
-- custodian, a valid source command, and a recorded destination command;
-- every transfer and unused-return reconciliation is appended to the
-- hash-chained audit bus.

CREATE TABLE IF NOT EXISTS custody_transfers (
  id TEXT PRIMARY KEY,
  transfer_group TEXT NOT NULL,              -- shared id for a multi-container pack-out
  container_id TEXT NOT NULL REFERENCES containers(id),
  source_command_id TEXT NOT NULL REFERENCES commands(id),
  destination_command_id TEXT NOT NULL REFERENCES commands(id),
  custodian_id TEXT,                         -- subject of the person packing out
  packed_at TEXT NOT NULL,
  transferred_at TEXT,                       -- set when custody changes hands
  due_at TEXT,                               -- expected return / redeployment date
  deployment_order TEXT,
  status TEXT NOT NULL DEFAULT 'PACKED',      -- PACKED | TRANSFERRED | RETURNED_UNUSED | UNKNOWN
  returned_unused_quantity TEXT,              -- canonical decimal string when reconciling unused return
  returned_unused_unit TEXT,                  -- unit of measure for unused return
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
