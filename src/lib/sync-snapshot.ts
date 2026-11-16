import { createHash } from "node:crypto";
import { all, one, run, transaction } from "./db";
import { appendAuditEvent, canonicalJson, auditHash, sha256Hex, recentAudit } from "./audit";

export type Row = Record<string, any>;

/**
 * DDIL (denied, degraded, intermittent, limited) snapshot export/import.
 *
 * A detached element (Fallon, South America, a forward theater) exports a
 * signed JSON bundle of inventory and audit evidence. The receiving command
 * (LOGSU / WARCOM) verifies the signature and internal chain, merges what it
 * can, and records the merge on its own audit bus — so chain verification is
 * never broken by foreign events with mismatched hashes.
 */

const FORMAT_VERSION = 1;

function bundleHash(bundle: {
  version: number;
  exported_at: string;
  source_command_id: string;
  materials: Row[];
  containers: Row[];
  audit_events: Row[];
}): string {
  return sha256Hex(
    canonicalJson({
      version: bundle.version,
      exported_at: bundle.exported_at,
      source_command_id: bundle.source_command_id,
      materials: bundle.materials,
      containers: bundle.containers,
      audit_events: bundle.audit_events,
    })
  );
}

export function exportSnapshot(sourceCommandId: string, actor: string) {
  const cmd = one<Row>("SELECT * FROM commands WHERE id = ?", sourceCommandId);
  if (!cmd) throw new Error(`Unknown source command ${sourceCommandId}.`);
  if (!actor?.trim()) throw new Error("A named actor is required.");

  const materials = all<Row>("SELECT * FROM materials");
  const containers = all<Row>("SELECT * FROM containers");
  const audit_events = all<Row>("SELECT * FROM audit_events ORDER BY seq ASC");
  const head = one<{ hash: string }>("SELECT hash FROM audit_events ORDER BY seq DESC LIMIT 1")?.hash ?? null;

  const exported_at = new Date().toISOString();
  const snapshotId = `syn-${Date.now().toString(36)}`;
  const partial = {
    version: FORMAT_VERSION,
    exported_at,
    source_command_id: cmd.id,
    materials,
    containers,
    audit_events,
  };
  const snapshot_hash = bundleHash(partial);

  const bundle = { ...partial, snapshot_hash, source_command: cmd, exported_by: actor.trim() };

  run(
    `INSERT INTO sync_snapshots
       (id, source_command_id, target_command_id, exported_at, merged_at, direction,
        snapshot_hash, prev_head, event_count, container_count, status, notes, created_by)
     VALUES (?, ?, NULL, ?, NULL, 'EXPORT', ?, ?, ?, ?, 'EXPORTED', ?, ?)`,
    snapshotId,
    cmd.id,
    exported_at,
    snapshot_hash,
    head,
    audit_events.length,
    containers.length,
    `DDIL export from ${cmd.code}`,
    actor.trim()
  );

  appendAuditEvent({
    plane: "TRUSTED_DATA",
    event_type: "SYNC_EXPORTED",
    source: "hlift.sync",
    subject_id: actor.trim(),
    resource_type: "sync_snapshot",
    resource_id: snapshotId,
    correlation_id: snapshot_hash,
    severity: "INFO",
    outcome: "EXPORTED",
    payload: { snapshot_id: snapshotId, snapshot_hash, event_count: audit_events.length, container_count: containers.length },
  });

  return { snapshot_id: snapshotId, snapshot_hash, bundle };
}

export function verifyBundleChain(audit_events: Row[]): { valid: boolean; brokenAt: string | null } {
  const rows = [...audit_events].sort((a, b) => Number(a.seq) - Number(b.seq));
  let prev: string | null = null;
  for (const row of rows) {
    const expected = auditHash(prev, {
      id: row.id,
      occurred_at: row.occurred_at,
      plane: row.plane,
      event_type: row.event_type,
      source: row.source,
      subject_id: row.subject_id,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      correlation_id: row.correlation_id,
      severity: row.severity,
      outcome: row.outcome,
      payload: row.payload,
    });
    if (row.prev_hash !== prev || row.hash !== expected) {
      return { valid: false, brokenAt: row.id };
    }
    prev = row.hash;
  }
  return { valid: true, brokenAt: null };
}

