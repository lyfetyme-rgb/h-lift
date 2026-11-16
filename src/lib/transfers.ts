import { all, one, run, transaction } from "./db";
import { appendAuditEvent } from "./audit";
import { parseDec, formatDec } from "./qty";

export type Row = Record<string, any>;

/**
 * Task-Unit deployment pack-out and custody transfer.
 *
 * A transfer is only valid when the source command actually holds the
 * containers (source custody), the destination is a command in the NSW
 * hierarchy, and the actor is named. Every transfer and unused-return
 * reconciliation is appended to the hash-chained audit bus.
 */

export function listPackoutCandidates(sourceCommandId: string): Row[] {
  return all(
    `SELECT c.*, m.name AS material_name, m.uom AS material_uom
       FROM containers c
       JOIN materials m ON m.id = c.material_id
      WHERE c.owning_command = ?
        AND c.state IN ('AVAILABLE', 'RESERVED')
        AND (m.shelf_life_days IS NULL OR c.expires_at IS NULL OR c.expires_at >= datetime('now'))
      ORDER BY m.name, c.container_code`,
    sourceCommandId
  );
}

export function listTransfers(): Row[] {
  return all(
    `SELECT t.*, src.name AS source_command_name, dst.name AS destination_command_name,
            m.name AS material_name, c.container_code
       FROM custody_transfers t
       JOIN commands src ON src.id = t.source_command_id
       JOIN commands dst ON dst.id = t.destination_command_id
       JOIN containers c ON c.id = t.container_id
       JOIN materials m ON m.id = c.material_id
      ORDER BY t.packed_at DESC`
  );
}

export function listTransferGroups(): Row[] {
  return all(
    `SELECT transfer_group, source_command_id, destination_command_id, transfer_count,
            MIN(packed_at) AS packed_at, MAX(transferred_at) AS transferred_at,
            MAX(deployment_order) AS deployment_order, MAX(status) AS status
       FROM (
         SELECT t.transfer_group, t.source_command_id, t.destination_command_id,
                COUNT(*) OVER (PARTITION BY t.transfer_group) AS transfer_count,
                t.packed_at, t.transferred_at, t.deployment_order, t.status
           FROM custody_transfers t
       )
      GROUP BY transfer_group`
  );
}

export function listCommands(): Row[] {
  return all("SELECT id, code, name, level, parent_id FROM commands ORDER BY level, code");
}

export function destinationCommands(): Row[] {
  return all(
    "SELECT id, code, name, level FROM commands WHERE level IN ('TENANT','INSTALLATION') ORDER BY code"
  );
}

export function getTransfer(id: string): Row | null {
  return one<Row>(
    `SELECT t.*, c.container_code, m.name AS material_name
       FROM custody_transfers t
       JOIN containers c ON c.id = t.container_id
       JOIN materials m ON m.id = c.material_id
      WHERE t.id = ?`,
    id
  );
}

