import { all, one, run } from "./db";
import { appendAuditEvent } from "./audit";
import { UNKNOWN, UNVERIFIED, daysUntil, shelfState } from "./status";
import {
  Dec,
  decOf,
  parseDec,
  formatDec,
  formatQty,
  add,
  sub,
  cmp,
  isZero,
  sum,
  percentOf,
} from "./qty";
import {
  CONTAINER_TRANSITIONS,
  RETURN_HOLD_STATES,
  IN_CUSTODY_STATES,
  canTransition,
} from "./lifecycle";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

const ZERO: Dec = decOf(0n, 3);

// ---------------------------------------------------------------------------
// Traceability chain (unchanged by the hazmat correction)
// ---------------------------------------------------------------------------

export interface TraceModel {
  missions: Row[];
  needs: Row[];
  caps: Row[];
  sysReqs: Row[];
  designs: Row[];
  issues: Row[];
  links: Row[];
  evidence: Row[];
  artifacts: Row[];
  approvals: Row[];
  validations: Row[];
  releases: Row[];
}

export function loadTrace(): TraceModel {
  return {
    missions: all("SELECT * FROM mission_requirements ORDER BY code"),
    needs: all("SELECT * FROM operational_needs ORDER BY code"),
    caps: all("SELECT * FROM capabilities ORDER BY code"),
    sysReqs: all("SELECT * FROM system_requirements ORDER BY code"),
    designs: all("SELECT * FROM design_components ORDER BY code"),
    issues: all("SELECT * FROM engineering_issues ORDER BY key"),
    links: all("SELECT * FROM code_links ORDER BY updated_at DESC"),
    evidence: all("SELECT * FROM evidence ORDER BY collected_at DESC"),
    artifacts: all("SELECT * FROM build_artifacts ORDER BY name"),
    approvals: all("SELECT * FROM deployment_approvals ORDER BY requested_at DESC"),
    validations: all("SELECT * FROM operational_validations"),
    releases: all("SELECT * FROM releases"),
  };
}

const by = (rows: Row[], key: string, value: string) => rows.filter((r) => r[key] === value);

export function chainFor(m: TraceModel, missionId: string): any[] {
  const needs = by(m.needs, "mission_requirement_id", missionId);
  return needs.map((need) => {
    const caps = by(m.caps, "operational_need_id", need.id).map((cap) => {
      const sysReqs = by(m.sysReqs, "capability_id", cap.id).map((sr) => {
        const designs = by(m.designs, "system_requirement_id", sr.id).map((dc) => {
          const issues = by(m.issues, "design_component_id", dc.id).map((iss) => {
            const links = by(m.links, "issue_id", iss.id);
            const ev = by(m.evidence, "issue_id", iss.id);
            const artifacts = by(m.artifacts, "issue_id", iss.id).map((art) => ({
              ...art,
              approvals: by(m.approvals, "artifact_id", art.id),
              validations: by(m.validations, "artifact_id", art.id),
              releases: by(m.releases, "artifact_id", art.id),
            }));
            return { ...iss, links, evidence: ev, artifacts };
          });
          return { ...dc, issues };
        });
        return { ...sr, designs, evidence: by(m.evidence, "system_requirement_id", sr.id) };
      });
      return { ...cap, sysReqs };
    });
    return { ...need, caps };
  });
}

export function missionSummaries() {
  const m = loadTrace();
  return m.missions.map((mr): any => {
    const tree = chainFor(m, mr.id);
    let needs = 0, caps = 0, sysReqs = 0, designs = 0, issues = 0, issuesDone = 0;
    let evidence = 0, evidenceVerified = 0, artifacts = 0, artifactsBuilt = 0;
    let approvalsPending = 0, releases = 0, releasesHeld = 0;
    const gaps = gapRowsForMission(m, mr.id, tree);

    for (const need of tree) {
      needs++;
      for (const cap of need.caps) {
        caps++;
        for (const sr of cap.sysReqs) {
          sysReqs++;
          evidence += sr.evidence.length;
          evidenceVerified += sr.evidence.filter((e: Row) => e.status === "VERIFIED").length;
          for (const dc of sr.designs) {
            designs++;
            for (const iss of dc.issues) {
              issues++;
              if (iss.status === "done") issuesDone++;
              for (const art of iss.artifacts) {
                artifacts++;
                if (art.status === "built") artifactsBuilt++;
                approvalsPending += art.approvals.filter((a: Row) => a.status === "pending").length;
                releases += art.releases.length;
                releasesHeld += art.releases.filter((r: Row) => r.status === "held").length;
              }
            }
          }
        }
      }
    }
    return {
      ...mr,
      counts: {
        needs, caps, sysReqs, designs, issues, issuesDone,
        evidence, evidenceVerified, artifacts, artifactsBuilt,
        approvalsPending, releases, releasesHeld,
      },
      gapCount: gaps.length,
    };
  });
}

export function missionDetail(id: string): any {
  const m = loadTrace();
  const mr = m.missions.find((x) => x.id === id);
  if (!mr) return null;
  const tree = chainFor(m, id);
  return { mission: mr, tree, gaps: gapRowsForMission(m, id, tree) };
}

// ---------------------------------------------------------------------------
// Derived evidence gaps. Nothing is inferred: missing inputs stay UNKNOWN.
// ---------------------------------------------------------------------------

export interface Gap {
  id: string;
  kind: string;
  code: string;
  name: string;
  status: string;
  detail: string;
  link: string;
}