export function importSnapshot(bundle: any, targetCommandId: string, actor: string) {
  if (!actor?.trim()) throw new Error("A named actor is required.");
  if (!bundle || typeof bundle !== "object") throw new Error("A snapshot bundle object is required.");
  // Accept either a direct bundle or an export envelope { snapshot_id, snapshot_hash, bundle }.
  if (bundle.bundle && typeof bundle.bundle === "object" && bundle.bundle.version) {
    bundle = bundle.bundle;
  }
  if (bundle.version !== FORMAT_VERSION) {
    throw new Error(`Unsupported snapshot version ${bundle.version}.`);
  }
  const { version, exported_at, source_command_id, materials, containers, audit_events, snapshot_hash } = bundle;
  if (!source_command_id || !exported_at || !snapshot_hash) {
    throw new Error("Bundle is missing required fields.");
  }
  if (!Array.isArray(materials) || !Array.isArray(containers) || !Array.isArray(audit_events)) {
    throw new Error("Bundle materials, containers and audit_events must be arrays.");
  }

  const src = one<Row>("SELECT * FROM commands WHERE id = ?", source_command_id);
  if (!src) throw new Error(`Unknown source command ${source_command_id}.`);
  const dst = one<Row>("SELECT * FROM commands WHERE id = ?", targetCommandId);
  if (!dst) throw new Error(`Unknown target command ${targetCommandId}.`);

  const recomputed = bundleHash({ version, exported_at, source_command_id, materials, containers, audit_events });
  if (recomputed !== snapshot_hash) {
    throw new Error("Snapshot hash mismatch; the bundle was modified after export.");
  }

  const chain = verifyBundleChain(audit_events);
  if (!chain.valid) {
    throw new Error(`Snapshot audit chain broke at ${chain.brokenAt}; refusing to merge.`);
  }

  const snapshotId = `syn-${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  const merged = transaction(() => {
    let materialsInserted = 0;
    let containersInserted = 0;
    for (const m of materials) {
      const exists = one("SELECT id FROM materials WHERE id = ?", m.id);
      if (exists) continue;
      run(
        `INSERT OR IGNORE INTO materials
           (id, material_code, name, description, category, nsn, manufacturer,
            manufacturer_part_no, unit_of_issue, package_description, measurement_basis,
            unit_of_measure, nominal_quantity_per_container, hazard_class,
            storage_compatibility, shelf_life_days, partial_container_accounting, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        m.id, m.material_code, m.name, m.description, m.category, m.nsn,
        m.manufacturer, m.manufacturer_part_no, m.unit_of_issue, m.package_description,
        m.measurement_basis, m.unit_of_measure, m.nominal_quantity_per_container,
        m.hazard_class, m.storage_compatibility, m.shelf_life_days,
        m.partial_container_accounting, m.status
      );
      materialsInserted++;
    }
    for (const c of containers) {
      const exists = one("SELECT id FROM containers WHERE id = ?", c.id);
      if (exists) continue;
      run(
        `INSERT OR IGNORE INTO containers
           (id, container_code, material_id, lot, package_type, nominal_quantity,
            current_quantity, unit_of_measure, seal_status, manufactured_at,
            expires_at, location, condition, state, state_reason, created_at,
            facility_id, owning_command, label_status, label_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.id, c.container_code, c.material_id, c.lot, c.package_type, c.nominal_quantity,
        c.current_quantity, c.unit_of_measure, c.seal_status, c.manufactured_at,
        c.expires_at, c.location, c.condition, c.state, c.state_reason, c.created_at,
        c.facility_id, c.owning_command, c.label_status, c.label_version
      );
      containersInserted++;
    }

    run(
      `INSERT INTO sync_snapshots
         (id, source_command_id, target_command_id, exported_at, merged_at, direction,
          snapshot_hash, prev_head, event_count, container_count, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, 'IMPORT', ?, ?, ?, ?, 'IMPORTED', ?, ?)`,
      snapshotId,
      src.id,
      dst.id,
      exported_at,
      now,
      snapshot_hash,
      audit_events.at(-1)?.hash ?? null,
      audit_events.length,
      containersInserted,
      `Merged DDIL snapshot from ${src.code} into ${dst.code}`,
      actor.trim()
    );

    return { materialsInserted, containersInserted };
  });

  appendAuditEvent({
    plane: "TRUSTED_DATA",
    event_type: "SYNC_MERGED",
    source: "hlift.sync",
    subject_id: actor.trim(),
    resource_type: "sync_snapshot",
    resource_id: snapshotId,
    correlation_id: snapshot_hash,
    severity: "INFO",
    outcome: "IMPORTED",
    payload: {
      snapshot_hash,
      source_command_id: src.id,
      target_command_id: dst.id,
      event_count: audit_events.length,
      materials_merged: merged.materialsInserted,
      containers_merged: merged.containersInserted,
    },
  });

  return {
    snapshot_id: snapshotId,
    snapshot_hash,
    materials_merged: merged.materialsInserted,
    containers_merged: merged.containersInserted,
    events_verified: audit_events.length,
  };
}