/** Create a pack-out transfer for one or more containers from the actor's command. */
export function createTransfer(input: {
  container_ids: string[];
  destination_command_id: string;
  actor: string;
  deployment_order?: string;
  due_at?: string;
  notes?: string;
}) {
  if (!Array.isArray(input.container_ids) || input.container_ids.length === 0) {
    throw new Error("At least one container is required for a pack-out.");
  }
  if (!input.actor?.trim()) throw new Error("A named custodian is required.");

  const dest = one<Row>(
    "SELECT id, code, name, level FROM commands WHERE id = ?",
    input.destination_command_id
  );
  if (!dest) throw new Error(`Unknown destination command ${input.destination_command_id}.`);
  if (!["TENANT", "INSTALLATION"].includes(dest.level)) {
    throw new Error("Destination must be a tenant or installation command.");
  }

  const containers: Row[] = [];
  for (const id of input.container_ids) {
    const c = one<Row>("SELECT * FROM containers WHERE id = ?", id);
    if (!c) throw new Error(`Unknown container ${id}.`);
    containers.push(c);
  }

  const source = containers[0].owning_command as string;
  if (!source) throw new Error("Source custody command is unknown; cannot validate the pack-out.");
  for (const c of containers) {
    if (c.owning_command !== source) {
      throw new Error("All containers in a pack-out must share the same source command.");
    }
    if (c.state !== "AVAILABLE" && c.state !== "RESERVED") {
      throw new Error(`Container ${c.container_code} is ${c.state}; only AVAILABLE or RESERVED containers may be packed out.`);
    }
    if (c.expires_at) {
      const t = Date.parse(c.expires_at);
      if (!Number.isNaN(t) && t < Date.now()) {
        throw new Error(`Container ${c.container_code} is expired; it cannot be transferred.`);
      }
    }
  }
  if (dest.id === source) throw new Error("Destination command must differ from the source command.");

  // Facility scope: every container must share the actor's facility.
  const actorCmd = one<{ command_id: string | null; facility_id: string | null }>(
    "SELECT command_id, facility_id FROM principals WHERE subject_id = ?",
    input.actor.trim()
  );
  if (!actorCmd) throw new Error(`Unknown principal ${input.actor}.`);
  if (actorCmd.command_id !== source) {
    throw new Error(
      `${input.actor} is at ${actorCmd.command_id ?? "UNKNOWN"}, not the source command ${source}.`
    );
  }
  for (const c of containers) {
    if (actorCmd.facility_id && c.facility_id && actorCmd.facility_id !== c.facility_id) {
      throw new Error(`Container ${c.container_code} is at ${c.facility_id}, not ${actorCmd.facility_id}.`);
    }
  }

  const now = new Date().toISOString();
  const group = `tr-${Date.now().toString(36)}`;
  const correlation = `corr-${group}`;

  const result = transaction(() => {
    const created: Row[] = [];
    for (const c of containers) {
      // Release the source custody assignment.
      run(
        `UPDATE custody_assignments
            SET released_at = ?, status = 'RELEASED'
          WHERE container_id = ? AND status = 'ACTIVE'`,
        now,
        c.id
      );
      // Open a destination-command custody record (custodian to be confirmed on receipt).
      run(
        `INSERT INTO custody_assignments (id, container_id, custodian_id, custodian_label, facility_id, accepted_at, due_at, released_at, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'ACTIVE', ?)`,
        `cust-${group}-${c.id}`,
        c.id,
        null,
        dest.code,
        c.facility_id,
        now,
        input.due_at ?? null,
        `Packed out under ${input.deployment_order ?? "deployment"}; custody transfer ${group}.`
      );
      // Pack-out moves the container to the destination command.
      run(
        `UPDATE containers
            SET owning_command = ?, state = 'ISSUED',
                location = ?, state_reason = ?
          WHERE id = ?`,
        dest.id,
        `${dest.code} / pack-out`,
        `Packed out to ${dest.code} on ${input.deployment_order ?? "deployment order"}`,
        c.id
      );
      run(
        `INSERT INTO custody_transfers
           (id, transfer_group, container_id, source_command_id, destination_command_id,
            custodian_id, packed_at, transferred_at, due_at, deployment_order,
            status, returned_unused_quantity, returned_unused_unit,
            reconciliation_notes, notes, correlation_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'TRANSFERRED', NULL, NULL, NULL, ?, ?, ?)`,
        `trf-${group}-${c.id}`,
        group,
        c.id,
        source,
        dest.id,
        input.actor.trim(),
        now,
        now,
        input.due_at ?? null,
        input.deployment_order ?? null,
        input.notes ?? null,
        correlation,
        input.actor.trim()
      );
      created.push(
        one(
          `SELECT t.*, c.container_code, m.name AS material_name
             FROM custody_transfers t
             JOIN containers c ON c.id = t.container_id
             JOIN materials m ON m.id = c.material_id
            WHERE t.id = ?`,
          `trf-${group}-${c.id}`
        ) ?? {}
      );
    }
    return created;
  });

  appendAuditEvent({
    plane: "OPERATIONAL",
    event_type: "CUSTODY_TRANSFER",
    source: "hlift.operational",
    subject_id: input.actor.trim(),
    resource_type: "custody_transfer",
    resource_id: group,
    correlation_id: correlation,
    severity: "MEDIUM",
    outcome: "TRANSFERRED",
    payload: {
      transfer_group: group,
      container_ids: input.container_ids,
      source_command_id: source,
      destination_command_id: dest.id,
      deployment_order: input.deployment_order ?? null,
      due_at: input.due_at ?? null,
      notes: input.notes ?? null,
    },
  });

  return { transfer_group: group, correlation_id: correlation, transfers: result };
}

