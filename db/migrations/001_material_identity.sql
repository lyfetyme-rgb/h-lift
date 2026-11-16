-- 001 — material identity
--
-- The catalogue record is not the physical package. This migration adds
-- verifiable identifiers to the material record (NSN/NIIN, manufacturer part,
-- supplier part) without inventing any value that the source did not supply.

CREATE TABLE IF NOT EXISTS material_identifiers (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES materials(id),
  kind TEXT NOT NULL,               -- NSN|NIIN|MANUFACTURER_PART|SUPPLIER_PART|CATALOG
  value TEXT NOT NULL,
  issuer TEXT,
  verified INTEGER,                 -- 1 verified | 0 rejected | NULL not verified
  source TEXT,
  recorded_at TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_material_identifiers_material
  ON material_identifiers(material_id, kind);
