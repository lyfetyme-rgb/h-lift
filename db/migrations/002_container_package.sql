-- 002 — container / package identity and labels
--
-- Physical accountability belongs to the container. A container also has an
-- owning command and facility so authorization can be scoped to an
-- organization instead of a global role name.

ALTER TABLE containers ADD COLUMN facility_id TEXT;
ALTER TABLE containers ADD COLUMN owning_command TEXT;
ALTER TABLE containers ADD COLUMN label_status TEXT NOT NULL DEFAULT 'UNKNOWN'; -- INTACT|DAMAGED|ILLEGIBLE|MISSING|UNKNOWN
ALTER TABLE containers ADD COLUMN label_version TEXT;

CREATE TABLE IF NOT EXISTS container_labels (
  id TEXT PRIMARY KEY,
  container_id TEXT NOT NULL REFERENCES containers(id),
  printed_at TEXT NOT NULL,
  printed_by TEXT,
  label_version TEXT NOT NULL,
  qr_payload TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN', -- INTACT|DAMAGED|ILLEGIBLE|MISSING|UNKNOWN
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_container_labels_container
  ON container_labels(container_id, printed_at);
CREATE INDEX IF NOT EXISTS idx_containers_facility
  ON containers(facility_id, state);