/** Reconcile unused items returned by a task unit after a deployment. */
export function recordUnusedReturn(input: {
  transfer_id: string;
  returned_unused_quantity: string;
  actor: string;
  notes?: string;
}) {
  if (!input.actor?.trim()) throw new Error("A named actor is required.");
  const transfer = getTransfer(input.transfer_id);
  if (!transfer) throw new Error(`Unknown transfer ${input.transfer_id}.`);
  if (transfer.status !== "TRANSFERRED") {
    throw new Error(`Transfer ${transfer.id} is ${transfer.status}; only TRANSFERRED records can be reconciled.`);
  }
  const qty = parseDec(input.returned_unused_quantity);
  if (!qty) throw new Error('returned_unused_quantity must be a decimal string such as "2.000".');
  const material = one<Row>(
    "SELECT m.unit_of_measure AS uom FROM containers c JOIN materials m ON m.id = c.material_id WHERE c.id = ?",
    transfer.container_id
  );
  const unit = material?.uom ?? "UNKNOWN";

  const now = new Date().toISOString();
  const inspectionId = `insp-${Date.now().toString(36)}`;

  transaction(() => {
    run(
      `UPDATE custody_transfers
          SET status = 'RETURNED_UNUSED',
              returned_unused_quantity = ?,
              returned_unused_unit = ?,
              reconciliation_notes = ?
        WHERE id = ?`,
      formatDec(qty),
      unit,
      input.notes ?? null,
      transfer.id
    );

    // Return the unused items into RETURN_HOLD so they appear on /hazmat/returns.
    run(
      `UPDATE containers
          SET state = 'RETURN_HOLD',
              location = 'Return hold / NSW reconciliation',
              state_reason = ?
        WHERE id = ?`,
      `Unused return reconciliation for ${transfer.deployment_order ?? transfer.transfer_group}`,
      transfer.container_id
    );

    run(
      `INSERT INTO return_inspections
         (id, container_id, received_at, inspected_at, inspector,
          measurement_method, declared_quantity, measured_quantity,
          identity_verified, correct_material, label_intact, shelf_life_valid,
          container_damaged, contamination_suspected, quantity_verified, storage_compatibility_valid,
          outcome, notes)
       VALUES (?, ?, ?, ?, ?, 'DECLARED_UNVERIFIED', ?, NULL,
               NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
               'PENDING', ?)`,
      inspectionId,
      transfer.container_id,
      now,
      now,
      input.actor.trim(),
      formatDec(qty),
      input.notes ?? null
    );
  });

  appendAuditEvent({
    plane: "OPERATIONAL",
    event_type: "CUSTODY_UNUSED_RETURN",
    source: "hlift.operational",
    subject_id: input.actor.trim(),
    resource_type: "custody_transfer",
    resource_id: transfer.id,
    correlation_id: transfer.correlation_id,
    severity: "INFO",
    outcome: "RETURNED_UNUSED",
    payload: {
      transfer_id: transfer.id,
      returned_unused_quantity: formatDec(qty),
      returned_unused_unit: unit,
      deployment_order: transfer.deployment_order,
      notes: input.notes ?? null,
    },
  });

  return getTransfer(transfer.id);
}