function gapRowsForMission(m: TraceModel, missionId: string, tree: any[]): Gap[] {
  const gaps: Gap[] = [];
  for (const need of tree) {
    for (const cap of need.caps) {
      for (const sr of cap.sysReqs) {
        const ev: Row[] = sr.evidence;
        if (ev.length === 0) {
          gaps.push({ id: `ev-${sr.id}`, kind: "EVIDENCE", code: sr.code, name: sr.title, status: UNKNOWN, detail: "No evidence collected for this system requirement.", link: `/traceability/${missionId}` });
        } else {
          const verified = ev.filter((e) => e.status === "VERIFIED");
          const failed = ev.filter((e) => e.status === "FAILED");
          const unresolved = ev.filter((e) => e.status === UNVERIFIED || e.status === UNKNOWN);
          if (failed.length) {
            gaps.push({ id: `evf-${sr.id}`, kind: "EVIDENCE", code: sr.code, name: sr.title, status: "FAILED", detail: `${failed.map((e) => e.name).join(", ")} failed.`, link: `/traceability/${missionId}` });
          } else if (verified.length === 0) {
            gaps.push({ id: `evu-${sr.id}`, kind: "EVIDENCE", code: sr.code, name: sr.title, status: unresolved[0]?.status ?? UNKNOWN, detail: `No verified evidence; ${ev.length} record(s) unresolved.`, link: `/traceability/${missionId}` });
          } else if (unresolved.length) {
            gaps.push({ id: `evp-${sr.id}`, kind: "EVIDENCE", code: sr.code, name: sr.title, status: UNVERIFIED, detail: `Verified evidence exists, but ${unresolved.length} record(s) remain UNVERIFIED/UNKNOWN.`, link: `/traceability/${missionId}` });
          }
        }

        if (sr.designs.length === 0) {
          gaps.push({ id: `dc-${sr.id}`, kind: "DESIGN", code: sr.code, name: sr.title, status: UNKNOWN, detail: "No design component linked.", link: `/traceability/${missionId}` });
        }
        for (const dc of sr.designs) {
          if (dc.issues.length === 0) {
            gaps.push({ id: `is-${dc.id}`, kind: "ISSUE", code: dc.code, name: dc.name, status: UNKNOWN, detail: "No engineering issue linked.", link: `/traceability/${missionId}` });
          }
          for (const iss of dc.issues) {
            if (iss.status === "done") {
              const merged = iss.links.some((l: Row) => l.pr_state === "merged");
              if (!merged) {
                const state = iss.links[0]?.pr_state ?? UNKNOWN;
                gaps.push({ id: `pr-${iss.id}`, kind: "CODE", code: iss.key, name: iss.title, status: state === "open" ? UNVERIFIED : state, detail: "Issue is done but no merged pull request is linked.", link: `/traceability/${missionId}` });
              }
            }
            if (iss.status === "done" && iss.artifacts.length === 0) {
              gaps.push({ id: `art-${iss.id}`, kind: "ARTIFACT", code: iss.key, name: iss.title, status: UNKNOWN, detail: "Done issue has no build artifact.", link: `/traceability/${missionId}` });
            }
            for (const art of iss.artifacts) {
              if (art.status === "UNKNOWN") {
                gaps.push({ id: `artu-${art.id}`, kind: "ARTIFACT", code: art.name, name: art.version, status: UNKNOWN, detail: "Artifact build status UNKNOWN.", link: `/traceability/${missionId}` });
              }
              if (art.approvals.length === 0) {
                gaps.push({ id: `aprm-${art.id}`, kind: "APPROVAL", code: art.name, name: art.version, status: UNKNOWN, detail: "No deployment approval record.", link: "/approvals" });
              } else {
                for (const apr of art.approvals) {
                  if (apr.status === "pending" || apr.status === "UNKNOWN" || apr.status === "rejected") {
                    gaps.push({ id: `apr-${apr.id}`, kind: "APPROVAL", code: `${apr.environment}`, name: `${art.name} ${art.version}`, status: apr.status, detail: `Deployment approval ${apr.status.toLowerCase()}${apr.note ? ` — ${apr.note}` : ""}.`, link: "/approvals" });
                  }
                }
              }
              if (art.validations.length === 0) {
                gaps.push({ id: `valm-${art.id}`, kind: "VALIDATION", code: art.name, name: art.version, status: UNKNOWN, detail: "No operational validation record.", link: `/traceability/${missionId}` });
              }
              for (const val of art.validations) {
                if (val.status !== "validated") {
                  gaps.push({ id: `val-${val.id}`, kind: "VALIDATION", code: art.name, name: art.version, status: val.status, detail: `Operational validation ${val.status.toLowerCase()}.`, link: `/traceability/${missionId}` });
                }
              }
              if (art.releases.length === 0) {
                gaps.push({ id: `relm-${art.id}`, kind: "RELEASE", code: art.name, name: art.version, status: UNKNOWN, detail: "No release record.", link: `/traceability/${missionId}` });
              }
              for (const rel of art.releases) {
                if (rel.status !== "released") {
                  gaps.push({ id: `rel-${rel.id}`, kind: "RELEASE", code: rel.version, name: art.name, status: rel.status, detail: `Release is ${rel.status.toLowerCase()}.`, link: `/traceability/${missionId}` });
                }
              }
            }
          }
        }
      }
    }
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// Hazmat: containers, accountability buckets, issue ledger, inspections
// ---------------------------------------------------------------------------

export const BUCKET_KEYS = [
  "AVAILABLE",
  "RESERVED",
  "ISSUED",
  "RETURN_HOLD",
  "QUARANTINED",
  "EXPIRED",
  "DISPOSITION_PENDING",
  "DISPOSED",
] as const;

export type BucketKey = (typeof BUCKET_KEYS)[number];

const BUCKET_OF: Record<string, BucketKey | null> = {
  AVAILABLE: "AVAILABLE",
  RESERVED: "RESERVED",
  ISSUED: "ISSUED",
  IN_CUSTODY: "ISSUED",
  IN_USE: "ISSUED",
  RETURN_INITIATED: "ISSUED",
  RETURN_RECEIVED: "RETURN_HOLD",
  RETURN_HOLD: "RETURN_HOLD",
  INSPECTED: "RETURN_HOLD",
  RESTOCK_APPROVED: "RETURN_HOLD",
  RELABEL_REQUIRED: "RETURN_HOLD",
  QUARANTINED: "QUARANTINED",
  EXPIRED: "EXPIRED",
  DISPOSITION_REQUIRED: "DISPOSITION_PENDING",
  DISPOSED: "DISPOSED",
  FULLY_CONSUMED: null,
  UNKNOWN: null,
};

export function bucketOf(state: string): BucketKey | null {
  return BUCKET_OF[state] ?? null;
}

function quant(value: unknown): Dec | null {
  return typeof value === "string" ? parseDec(value) : null;
}

export function listMaterials() {
  return all("SELECT * FROM materials ORDER BY material_code").map((m) => ({
    ...m,
    nominal_dec: quant(m.nominal_quantity_per_container),
    partial_allowed: m.partial_container_accounting === 1,
  }));
}

export function listContainers() {
  const rows = all(
    `SELECT c.*, m.name AS material_name, m.material_code, m.category,
            m.measurement_basis, m.unit_of_issue, m.package_description,
            m.shelf_life_days, m.partial_container_accounting
     FROM containers c JOIN materials m ON m.id = c.material_id
     ORDER BY c.container_code`
  );
  const txns = all("SELECT * FROM issue_transactions ORDER BY issued_at DESC");
  const inspections = all("SELECT * FROM return_inspections ORDER BY received_at DESC");

  return rows.map((c) => {
    const txn = txns.find((t) => t.container_id === c.id) ?? null;
    const inspection = inspections.find((i) => i.container_id === c.id) ?? null;
    const nominal = quant(c.nominal_quantity);
    const current = quant(c.current_quantity);
    return {
      ...c,
      nominal,
      current,
      txn,
      inspection,
      bucket: bucketOf(c.state),
      expiry_state: shelfState(c.expires_at),
      days_to_expiry: daysUntil(c.expires_at),
      remaining_fraction: percentOf(current, nominal),
      variance: txn ? txnVariance(txn) : null,
      outstanding: txn ? txnOutstanding(txn) : null,
    };
  });
}

function txnVariance(t: Row): Dec | null {
  const issued = quant(t.issued_quantity);
  const consumed = quant(t.consumed_quantity);
  const returned = quant(t.returned_quantity);
  const disposed = quant(t.disposed_quantity);
  if (!issued || !consumed || !returned || !disposed) return null;
  return sub(sub(issued, consumed), add(returned, disposed));
}

function txnOutstanding(t: Row): Dec | null {
  const issued = quant(t.issued_quantity);
  if (!issued) return null;
  const returned = quant(t.returned_quantity) ?? ZERO;
  const disposed = quant(t.disposed_quantity) ?? ZERO;
  return sub(sub(issued, returned), disposed);
}

export interface BucketCell {
  key: BucketKey;
  quantity: Dec | null;
  unknownCount: number;
  count: number;
}

export interface MaterialRollup {
  material: Row;
  buckets: BucketCell[];
  onHand: Dec | null;
  onHandUnknown: number;
  containers: Row[];
  unknownQuantity: number;
}

export function inventoryByMaterial(): MaterialRollup[] {
  const containers = listContainers();
  return listMaterials().map((material) => {
    const own = containers.filter((c) => c.material_id === material.id);
    const buckets: BucketCell[] = BUCKET_KEYS.map((key) => {
      const inBucket = own.filter((c) => c.bucket === key);
      const quantities = inBucket.map((c) => containerBucketQty(c, key));
      const known = sum(quantities.filter((q): q is Dec => q !== null));
      return {
        key,
        quantity: known,
        unknownCount: quantities.filter((q) => q === null).length,
        count: inBucket.length,
      };
    });

    const onHandBuckets = buckets.filter((b) => b.key !== "DISPOSED");
    const onHandKnown = sum(
      onHandBuckets.map((b) => {
        if (b.count === 0) return ZERO;
        return b.quantity;
      })
    );

    return {
      material,
      buckets,
      onHand: onHandKnown,
      onHandUnknown: onHandBuckets.reduce((n, b) => n + b.unknownCount, 0),
      containers: own,
      unknownQuantity: own.filter((c) => c.current === null && c.bucket !== "DISPOSED").length,
    };
  });
}

function containerBucketQty(c: Row, key: BucketKey): Dec | null {
  if (key === "ISSUED") {
    if (c.txn) return txnOutstanding(c.txn);
    return c.current;
  }
  if (key === "DISPOSED") {
    return quant(c.txn?.disposed_quantity) ?? c.current;
  }
  return c.current;
}

export function listTransactions() {
  return all(
    `SELECT t.*, c.container_code, c.state AS container_state,
            m.name AS material_name, m.material_code, m.package_description
     FROM issue_transactions t
     JOIN containers c ON c.id = t.container_id
     JOIN materials m ON m.id = c.material_id
     ORDER BY t.issued_at DESC`
  ).map((t) => ({
    ...t,
    issued: quant(t.issued_quantity),
    consumed: quant(t.consumed_quantity),
    returned: quant(t.returned_quantity),
    disposed: quant(t.disposed_quantity),
    variance: txnVariance(t),
    outstanding: txnOutstanding(t),
  }));
}

export function listInspections() {
  return all(
    `SELECT i.*, c.container_code, c.state AS container_state, c.nominal_quantity,
            c.current_quantity, c.unit_of_measure, m.name AS material_name
     FROM return_inspections i
     JOIN containers c ON c.id = i.container_id
     JOIN materials m ON m.id = c.material_id
     ORDER BY CASE i.outcome WHEN 'PENDING' THEN 0 ELSE 1 END, i.received_at DESC`
  ).map((i) => ({
    ...i,
    declared: quant(i.declared_quantity),
    measured: quant(i.measured_quantity),
    pending: i.outcome === "PENDING",
    completed: checklistCount(i),
  }));
}

function checklistCount(i: Row): { confirmed: number; unknown: number } {
  const fields = [
    "identity_verified", "correct_material", "label_intact", "shelf_life_valid",
    "container_damaged", "contamination_suspected", "quantity_verified",
    "storage_compatibility_valid",
  ];
  let confirmed = 0;
  let unknown = 0;
  for (const f of fields) {
    if (i[f] === null || i[f] === undefined) unknown++;
    else confirmed++;
  }
  return { confirmed, unknown };
}

export function listLedger(containerId: string) {
  return all(
    "SELECT * FROM container_ledger WHERE container_id = ? ORDER BY occurred_at DESC, id DESC",
    containerId
  );
}

export function recentLedger(limit = 60) {
  return all(
    `SELECT l.*, c.container_code, c.unit_of_measure, m.name AS material_name
     FROM container_ledger l
     JOIN containers c ON c.id = l.container_id
     JOIN materials m ON m.id = c.material_id
     ORDER BY l.occurred_at DESC, l.id DESC
     LIMIT ?`,
    limit
  );
}

export function listIssueRequests() {
  return all(
    `SELECT r.*, m.material_code, m.name AS material_name, m.package_description
     FROM issue_requests r JOIN materials m ON m.id = r.material_id
     ORDER BY r.created_at DESC`
  ).map((r) => ({
    ...r,
    authorized: quant(r.authorized_quantity),
  }));
}

export function containerDetail(id: string) {
  const container = listContainers().find((c) => c.id === id);
  if (!container) return null;
  const checks = all(
    "SELECT * FROM container_checks WHERE container_id = ? ORDER BY due_at",
    id
  );
  return {
    container,
    ledger: listLedger(id),
    transactions: listTransactions().filter((t) => t.container_id === id),
    inspections: listInspections().filter((i) => i.container_id === id),
    checks,
    allowed: CONTAINER_TRANSITIONS[container.state] ?? [],
  };
}

export function stateCounts() {
  const containers = listContainers();
  const counts: Record<string, number> = {};
  for (const c of containers) counts[c.state] = (counts[c.state] ?? 0) + 1;
  return counts;
}

/**
 * Record a partial-use return.
 *
 * The container goes RETURN_INITIATED -> RETURN_RECEIVED -> RETURN_HOLD. It
 * never goes straight to AVAILABLE, and the returned quantity is stored as
 * declared/estimated until an inspector measures it.
 */
export function recordReturn(input: {
  container_id: string;
  returned_quantity: Dec;
  measurement_method: string;
  actor: string;
  notes?: string;
}) {
  const container = one<Row>("SELECT * FROM containers WHERE id = ?", input.container_id);
  if (!container) throw new Error(`Unknown container ${input.container_id}`);
  if (!IN_CUSTODY_STATES.includes(container.state) && container.state !== "RETURN_RECEIVED") {
    throw new Error(
      `Container ${container.container_code} is ${container.state}; only containers in custody can be returned.`
    );
  }
  if (cmp(input.returned_quantity, ZERO) < 0) {
    throw new Error("returned_quantity cannot be negative.");
  }
  const nominal = quant(container.nominal_quantity);
  if (nominal && cmp(input.returned_quantity, nominal) > 0) {
    throw new Error(
      `returned_quantity exceeds the container nominal quantity of ${formatDec(nominal)} ${container.unit_of_measure}.`
    );
  }
  if (!input.actor?.trim()) throw new Error("A named actor is required to receive a return.");

  const now = new Date().toISOString();
  const id = `ret-${Date.now().toString(36)}`;
  const returnedText = formatDec(input.returned_quantity);
  const measured = input.measurement_method === "MEASURED";

  // A declared/estimated remainder is NOT written into current_quantity: that
  // column is the accountable quantity. The declaration lives on the
  // inspection record until an inspector measures it.
  run(
    "UPDATE containers SET current_quantity = ?, seal_status = 'OPENED' WHERE id = ?",
    measured ? returnedText : null,
    input.container_id
  );

  const events: [string, string][] = [
    ["RETURN_INITIATED", "UNVERIFIED"],
    ["RETURN_RECEIVED", measured ? "VERIFIED" : "UNVERIFIED"],
    ["RETURN_HOLD", "UNVERIFIED"],
  ];
  events.forEach(([event, status], idx) => {
    run(
      `INSERT INTO container_ledger (id, container_id, occurred_at, event, actor, status, quantity_delta, notes, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `${id}-led-${idx}`,
      input.container_id,
      now,
      event,
      input.actor,
      status,
      event === "RETURN_RECEIVED" ? returnedText : null,
      idx === 2 ? "Held for inspection; not returned to stock." : input.notes ?? null,
      null
    );
  });

  run("UPDATE containers SET state = 'RETURN_HOLD', state_reason = ? WHERE id = ?",
    "Returned; eight-point inspection pending", input.container_id);

  // Close out the open issue, or record a standalone return.
  const txn = one<Row>(
    "SELECT * FROM issue_transactions WHERE container_id = ? ORDER BY issued_at DESC LIMIT 1",
    input.container_id
  );
  if (txn) {
    const issued = quant(txn.issued_quantity);
    const consumed = issued ? sub(issued, input.returned_quantity) : null;
    run(
      `UPDATE issue_transactions
       SET returned_quantity = ?, consumed_quantity = ?, returned_at = ?, status = ?,
           measurement_basis = ?, disposed_quantity = COALESCE(disposed_quantity, '0.000')
       WHERE id = ?`,
      returnedText,
      consumed ? formatDec(consumed) : null,
      now,
      input.measurement_method === "MEASURED" ? "CLOSED" : "UNVERIFIED",
      txn.measurement_basis,
      txn.id
    );
  }

  const inspId = `insp-${Date.now().toString(36)}`;
  run(
    `INSERT INTO return_inspections
       (id, container_id, received_at, measurement_method, declared_quantity, measured_quantity, outcome, notes)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    inspId,
    input.container_id,
    now,
    input.measurement_method,
    returnedText,
    input.measurement_method === "MEASURED" ? returnedText : null,
    "Awaiting eight-point inspection. Return quantity is not yet confirmed."
  );

  appendAuditEvent({
    plane: "OPERATIONAL",
    event_type: "MATERIAL_RETURNED",
    source: "hlift.operational",
    subject_id: input.actor,
    resource_type: "container",
    resource_id: input.container_id,
    severity: "INFO",
    outcome: "RETURN_HOLD",
    payload: {
      returned_quantity: returnedText,
      measurement_method: input.measurement_method,
      inspection_id: inspId,
      verified: measured,
    },
  });

  return {
    container: listContainers().find((c) => c.id === input.container_id),
    inspection: listInspections().find((i) => i.id === inspId),
  };
}

const CHECK_FIELDS = [
  "identity_verified",
  "correct_material",
  "label_intact",
  "shelf_life_valid",
  "container_damaged",
  "contamination_suspected",
  "quantity_verified",
  "storage_compatibility_valid",
] as const;

const OUTCOME_STATE: Record<string, string> = {
  ACCEPT: "AVAILABLE",
  RELABEL: "RELABEL_REQUIRED",
  QUARANTINE: "QUARANTINED",
  DISPOSITION: "DISPOSITION_REQUIRED",
};

export function decideInspection(input: {
  inspection_id: string;
  inspector: string;
  outcome: "ACCEPT" | "RELABEL" | "QUARANTINE" | "DISPOSITION";
  checks: Record<string, boolean | null>;
  measured_quantity?: Dec | null;
  measurement_method?: string | null;
  notes?: string;
}) {
  const insp = one<Row>("SELECT * FROM return_inspections WHERE id = ?", input.inspection_id);
  if (!insp) throw new Error(`Unknown inspection ${input.inspection_id}`);
  if (insp.outcome !== "PENDING") throw new Error(`Inspection is already ${insp.outcome}.`);
  if (!input.inspector?.trim()) throw new Error("A named inspector is required.");

  const unknownChecks = CHECK_FIELDS.filter((f) => input.checks[f] === null || input.checks[f] === undefined);
  const method = input.measurement_method ?? insp.measurement_method;

  // ACCEPT is the only path back to available stock, and it demands a complete,
  // passing checklist plus an independently measured quantity.
  if (input.outcome === "ACCEPT") {
    if (unknownChecks.length) {
      throw new Error(
        `Cannot ACCEPT: ${unknownChecks.length} checklist item(s) are UNKNOWN (${unknownChecks.join(", ")}).`
      );
    }
    const failing = CHECK_FIELDS.filter((f) => {
      const value = input.checks[f];
      return f === "container_damaged" || f === "contamination_suspected" ? value === true : value === false;
    });
    if (failing.length) throw new Error(`Cannot ACCEPT: failed checks (${failing.join(", ")}).`);
    if (!input.measured_quantity) throw new Error("Cannot ACCEPT without a measured remaining quantity.");
    if (method !== "MEASURED") throw new Error("Cannot ACCEPT without measurement_method = MEASURED.");
  }
  if (input.outcome === "RELABEL" && unknownChecks.length) {
    throw new Error(`Cannot RELABEL with ${unknownChecks.length} UNKNOWN checklist item(s).`);
  }

  const now = new Date().toISOString();
  const measured = input.measured_quantity ?? null;
  const declared = quant(insp.declared_quantity);
  // Only a measurement may become the accountable quantity. A declared
  // remainder is retained on the inspection record as UNVERIFIED evidence.
  const accountable = measured ?? (input.outcome === "ACCEPT" ? null : quant(insp.measured_quantity));
  const finalQuantity = input.outcome === "ACCEPT" ? measured : accountable ?? declared;
  const values = CHECK_FIELDS.map((f) => {
    const v = input.checks[f];
    return v === true ? 1 : v === false ? 0 : null;
  });

  run(
    `UPDATE return_inspections SET
       inspected_at = ?, inspector = ?, measurement_method = ?, measured_quantity = ?,
       identity_verified = ?, correct_material = ?, label_intact = ?, shelf_life_valid = ?,
       container_damaged = ?, contamination_suspected = ?, quantity_verified = ?,
       storage_compatibility_valid = ?, outcome = ?, notes = ?
     WHERE id = ?`,
    now,
    input.inspector.trim(),
    method ?? "UNKNOWN",
    measured ? formatDec(measured) : insp.measured_quantity,
    ...values,
    input.outcome,
    input.notes ?? insp.notes,
    input.inspection_id
  );

  const container = one<Row>("SELECT * FROM containers WHERE id = ?", insp.container_id);
  if (!container) throw new Error("Inspection container missing.");

  const target = OUTCOME_STATE[input.outcome];
  const movements =
    input.outcome === "ACCEPT"
      ? (["INSPECTED", "RESTOCK_APPROVED", "AVAILABLE"] as string[])
      : input.outcome === "RELABEL"
        ? (["INSPECTED", "RELABEL_REQUIRED"] as string[])
        : input.outcome === "QUARANTINE"
          ? (["INSPECTED", "QUARANTINED"] as string[])
          : (["INSPECTED", "DISPOSITION_REQUIRED"] as string[]);

  movements.forEach((event, idx) => {
    run(
      `INSERT INTO container_ledger (id, container_id, occurred_at, event, actor, status, quantity_delta, notes, payload)
       VALUES (?, ?, ?, ?, ?, 'VERIFIED', ?, ?, NULL)`,
      `${input.inspection_id}-d-${idx}`,
      insp.container_id,
      now,
      event,
      input.inspector.trim(),
      event === "AVAILABLE" && finalQuantity ? formatDec(finalQuantity) : null,
      idx === 0 ? `Inspection outcome ${input.outcome}.` : input.notes ?? null
    );
  });

  run(
    `UPDATE containers SET state = ?, state_reason = ?, current_quantity = COALESCE(?, current_quantity)
     WHERE id = ?`,
    target,
    `Inspection ${input.outcome} by ${input.inspector.trim()}`,
    accountable ? formatDec(accountable) : null,
    insp.container_id
  );

  appendAuditEvent({
    plane: "OPERATIONAL",
    event_type: "MATERIAL_INSPECTED",
    source: "hlift.operational",
    subject_id: input.inspector.trim(),
    resource_type: "container",
    resource_id: insp.container_id,
    severity: input.outcome === "ACCEPT" ? "INFO" : "MEDIUM",
    outcome: input.outcome,
    payload: {
      inspection_id: input.inspection_id,
      measured_quantity: measured ? formatDec(measured) : null,
      measurement_method: method,
      checklist: input.checks,
      target_state: target,
    },
  });

  return {
    inspection: listInspections().find((i) => i.id === input.inspection_id),
    container: listContainers().find((c) => c.id === insp.container_id),
    state: target,
  };
}

export function transitionContainer(id: string, to: string, actor: string, notes?: string) {
  const container = one<Row>("SELECT * FROM containers WHERE id = ?", id);
  if (!container) throw new Error(`Unknown container ${id}`);
  if (!actor?.trim()) throw new Error("A named actor is required for a lifecycle transition.");
  if (!canTransition(CONTAINER_TRANSITIONS, container.state, to)) {
    throw new Error(`Illegal transition ${container.state} -> ${to} for ${container.container_code}.`);
  }
  if (to === "AVAILABLE") {
    const accepted = one<Row>(
      "SELECT * FROM return_inspections WHERE container_id = ? AND outcome = 'ACCEPT' ORDER BY inspected_at DESC LIMIT 1",
      id
    );
    if (!accepted) {
      throw new Error(
        `Cannot return ${container.container_code} to AVAILABLE without an ACCEPTED inspection.`
      );
    }
  }
  const now = new Date().toISOString();
  run("UPDATE containers SET state = ?, state_reason = ? WHERE id = ?", to, notes ?? `Transition to ${to}`, id);
  run(
    `INSERT INTO container_ledger (id, container_id, occurred_at, event, actor, status, quantity_delta, notes, payload)
     VALUES (?, ?, ?, ?, ?, 'VERIFIED', NULL, ?, NULL)`,
    `led-${Date.now().toString(36)}`,
    id,
    now,
    to,
    actor.trim(),
    notes ?? null
  );
  appendAuditEvent({
    plane: "OPERATIONAL",
    event_type: "CONTAINER_TRANSITION",
    source: "hlift.operational",
    subject_id: actor.trim(),
    resource_type: "container",
    resource_id: id,
    severity: "INFO",
    outcome: to,
    payload: { from: container.state, to, notes: notes ?? null },
  });
  return listContainers().find((c) => c.id === id);
}

export function quarterlyChecks() {
  return all(
    `SELECT k.*, c.container_code, c.state AS container_state, c.unit_of_measure,
            m.name AS material_name
     FROM container_checks k
     JOIN containers c ON c.id = k.container_id
     JOIN materials m ON m.id = c.material_id
     ORDER BY CASE k.status WHEN 'OVERDUE' THEN 0 WHEN 'DUE' THEN 1 WHEN 'UNKNOWN' THEN 2 ELSE 3 END, k.due_at`
  );
}

export function expirations() {
  return listContainers().sort((a, b) => (a.days_to_expiry ?? 99999) - (b.days_to_expiry ?? 99999));
}

export function hazmatSummary() {
  const materials = listMaterials();
  const containers = listContainers();
  const inspections = listInspections();
  const txns = listTransactions();
  const checks = quarterlyChecks();
  const states = stateCounts();
  const held = containers.filter((c) => RETURN_HOLD_STATES.includes(c.state));

  return {
    materials: materials.length,
    containers: containers.length,
    available: states.AVAILABLE ?? 0,
    reserved: states.RESERVED ?? 0,
    issued: containers.filter((c) => IN_CUSTODY_STATES.includes(c.state)).length,
    returnHold: held.length,
    quarantined: states.QUARANTINED ?? 0,
    expired: states.EXPIRED ?? 0,
    dispositionPending: states.DISPOSITION_REQUIRED ?? 0,
    disposed: states.DISPOSED ?? 0,
    consumed: states.FULLY_CONSUMED ?? 0,
    unknownState: states.UNKNOWN ?? 0,
    unknownQuantity: containers.filter(
      (c) => c.current === null && !["DISPOSED", "FULLY_CONSUMED"].includes(c.state)
    ).length,
    unknownExpiry: containers.filter(
      (c) => c.expiry_state === UNKNOWN && !["DISPOSED", "FULLY_CONSUMED"].includes(c.state)
    ).length,
    inspectionsPending: inspections.filter((i) => i.pending).length,
    inspectionsAccepted: inspections.filter((i) => i.outcome === "ACCEPT").length,
    varianceCount: txns.filter((t) => t.variance !== null && !isZero(t.variance)).length,
    unverifiedTransactions: txns.filter((t) => t.status === "UNVERIFIED").length,
    checksOverdue: checks.filter((c) => c.status === "OVERDUE").length,
    checksDue: checks.filter((c) => c.status === "DUE").length,
    checksUnknown: checks.filter((c) => c.status === UNKNOWN).length,
    states,
  };
}

export function hazmatGaps(): Gap[] {
  const gaps: Gap[] = [];
  for (const c of listContainers()) {
    const active = !["DISPOSED", "FULLY_CONSUMED"].includes(c.state);
    const link = `/hazmat/containers/${c.id}`;

    if (active && c.expiry_state === UNKNOWN) {
      gaps.push({
        id: `hz-exp-${c.id}`, kind: "HAZMAT", code: c.container_code, name: c.material_name,
        status: UNKNOWN, detail: "Expiry date not recorded on the container.", link,
      });
    }
    if (active && c.current === null) {
      gaps.push({
        id: `hz-qty-${c.id}`, kind: "HAZMAT_QTY", code: c.container_code, name: c.material_name,
        status: UNKNOWN, detail: "Remaining quantity not recorded; container quantity UNKNOWN.", link,
      });
    }
    if (c.state === "QUARANTINED") {
      gaps.push({
        id: `hz-q-${c.id}`, kind: "HAZMAT", code: c.container_code, name: c.material_name,
        status: "QUARANTINED", detail: "Container quarantined and unavailable.", link,
      });
    }
    if (c.state === "EXPIRED") {
      gaps.push({
        id: `hz-x-${c.id}`, kind: "HAZMAT", code: c.container_code, name: c.material_name,
        status: "EXPIRED", detail: "Container past expiry; disposition required.", link,
      });
    }
    if (c.state === "DISPOSITION_REQUIRED") {
      gaps.push({
        id: `hz-d-${c.id}`, kind: "DISPOSITION", code: c.container_code, name: c.material_name,
        status: "DISPOSITION_REQUIRED", detail: "Inspection requires a disposition decision.", link,
      });
    }
    if (c.state === "RELABEL_REQUIRED") {
      gaps.push({
        id: `hz-r-${c.id}`, kind: "HAZMAT", code: c.container_code, name: c.material_name,
        status: "UNVERIFIED", detail: "Container requires relabelling before restock.", link,
      });
    }
  }

  for (const insp of listInspections()) {
    if (insp.pending) {
      gaps.push({
        id: `hz-insp-${insp.id}`, kind: "INSPECTION", code: insp.container_code, name: insp.material_name,
        status: UNKNOWN, detail: "Return held; eight-point inspection not completed.", link: "/hazmat/returns",
      });
    }
  }

  for (const txn of listTransactions()) {
    if (txn.variance !== null && !isZero(txn.variance)) {
      gaps.push({
        id: `hz-var-${txn.id}`, kind: "QUANTITY_VARIANCE", code: txn.container_code, name: txn.txn_code,
        status: UNVERIFIED,
        detail: `${formatDec(txn.variance)} ${txn.unit_of_measure} unaccounted (issued ${formatDec(txn.issued)} − consumed ${formatDec(txn.consumed)} − returned ${formatDec(txn.returned)} − disposed ${formatDec(txn.disposed)}). Not written off.`,
        link: "/hazmat/issues",
      });
    }
    if (txn.status === "UNVERIFIED") {
      gaps.push({
        id: `hz-txn-${txn.id}`, kind: "RETURN_QUANTITY", code: txn.container_code, name: txn.txn_code,
        status: UNVERIFIED, detail: "Returned quantity declared or estimated; not independently measured.", link: "/hazmat/returns",
      });
    }
  }

  for (const chk of quarterlyChecks()) {
    if (chk.status === "OVERDUE" || chk.status === UNKNOWN) {
      gaps.push({
        id: `chk-${chk.id}`, kind: "QUARTERLY_CHECK", code: chk.container_code, name: chk.quarter,
        status: chk.status,
        detail: chk.status === "OVERDUE" ? `Quarterly check overdue (due ${chk.due_at.slice(0, 10)}).` : "Check status UNKNOWN.",
        link: "/hazmat/quarterly",
      });
    }
  }

  return gaps;
}

export function evidenceGaps(): Gap[] {
  const m = loadTrace();
  const gaps: Gap[] = [];
  for (const mr of m.missions) {
    gaps.push(...gapRowsForMission(m, mr.id, chainFor(m, mr.id)));
  }
  gaps.push(...hazmatGaps());
  return gaps;
}

// ---------------------------------------------------------------------------
// Operational control views
// ---------------------------------------------------------------------------

export const listConflicts = () => all("SELECT * FROM conflicts ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'UNKNOWN' THEN 1 ELSE 2 END, detected_at DESC");
export const listSyncNodes = () => all("SELECT * FROM sync_nodes ORDER BY name");
export const listHitl = () => all("SELECT * FROM hitl_exceptions ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'UNKNOWN' THEN 1 ELSE 2 END, created_at DESC");
export const listSecurity = () => all("SELECT * FROM security_events ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'UNKNOWN' THEN 1 ELSE 2 END, occurred_at DESC");
export const listBlockers = () => all("SELECT * FROM blockers ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'UNKNOWN' THEN 1 ELSE 2 END, created_at DESC");

export function listApprovals() {
  return all(
    `SELECT a.*, b.name AS artifact_name, b.version AS artifact_version,
            b.container_image, b.status AS artifact_status
     FROM deployment_approvals a JOIN build_artifacts b ON b.id = a.artifact_id
     ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'UNKNOWN' THEN 1 ELSE 2 END, a.requested_at DESC`
  );
}

export function decideApproval(id: string, action: "approve" | "reject", approver: string, note?: string) {
  const apr = one<Row>("SELECT * FROM deployment_approvals WHERE id = ?", id);
  if (!apr) throw new Error(`Unknown approval ${id}`);
  if (!["pending", UNKNOWN].includes(apr.status)) {
    throw new Error(`Approval ${id} is already ${apr.status}.`);
  }
  if (!approver?.trim()) throw new Error("An approver identity is required.");
  run(
    `UPDATE deployment_approvals SET status = ?, approver = ?, decided_at = ?, note = COALESCE(?, note) WHERE id = ?`,
    action === "approve" ? "approved" : "rejected",
    approver.trim(),
    new Date().toISOString(),
    note ?? null,
    id
  );
  appendAuditEvent({
    plane: "GOVERNANCE",
    event_type: "RELEASE_DECISION",
    source: "hlift.governance",
    subject_id: approver.trim(),
    resource_type: "deployment_approval",
    resource_id: id,
    severity: "MEDIUM",
    outcome: action === "approve" ? "APPROVED" : "REJECTED",
    payload: { environment: apr.environment, artifact_id: apr.artifact_id, note: note ?? null },
  });
  return one<Row>("SELECT * FROM deployment_approvals WHERE id = ?", id);
}

export function decideHitl(id: string, action: "approve" | "reject", decidedBy: string, note?: string) {
  const hx = one<Row>("SELECT * FROM hitl_exceptions WHERE id = ?", id);
  if (!hx) throw new Error(`Unknown HITL exception ${id}`);
  if (!["OPEN", UNKNOWN].includes(hx.status)) {
    throw new Error(`Exception ${id} is already ${hx.status}.`);
  }
  if (!decidedBy?.trim()) throw new Error("A decider identity is required.");
  run(
    `UPDATE hitl_exceptions SET status = ?, decided_by = ?, decided_at = ?, decision_note = COALESCE(?, decision_note) WHERE id = ?`,
    action === "approve" ? "APPROVED" : "REJECTED",
    decidedBy.trim(),
    new Date().toISOString(),
    note ?? null,
    id
  );
  appendAuditEvent({
    plane: "GOVERNANCE",
    event_type: "EXCEPTION_DECISION",
    source: "hlift.governance",
    subject_id: decidedBy.trim(),
    resource_type: "hitl_exception",
    resource_id: id,
    severity: hx.severity,
    outcome: action === "approve" ? "APPROVED" : "REJECTED",
    payload: { code: hx.code, linked_kind: hx.linked_kind, linked_id: hx.linked_id, note: note ?? null },
  });
  return one<Row>("SELECT * FROM hitl_exceptions WHERE id = ?", id);
}

export function resolveConflict(id: string, resolution: string, actor?: string) {
  const cf = one<Row>("SELECT * FROM conflicts WHERE id = ?", id);
  if (!cf) throw new Error(`Unknown conflict ${id}`);
  if (!resolution?.trim()) throw new Error("A resolution note is required.");
  run(
    `UPDATE conflicts SET status = 'resolved', resolved_at = ?, resolution = ? WHERE id = ?`,
    new Date().toISOString(),
    resolution.trim(),
    id
  );
  appendAuditEvent({
    plane: "OPERATIONAL",
    event_type: "CONFLICT_RESOLVED",
    source: "hlift.operational",
    subject_id: actor ?? "UNKNOWN",
    resource_type: "conflict",
    resource_id: id,
    severity: cf.severity,
    outcome: "RESOLVED",
    payload: { code: cf.code, resolution: resolution.trim() },
  });
  return one<Row>("SELECT * FROM conflicts WHERE id = ?", id);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function overview() {
  const count = (table: string, where = "1=1") =>
    one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)?.n ?? 0;

  const approvals = listApprovals();
  const hazmat = hazmatSummary();
  const gaps = evidenceGaps();

  return {
    requirements: {
      missions: count("mission_requirements"),
      needs: count("operational_needs"),
      capabilities: count("capabilities"),
      system: count("system_requirements"),
    },
    delivery: {
      issues: count("engineering_issues"),
      inProgress: count("engineering_issues", "status = 'in_progress'"),
      done: count("engineering_issues", "status = 'done'"),
      openPrs: count("code_links", "pr_state = 'open'"),
      failingChecks: count("code_links", "checks_status = 'failing'"),
      artifacts: count("build_artifacts"),
      unknownArtifacts: count("build_artifacts", "status = 'UNKNOWN'"),
    },
    approvals: {
      pending: approvals.filter((a) => a.status === "pending").length,
      unknown: approvals.filter((a) => a.status === UNKNOWN).length,
      approved: approvals.filter((a) => a.status === "approved").length,
    },
    hazmat,
    control: {
      openConflicts: count("conflicts", "status = 'open'"),
      unknownConflicts: count("conflicts", "status = 'UNKNOWN'"),
      openHitl: count("hitl_exceptions", "status = 'OPEN'"),
      openSecurity: count("security_events", "status = 'OPEN'"),
      openBlockers: count("blockers", "status = 'OPEN'"),
      syncAttention: count("sync_nodes", "status IN ('pending','conflict','offline')"),
      syncUnknown: count("sync_nodes", "status = 'UNKNOWN'"),
    },
    evidenceGaps: {
      total: gaps.length,
      unknown: gaps.filter((g) => g.status === UNKNOWN).length,
      unverified: gaps.filter((g) => g.status === UNVERIFIED).length,
      failed: gaps.filter((g) => g.status === "FAILED").length,
      byKind: gaps.reduce<Record<string, number>>((acc, g) => {
        acc[g.kind] = (acc[g.kind] ?? 0) + 1;
        return acc;
      }, {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Weekly status (HLIFT-WSR v1 — see src/lib/weekly.ts)
// ---------------------------------------------------------------------------

export function weeklyData() {
  const ov = overview();
  const gaps = evidenceGaps();
  const approvals = listApprovals().filter((a) => a.status === "pending" || a.status === UNKNOWN);
  const hitl = listHitl().filter((h) => h.status === "OPEN" || h.status === UNKNOWN);
  const blockers = listBlockers().filter((b) => b.status === "OPEN");
  const security = listSecurity().filter((s) => s.status === "OPEN");
  const conflicts = listConflicts().filter((c) => c.status === "open" || c.status === UNKNOWN);
  const checks = quarterlyChecks();
  const txns = listTransactions();
  const returns = txns.filter((t) => t.returned !== null && !isZero(t.returned));
  const inspections = listInspections();
  const rollup = inventoryByMaterial();
  const nodes = listSyncNodes();

  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const firstJan = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - firstJan.getTime()) / 864e5 + firstJan.getDay() + 1) / 7);

  return {
    report: {
      title: "H-LIFT Weekly Status",
      format: "HLIFT-WSR v1",
      week: `${now.getFullYear()}-W${String(week).padStart(2, "0")}`,
      period_start: monday.toISOString().slice(0, 10),
      period_end: sunday.toISOString().slice(0, 10),
      generated_at: now.toISOString(),
      store: "H-LIFT operations",
      delta_vs_previous: UNKNOWN,
    },
    overview: ov,
    requirements: all(
      `SELECT status, COUNT(*) AS n FROM mission_requirements GROUP BY status
       UNION ALL SELECT 'NEEDS:' || status, COUNT(*) FROM operational_needs GROUP BY status
       UNION ALL SELECT 'CAPS:' || status, COUNT(*) FROM capabilities GROUP BY status
       UNION ALL SELECT 'SYS:' || status, COUNT(*) FROM system_requirements GROUP BY status`
    ),
    issues: all("SELECT status, COUNT(*) AS n FROM engineering_issues GROUP BY status"),
    approvals,
    hitl,
    blockers,
    security,
    conflicts,
    checks: {
      overdue: checks.filter((c) => c.status === "OVERDUE"),
      due: checks.filter((c) => c.status === "DUE"),
      unknown: checks.filter((c) => c.status === UNKNOWN),
    },
    returns,
    inspections,
    inventory: rollup,
    nodes,
    evidence_gaps: {
      total: gaps.length,
      list: gaps.slice(0, 20),
    },
  };
}
