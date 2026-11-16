// Seed H-LIFT with a realistic, deliberately imperfect dataset.
// Unknowns and unverified records are preserved on purpose: the platform
// must show them rather than infer a comfortable answer.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dbPath = join(root, "data", "hlift.db");
const reset = process.argv.includes("--reset");

if (reset) {
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = dbPath + suffix;
    if (!existsSync(p)) continue;
    try {
      rmSync(p);
    } catch (e) {
      if (e && e.code === "EPERM") {
        console.error(
          `\nCannot delete ${p} â€” another process (almost always 'npm run dev') holds the SQLite file open.\n` +
            `Run 'npm run reset:dev' instead: it stops the dev server, reseeds and restarts it.\n`
        );
        process.exit(1);
      }
      throw e;
    }
  }
}
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(readFileSync(join(root, "db", "schema.sql"), "utf8"));

// Forward migrations extend the preserved baseline; the ledger keeps ALTER
// TABLE statements idempotent. This mirrors src/lib/db.ts.
function applyMigrations() {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     );`
  );
  const done = new Set(
    db.prepare("SELECT filename FROM schema_migrations").all().map((r) => r.filename)
  );
  const dir = join(root, "db", "migrations");
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(join(dir, file), "utf8"));
      db.prepare("INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString()
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${e.message}`);
    }
  }
}

applyMigrations();

const iso = (d) => d.toISOString();
const now = new Date();
const daysAgo = (n) => iso(new Date(now.getTime() - n * 864e5));
const daysAhead = (n) => iso(new Date(now.getTime() + n * 864e5));
const hoursAgo = (n) => iso(new Date(now.getTime() - n * 36e5));
const minutesAgo = (n) => iso(new Date(now.getTime() - n * 60e3));

function insert(table, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const stmt = db.prepare(
    `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`
  );
  for (const row of rows) stmt.run(...cols.map((c) => row[c] ?? null));
}

// ---- canonical audit bus --------------------------------------------------
// Must remain byte-identical to src/lib/audit.ts.
const canonicalJson = (value) => {
  const enc = (v) => {
    if (v === null || v === undefined) return "null";
    if (Array.isArray(v)) return `[${v.map(enc).join(",")}]`;
    if (typeof v === "object") {
      const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${enc(v[k])}`).join(",")}}`;
    }
    if (typeof v === "number" && !Number.isFinite(v)) return "null";
    return JSON.stringify(v);
  };
  return enc(value);
};

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

const auditRows = [];
function addAudit(e) {
  const prev = auditRows.length ? auditRows[auditRows.length - 1].hash : null;
  const row = {
    id: e.id ?? `evt-${String(auditRows.length + 1).padStart(4, "0")}`,
    occurred_at: e.occurred_at ?? iso(now),
    plane: e.plane,
    event_type: e.event_type,
    source: e.source,
    subject_id: e.subject_id ?? null,
    resource_type: e.resource_type ?? null,
    resource_id: e.resource_id ?? null,
    correlation_id: e.correlation_id ?? null,
    severity: e.severity ?? null,
    outcome: e.outcome ?? null,
    payload: e.payload === undefined ? null : canonicalJson(e.payload),
    prev_hash: prev,
  };
  row.hash = sha256(
    [
      prev ?? "",
      row.id,
      row.occurred_at,
      row.plane,
      row.event_type,
      row.source,
      row.subject_id ?? "",
      row.resource_type ?? "",
      row.resource_id ?? "",
      row.correlation_id ?? "",
      row.severity ?? "",
      row.outcome ?? "",
      row.payload ?? "",
    ].join("\n")
  );
  auditRows.push(row);
}

// ---------------------------------------------------------------- traceability
insert("mission_requirements", [
  {
    id: "mr-1", code: "MR-001", mission: "H-LIFT Field Sustainment",
    title: "Sustain field teams through full equipment lifecycle without unplanned downtime",
    description: "Mission requirement: any deployed H-LIFT asset must remain serviceable, traceable and replaceable for the duration of the operation.",
    status: "VERIFIED", owner: "mission-cell", priority: "critical", created_at: daysAgo(120),
  },
  {
    id: "mr-2", code: "MR-002", mission: "H-LIFT Hazmat Safety",
    title: "Guarantee hazmat shelf-life, quarterly inspection and safe partial-use returns",
    description: "Every hazmat item must have verified expiry, quarterly check and partial-use accounting before return to service.",
    status: "IN_PROGRESS", owner: "safety-office", priority: "critical", created_at: daysAgo(90),
  },
  {
    id: "mr-3", code: "MR-003", mission: "H-LIFT Delivery Assurance",
    title: "Prove requirements-to-release traceability for every deployed artifact",
    description: "No artifact reaches production without linked requirements, merged code, verified evidence and human approval.",
    status: "IN_PROGRESS", owner: "engineering", priority: "high", created_at: daysAgo(75),
  },
]);

insert("operational_needs", [
  { id: "on-1", code: "ON-101", mission_requirement_id: "mr-1", title: "Know stock and serviceability at every site in near real time", status: "APPROVED", owner: "ops" },
  { id: "on-2", code: "ON-102", mission_requirement_id: "mr-1", title: "Replace a spent asset within the same shift", status: "APPROVED", owner: "ops" },
  { id: "on-3", code: "ON-201", mission_requirement_id: "mr-2", title: "Detect and quarantine hazmat before expiry is breached", status: "APPROVED", owner: "safety-office" },
  { id: "on-4", code: "ON-202", mission_requirement_id: "mr-2", title: "Account for partial use when an item returns to stores", status: "IN_PROGRESS", owner: "safety-office" },
  { id: "on-5", code: "ON-301", mission_requirement_id: "mr-3", title: "Block releases that lack evidence or approval", status: "APPROVED", owner: "engineering" },
]);

insert("capabilities", [
  { id: "cap-1", code: "CAP-101", operational_need_id: "on-1", name: "Offline-tolerant inventory sync", description: "Field kits reconcile stock while disconnected and merge on reconnect.", status: "VERIFIED" },
  { id: "cap-2", code: "CAP-102", operational_need_id: "on-2", name: "Same-shift replenishment workflow", description: "Replenishment queue with priority and dispatch.", status: "IN_PROGRESS" },
  { id: "cap-3", code: "CAP-201", operational_need_id: "on-3", name: "Shelf-life and expiry enforcement", description: "Expiry watch with quarantine transitions.", status: "IN_PROGRESS" },
  { id: "cap-4", code: "CAP-202", operational_need_id: "on-4", name: "Partial-use return accounting", description: "Record hours used and remaining fraction on return.", status: "IN_PROGRESS" },
  { id: "cap-5", code: "CAP-301", operational_need_id: "on-5", name: "Release gate with evidence binding", description: "Deterministic gate: requirements, evidence, approval.", status: "UNVERIFIED" },
]);

insert("system_requirements", [
  { id: "sr-1", code: "SYS-101", capability_id: "cap-1", title: "Sync queue persists locally for at least 72 h offline", description: "Local store must retain pending mutations for 72 h.", kind: "functional", status: "VERIFIED" },
  { id: "sr-2", code: "SYS-102", capability_id: "cap-1", title: "Conflict detection on divergent stock edits", description: "Two edits to the same item must surface a conflict queue entry.", kind: "data", status: "VERIFIED" },
  { id: "sr-3", code: "SYS-103", capability_id: "cap-2", title: "Replenishment order carries requirement trace id", kind: "functional", status: "IN_PROGRESS" },
  { id: "sr-4", code: "SYS-201", capability_id: "cap-3", title: "Expiry within 30 days raises a blocking alert", kind: "functional", status: "VERIFIED" },
  { id: "sr-5", code: "SYS-202", capability_id: "cap-3", title: "Quarantine requires verified inspector identity", kind: "security", status: "UNVERIFIED" },
  { id: "sr-6", code: "SYS-203", capability_id: "cap-4", title: "Partial return records hours used and remaining fraction", description: "Example: a tube used 8 h and returned with one quarter remaining must record 8 h and 0.25.", kind: "functional", status: "IN_PROGRESS" },
  { id: "sr-7", code: "SYS-204", capability_id: "cap-4", title: "Unverified return quantities remain UNVERIFIED until inspected", kind: "policy", status: "IN_PROGRESS" },
  { id: "sr-8", code: "SYS-205", capability_id: "cap-4", title: "Quarterly check due dates computed from last verified check", kind: "functional", status: "UNKNOWN" },
  { id: "sr-9", code: "SYS-301", capability_id: "cap-5", title: "Release blocked when any evidence is UNVERIFIED or UNKNOWN", kind: "policy", status: "APPROVED" },
  { id: "sr-10", code: "SYS-302", capability_id: "cap-5", title: "Production deploy requires human approval record", kind: "policy", status: "VERIFIED" },
]);

insert("design_components", [
  { id: "dc-1", code: "DC-101", system_requirement_id: "sr-1", name: "sync-service", kind: "service", description: "Offline queue and merge.", status: "VERIFIED" },
  { id: "dc-2", code: "DC-102", system_requirement_id: "sr-2", name: "conflict-detector", kind: "service", description: "Divergence detection.", status: "VERIFIED" },
  { id: "dc-3", code: "DC-103", system_requirement_id: "sr-3", name: "replenishment-worker", kind: "worker", status: "IN_PROGRESS" },
  { id: "dc-4", code: "DC-201", system_requirement_id: "sr-4", name: "expiry-watch", kind: "worker", status: "VERIFIED" },
  { id: "dc-5", code: "DC-202", system_requirement_id: "sr-5", name: "quarantine-gate", kind: "service", status: "UNVERIFIED" },
  { id: "dc-6", code: "DC-203", system_requirement_id: "sr-6", name: "return-intake-ui", kind: "ui", status: "IN_PROGRESS" },
  { id: "dc-7", code: "DC-204", system_requirement_id: "sr-7", name: "return-verification", kind: "service", status: "IN_PROGRESS" },
  { id: "dc-8", code: "DC-205", system_requirement_id: "sr-8", name: "quarterly-check-scheduler", kind: "worker", status: "UNKNOWN" },
  { id: "dc-9", code: "DC-301", system_requirement_id: "sr-9", name: "release-gate", kind: "service", status: "APPROVED" },
  { id: "dc-10", code: "DC-302", system_requirement_id: "sr-10", name: "approval-router", kind: "service", status: "VERIFIED" },
]);

insert("engineering_issues", [
  { id: "iss-1", key: "HL-101", design_component_id: "dc-1", title: "Persist offline sync queue for 72 h", status: "done", priority: "high", assignee: "m.okafor", linear_url: "https://linear.app/hlift/issue/HL-101", created_at: daysAgo(40) },
  { id: "iss-2", key: "HL-102", design_component_id: "dc-2", title: "Detect divergent stock edits and enqueue conflict", status: "done", priority: "high", assignee: "m.okafor", linear_url: "https://linear.app/hlift/issue/HL-102", created_at: daysAgo(38) },
  { id: "iss-3", key: "HL-103", design_component_id: "dc-3", title: "Attach trace id to replenishment orders", status: "in_progress", priority: "normal", assignee: "r.iyer", linear_url: "https://linear.app/hlift/issue/HL-103", created_at: daysAgo(21) },
  { id: "iss-4", key: "HL-104", design_component_id: "dc-4", title: "Raise blocking alert at 30-day expiry", status: "done", priority: "urgent", assignee: "s.novak", linear_url: "https://linear.app/hlift/issue/HL-104", created_at: daysAgo(60) },
  { id: "iss-5", key: "HL-105", design_component_id: "dc-6", title: "Return intake captures hours used and remaining fraction", status: "in_review", priority: "urgent", assignee: "a.delgado", linear_url: "https://linear.app/hlift/issue/HL-105", created_at: daysAgo(14) },
  { id: "iss-6", key: "HL-106", design_component_id: "dc-7", title: "Keep uninspected return quantities UNVERIFIED", status: "todo", priority: "high", assignee: "a.delgado", linear_url: "https://linear.app/hlift/issue/HL-106", created_at: daysAgo(12) },
  { id: "iss-7", key: "HL-107", design_component_id: "dc-8", title: "Compute quarterly check due dates", status: "backlog", priority: "normal", assignee: null, linear_url: null, created_at: daysAgo(9) },
  { id: "iss-8", key: "HL-108", design_component_id: "dc-9", title: "Release gate blocks UNVERIFIED evidence", status: "done", priority: "high", assignee: "s.novak", linear_url: "https://linear.app/hlift/issue/HL-108", created_at: daysAgo(30) },
  { id: "iss-9", key: "HL-109", design_component_id: "dc-5", title: "Quarantine gate identity check", status: "in_progress", priority: "high", assignee: "r.iyer", linear_url: "https://linear.app/hlift/issue/HL-109", created_at: daysAgo(17) },
  { id: "iss-10", key: "HL-110", design_component_id: "dc-10", title: "Route production approval to HITL queue", status: "done", priority: "normal", assignee: "s.novak", linear_url: "https://linear.app/hlift/issue/HL-110", created_at: daysAgo(45) },
  { id: "iss-11", key: "HL-111", design_component_id: "dc-8", title: "Unknown: scheduler retry policy not specified", status: "UNKNOWN", priority: "UNKNOWN", assignee: null, linear_url: null, created_at: daysAgo(5) },
]);

insert("code_links", [
  { id: "cl-1", issue_id: "iss-1", branch: "feat/HL-101-offline-queue", commit_sha: "a41f9c2", pr_url: "https://github.com/hlift/platform/pull/212", pr_state: "merged", checks_status: "passing", updated_at: daysAgo(20) },
  { id: "cl-2", issue_id: "iss-2", branch: "feat/HL-102-conflict-detect", commit_sha: "b7d0e18", pr_url: "https://github.com/hlift/platform/pull/219", pr_state: "merged", checks_status: "passing", updated_at: daysAgo(16) },
  { id: "cl-3", issue_id: "iss-3", branch: "feat/HL-103-trace-id", commit_sha: "c92a441", pr_url: "https://github.com/hlift/platform/pull/231", pr_state: "open", checks_status: "pending", updated_at: daysAgo(2) },
  { id: "cl-4", issue_id: "iss-4", branch: "feat/HL-104-expiry-alert", commit_sha: "d18b7f0", pr_url: "https://github.com/hlift/platform/pull/198", pr_state: "merged", checks_status: "passing", updated_at: daysAgo(40) },
  { id: "cl-5", issue_id: "iss-5", branch: "feat/HL-105-return-intake", commit_sha: "e5c3d91", pr_url: "https://github.com/hlift/platform/pull/238", pr_state: "open", checks_status: "failing", updated_at: hoursAgo(6) },
  { id: "cl-6", issue_id: "iss-6", branch: null, commit_sha: null, pr_url: null, pr_state: "UNKNOWN", checks_status: "UNKNOWN", updated_at: daysAgo(12) },
  { id: "cl-7", issue_id: "iss-8", branch: "feat/HL-108-release-gate", commit_sha: "f0a6b3c", pr_url: "https://github.com/hlift/platform/pull/205", pr_state: "merged", checks_status: "passing", updated_at: daysAgo(25) },
  { id: "cl-8", issue_id: "iss-10", branch: "feat/HL-110-approval-route", commit_sha: "0b2e774", pr_url: "https://github.com/hlift/platform/pull/190", pr_state: "merged", checks_status: "passing", updated_at: daysAgo(35) },
]);

insert("evidence", [
  { id: "ev-1", type: "test", name: "offline-queue-72h integration suite", status: "VERIFIED", issue_id: "iss-1", system_requirement_id: "sr-1", artifact_url: "https://ci.hlift.dev/runs/8811", collected_at: daysAgo(20), notes: "Passed 14/14, artifact retained." },
  { id: "ev-2", type: "test", name: "conflict divergence unit suite", status: "VERIFIED", issue_id: "iss-2", system_requirement_id: "sr-2", artifact_url: "https://ci.hlift.dev/runs/8830", collected_at: daysAgo(16), notes: null },
  { id: "ev-3", type: "security", name: "dependency scan â€” sync-service", status: "UNVERIFIED", issue_id: "iss-1", system_requirement_id: "sr-1", artifact_url: "https://ci.hlift.dev/runs/8812", collected_at: daysAgo(20), notes: "Scanner output uploaded; triage sign-off missing." },
  { id: "ev-4", type: "policy", name: "quarantine identity policy check", status: "UNKNOWN", issue_id: "iss-9", system_requirement_id: "sr-5", artifact_url: null, collected_at: null, notes: "No policy evidence collected." },
  { id: "ev-5", type: "test", name: "return intake e2e â€” 8h / 25%", status: "FAILED", issue_id: "iss-5", system_requirement_id: "sr-6", artifact_url: "https://ci.hlift.dev/runs/8902", collected_at: hoursAgo(6), notes: "Remaining fraction rounded to 0.2; expected 0.25." },
  { id: "ev-6", type: "test", name: "release gate blocks unverified evidence", status: "VERIFIED", issue_id: "iss-8", system_requirement_id: "sr-9", artifact_url: "https://ci.hlift.dev/runs/8740", collected_at: daysAgo(25), notes: null },
  { id: "ev-7", type: "security", name: "approval-router authz test", status: "VERIFIED", issue_id: "iss-10", system_requirement_id: "sr-10", artifact_url: "https://ci.hlift.dev/runs/8702", collected_at: daysAgo(35), notes: null },
  { id: "ev-8", type: "test", name: "expiry alert 30-day boundary", status: "VERIFIED", issue_id: "iss-4", system_requirement_id: "sr-4", artifact_url: "https://ci.hlift.dev/runs/8620", collected_at: daysAgo(40), notes: null },
  { id: "ev-9", type: "policy", name: "UNVERIFIED preservation policy", status: "UNVERIFIED", issue_id: "iss-6", system_requirement_id: "sr-7", artifact_url: null, collected_at: daysAgo(3), notes: "Draft policy; no independent review." },
]);

insert("build_artifacts", [
  { id: "art-1", issue_id: "iss-1", name: "hlift/sync-service", version: "1.14.0", container_image: "ghcr.io/hlift/sync-service:1.14.0", digest: "sha256:1f9câ€¦a2", status: "built", built_at: daysAgo(20) },
  { id: "art-2", issue_id: "iss-8", name: "hlift/release-gate", version: "2.3.1", container_image: "ghcr.io/hlift/release-gate:2.3.1", digest: "sha256:7b2dâ€¦e1", status: "built", built_at: daysAgo(25) },
  { id: "art-3", issue_id: "iss-5", name: "hlift/return-intake", version: "0.9.0-rc3", container_image: null, digest: null, status: "UNKNOWN", built_at: null },
]);

insert("deployment_approvals", [
  { id: "apr-1", artifact_id: "art-1", environment: "staging", status: "approved", requested_by: "ci-bot", approver: "k.rivera", requested_at: daysAgo(19), decided_at: daysAgo(19), note: "Staging smoke test only." },
  { id: "apr-2", artifact_id: "art-1", environment: "production", status: "pending", requested_by: "ci-bot", approver: null, requested_at: daysAgo(2), decided_at: null, note: "Blocked: security evidence UNVERIFIED (ev-3)." },
  { id: "apr-3", artifact_id: "art-2", environment: "production", status: "pending", requested_by: "s.novak", approver: null, requested_at: daysAgo(1), decided_at: null, note: "Awaiting release manager." },
  { id: "apr-4", artifact_id: "art-3", environment: "staging", status: "UNKNOWN", requested_by: "a.delgado", approver: null, requested_at: daysAgo(4), decided_at: null, note: "Artifact build status unknown; approval record incomplete." },
]);

insert("operational_validations", [
  { id: "val-1", artifact_id: "art-1", status: "validated", validated_by: "field-ops", validated_at: daysAgo(18), notes: "Staging validation passed; production not yet trialled." },
  { id: "val-2", artifact_id: "art-2", status: "UNVERIFIED", validated_by: null, validated_at: null, notes: "No operational validation record." },
]);

insert("releases", [
  { id: "rel-1", version: "1.14.0", artifact_id: "art-1", validation_id: "val-1", status: "held", released_at: null, notes: "Held pending production approval apr-2 and security evidence." },
]);

// ---------------------------------------------------------------- hazmat
// Container-aware dataset. The examples the programme gave are modelled
// literally:
//   * 12 x 16 oz aerosol cans of lubricant, 2 authorized / 2 picked up,
//     1 fully consumed, 1 partially used and returned into RETURN_HOLD.
//   * 4 x 5 GAL pails of hydraulic fluid, 1 issued, 3.400 GAL returned,
//     1.600 GAL consumed.
// A return never lands in AVAILABLE: it enters RETURN_HOLD with a pending
// eight-point inspection.

const mkMaterial = (m) => ({
  id: m.id,
  material_code: m.code,
  name: m.name,
  description: m.description ?? null,
  category: m.category,
  nsn: m.nsn ?? null,
  manufacturer: m.mfr ?? null,
  manufacturer_part_no: m.mpn ?? null,
  unit_of_issue: m.uoi,
  package_description: m.package,
  measurement_basis: m.basis,
  unit_of_measure: m.uom,
  nominal_quantity_per_container: m.nominal,
  hazard_class: m.hazard ?? null,
  storage_compatibility: m.storage ?? null,
  shelf_life_days: m.shelfLife ?? null,
  partial_container_accounting: m.partial ?? 0,
  status: m.status ?? "UNKNOWN",
});

insert("materials", [
  mkMaterial({
    id: "mat-lub-001", code: "MAT-LUB-001",
    name: "MIL-PRF lubricating oil, aerosol, 16 oz",
    description: "Aerosol lubricant can. Demo dataset; identifiers are illustrative.",
    category: "lubricant", mfr: "Example Lubricants Inc. (demo)", mpn: "EL-2104-16A",
    uoi: "EA", package: "16 oz aerosol can", basis: "VOLUME", uom: "OZ", nominal: "16.000",
    hazard: "flammable aerosol", storage: "flammable cabinet", shelfLife: 1825,
    partial: 1, status: "VERIFIED",
  }),
  mkMaterial({
    id: "mat-hyd-002", code: "MAT-HYD-002",
    name: "Hydraulic fluid, petroleum base, 5 GAL pail",
    description: "Bulk hydraulic fluid supplied in 5-gallon pails.",
    category: "hydraulic_fluid", mfr: "Example Petroleum Co. (demo)", mpn: "EP-HF-5P",
    uoi: "PA", package: "5 GAL pail", basis: "VOLUME", uom: "GAL", nominal: "5.000",
    hazard: "combustible liquid", storage: "flammable cabinet", shelfLife: 1825,
    partial: 1, status: "VERIFIED",
  }),
  mkMaterial({
    id: "mat-tube-003", code: "MAT-TUBE-003",
    name: "Breathing air tube, 8 h service",
    description: "Service life is measured in breathing hours, not volume.",
    category: "breathing_tube", mfr: null, mpn: null,
    uoi: "EA", package: "8 h service tube", basis: "SERVICE_HOURS", uom: "H", nominal: "8.000",
    hazard: null, storage: "breathing-air store", shelfLife: 365,
    partial: 1, status: "VERIFIED",
  }),
  mkMaterial({
    id: "mat-flt-004", code: "MAT-FLT-004",
    name: "Particulate filter P3, box of 20",
    description: "Discrete product. Policy does not permit partial-box accounting.",
    category: "filter", mfr: "Example Respiratory Ltd. (demo)", mpn: "ER-P3-20",
    uoi: "BX", package: "box of 20 filters", basis: "COUNT", uom: "EA", nominal: "20.000",
    hazard: null, storage: "dry store", shelfLife: 730,
    partial: 0, status: "VERIFIED",
  }),
  mkMaterial({
    id: "mat-cyl-005", code: "MAT-CYL-005",
    name: "Air cylinder, 6 L, 200 bar",
    description: "Accounted by cylinder pressure and test status, not by volume dispensed.",
    category: "cylinder", mfr: "Example Gas Systems (demo)", mpn: "EG-6L-200",
    uoi: "EA", package: "6 L cylinder", basis: "PRESSURE", uom: "BAR", nominal: "200.000",
    hazard: "compressed gas", storage: "cylinder cage", shelfLife: 3650,
    partial: 0, status: "VERIFIED",
  }),
  mkMaterial({
    id: "mat-dcn-006", code: "MAT-DCN-006",
    name: "Decontamination agent, 5 L",
    description: "Product identity partially recorded; expiry unknown on one container.",
    category: "agent", mfr: null, mpn: null,
    uoi: "CA", package: "5 L container", basis: "VOLUME", uom: "L", nominal: "5.000",
    hazard: "corrosive", storage: "hazmat cabinet", shelfLife: 540,
    partial: 1, status: "UNKNOWN",
  }),
  mkMaterial({
    id: "mat-adh-007", code: "MAT-ADH-007",
    name: "Contact adhesive, 1 qt",
    description: "Used to demonstrate a return with a quantity variance.",
    category: "adhesive", mfr: "Example Adhesives (demo)", mpn: "EA-CA-32",
    uoi: "CA", package: "1 qt cartridge", basis: "VOLUME", uom: "OZ", nominal: "32.000",
    hazard: "flammable", storage: "flammable cabinet", shelfLife: 730,
    partial: 1, status: "VERIFIED",
  }),
  // NSW-specific materials (East/West task units)
  mkMaterial({
    id: "mat-nsw-001", code: "MAT-NSW-BAT-001",
    name: "Lithium primary battery, BA-5590/U high-density tactical (15 V)",
    description: "High-density lithium battery for NVG and radios. Restricted hazmat; pack-out tracked for deploying task units.",
    category: "battery", nsn: "6135-01-DEM-0001",
    mfr: "Example Power Corp. (demo)", mpn: "BA-5590-HD",
    uoi: "EA", package: "unit", basis: "COUNT", uom: "EA", nominal: "1.000",
    hazard: "lithium metal, fire risk", storage: "lithium locker, vented", shelfLife: 1825,
    partial: 0, status: "VERIFIED",
  }),
  mkMaterial({
    id: "mat-nsw-002", code: "MAT-NSW-RES-001",
    name: "Marine composite resin, epoxy, 1 gal kit",
    description: "Two-part epoxy for composite hull and edgewater repair on NSW craft.",
    category: "resin", nsn: "6850-01-DEM-0002",
    mfr: "Example Composites (demo)", mpn: "EC-EPOXY-1",
    uoi: "KT", package: "1 gal kit", basis: "VOLUME", uom: "GAL", nominal: "1.000",
    hazard: "corrosive, sensitizer", storage: "hazmat cabinet, temperature controlled", shelfLife: 730,
    partial: 1, status: "VERIFIED",
  }),
  mkMaterial({
    id: "mat-nsw-003", code: "MAT-NSW-LUB-001",
    name: "Oxygen-compatible lubricant, dive locker, 4 oz",
    description: "Oxygen-safe lubricant for rebreather and SCUBA service; contamination control required.",
    category: "lubricant", nsn: "9150-01-DEM-0003",
    mfr: "Example Dive Systems (demo)", mpn: "EDS-O2-4",
    uoi: "EA", package: "4 oz tube", basis: "MASS", uom: "OZ", nominal: "4.000",
    hazard: "oxidizer-compatible", storage: "dive locker, oxygen-service clean", shelfLife: 1825,
    partial: 1, status: "VERIFIED",
  }),
  mkMaterial({
    id: "mat-nsw-004", code: "MAT-NSW-CLP-001",
    name: "Weapons CLP, rifle bore cleaner, 8 oz",
    description: "Cleaner-lubricant-protectant for NSW direct-action weapons.",
    category: "clp", nsn: "9150-01-DEM-0004",
    mfr: "Example Ordnance (demo)", mpn: "EO-CLP-8",
    uoi: "EA", package: "8 oz bottle", basis: "VOLUME", uom: "OZ", nominal: "8.000",
    hazard: "flammable", storage: "flammable cabinet", shelfLife: 1825,
    partial: 1, status: "VERIFIED",
  }),
]);

const mkContainer = (c) => ({
  id: c.id,
  container_code: c.code,
  material_id: c.material,
  lot: c.lot ?? null,
  package_type: c.package,
  nominal_quantity: c.nominal,
  current_quantity: c.current ?? null,
  unit_of_measure: c.uom,
  seal_status: c.seal ?? "UNKNOWN",
  manufactured_at: c.made ?? null,
  expires_at: c.expires ?? null,
  location: c.location ?? null,
  condition: c.condition ?? "UNKNOWN",
  state: c.state,
  state_reason: c.reason ?? null,
  created_at: c.created ?? daysAgo(60),
  facility_id: c.facility ?? "FAC-STORE",
  owning_command: c.command ?? "logsu-2",
  label_status: c.label ?? "INTACT",
  label_version: c.labelVersion ?? "L1",
});

const containers = [];

// 12 aerosol cans, lot L240716A, expire 2027-07-16.
for (let i = 1; i <= 12; i++) {
  const n = String(i).padStart(4, "0");
  const state =
    i === 10 ? "RESERVED" : i === 11 ? "FULLY_CONSUMED" : i === 12 ? "RETURN_HOLD" : "AVAILABLE";
  containers.push(
    mkContainer({
      id: `ct-lub-${n}`, code: `CT-LUB-${n}`, material: "mat-lub-001",
      lot: "L240716A", package: "aerosol_can", nominal: "16.000",
      current: i === 11 ? "0.000" : i === 12 ? "9.500" : "16.000",
      uom: "OZ", seal: i === 11 || i === 12 ? "OPENED" : "SEALED",
      made: "2024-07-16T00:00:00.000Z", expires: "2027-07-16T00:00:00.000Z",
      location: i === 10 ? "Store / flammable cabinet (reserved)" : "Store / flammable cabinet",
      condition: "SERVICEABLE", state,
      reason: i === 10 ? "Reserved for IR-2026-046" : i === 11 ? "Consumed in full" : i === 12 ? "Returned; inspection pending" : null,
      created: daysAgo(150),
    })
  );
}

// 4 hydraulic pails, lot L260210B, expire 2028-02-10.
containers.push(
  mkContainer({ id: "ct-hyd-0001", code: "CT-HYD-0001", material: "mat-hyd-002", lot: "L260210B", package: "pail", nominal: "5.000", current: "5.000", uom: "GAL", seal: "SEALED", made: "2026-02-10T00:00:00.000Z", expires: "2028-02-10T00:00:00.000Z", location: "Store / flammable cabinet", condition: "SERVICEABLE", state: "AVAILABLE", created: daysAgo(90) }),
  mkContainer({ id: "ct-hyd-0002", code: "CT-HYD-0002", material: "mat-hyd-002", lot: "L260210B", package: "pail", nominal: "5.000", current: "5.000", uom: "GAL", seal: "SEALED", made: "2026-02-10T00:00:00.000Z", expires: "2028-02-10T00:00:00.000Z", location: "Store / flammable cabinet", condition: "SERVICEABLE", state: "AVAILABLE", created: daysAgo(90) }),
  mkContainer({ id: "ct-hyd-0003", code: "CT-HYD-0003", material: "mat-hyd-002", lot: "L260210B", package: "pail", nominal: "5.000", current: "5.000", uom: "GAL", seal: "OPENED", made: "2026-02-10T00:00:00.000Z", expires: "2028-02-10T00:00:00.000Z", location: "Site Bravo / plant room", condition: "SERVICEABLE", state: "IN_USE", reason: "Issued on IR-2026-045", created: daysAgo(90) }),
  mkContainer({ id: "ct-hyd-0004", code: "CT-HYD-0004", material: "mat-hyd-002", lot: "L260210B", package: "pail", nominal: "5.000", current: "3.400", uom: "GAL", seal: "OPENED", made: "2026-02-10T00:00:00.000Z", expires: "2028-02-10T00:00:00.000Z", location: "Return hold / bay 1", condition: "SERVICEABLE", state: "RETURN_HOLD", reason: "Returned 3.400 GAL; inspection pending", created: daysAgo(90) }),
);

containers.push(
  mkContainer({ id: "ct-tube-014", code: "CT-TUBE-014", material: "mat-tube-003", lot: "L260401C", package: "tube", nominal: "8.000", current: "2.000", uom: "H", seal: "OPENED", made: "2026-04-01T00:00:00.000Z", expires: "2027-04-01T00:00:00.000Z", location: "Store / breathing-air rack", condition: "SERVICEABLE", state: "AVAILABLE", reason: "Inspected and restocked with 2.000 H service life remaining", created: daysAgo(120) }),
  mkContainer({ id: "ct-tube-018", code: "CT-TUBE-018", material: "mat-tube-003", lot: "L260401C", package: "tube", nominal: "8.000", current: null, uom: "H", seal: "OPENED", made: "2026-04-01T00:00:00.000Z", expires: "2027-04-01T00:00:00.000Z", location: "Return hold / bay 2", condition: "UNKNOWN", state: "RETURN_HOLD", reason: "Declared 2.000 H remaining; no inspector measurement", created: daysAgo(120) }),
  mkContainer({ id: "ct-flt-003", code: "CT-FLT-003", material: "mat-flt-004", lot: "L251030D", package: "box", nominal: "20.000", current: "20.000", uom: "EA", seal: "SEALED", made: "2025-10-30T00:00:00.000Z", expires: daysAhead(12), location: "Store / shelf C", condition: "SERVICEABLE", state: "AVAILABLE", created: daysAgo(60) }),
  mkContainer({ id: "ct-cyl-009", code: "CT-CYL-009", material: "mat-cyl-005", lot: "L150601E", package: "cylinder", nominal: "200.000", current: null, uom: "BAR", seal: "SEALED", made: "2015-06-01T00:00:00.000Z", expires: daysAgo(10), location: "Site Alpha / cage", condition: "UNKNOWN", state: "EXPIRED", reason: "Past hydrostatic test date; pressure not recorded", created: daysAgo(3650) }),
  mkContainer({ id: "ct-dcn-002", code: "CT-DCN-002", material: "mat-dcn-006", lot: null, package: "cartridge", nominal: "5.000", current: null, uom: "L", seal: "UNKNOWN", made: null, expires: null, location: "Quarantine / hold 1", condition: "SUSPECT", state: "QUARANTINED", reason: "Label illegible; expiry UNKNOWN", created: daysAgo(45) }),
  mkContainer({ id: "ct-dcn-001", code: "CT-DCN-001", material: "mat-dcn-006", lot: "L240901F", package: "cartridge", nominal: "5.000", current: "0.000", uom: "L", seal: "OPENED", made: "2024-09-01T00:00:00.000Z", expires: "2026-09-01T00:00:00.000Z", location: "Disposal / hazwaste", condition: "DAMAGED", state: "DISPOSED", reason: "Expired and disposed as hazardous waste", created: daysAgo(300) }),
  mkContainer({ id: "ct-adh-001", code: "CT-ADH-001", material: "mat-adh-007", lot: "L250305G", package: "cartridge", nominal: "32.000", current: "18.000", uom: "OZ", seal: "OPENED", made: "2025-03-05T00:00:00.000Z", expires: "2027-03-05T00:00:00.000Z", location: "Return hold / hazmat bay", condition: "SUSPECT", state: "DISPOSITION_REQUIRED", reason: "2.000 OZ unaccounted; contamination suspected", created: daysAgo(200) }),
);

// NSW East pack-out lot (LOGSU-2 -> deploying TUs)
for (let i = 1; i <= 6; i++) {
  const n = String(i).padStart(4, "0");
  containers.push(
    mkContainer({
      id: `ct-nsw-bat-${n}`, code: `CT-NSW-BAT-${n}`, material: "mat-nsw-001",
      lot: "NSW2410A", package: "unit", nominal: "1.000", current: "1.000",
      uom: "EA", seal: "SEALED", made: "2026-04-10T00:00:00.000Z", expires: "2031-04-10T00:00:00.000Z",
      location: "LOGSU-2 / lithium locker", condition: "SERVICEABLE", state: "AVAILABLE",
      command: "logsu-2", facility: "FAC-STORE", created: daysAgo(40),
    })
  );
}
for (let i = 1; i <= 4; i++) {
  const n = String(i).padStart(4, "0");
  containers.push(
    mkContainer({
      id: `ct-nsw-res-${n}`, code: `CT-NSW-RES-${n}`, material: "mat-nsw-002",
      lot: "NSW2411B", package: "kit", nominal: "1.000", current: "1.000",
      uom: "GAL", seal: "SEALED", made: "2026-05-01T00:00:00.000Z", expires: "2028-05-01T00:00:00.000Z",
      location: "LOGSU-2 / hazmat cabinet", condition: "SERVICEABLE", state: "AVAILABLE",
      command: "logsu-2", facility: "FAC-STORE", created: daysAgo(35),
    })
  );
}
for (let i = 1; i <= 3; i++) {
  const n = String(i).padStart(4, "0");
  containers.push(
    mkContainer({
      id: `ct-nsw-lub-${n}`, code: `CT-NSW-LUB-${n}`, material: "mat-nsw-003",
      lot: "NSW2412C", package: "tube", nominal: "4.000", current: "4.000",
      uom: "OZ", seal: "SEALED", made: "2026-05-15T00:00:00.000Z", expires: "2031-05-15T00:00:00.000Z",
      location: "LOGSU-2 / dive locker", condition: "SERVICEABLE", state: "AVAILABLE",
      command: "logsu-2", facility: "FAC-STORE", created: daysAgo(30),
    })
  );
}
for (let i = 1; i <= 4; i++) {
  const n = String(i).padStart(4, "0");
  containers.push(
    mkContainer({
      id: `ct-nsw-clp-${n}`, code: `CT-NSW-CLP-${n}`, material: "mat-nsw-004",
      lot: "NSW2413D", package: "bottle", nominal: "8.000", current: "8.000",
      uom: "OZ", seal: "SEALED", made: "2026-05-20T00:00:00.000Z", expires: "2031-05-20T00:00:00.000Z",
      location: "LOGSU-2 / flammable cabinet", condition: "SERVICEABLE", state: "AVAILABLE",
      command: "logsu-2", facility: "FAC-STORE", created: daysAgo(25),
    })
  );
}
// One battery lot already transferred to TU-STUTTGART-01 (prior pack-out)
containers.push(
  mkContainer({
    id: "ct-nsw-bat-9001", code: "CT-NSW-BAT-9001", material: "mat-nsw-001",
    lot: "NSW2407A", package: "unit", nominal: "1.000", current: "1.000",
    uom: "EA", seal: "SEALED", made: "2026-02-07T00:00:00.000Z", expires: "2031-02-07T00:00:00.000Z",
    location: "TU-STUTTGART-01 / pack-out kit", condition: "SERVICEABLE", state: "ISSUED",
    command: "tu-stuttgart-01", facility: "FAC-STORE", reason: "Packed out to TU-STUTTGART-01 on deployment order DEPL-2026-003",
    created: daysAgo(45),
  })
);

insert("containers", containers);

// Label condition is part of physical accountability. A missing or illegible
// label is a record, not an assumption that the container is fine.
const labelOverrides = {
  "ct-dcn-002": "ILLEGIBLE",
  "ct-adh-001": "DAMAGED",
  "ct-tube-018": "MISSING",
};
for (const c of containers) {
  if (labelOverrides[c.id]) c.label_status = labelOverrides[c.id];
}

insert("container_labels", containers.map((c) => ({
  id: `lbl-${c.id}`,
  container_id: c.id,
  printed_at: c.created_at,
  printed_by: "stores",
  label_version: c.label_version,
  qr_payload: `hlift://container/${c.container_code}?v=${c.label_version}`,
  status: c.label_status,
  notes: c.label_status === "INTACT" ? null : `Label ${c.label_status.toLowerCase()} at last inspection.`,
})));

insert("material_identifiers", [
  { id: "mid-1", material_id: "mat-lub-001", kind: "NSN", value: "9150-01-DEM-0001", issuer: "DLA", verified: 1, source: "catalog-import", recorded_at: daysAgo(160), notes: "Illustrative NSN for demo data." },
  { id: "mid-2", material_id: "mat-lub-001", kind: "MANUFACTURER_PART", value: "EL-2104-16A", issuer: "Example Lubricants Inc.", verified: 1, source: "label", recorded_at: daysAgo(160), notes: null },
  { id: "mid-3", material_id: "mat-hyd-002", kind: "NSN", value: "9150-01-DEM-0002", issuer: "DLA", verified: 1, source: "catalog-import", recorded_at: daysAgo(160), notes: null },
  { id: "mid-4", material_id: "mat-tube-003", kind: "NSN", value: "4240-01-DEM-0003", issuer: "DLA", verified: 1, source: "catalog-import", recorded_at: daysAgo(150), notes: null },
  { id: "mid-5", material_id: "mat-flt-004", kind: "NSN", value: "4240-01-DEM-0004", issuer: "DLA", verified: 1, source: "catalog-import", recorded_at: daysAgo(120), notes: null },
  { id: "mid-6", material_id: "mat-cyl-005", kind: "NSN", value: "4220-01-DEM-0005", issuer: "DLA", verified: 1, source: "catalog-import", recorded_at: daysAgo(120), notes: null },
  { id: "mid-7", material_id: "mat-dcn-006", kind: "NSN", value: "6850-01-DEM-0006", issuer: "DLA", verified: null, source: "field-entry", recorded_at: daysAgo(45), notes: "Identifier not independently verified." },
  { id: "mid-8", material_id: "mat-adh-007", kind: "MANUFACTURER_PART", value: "EA-CA-32", issuer: "Example Adhesives", verified: 1, source: "label", recorded_at: daysAgo(200), notes: null },
  { id: "mid-9", material_id: "mat-nsw-001", kind: "NSN", value: "6135-01-DEM-0001", issuer: "DLA", verified: 1, source: "catalog-import", recorded_at: daysAgo(60), notes: "BA-5590/U high-density tactical lithium battery." },
  { id: "mid-10", material_id: "mat-nsw-002", kind: "NSN", value: "6850-01-DEM-0002", issuer: "DLA", verified: 1, source: "catalog-import", recorded_at: daysAgo(60), notes: "Marine composite epoxy resin kit." },
  { id: "mid-11", material_id: "mat-nsw-003", kind: "NSN", value: "9150-01-DEM-0003", issuer: "DLA", verified: 1, source: "catalog-import", recorded_at: daysAgo(60), notes: "Oxygen-compatible dive locker lubricant." },
  { id: "mid-12", material_id: "mat-nsw-004", kind: "NSN", value: "9150-01-DEM-0004", issuer: "DLA", verified: 1, source: "catalog-import", recorded_at: daysAgo(60), notes: "Weapons CLP." },
]);

insert("custody_assignments", [
  { id: "cust-1", container_id: "ct-hyd-0003", custodian_id: "op.j.mendez", custodian_label: "site-bravo", facility_id: "FAC-STORE", accepted_at: hoursAgo(30), due_at: daysAhead(2), released_at: null, status: "ACTIVE", notes: "Open issue IR-2026-045." },
  { id: "cust-2", container_id: "ct-hyd-0004", custodian_id: "op.j.mendez", custodian_label: "field-ops", facility_id: "FAC-STORE", accepted_at: daysAgo(3), due_at: daysAgo(1), released_at: daysAgo(2), status: "RELEASED", notes: "Returned 3.400 GAL." },
  { id: "cust-3", container_id: "ct-lub-0012", custodian_id: "op.j.mendez", custodian_label: "response-team", facility_id: "FAC-STORE", accepted_at: hoursAgo(32), due_at: hoursAgo(8), released_at: hoursAgo(21), status: "RELEASED", notes: "Returned 9.500 OZ." },
  { id: "cust-4", container_id: "ct-tube-018", custodian_id: "op.j.mendez", custodian_label: "field-kit-7", facility_id: "FAC-STORE", accepted_at: hoursAgo(30), due_at: daysAgo(1), released_at: hoursAgo(20), status: "RELEASED", notes: "Returned with declared, unverified quantity." },
  { id: "cust-5", container_id: "ct-lub-0011", custodian_id: "op.j.mendez", custodian_label: "response-team", facility_id: "FAC-STORE", accepted_at: hoursAgo(32), due_at: hoursAgo(9), released_at: hoursAgo(24), status: "RELEASED", notes: "Consumed in full." },
  ...[1,2,3,4,5,6].map((i) => ({ id: `cust-bat-${i}`, container_id: `ct-nsw-bat-${String(i).padStart(4,"0")}`, custodian_id: "cust.k.rivera", custodian_label: "LOGSU-2 stores", facility_id: "FAC-STORE", accepted_at: daysAgo(40), due_at: null, released_at: null, status: "ACTIVE", notes: "Available for pack-out." })),
  ...[1,2,3,4].map((i) => ({ id: `cust-res-${i}`, container_id: `ct-nsw-res-${String(i).padStart(4,"0")}`, custodian_id: "cust.k.rivera", custodian_label: "LOGSU-2 stores", facility_id: "FAC-STORE", accepted_at: daysAgo(35), due_at: null, released_at: null, status: "ACTIVE", notes: "Available for pack-out." })),
  ...[1,2,3].map((i) => ({ id: `cust-lub-${i}`, container_id: `ct-nsw-lub-${String(i).padStart(4,"0")}`, custodian_id: "cust.k.rivera", custodian_label: "LOGSU-2 dive locker", facility_id: "FAC-STORE", accepted_at: daysAgo(30), due_at: null, released_at: null, status: "ACTIVE", notes: "Available for pack-out." })),
  ...[1,2,3,4].map((i) => ({ id: `cust-clp-${i}`, container_id: `ct-nsw-clp-${String(i).padStart(4,"0")}`, custodian_id: "cust.k.rivera", custodian_label: "LOGSU-2 armory", facility_id: "FAC-STORE", accepted_at: daysAgo(25), due_at: null, released_at: null, status: "ACTIVE", notes: "Available for pack-out." })),
  { id: "cust-bat-9001", container_id: "ct-nsw-bat-9001", custodian_id: "cust.k.rivera", custodian_label: "LOGSU-2 stores", facility_id: "FAC-STORE", accepted_at: daysAgo(60), due_at: null, released_at: daysAgo(45), status: "RELEASED", notes: "Packed out to TU-STUTTGART-01 on deployment order DEPL-2026-003." },
]);

const mkRequest = (r) => ({
  id: r.id, request_code: r.code, material_id: r.material,
  authorized_containers: r.containers ?? null, authorized_quantity: r.qty ?? null,
  unit_of_measure: r.uom, state: r.state, requested_by: r.by ?? null,
  authorized_by: r.auth ?? null, created_at: r.created, updated_at: r.updated ?? r.created,
  notes: r.notes ?? null,
});

insert("issue_requests", [
  mkRequest({ id: "req-1", code: "IR-2026-041", material: "mat-lub-001", containers: 2, qty: "32.000", uom: "OZ", state: "ISSUED", by: "response-team", auth: "k.rivera", created: hoursAgo(40), updated: hoursAgo(32), notes: "2 cans authorized; 2 sealed cans picked up." }),
  mkRequest({ id: "req-2", code: "IR-2026-044", material: "mat-hyd-002", containers: 1, qty: "5.000", uom: "GAL", state: "ISSUED", by: "field-ops", auth: "k.rivera", created: daysAgo(4), updated: daysAgo(3), notes: "1 sealed 5 GAL pail." }),
  mkRequest({ id: "req-3", code: "IR-2026-045", material: "mat-hyd-002", containers: 1, qty: "5.000", uom: "GAL", state: "ISSUED", by: "site-bravo", auth: "k.rivera", created: hoursAgo(34), updated: hoursAgo(30), notes: "Pail CT-HYD-0003 currently in use." }),
  mkRequest({ id: "req-4", code: "IR-2026-046", material: "mat-lub-001", containers: 1, qty: "16.000", uom: "OZ", state: "RESERVED", by: "m.okafor", auth: "s.novak", created: daysAgo(1), updated: daysAgo(1), notes: "Reserved can CT-LUB-0010 for inspection team." }),
  mkRequest({ id: "req-5", code: "IR-2026-047", material: "mat-tube-003", containers: 2, qty: "16.000", uom: "H", state: "REQUESTED", by: "field-kit-7", auth: null, created: hoursAgo(6), notes: "Awaiting validation; no container reserved." }),
]);

insert("issue_transactions", [
  { id: "txn-1", txn_code: "TX-2026-041-1", request_id: "req-1", container_id: "ct-lub-0011", issued_quantity: "16.000", consumed_quantity: "16.000", returned_quantity: "0.000", disposed_quantity: "0.000", measurement_basis: "VOLUME", unit_of_measure: "OZ", status: "CLOSED", issued_at: hoursAgo(32), issued_to: "response-team", returned_at: hoursAgo(24), notes: "Can consumed in full during an 8 h shift." },
  { id: "txn-2", txn_code: "TX-2026-041-2", request_id: "req-1", container_id: "ct-lub-0012", issued_quantity: "16.000", consumed_quantity: "6.500", returned_quantity: "9.500", disposed_quantity: "0.000", measurement_basis: "VOLUME", unit_of_measure: "OZ", status: "CLOSED", issued_at: hoursAgo(32), issued_to: "response-team", returned_at: hoursAgo(20), notes: "Return measured at 9.500 OZ; 6.500 OZ consumed." },
  { id: "txn-3", txn_code: "TX-2026-044-1", request_id: "req-2", container_id: "ct-hyd-0004", issued_quantity: "5.000", consumed_quantity: "1.600", returned_quantity: "3.400", disposed_quantity: "0.000", measurement_basis: "VOLUME", unit_of_measure: "GAL", status: "CLOSED", issued_at: daysAgo(3), issued_to: "field-ops", returned_at: daysAgo(2), notes: "Pail returned open with 3.400 GAL measured." },
  { id: "txn-4", txn_code: "TX-2026-045-1", request_id: "req-3", container_id: "ct-hyd-0003", issued_quantity: "5.000", consumed_quantity: null, returned_quantity: null, disposed_quantity: null, measurement_basis: "VOLUME", unit_of_measure: "GAL", status: "OPEN", issued_at: hoursAgo(30), issued_to: "site-bravo", returned_at: null, notes: "Open issue; consumption not yet reported." },
  { id: "txn-5", txn_code: "TX-2026-039-1", request_id: null, container_id: "ct-tube-014", issued_quantity: "8.000", consumed_quantity: "6.000", returned_quantity: "2.000", disposed_quantity: "0.000", measurement_basis: "SERVICE_HOURS", unit_of_measure: "H", status: "CLOSED", issued_at: hoursAgo(32), issued_to: "site-alpha", returned_at: hoursAgo(24), notes: "6.000 H used; 2.000 H verified by inspector." },
  { id: "txn-6", txn_code: "TX-2026-040-1", request_id: null, container_id: "ct-tube-018", issued_quantity: "8.000", consumed_quantity: "6.000", returned_quantity: "2.000", disposed_quantity: "0.000", measurement_basis: "SERVICE_HOURS", unit_of_measure: "H", status: "UNVERIFIED", issued_at: hoursAgo(30), issued_to: "field-kit-7", returned_at: hoursAgo(20), notes: "Remaining 2.000 H declared by operator; no inspector measurement." },
  { id: "txn-7", txn_code: "TX-2026-033-1", request_id: null, container_id: "ct-adh-001", issued_quantity: "32.000", consumed_quantity: "12.000", returned_quantity: "18.000", disposed_quantity: "0.000", measurement_basis: "VOLUME", unit_of_measure: "OZ", status: "CLOSED", issued_at: daysAgo(6), issued_to: "shop-2", returned_at: daysAgo(1), notes: "2.000 OZ unaccounted for; possible leak â€” variance not written off." },
  { id: "txn-8", txn_code: "TX-2026-021-1", request_id: null, container_id: "ct-dcn-001", issued_quantity: "5.000", consumed_quantity: "0.000", returned_quantity: "0.000", disposed_quantity: "5.000", measurement_basis: "VOLUME", unit_of_measure: "L", status: "CLOSED", issued_at: daysAgo(40), issued_to: "hazwaste", returned_at: daysAgo(20), notes: "Expired lot disposed through hazardous waste contractor." },
]);

const ledgerRows = [];
let ledgerSeq = 0;
const addLedger = (container, at, event, opts = {}) => {
  ledgerSeq += 1;
  ledgerRows.push({
    id: `led-${String(ledgerSeq).padStart(4, "0")}`,
    container_id: container,
    occurred_at: at,
    event,
    actor: opts.actor ?? null,
    status: opts.status ?? "UNKNOWN",
    quantity_delta: opts.delta ?? null,
    notes: opts.notes ?? null,
    payload: opts.payload ?? null,
  });
};

for (const c of containers) {
  addLedger(c.id, c.created_at, "RECEIVED", {
    actor: "stores", status: "VERIFIED",
    delta: c.nominal_quantity,
    notes: `Lot ${c.lot ?? "UNKNOWN"} received.`,
  });
}

// Lubricant story: reserve, issue, consume one, partially use and return the other.
addLedger("ct-lub-0010", daysAgo(1), "RESERVED", { actor: "m.okafor", status: "VERIFIED", delta: "0.000", notes: "Reserved against IR-2026-046." });
addLedger("ct-lub-0011", daysAgo(2), "RESERVED", { actor: "response-team", status: "VERIFIED", delta: "0.000" });
addLedger("ct-lub-0011", daysAgo(2), "PICKUP_READY", { actor: "stores", status: "VERIFIED", delta: "0.000" });
addLedger("ct-lub-0011", hoursAgo(32), "ISSUED", { actor: "stores", status: "VERIFIED", delta: "16.000", notes: "Sealed can issued against IR-2026-041." });
addLedger("ct-lub-0011", hoursAgo(32), "IN_CUSTODY", { actor: "response-team", status: "VERIFIED" });
addLedger("ct-lub-0011", hoursAgo(32), "IN_USE", { actor: "response-team", status: "VERIFIED" });
addLedger("ct-lub-0011", hoursAgo(24), "FULLY_CONSUMED", { actor: "response-team", status: "VERIFIED", delta: "-16.000", notes: "Can emptied in full." });

addLedger("ct-lub-0012", daysAgo(2), "RESERVED", { actor: "response-team", status: "VERIFIED", delta: "0.000" });
addLedger("ct-lub-0012", daysAgo(2), "PICKUP_READY", { actor: "stores", status: "VERIFIED", delta: "0.000" });
addLedger("ct-lub-0012", hoursAgo(32), "ISSUED", { actor: "stores", status: "VERIFIED", delta: "16.000" });
addLedger("ct-lub-0012", hoursAgo(32), "IN_CUSTODY", { actor: "response-team", status: "VERIFIED" });
addLedger("ct-lub-0012", hoursAgo(32), "IN_USE", { actor: "response-team", status: "VERIFIED" });
addLedger("ct-lub-0012", hoursAgo(21), "RETURN_INITIATED", { actor: "response-team", status: "VERIFIED" });
addLedger("ct-lub-0012", hoursAgo(20), "RETURN_RECEIVED", { actor: "stores", status: "VERIFIED", delta: "9.500", notes: "Declared 9.500 OZ remaining." });
addLedger("ct-lub-0012", hoursAgo(20), "RETURN_HOLD", { actor: "stores", status: "VERIFIED", notes: "Held for inspection; not returned to stock." });

// Hydraulic pail in use (open issue) and pail returned into hold.
addLedger("ct-hyd-0003", hoursAgo(30), "RESERVED", { actor: "site-bravo", status: "VERIFIED", delta: "0.000" });
addLedger("ct-hyd-0003", hoursAgo(30), "PICKUP_READY", { actor: "stores", status: "VERIFIED", delta: "0.000" });
addLedger("ct-hyd-0003", hoursAgo(30), "ISSUED", { actor: "stores", status: "VERIFIED", delta: "5.000", notes: "Sealed pail issued against IR-2026-045." });
addLedger("ct-hyd-0003", hoursAgo(30), "IN_CUSTODY", { actor: "site-bravo", status: "VERIFIED" });
addLedger("ct-hyd-0003", hoursAgo(30), "IN_USE", { actor: "site-bravo", status: "VERIFIED" });

addLedger("ct-hyd-0004", daysAgo(4), "RESERVED", { actor: "field-ops", status: "VERIFIED", delta: "0.000" });
addLedger("ct-hyd-0004", daysAgo(3), "PICKUP_READY", { actor: "stores", status: "VERIFIED", delta: "0.000" });
addLedger("ct-hyd-0004", daysAgo(3), "ISSUED", { actor: "stores", status: "VERIFIED", delta: "5.000", notes: "Sealed 5 GAL pail issued against IR-2026-044." });
addLedger("ct-hyd-0004", daysAgo(3), "IN_CUSTODY", { actor: "field-ops", status: "VERIFIED" });
addLedger("ct-hyd-0004", daysAgo(3), "IN_USE", { actor: "field-ops", status: "VERIFIED" });
addLedger("ct-hyd-0004", daysAgo(2), "RETURN_INITIATED", { actor: "field-ops", status: "VERIFIED" });
addLedger("ct-hyd-0004", daysAgo(2), "RETURN_RECEIVED", { actor: "stores", status: "VERIFIED", delta: "3.400", notes: "Open pail, 3.400 GAL measured." });
addLedger("ct-hyd-0004", daysAgo(2), "RETURN_HOLD", { actor: "stores", status: "VERIFIED", notes: "Held for inspection; not returned to stock." });

// Tubes: one verified and restocked, one declared and still on hold.
addLedger("ct-tube-014", hoursAgo(32), "ISSUED", { actor: "stores", status: "VERIFIED", delta: "8.000" });
addLedger("ct-tube-014", hoursAgo(32), "IN_USE", { actor: "site-alpha", status: "VERIFIED" });
addLedger("ct-tube-014", hoursAgo(24), "RETURN_INITIATED", { actor: "site-alpha", status: "VERIFIED" });
addLedger("ct-tube-014", hoursAgo(24), "RETURN_RECEIVED", { actor: "stores", status: "VERIFIED", delta: "2.000" });
addLedger("ct-tube-014", hoursAgo(24), "RETURN_HOLD", { actor: "stores", status: "VERIFIED" });
addLedger("ct-tube-014", hoursAgo(22), "INSPECTED", { actor: "inspector.t.rao", status: "VERIFIED", notes: "All eight checks confirmed; 2.000 H measured." });
addLedger("ct-tube-014", hoursAgo(22), "RESTOCK_APPROVED", { actor: "inspector.t.rao", status: "VERIFIED" });
addLedger("ct-tube-014", hoursAgo(22), "AVAILABLE", { actor: "stores", status: "VERIFIED", delta: "2.000" });

addLedger("ct-tube-018", hoursAgo(30), "ISSUED", { actor: "stores", status: "VERIFIED", delta: "8.000" });
addLedger("ct-tube-018", hoursAgo(30), "IN_USE", { actor: "field-kit-7", status: "VERIFIED" });
addLedger("ct-tube-018", hoursAgo(20), "RETURN_INITIATED", { actor: "field-kit-7", status: "UNVERIFIED" });
addLedger("ct-tube-018", hoursAgo(20), "RETURN_RECEIVED", { actor: "stores", status: "UNVERIFIED", delta: "2.000", notes: "Operator declared 2.000 H remaining." });
addLedger("ct-tube-018", hoursAgo(20), "RETURN_HOLD", { actor: "stores", status: "UNVERIFIED", notes: "No inspector available; quantity UNVERIFIED." });

// Adhesive: return with a variance, then disposition required.
addLedger("ct-adh-001", daysAgo(6), "ISSUED", { actor: "stores", status: "VERIFIED", delta: "32.000" });
addLedger("ct-adh-001", daysAgo(6), "IN_USE", { actor: "shop-2", status: "VERIFIED" });
addLedger("ct-adh-001", daysAgo(1), "RETURN_INITIATED", { actor: "shop-2", status: "VERIFIED" });
addLedger("ct-adh-001", daysAgo(1), "RETURN_RECEIVED", { actor: "stores", status: "VERIFIED", delta: "18.000" });
addLedger("ct-adh-001", daysAgo(1), "RETURN_HOLD", { actor: "stores", status: "VERIFIED" });
addLedger("ct-adh-001", daysAgo(1), "INSPECTED", { actor: "inspector.t.rao", status: "VERIFIED", notes: "2.000 OZ variance; possible leak." });
addLedger("ct-adh-001", daysAgo(1), "DISPOSITION_REQUIRED", { actor: "inspector.t.rao", status: "VERIFIED" });

addLedger("ct-cyl-009", daysAgo(10), "EXPIRED", { actor: "system", status: "VERIFIED", notes: "Hydrostatic test date passed; do not issue." });
addLedger("ct-dcn-002", daysAgo(6), "QUARANTINED", { actor: "inspector.t.rao", status: "VERIFIED", notes: "Label illegible; expiry UNKNOWN." });
addLedger("ct-dcn-001", daysAgo(30), "EXPIRED", { actor: "system", status: "VERIFIED" });
addLedger("ct-dcn-001", daysAgo(25), "DISPOSITION_REQUIRED", { actor: "safety-office", status: "VERIFIED" });
addLedger("ct-dcn-001", daysAgo(20), "DISPOSED", { actor: "hazwaste", status: "VERIFIED", delta: "-5.000", notes: "Disposed through licensed contractor." });

insert("container_ledger", ledgerRows);

const mkInspection = (i) => ({
  id: i.id, container_id: i.container, received_at: i.received, inspected_at: i.inspected ?? null,
  inspector: i.inspector ?? null, measurement_method: i.method ?? "UNKNOWN",
  declared_quantity: i.declared ?? null, measured_quantity: i.measured ?? null,
  identity_verified: i.identity ?? null, correct_material: i.material ?? null,
  label_intact: i.label ?? null, shelf_life_valid: i.shelf ?? null,
  container_damaged: i.damaged ?? null, contamination_suspected: i.contam ?? null,
  quantity_verified: i.qty ?? null, storage_compatibility_valid: i.storage ?? null,
  outcome: i.outcome ?? "PENDING", notes: i.notes ?? null,
});

insert("return_inspections", [
  mkInspection({ id: "insp-1", container: "ct-lub-0012", received: hoursAgo(20), method: "MEASURED", declared: "9.500", measured: "9.500", notes: "Awaiting inspector; measurement recorded at intake." }),
  mkInspection({ id: "insp-2", container: "ct-hyd-0004", received: daysAgo(2), method: "MEASURED", declared: "3.400", measured: "3.400", notes: "Awaiting inspector confirmation." }),
  mkInspection({ id: "insp-3", container: "ct-tube-014", received: hoursAgo(24), inspected: hoursAgo(22), inspector: "inspector.t.rao", method: "MEASURED", declared: "2.000", measured: "2.000", identity: 1, material: 1, label: 1, shelf: 1, damaged: 0, contam: 0, qty: 1, storage: 1, outcome: "ACCEPT", notes: "Restocked with 2.000 H service life remaining." }),
  mkInspection({ id: "insp-4", container: "ct-tube-018", received: hoursAgo(20), method: "DECLARED_UNVERIFIED", declared: "2.000", notes: "Declared by operator. No inspector measurement; all checks UNKNOWN." }),
  mkInspection({ id: "insp-5", container: "ct-adh-001", received: daysAgo(1), inspected: daysAgo(1), inspector: "inspector.t.rao", method: "MEASURED", declared: "18.000", measured: "18.000", identity: 1, material: 1, label: 1, shelf: 1, damaged: 1, contam: 1, qty: 1, storage: 1, outcome: "DISPOSITION", notes: "2.000 OZ unaccounted; container damaged and contamination suspected." }),
  mkInspection({ id: "insp-6", container: "ct-dcn-002", received: daysAgo(6), inspected: daysAgo(6), inspector: "inspector.t.rao", method: "UNKNOWN", identity: 1, material: null, label: 0, shelf: null, damaged: null, contam: null, qty: null, storage: null, outcome: "QUARANTINE", notes: "Identity partially verified; label illegible, expiry unknown." }),
]);

insert("container_checks", [
  { id: "chk-1", container_id: "ct-lub-0012", quarter: "2026-Q4", due_at: daysAhead(30), completed_at: null, inspector: null, result: null, status: "DUE" },
  { id: "chk-2", container_id: "ct-flt-003", quarter: "2026-Q4", due_at: daysAgo(14), completed_at: null, inspector: null, result: null, status: "OVERDUE" },
  { id: "chk-3", container_id: "ct-cyl-009", quarter: "2026-Q4", due_at: daysAgo(14), completed_at: null, inspector: null, result: null, status: "OVERDUE" },
  { id: "chk-4", container_id: "ct-dcn-002", quarter: "2026-Q4", due_at: daysAhead(10), completed_at: null, inspector: null, result: null, status: "DUE" },
  { id: "chk-5", container_id: "ct-tube-018", quarter: "2026-Q3", due_at: daysAgo(55), completed_at: daysAgo(58), inspector: "inspector.t.rao", result: "pass", status: "COMPLETE" },
  { id: "chk-6", container_id: "ct-adh-001", quarter: "2026-Q4", due_at: daysAhead(40), completed_at: null, inspector: null, result: null, status: "UNKNOWN" },
]);

// ---------------------------------------------------------------- control views
insert("conflicts", [
  { id: "cf-1", code: "CF-001", type: "duplicate_link", severity: "high", status: "open", entity_a: "HL-105", entity_b: "SYS-203 / SYS-204", detected_at: daysAgo(2), resolved_at: null, resolution: null, notes: "Issue linked to two system requirements; confirm intent." },
  { id: "cf-2", code: "CF-002", type: "status_mismatch", severity: "high", status: "open", entity_a: "HL-105 (in_review, checks failing)", entity_b: "PR #238 (open, failing)", detected_at: hoursAgo(6), resolved_at: null, resolution: null, notes: "Branch state consistent, but evidence ev-5 failed." },
  { id: "cf-3", code: "CF-003", type: "stale_sync", severity: "medium", status: "open", entity_a: "sync node field-kit-7", entity_b: "inventory items", detected_at: hoursAgo(9), resolved_at: null, resolution: null, notes: "14 pending changes older than 8 h." },
  { id: "cf-4", code: "CF-004", type: "ownership", severity: "low", status: "UNKNOWN", entity_a: "HL-107", entity_b: null, detected_at: daysAgo(9), resolved_at: null, resolution: null, notes: "No assignee and no owner recorded; cannot infer." },
  { id: "cf-5", code: "CF-005", type: "duplicate_link", severity: "medium", status: "resolved", entity_a: "HL-102", entity_b: "SYS-102", detected_at: daysAgo(15), resolved_at: daysAgo(14), resolution: "Confirmed intended link; closed.", notes: null },
]);

insert("sync_nodes", [
  { id: "node-1", name: "Site Alpha tablet", kind: "tablet", last_sync_at: hoursAgo(0.2), pending_changes: 0, status: "synced", detail: "Merged cleanly." },
  { id: "node-2", name: "Store gateway", kind: "edge_gateway", last_sync_at: hoursAgo(1), pending_changes: 14, status: "pending", detail: "Waiting on upstream window." },
  { id: "node-3", name: "Field kit 7", kind: "field_kit", last_sync_at: hoursAgo(9), pending_changes: 3, status: "conflict", detail: "Divergent stock edit on container CT-TUBE-018." },
  { id: "node-4", name: "Site Bravo tablet", kind: "tablet", last_sync_at: hoursAgo(26), pending_changes: 6, status: "offline", detail: "No heartbeat since yesterday." },
  { id: "node-5", name: "Mobile relay 2", kind: "field_kit", last_sync_at: null, pending_changes: null, status: "UNKNOWN", detail: "Never registered a sync; counts unknown." },
]);

insert("hitl_exceptions", [
  { id: "hx-1", code: "HX-001", title: "Production deploy apr-2 for sync-service 1.14.0", reason: "Security evidence ev-3 is UNVERIFIED; release policy requires human decision.", severity: "high", status: "OPEN", requested_by: "ci-bot", created_at: daysAgo(2), decided_by: null, decided_at: null, decision_note: null, linked_kind: "deployment_approval", linked_id: "apr-2" },
  { id: "hx-2", code: "HX-002", title: "Quarantine CT-DCN-002 without recorded expiry", reason: "Expiry UNKNOWN; policy requires inspector confirmation.", severity: "medium", status: "EXPIRED", requested_by: "inspector.t.rao", created_at: daysAgo(20), decided_by: null, decided_at: null, decision_note: "Exception window lapsed; item remains quarantined.", linked_kind: "container", linked_id: "ct-dcn-002" },
  { id: "hx-3", code: "HX-003", title: "Early release of CT-FLT-003 (box of 20) for drill", reason: "Expires in 12 days; drill scheduled before expiry.", severity: "low", status: "APPROVED", requested_by: "ops", created_at: daysAgo(5), decided_by: "k.rivera", decided_at: daysAgo(4), decision_note: "Approved for drill use only; must return to store after.", linked_kind: "container", linked_id: "ct-flt-003" },
  { id: "hx-4", code: "HX-004", title: "Bypass release gate for hotfix", reason: "Requested skip of evidence binding.", severity: "critical", status: "REJECTED", requested_by: "unknown", created_at: daysAgo(8), decided_by: "safety-office", decided_at: daysAgo(8), decision_note: "Rejected: no exceptions to evidence binding for production.", linked_kind: "release", linked_id: "rel-1" },
]);

insert("security_events", [
  { id: "sec-1", code: "SEC-001", title: "Anomalous bulk export from sync API", category: "anomaly", severity: "high", status: "OPEN", source: "api-gateway", occurred_at: hoursAgo(4), notes: "3Ã— normal volume from one token; owner unknown.", event_type: "DATA_EXPORT", outcome: "DETECTED", subject_id: "op.j.mendez", source_ip: "10.20.4.18", resource_type: "api_token", resource_id: "tok-8841", correlation_id: "corr-export-01", normalized: 1, ingested_at: hoursAgo(4), asset_id: "asset-api-gateway" },
  { id: "sec-2", code: "SEC-002", title: "Dependency CVE in image base layer", category: "vulnerability", severity: "medium", status: "TRIAGED", source: "scanner", occurred_at: daysAgo(3), notes: "No known exploit path; patch scheduled.", event_type: "VULNERABILITY_DETECTED", outcome: "OPEN", subject_id: null, source_ip: null, resource_type: "container_image", resource_id: "ghcr.io/hlift/sync-service:1.14.0", correlation_id: "corr-cve-01", normalized: 1, ingested_at: daysAgo(3), asset_id: "asset-sync-service" },
  { id: "sec-3", code: "SEC-003", title: "Approval route missing authz check", category: "auth", severity: "critical", status: "MITIGATED", source: "internal-review", occurred_at: daysAgo(12), notes: "Fixed in HL-110; regression test ev-7.", event_type: "POLICY_VIOLATION", outcome: "MITIGATED", subject_id: null, source_ip: null, resource_type: "deployment_approval", resource_id: "apr-3", correlation_id: "corr-authz-01", normalized: 1, ingested_at: daysAgo(12), asset_id: "asset-api-gateway" },
  { id: "sec-4", code: "SEC-004", title: "Unverified firmware provenance on field kit", category: "supply_chain", severity: "high", status: "UNKNOWN", source: "field-report", occurred_at: daysAgo(1), notes: "Provenance record missing; no conclusion.", event_type: "PROVENANCE_UNKNOWN", outcome: "UNKNOWN", subject_id: "op.j.mendez", source_ip: null, resource_type: "endpoint", resource_id: "field-kit-7", correlation_id: null, normalized: 1, ingested_at: daysAgo(1), asset_id: "asset-field-kit-7" },
]);

insert("blockers", [
  { id: "blk-1", code: "BLK-001", title: "Hazmat inspector unavailable for return inspection", severity: "high", owner: "safety-office", status: "OPEN", linked_kind: "container", linked_id: "ct-tube-018", created_at: daysAgo(1), resolved_at: null, notes: "CT-TUBE-018 and two other containers are held in RETURN_HOLD pending inspection." },
  { id: "blk-4", code: "BLK-004", title: "CT-ADH-001 quantity variance unresolved (2.000 OZ)", severity: "high", owner: "safety-office", status: "OPEN", linked_kind: "container", linked_id: "ct-adh-001", created_at: daysAgo(1), resolved_at: null, notes: "Variance recorded, not written off; disposition pending." },
  { id: "blk-2", code: "BLK-002", title: "Staging cluster at capacity for return-intake rc3", severity: "medium", owner: "platform", status: "OPEN", linked_kind: "build_artifact", linked_id: "art-3", created_at: daysAgo(4), resolved_at: null, notes: "Build not produced; artifact status UNKNOWN." },
  { id: "blk-3", code: "BLK-003", title: "Linear API token expired for issue sync", severity: "low", owner: "engineering", status: "RESOLVED", linked_kind: "engineering_issue", linked_id: "iss-7", created_at: daysAgo(10), resolved_at: daysAgo(8), notes: "Rotated." },
]);

// ===========================================================================
// Identity adapter, roles, canonical capabilities and local policy
// ===========================================================================

insert("commands", [
  // NSW enterprise root
  { id: "warcom", code: "WARCOM", name: "Naval Special Warfare Command", level: "HQ", parent_id: null, jurisdiction_tag: "CONUS-CA", unit_type: "HOMEPORT", description: "NSW operational and administrative headquarters; Coronado, CA.", created_at: daysAgo(400) },
  // Type Commands
  { id: "nswg-1", code: "NSWG-1", name: "Naval Special Warfare Group 1 (West)", level: "TYPE_COMMAND", parent_id: "warcom", jurisdiction_tag: "CONUS-CA", unit_type: "HOMEPORT", description: "West Coast NSW type command; Coronado, CA.", created_at: daysAgo(395) },
  { id: "nswg-2", code: "NSWG-2", name: "Naval Special Warfare Group 2 (East)", level: "TYPE_COMMAND", parent_id: "warcom", jurisdiction_tag: "CONUS-VA", unit_type: "HOMEPORT", description: "East Coast NSW type command; Little Creek, VA.", created_at: daysAgo(395) },
  { id: "nswg-4", code: "NSWG-4", name: "Naval Special Warfare Group 4", level: "TYPE_COMMAND", parent_id: "warcom", jurisdiction_tag: "CONUS-VA", unit_type: "HOMEPORT", description: "SBT / riverine type command; Little Creek, VA.", created_at: daysAgo(395) },
  { id: "nswcen", code: "NSWCEN", name: "Naval Special Warfare Center (Training Command)", level: "TYPE_COMMAND", parent_id: "warcom", jurisdiction_tag: "CONUS-CA", unit_type: "HOMEPORT", description: "NSW training command; schoolhouse and detachments.", created_at: daysAgo(395) },
  // Installations / forward hubs
  { id: "logsu-1", code: "LOGSU-1", name: "Logistics Support Unit 1", level: "INSTALLATION", parent_id: "nswg-1", jurisdiction_tag: "CONUS-CA", unit_type: "HOMEPORT", description: "West Coast logistics support; Coronado, CA.", created_at: daysAgo(380) },
  { id: "logsu-2", code: "LOGSU-2", name: "Logistics Support Unit 2", level: "INSTALLATION", parent_id: "nswg-2", jurisdiction_tag: "CONUS-VA", unit_type: "HOMEPORT", description: "East Coast logistics support; Little Creek, VA.", created_at: daysAgo(380) },
  { id: "det-fallon", code: "DET-FALLON", name: "NAS Fallon Training Detachment", level: "INSTALLATION", parent_id: "nswcen", jurisdiction_tag: "CONUS-NV", unit_type: "TRAINING_DET", description: "Desert / air-ground training hub; NAS Fallon, NV.", created_at: daysAgo(380) },
  { id: "det-kodiak", code: "DET-KODIAK", name: "Kodiak Cold Weather Maritime Training Detachment", level: "INSTALLATION", parent_id: "nswcen", jurisdiction_tag: "CONUS-AK", unit_type: "TRAINING_DET", description: "Cold weather maritime training; Kodiak, AK.", created_at: daysAgo(380) },
  { id: "nswu-2-stuttgart", code: "NSWU-2-STUTTGART", name: "NSW Unit 2 Stuttgart (SOCEUR)", level: "INSTALLATION", parent_id: "nswg-2", jurisdiction_tag: "OCONUS-EU-DE", unit_type: "FORWARD_HUB", description: "European forward hub; Stuttgart, Germany.", created_at: daysAgo(380) },
  { id: "nswu-1-guam", code: "NSWU-1-GUAM", name: "NSW Unit 1 Guam (Indo-Pacific)", level: "INSTALLATION", parent_id: "nswg-1", jurisdiction_tag: "OCONUS-PAC", unit_type: "FORWARD_HUB", description: "Indo-Pacific forward hub; Guam.", created_at: daysAgo(380) },
  { id: "nswu-4-south", code: "NSWU-4-SOUTH", name: "NSW Unit 4 SOUTH (SOCSOUTH)", level: "INSTALLATION", parent_id: "nswg-4", jurisdiction_tag: "OCONUS-SOUTHCOM", unit_type: "FORWARD_HUB", description: "South America / Caribbean forward support hub; Homestead and AOR.", created_at: daysAgo(380) },
  // Tenant / operating units (West)
  { id: "st-1", code: "ST-1", name: "SEAL Team 1", level: "TENANT", parent_id: "logsu-1", jurisdiction_tag: "CONUS-CA", unit_type: "HOMEPORT", description: "SEAL team; West.", created_at: daysAgo(300) },
  { id: "st-3", code: "ST-3", name: "SEAL Team 3", level: "TENANT", parent_id: "logsu-1", jurisdiction_tag: "CONUS-CA", unit_type: "HOMEPORT", description: "SEAL team; West.", created_at: daysAgo(300) },
  { id: "sbt-12", code: "SBT-12", name: "Special Boat Team 12", level: "TENANT", parent_id: "logsu-1", jurisdiction_tag: "CONUS-CA", unit_type: "HOMEPORT", description: "SWCC special boat team; West.", created_at: daysAgo(300) },
  { id: "tu-fallon-01", code: "TU-FALLON-01", name: "TU-Fallon-01 (rotating)", level: "TENANT", parent_id: "det-fallon", jurisdiction_tag: "CONUS-NV", unit_type: "DEPLOYED_TU", description: "Fallon rotation task unit.", created_at: daysAgo(290) },
  // Tenant / operating units (East)
  { id: "st-2", code: "ST-2", name: "SEAL Team 2", level: "TENANT", parent_id: "logsu-2", jurisdiction_tag: "CONUS-VA", unit_type: "HOMEPORT", description: "SEAL team; East.", created_at: daysAgo(300) },
  { id: "st-4", code: "ST-4", name: "SEAL Team 4", level: "TENANT", parent_id: "logsu-2", jurisdiction_tag: "CONUS-VA", unit_type: "HOMEPORT", description: "SEAL team; East.", created_at: daysAgo(300) },
  { id: "sbt-20", code: "SBT-20", name: "Special Boat Team 20", level: "TENANT", parent_id: "logsu-2", jurisdiction_tag: "CONUS-VA", unit_type: "HOMEPORT", description: "SWCC special boat team; East.", created_at: daysAgo(300) },
  { id: "tu-stuttgart-01", code: "TU-STUTTGART-01", name: "TU-Stuttgart-01 (EU forward)", level: "TENANT", parent_id: "nswu-2-stuttgart", jurisdiction_tag: "OCONUS-EU-DE", unit_type: "DEPLOYED_TU", description: "European forward rotation task unit.", created_at: daysAgo(290) },
  // SOUTHCOM / South America elements
  { id: "sbt-22", code: "SBT-22", name: "Special Boat Team 22", level: "TENANT", parent_id: "nswu-4-south", jurisdiction_tag: "OCONUS-SOUTHCOM", unit_type: "HOMEPORT", description: "Riverine / special boat team; SOUTHCOM.", created_at: daysAgo(290) },
  { id: "det-south-colombia", code: "DET-SOUTH-COLOMBIA", name: "Det SOUTH Colombia", level: "TENANT", parent_id: "nswu-4-south", jurisdiction_tag: "OCONUS-SOUTHCOM-CO", unit_type: "FORWARD_HUB", description: "Colombia maritime element; SOUTHCOM.", created_at: daysAgo(290) },
  { id: "det-south-peru", code: "DET-SOUTH-PERU", name: "Det SOUTH Peru", level: "TENANT", parent_id: "nswu-4-south", jurisdiction_tag: "OCONUS-SOUTHCOM-PE", unit_type: "FORWARD_HUB", description: "Peru maritime element; SOUTHCOM.", created_at: daysAgo(290) },
  { id: "tu-panama-01", code: "TU-PANAMA-01", name: "TU-Panama-01 (riverine)", level: "TENANT", parent_id: "nswu-4-south", jurisdiction_tag: "OCONUS-SOUTHCOM-PA", unit_type: "DEPLOYED_TU", description: "Panama riverine task unit.", created_at: daysAgo(290) },
]);

insert("custody_transfers", [
  { id: "tr-0001", transfer_group: "tr-group-001", container_id: "ct-nsw-bat-9001", source_command_id: "logsu-2", destination_command_id: "tu-stuttgart-01", custodian_id: "cust.k.rivera", packed_at: daysAgo(45), transferred_at: daysAgo(44), due_at: daysAhead(60), deployment_order: "DEPL-2026-003", status: "TRANSFERRED", returned_unused_quantity: null, returned_unused_unit: null, reconciliation_notes: null, notes: "Packed out for East Coast deployment.", correlation_id: "corr-deploy-001", created_by: "cust.k.rivera" },
]);

insert("principals", [
  { id: "pr-op-mendez", subject_id: "op.j.mendez", display_name: "J. Mendez", email: "j.mendez@demo.dod.mil", command_id: "st-2", facility_id: "FAC-STORE", credential_assurance: "HIGH", idp_issuer: "demo.dod.idp", status: "ACTIVE", attributes: canonicalJson({ billet: "HAZMAT handler", clearance: "SECRET", cac_present: true }), created_at: daysAgo(180), last_seen_at: minutesAgo(12) },
  { id: "pr-cust-rivera", subject_id: "cust.k.rivera", display_name: "K. Rivera", email: "k.rivera@demo.dod.mil", command_id: "logsu-2", facility_id: "FAC-STORE", credential_assurance: "HIGH", idp_issuer: "demo.dod.idp", status: "ACTIVE", attributes: canonicalJson({ billet: "HAZMAT custodian", clearance: "SECRET", cac_present: true }), created_at: daysAgo(360), last_seen_at: minutesAgo(3) },
  { id: "pr-it-okoro", subject_id: "it.a.okoro", display_name: "A. Okoro", email: "a.okoro@demo.dod.mil", command_id: "nswg-2", facility_id: "FAC-STORE", credential_assurance: "HIGH", idp_issuer: "demo.dod.idp", status: "ACTIVE", attributes: canonicalJson({ billet: "platform administrator", clearance: "SECRET", cac_present: true }), created_at: daysAgo(300), last_seen_at: minutesAgo(45) },
  { id: "pr-cyber-lee", subject_id: "cyber.s.lee", display_name: "S. Lee", email: "s.lee@demo.dod.mil", command_id: "nswg-2", facility_id: "FAC-STORE", credential_assurance: "HIGH", idp_issuer: "demo.dod.idp", status: "ACTIVE", attributes: canonicalJson({ billet: "cybersecurity analyst", clearance: "TOP SECRET", cac_present: true }), created_at: daysAgo(280), last_seen_at: minutesAgo(8) },
  { id: "pr-cmd-patel", subject_id: "cmd.capt.patel", display_name: "Capt. R. Patel", email: "r.patel@demo.dod.mil", command_id: "warcom", facility_id: "COMMAND-NAVSUP", credential_assurance: "HIGH", idp_issuer: "demo.dod.idp", status: "ACTIVE", attributes: canonicalJson({ billet: "commanding officer", clearance: "TOP SECRET", cac_present: true }), created_at: daysAgo(400), last_seen_at: hoursAgo(3) },
  { id: "pr-aud-wright", subject_id: "aud.d.wright", display_name: "D. Wright", email: "d.wright@demo.dod.mil", command_id: "warcom", facility_id: "COMMAND-NAVSUP", credential_assurance: "HIGH", idp_issuer: "demo.dod.idp", status: "ACTIVE", attributes: canonicalJson({ billet: "independent assessor", clearance: "SECRET", cac_present: true }), created_at: daysAgo(200), last_seen_at: hoursAgo(20) },
]);

insert("roles", [
  { id: "role-op", code: "HAZMAT_OPERATOR", name: "HAZMAT Operator", description: "Performs authorized material transactions.", is_command_defined: 0 },
  { id: "role-cust", code: "HAZMAT_CUSTODIAN", name: "HAZMAT Custodian", description: "Controls inventory, custody, issue and inspection processes.", is_command_defined: 0 },
  { id: "role-it", code: "IT_ADMINISTRATOR", name: "IT Administrator", description: "Maintains the technical platform and configuration baseline.", is_command_defined: 0 },
  { id: "role-cyber", code: "CYBERSECURITY_PERSONNEL", name: "Cybersecurity Personnel", description: "Monitors, investigates and protects the system.", is_command_defined: 0 },
  { id: "role-cmd", code: "COMMAND_OVERSIGHT", name: "Command Oversight", description: "Observes readiness and risk; read, acknowledge and review by default.", is_command_defined: 0 },
  { id: "role-aud", code: "AUDITOR_ASSESSOR", name: "Auditor / Assessor", description: "Independently examines controls and evidence.", is_command_defined: 0 },
]);

insert("capability_catalog", [
  { code: "material.request", name: "Request material", plane: "OPERATIONAL", description: "Create a material issue request.", is_write: 1 },
  { code: "material.issue", name: "Issue material", plane: "OPERATIONAL", description: "Reserve, pick and issue a physical container.", is_write: 1 },
  { code: "material.receive", name: "Receive material", plane: "OPERATIONAL", description: "Receive a container into custody or stock.", is_write: 1 },
  { code: "material.return", name: "Return material", plane: "OPERATIONAL", description: "Receive a partial-use return into RETURN_HOLD.", is_write: 1 },
  { code: "material.inspect", name: "Inspect material", plane: "OPERATIONAL", description: "Record the eight-point return inspection and outcome.", is_write: 1 },
  { code: "material.relabel", name: "Relabel container", plane: "OPERATIONAL", description: "Reprint a container label after verification.", is_write: 1 },
  { code: "material.transfer", name: "Transfer custody", plane: "OPERATIONAL", description: "Pack out and transfer containers to a deploying task unit.", is_write: 1 },
  { code: "inventory.read", name: "Read inventory", plane: "OPERATIONAL", description: "Read material, container and custody records.", is_write: 0 },
  { code: "inventory.adjust", name: "Adjust inventory", plane: "OPERATIONAL", description: "Record a lifecycle transition or measured adjustment.", is_write: 1 },
  { code: "inventory.reconcile", name: "Reconcile inventory", plane: "OPERATIONAL", description: "Resolve discrepancies and conflicts.", is_write: 1 },
  { code: "security.events.read", name: "Read security events", plane: "CYBERSECURITY", description: "Read the normalized event register.", is_write: 0 },
  { code: "security.incident.manage", name: "Manage incidents", plane: "CYBERSECURITY", description: "Open, investigate, contain and close incidents.", is_write: 1 },
  { code: "security.configuration.manage", name: "Manage configuration", plane: "CYBERSECURITY", description: "Change the security configuration baseline.", is_write: 1 },
  { code: "security.vulnerability.manage", name: "Manage vulnerabilities", plane: "CYBERSECURITY", description: "Triage, mitigate and remediate vulnerabilities.", is_write: 1 },
  { code: "assurance.controls.read", name: "Read controls", plane: "ASSURANCE", description: "Read the control catalogue and implementation status.", is_write: 0 },
  { code: "assurance.evidence.read", name: "Read evidence", plane: "ASSURANCE", description: "Read and export control evidence objects.", is_write: 0 },
  { code: "assurance.finding.manage", name: "Manage findings", plane: "ASSURANCE", description: "Assess controls and open or advance findings.", is_write: 1 },
  { code: "assurance.finding.close", name: "Close finding", plane: "ASSURANCE", description: "Narrow command acknowledgement required to close a finding.", is_write: 1 },
  { code: "oversight.read", name: "Read command posture", plane: "GOVERNANCE", description: "Read readiness, risk and status without altering records.", is_write: 0 },
  { code: "release.approve", name: "Approve release", plane: "GOVERNANCE", description: "Approve a deployment after evidence review; self-approval is denied.", is_write: 1 },
  { code: "exception.decide", name: "Decide exception", plane: "GOVERNANCE", description: "Decide a human-in-the-loop exception.", is_write: 1 },
]);

insert("principal_roles", [
  { id: "prr-1", principal_id: "pr-op-mendez", role_id: "role-op", command_id: "st-2", facility_id: "FAC-STORE", assigned_at: daysAgo(180), assigned_by: "cust.k.rivera", status: "ACTIVE" },
  { id: "prr-2", principal_id: "pr-cust-rivera", role_id: "role-cust", command_id: "logsu-2", facility_id: "FAC-STORE", assigned_at: daysAgo(360), assigned_by: "cmd.capt.patel", status: "ACTIVE" },
  { id: "prr-3", principal_id: "pr-it-okoro", role_id: "role-it", command_id: "nswg-2", facility_id: "FAC-STORE", assigned_at: daysAgo(300), assigned_by: "cmd.capt.patel", status: "ACTIVE" },
  { id: "prr-4", principal_id: "pr-cyber-lee", role_id: "role-cyber", command_id: "nswg-2", facility_id: "FAC-STORE", assigned_at: daysAgo(280), assigned_by: "cmd.capt.patel", status: "ACTIVE" },
  { id: "prr-5", principal_id: "pr-cmd-patel", role_id: "role-cmd", command_id: "warcom", facility_id: "COMMAND-NAVSUP", assigned_at: daysAgo(400), assigned_by: "higher-headquarters", status: "ACTIVE" },
  { id: "prr-6", principal_id: "pr-aud-wright", role_id: "role-aud", command_id: "warcom", facility_id: "COMMAND-NAVSUP", assigned_at: daysAgo(200), assigned_by: "higher-headquarters", status: "ACTIVE" },
]);

const grants = {
  "role-op": ["material.request", "material.receive", "material.return", "inventory.read"],
  "role-cust": ["material.issue", "material.receive", "material.return", "material.inspect", "material.relabel", "material.transfer", "inventory.read", "inventory.adjust", "inventory.reconcile", "exception.decide"],
  "role-it": ["security.events.read", "security.configuration.manage", "release.approve"],
  "role-cyber": ["security.events.read", "security.incident.manage", "security.configuration.manage", "security.vulnerability.manage"],
  "role-cmd": ["oversight.read", "inventory.read", "security.events.read", "assurance.controls.read", "assurance.evidence.read", "assurance.finding.close"],
  "role-aud": ["assurance.controls.read", "assurance.evidence.read", "assurance.finding.manage", "inventory.read"],
};
insert(
  "role_capabilities",
  Object.entries(grants).flatMap(([role, caps]) =>
    caps.map((c) => ({ role_id: role, capability_code: c, constraint_scope: null }))
  )
);

// Local policy. Writes require HIGH credential assurance. Facility-scoped
// actions require the principal and resource to share a facility. Expiry is a
// time rule that can block issue and relabel even when the state is legal.
const policySpec = [
  ["material.request", "HIGH", "MATCH", null, 0],
  ["material.issue", "HIGH", "MATCH", ["AVAILABLE", "RESERVED"], 1],
  ["material.receive", "HIGH", "MATCH", ["RESERVED", "PICKUP_READY"], 1],
  ["material.return", "HIGH", "MATCH", ["ISSUED", "IN_CUSTODY", "IN_USE", "RETURN_RECEIVED"], 0],
  ["material.inspect", "HIGH", "MATCH", ["RETURN_HOLD"], 1],
  ["material.relabel", "HIGH", "MATCH", ["RELABEL_REQUIRED"], 1],
  ["material.transfer", "HIGH", "MATCH", null, 0],
  ["inventory.read", "LOW", "MATCH", null, 0],
  ["inventory.adjust", "HIGH", "MATCH", null, 0],
  ["inventory.reconcile", "HIGH", "MATCH", null, 0],
  ["release.approve", "HIGH", "ANY", null, 0],
  ["exception.decide", "HIGH", "ANY", null, 0],
  ["security.events.read", "LOW", "ANY", null, 0],
  ["security.incident.manage", "HIGH", "ANY", null, 0],
  ["security.configuration.manage", "HIGH", "ANY", null, 0],
  ["security.vulnerability.manage", "HIGH", "ANY", null, 0],
  ["assurance.controls.read", "LOW", "ANY", null, 0],
  ["assurance.evidence.read", "LOW", "ANY", null, 0],
  ["assurance.finding.manage", "HIGH", "ANY", null, 0],
  ["assurance.finding.close", "HIGH", "ANY", null, 0],
  ["oversight.read", "LOW", "ANY", null, 0],
];

insert(
  "policies",
  policySpec.map(([capability, assurance, scope, states, expiry], idx) => ({
    id: `pol-${String(idx + 1).padStart(3, "0")}`,
    version: 1,
    name: `${capability} baseline policy`,
    plane: capability.startsWith("material.") || capability.startsWith("inventory.")
      ? "OPERATIONAL"
      : capability.startsWith("security.")
        ? "CYBERSECURITY"
        : capability.startsWith("assurance.")
          ? "ASSURANCE"
          : "GOVERNANCE",
    capability_code: capability,
    effect: "PERMIT",
    requires_assurance: assurance,
    facility_scope: scope,
    command_scope:
      assurance === "LOW"
        ? "DESCENDANTS"
        : scope === "ANY"
          ? "ANY"
          : "MATCH",
    allowed_states: states ? JSON.stringify(states) : null,
    require_valid_expiry: expiry,
    obligations: capability === "assurance.finding.close" ? JSON.stringify(["COMMAND_ACKNOWLEDGEMENT_REQUIRED"]) : null,
    description: `Local baseline policy for ${capability}.`,
    active: 1,
    created_at: daysAgo(60),
  }))
);

// Historical authorization decisions, including denied attempts. These are
// records, not illustrations: each also appears on the audit bus.
const seedDecisions = [
  { id: "authz-seed-01", decided_at: hoursAgo(4), principal_id: "pr-op-mendez", subject_id: "op.j.mendez", roles: ["HAZMAT_OPERATOR"], command_id: "st-2", facility_id: "FAC-STORE", resource_type: "container", resource_id: "ct-lub-0010", action: "MATERIAL_REQUEST", capability_code: "material.request", lifecycle_state: "AVAILABLE", credential_assurance: "HIGH", policy_id: "pol-001", permitted: 0, reason_code: "LIFECYCLE_STATE_BLOCKED", obligations: [], correlation_id: null },
  { id: "authz-seed-02", decided_at: hoursAgo(6), principal_id: "pr-op-mendez", subject_id: "op.j.mendez", roles: ["HAZMAT_OPERATOR"], command_id: "st-2", facility_id: "FAC-STORE", resource_type: "container", resource_id: "ct-hyd-0001", action: "MATERIAL_ISSUE", capability_code: "material.issue", lifecycle_state: "AVAILABLE", credential_assurance: "HIGH", policy_id: "pol-002", permitted: 0, reason_code: "MISSING_CAPABILITY", obligations: [], correlation_id: null },
  { id: "authz-seed-03", decided_at: hoursAgo(8), principal_id: "pr-cust-rivera", subject_id: "cust.k.rivera", roles: ["HAZMAT_CUSTODIAN"], command_id: "logsu-2", facility_id: "FAC-STORE", resource_type: "container", resource_id: "ct-hyd-0003", action: "MATERIAL_RETURN", capability_code: "material.return", lifecycle_state: "IN_USE", credential_assurance: "HIGH", policy_id: "pol-004", permitted: 0, reason_code: "FACILITY_SCOPE_MISMATCH", obligations: [], correlation_id: null },
  { id: "authz-seed-04", decided_at: hoursAgo(9), principal_id: "pr-cust-rivera", subject_id: "cust.k.rivera", roles: ["HAZMAT_CUSTODIAN"], command_id: "logsu-2", facility_id: "FAC-STORE", resource_type: "security_asset", resource_id: "asset-api-gateway", action: "SECURITY_CONFIGURATION_MANAGE", capability_code: "security.configuration.manage", lifecycle_state: null, credential_assurance: "HIGH", policy_id: "pol-014", permitted: 0, reason_code: "MISSING_CAPABILITY", obligations: [], correlation_id: null },
  { id: "authz-seed-05", decided_at: hoursAgo(10), principal_id: "pr-cust-rivera", subject_id: "cust.k.rivera", roles: ["HAZMAT_CUSTODIAN"], command_id: "logsu-2", facility_id: "FAC-STORE", resource_type: "container", resource_id: "ct-tube-014", action: "MATERIAL_INSPECT", capability_code: "material.inspect", lifecycle_state: "RETURN_HOLD", credential_assurance: "HIGH", policy_id: "pol-005", permitted: 1, reason_code: "PERMITTED", obligations: [], correlation_id: null },
  { id: "authz-seed-06", decided_at: hoursAgo(7), principal_id: "pr-cyber-lee", subject_id: "cyber.s.lee", roles: ["CYBERSECURITY_PERSONNEL"], command_id: "nswg-2", facility_id: "FAC-STORE", resource_type: "security_incident", resource_id: "INC-2026-001", action: "SECURITY_INCIDENT_MANAGE", capability_code: "security.incident.manage", lifecycle_state: "OPEN", credential_assurance: "HIGH", policy_id: "pol-013", permitted: 1, reason_code: "PERMITTED", obligations: [], correlation_id: "corr-export-01" },
  { id: "authz-seed-07", decided_at: hoursAgo(3), principal_id: "pr-cmd-patel", subject_id: "cmd.capt.patel", roles: ["COMMAND_OVERSIGHT"], command_id: "warcom", facility_id: "COMMAND-NAVSUP", resource_type: "summary", resource_id: "inventory-readiness", action: "OVERSIGHT_READ", capability_code: "oversight.read", lifecycle_state: null, credential_assurance: "HIGH", policy_id: "pol-020", permitted: 1, reason_code: "PERMITTED", obligations: [], correlation_id: null },
  { id: "authz-seed-08", decided_at: hoursAgo(5), principal_id: "pr-aud-wright", subject_id: "aud.d.wright", roles: ["AUDITOR_ASSESSOR"], command_id: "warcom", facility_id: "COMMAND-NAVSUP", resource_type: "finding", resource_id: "FND-2026-001", action: "ASSURANCE_FINDING_CLOSE", capability_code: "assurance.finding.close", lifecycle_state: "OPEN", credential_assurance: "HIGH", policy_id: "pol-019", permitted: 0, reason_code: "MISSING_CAPABILITY", obligations: [], correlation_id: null },
  { id: "authz-seed-09", decided_at: daysAgo(1), principal_id: "pr-it-okoro", subject_id: "it.a.okoro", roles: ["IT_ADMINISTRATOR"], command_id: "nswg-2", facility_id: "FAC-STORE", resource_type: "deployment_approval", resource_id: "apr-3", action: "RELEASE_APPROVE", capability_code: "release.approve", lifecycle_state: "pending", credential_assurance: "HIGH", policy_id: "pol-010", permitted: 1, reason_code: "PERMITTED", obligations: ["RECORD_APPROVAL_NOTE"], correlation_id: null },
];

insert(
  "authorization_decisions",
  seedDecisions.map((d) => ({
    ...d,
    roles: JSON.stringify(d.roles),
    obligations: JSON.stringify(d.obligations),
  }))
);

// ===========================================================================
// Cybersecurity plane: assets, sources, incidents, vulnerabilities, checks
// ===========================================================================

insert("security_assets", [
  { id: "asset-api-gateway", name: "Public API gateway", asset_type: "API", environment: "PRODUCTION", owner_command: "logsu-2", facility_id: "FAC-STORE", criticality: "CRITICAL", exposure: "PARTNER", status: "ACTIVE", created_at: daysAgo(240), notes: "Terminates mutual TLS for partner commands." },
  { id: "asset-sync-service", name: "Offline sync service", asset_type: "CONTAINER", environment: "PRODUCTION", owner_command: "logsu-2", facility_id: "FAC-STORE", criticality: "HIGH", exposure: "INTERNAL", status: "ACTIVE", created_at: daysAgo(200), notes: null },
  { id: "asset-db", name: "H-LIFT primary database", asset_type: "DATABASE", environment: "PRODUCTION", owner_command: "warcom", facility_id: "FAC-STORE", criticality: "CRITICAL", exposure: "INTERNAL", status: "ACTIVE", created_at: daysAgo(260), notes: "Hash-chained audit bus stored here." },
  { id: "asset-field-kit-7", name: "Field kit 7 endpoint", asset_type: "ENDPOINT", environment: "FIELD", owner_command: "st-2", facility_id: "FAC-STORE", criticality: "MEDIUM", exposure: "INTERNET", status: "ACTIVE", created_at: daysAgo(150), notes: "Intermittent connectivity." },
  { id: "asset-idp-bridge", name: "Identity adapter bridge", asset_type: "IDP", environment: "PRODUCTION", owner_command: "nswg-2", facility_id: "FAC-STORE", criticality: "CRITICAL", exposure: "INTERNAL", status: "ACTIVE", created_at: daysAgo(180), notes: "Holds no credentials; assertion verification only." },
]);

insert("security_ingest_sources", [
  { id: "src-idp", name: "DoD identity provider", kind: "IDP", status: "ACTIVE", last_ingest_at: minutesAgo(2), event_count: 18, notes: "Authentication and authorization context." },
  { id: "src-api", name: "API gateway", kind: "API_GATEWAY", status: "ACTIVE", last_ingest_at: minutesAgo(4), event_count: 3, notes: null },
  { id: "src-host", name: "Host / container telemetry", kind: "HOST_TELEMETRY", status: "ACTIVE", last_ingest_at: minutesAgo(15), event_count: 2, notes: null },
  { id: "src-scanner", name: "Vulnerability scanner", kind: "VULNERABILITY_SCANNER", status: "ACTIVE", last_ingest_at: hoursAgo(6), event_count: 2, notes: "Nightly image and dependency scan." },
  { id: "src-config", name: "Configuration monitor", kind: "CONFIG_MONITOR", status: "ACTIVE", last_ingest_at: minutesAgo(30), event_count: 3, notes: null },
  { id: "src-integrity", name: "File integrity monitor", kind: "INTEGRITY", status: "STALE", last_ingest_at: hoursAgo(30), event_count: 3, notes: "No heartbeat for 30 h; treated as UNKNOWN, not healthy." },
  { id: "src-sensor", name: "Field sensor relay", kind: "SENSOR", status: "ACTIVE", last_ingest_at: hoursAgo(2), event_count: 1, notes: null },
]);

insert("security_incidents", [
  { id: "inc-1", code: "INC-2026-001", title: "Anomalous bulk export from sync API", severity: "high", status: "OPEN", category: "data_exfiltration", opened_at: hoursAgo(4), closed_at: null, owner_subject: "cyber.s.lee", correlated_event_count: 2, summary: "One API token produced three times the normal export volume in four minutes.", containment: "Token suspended pending owner confirmation.", notes: "Owner attribution unresolved." },
  { id: "inc-2", code: "INC-2026-002", title: "Repeated failed console authentications", severity: "medium", status: "INVESTIGATING", category: "authentication", opened_at: hoursAgo(5), closed_at: null, owner_subject: "cyber.s.lee", correlated_event_count: 8, summary: "Fourteen failed attempts across two subjects within 24 h; source addresses cluster in one /24.", containment: "Rate limit applied; no successful login from the cluster.", notes: "Checking whether the pattern is a mistyped credential or password spraying." },
  { id: "inc-3", code: "INC-2026-003", title: "Unverified firmware provenance on field kit", severity: "high", status: "CONTAINED", category: "supply_chain", opened_at: daysAgo(1), closed_at: null, owner_subject: "it.a.okoro", correlated_event_count: 1, summary: "Provenance record missing for the installed firmware image.", containment: "Endpoint isolated from the field network.", notes: "Awaiting vendor attestation." },
  { id: "inc-4", code: "INC-2026-004", title: "Dependency CVE in image base layer", severity: "medium", status: "CLOSED", category: "vulnerability", opened_at: daysAgo(5), closed_at: daysAgo(2), owner_subject: "it.a.okoro", correlated_event_count: 1, summary: "Base image carried a vulnerable compression library.", containment: "Image rebuilt on a patched base.", notes: null },
]);

insert("incident_actions", [
  { id: "ia-1", incident_id: "inc-1", action: "OPENED", actor_subject: "cyber.s.lee", at: hoursAgo(4), notes: "Correlated export anomaly from api-gateway." },
  { id: "ia-2", incident_id: "inc-1", action: "CONTAINMENT_STARTED", actor_subject: "cyber.s.lee", at: hoursAgo(3.5), notes: "Token suspended." },
  { id: "ia-3", incident_id: "inc-2", action: "OPENED", actor_subject: "cyber.s.lee", at: hoursAgo(5), notes: "Failed-login burst crossed threshold." },
  { id: "ia-4", incident_id: "inc-2", action: "INVESTIGATING", actor_subject: "cyber.s.lee", at: hoursAgo(4.5), notes: "Source addresses and subjects under review." },
  { id: "ia-5", incident_id: "inc-3", action: "CONTAINED", actor_subject: "it.a.okoro", at: hoursAgo(18), notes: "Endpoint isolated." },
  { id: "ia-6", incident_id: "inc-4", action: "CLOSED", actor_subject: "it.a.okoro", at: daysAgo(2), notes: "Patched image deployed; scan clean." },
]);

const mkEvent = (e) => ({
  id: e.id,
  code: e.code,
  title: e.title,
  category: e.category,
  severity: e.severity,
  status: e.status,
  source: e.source,
  occurred_at: e.at,
  notes: e.notes ?? null,
  event_type: e.type,
  outcome: e.outcome,
  subject_id: e.subject ?? null,
  source_ip: e.ip ?? null,
  resource_type: e.rtype ?? null,
  resource_id: e.rid ?? null,
  correlation_id: e.corr ?? null,
  normalized: 1,
  ingested_at: e.at,
  asset_id: e.asset ?? null,
});

const authEvents = [];
for (let i = 1; i <= 14; i++) {
  authEvents.push(
    mkEvent({
      id: `sec-auth-${i}`,
      code: `SEC-1${String(i).padStart(2, "0")}`,
      title: `Failed console authentication for ${i % 3 === 0 ? "op.j.mendez" : "cust.k.rivera"}`,
      category: "authentication",
      severity: i <= 3 ? "medium" : "low",
      status: i <= 2 ? "OPEN" : "TRIAGED",
      source: "idp",
      at: i <= 12 ? minutesAgo(18 * i) : daysAgo(2),
      type: "AUTHENTICATION",
      outcome: "FAILURE",
      subject: i % 3 === 0 ? "op.j.mendez" : "cust.k.rivera",
      ip: `10.20.9.${20 + (i % 7)}`,
      rtype: "principal",
      rid: i % 3 === 0 ? "op.j.mendez" : "cust.k.rivera",
      corr: i <= 8 ? "corr-auth-burst-01" : null,
      asset: "asset-idp-bridge",
      notes: "Assertion rejected by the identity service; no credential reached H-LIFT.",
    })
  );
}

const otherEvents = [
  mkEvent({ id: "sec-cfg-1", code: "SEC-201", title: "TLS minimum version drifted below baseline", category: "configuration", severity: "high", status: "OPEN", source: "config-monitor", at: hoursAgo(2), type: "CONFIGURATION_DRIFT", outcome: "DRIFT", rtype: "security_asset", rid: "asset-api-gateway", corr: "corr-config-01", asset: "asset-api-gateway", notes: "Observed TLS 1.1 permitted on one listener." }),
  mkEvent({ id: "sec-cfg-2", code: "SEC-202", title: "Audit retention window reduced", category: "configuration", severity: "medium", status: "OPEN", source: "config-monitor", at: hoursAgo(7), type: "CONFIGURATION_DRIFT", outcome: "DRIFT", rtype: "security_asset", rid: "asset-db", corr: "corr-config-01", asset: "asset-db", notes: "Observed 30 days, baseline requires 90 days." }),
  mkEvent({ id: "sec-int-1", code: "SEC-203", title: "Binary digest mismatch on sync-service", category: "integrity", severity: "critical", status: "OPEN", source: "integrity-monitor", at: hoursAgo(3), type: "INTEGRITY_MISMATCH", outcome: "MISMATCH", rtype: "container_image", rid: "ghcr.io/hlift/sync-service:1.14.0", corr: "corr-integrity-01", asset: "asset-sync-service", notes: "Observed digest does not match the signed build record." }),
  mkEvent({ id: "sec-api-1", code: "SEC-204", title: "API token exceeded export rate limit", category: "anomaly", severity: "high", status: "OPEN", source: "api-gateway", at: hoursAgo(4), type: "RATE_LIMIT_EXCEEDED", outcome: "BLOCKED", subject: "op.j.mendez", rtype: "api_token", rid: "tok-8841", corr: "corr-export-01", asset: "asset-api-gateway", notes: "Request blocked after threshold." }),
  mkEvent({ id: "sec-host-1", code: "SEC-205", title: "Unexpected outbound connection from field kit", category: "anomaly", severity: "medium", status: "UNKNOWN", source: "host-telemetry", at: hoursAgo(11), type: "NETWORK_ANOMALY", outcome: "UNKNOWN", rtype: "endpoint", rid: "field-kit-7", corr: null, asset: "asset-field-kit-7", notes: "Destination unresolved; not concluded benign." }),
  mkEvent({ id: "sec-scan-1", code: "SEC-206", title: "Nightly scan completed with 7 open findings", category: "vulnerability", severity: "medium", status: "TRIAGED", source: "scanner", at: hoursAgo(6), type: "SCAN_COMPLETE", outcome: "COMPLETE", rtype: "security_asset", rid: "asset-api-gateway", corr: "corr-cve-01", asset: "asset-api-gateway", notes: "Counts from scanner output." }),
];

insert("security_events", [...authEvents, ...otherEvents]);

insert("security_event_links", [
  { event_id: "sec-1", incident_id: "inc-1", linked_at: hoursAgo(4) },
  { event_id: "sec-api-1", incident_id: "inc-1", linked_at: hoursAgo(4) },
  ...authEvents.slice(0, 8).map((e) => ({ event_id: e.id, incident_id: "inc-2", linked_at: hoursAgo(5) })),
  { event_id: "sec-4", incident_id: "inc-3", linked_at: daysAgo(1) },
  { event_id: "sec-2", incident_id: "inc-4", linked_at: daysAgo(5) },
]);

insert("vulnerabilities", [
  { id: "vul-1", code: "VUL-2026-001", title: "Compression library heap overflow", cve_id: "CVE-2026-21894", severity: "CRITICAL", status: "OPEN", asset_id: "asset-sync-service", discovered_at: daysAgo(3), due_at: daysAhead(4), remediated_at: null, cvss: "9.800", source: "scanner", notes: "Reachable through image unpack path." },
  { id: "vul-2", code: "VUL-2026-002", title: "Partner TLS listener permits TLS 1.1", cve_id: null, severity: "HIGH", status: "OPEN", asset_id: "asset-api-gateway", discovered_at: hoursAgo(2), due_at: daysAhead(7), remediated_at: null, cvss: "7.400", source: "config-monitor", notes: "Configuration finding, no CVE." },
  { id: "vul-3", code: "VUL-2026-003", title: "Session cookie missing SameSite on legacy path", cve_id: null, severity: "MEDIUM", status: "TRIAGED", asset_id: "asset-api-gateway", discovered_at: daysAgo(8), due_at: daysAhead(20), remediated_at: null, cvss: "5.300", source: "internal-review", notes: "Mitigated by strict origin check; fix pending." },
  { id: "vul-4", code: "VUL-2026-004", title: "Outdated OpenSSL in field-kit image", cve_id: "CVE-2025-15467", severity: "HIGH", status: "OPEN", asset_id: "asset-field-kit-7", discovered_at: daysAgo(6), due_at: daysAhead(2), remediated_at: null, cvss: "8.100", source: "scanner", notes: "Field kit update window required." },
  { id: "vul-5", code: "VUL-2026-005", title: "Database backup encryption key rotation overdue", cve_id: null, severity: "MEDIUM", status: "TRIAGED", asset_id: "asset-db", discovered_at: daysAgo(15), due_at: daysAhead(12), remediated_at: null, cvss: "6.000", source: "config-monitor", notes: "Rotation runbook exists." },
  { id: "vul-6", code: "VUL-2026-006", title: "Verbose error responses expose stack traces", cve_id: null, severity: "LOW", status: "OPEN", asset_id: "asset-api-gateway", discovered_at: daysAgo(10), due_at: daysAhead(30), remediated_at: null, cvss: "3.700", source: "internal-review", notes: null },
  { id: "vul-7", code: "VUL-2026-007", title: "IdP bridge accepts deprecated signature algorithm", cve_id: null, severity: "HIGH", status: "TRIAGED", asset_id: "asset-idp-bridge", discovered_at: daysAgo(4), due_at: daysAhead(9), remediated_at: null, cvss: "7.100", source: "config-monitor", notes: "Allowlist tightened; code change pending." },
  { id: "vul-8", code: "VUL-2026-008", title: "Container base image CVE", cve_id: "CVE-2025-99001", severity: "MEDIUM", status: "REMEDIATED", asset_id: "asset-sync-service", discovered_at: daysAgo(20), due_at: daysAgo(6), remediated_at: daysAgo(2), cvss: "5.900", source: "scanner", notes: "Patched base image deployed." },
  { id: "vul-9", code: "VUL-2026-009", title: "Unused debug endpoint exposed internally", cve_id: null, severity: "LOW", status: "REMEDIATED", asset_id: "asset-api-gateway", discovered_at: daysAgo(30), due_at: daysAgo(10), remediated_at: daysAgo(12), cvss: "2.900", source: "internal-review", notes: "Endpoint removed." },
]);

insert("configuration_checks", [
  { id: "cfg-1", asset_id: "asset-api-gateway", check_code: "TLS-MIN-VERSION", baseline: "TLS1.2", observed: "TLS1.1", status: "DRIFT", checked_at: hoursAgo(2), drift_detail: "One listener still permits TLS 1.1.", notes: null },
  { id: "cfg-2", asset_id: "asset-db", check_code: "AUDIT-RETENTION-DAYS", baseline: "90", observed: "30", status: "DRIFT", checked_at: hoursAgo(7), drift_detail: "Retention reduced from 90 to 30 days.", notes: "Change ticket not found." },
  { id: "cfg-3", asset_id: "asset-idp-bridge", check_code: "SIGNATURE-ALGORITHM", baseline: "RS256", observed: "RS256", status: "PASS", checked_at: hoursAgo(5), drift_detail: null, notes: null },
  { id: "cfg-4", asset_id: "asset-sync-service", check_code: "READ-ONLY-ROOTFS", baseline: "true", observed: "true", status: "PASS", checked_at: hoursAgo(6), drift_detail: null, notes: null },
  { id: "cfg-5", asset_id: "asset-field-kit-7", check_code: "DISK-ENCRYPTION", baseline: "enabled", observed: null, status: "UNKNOWN", checked_at: hoursAgo(26), drift_detail: "Endpoint offline; cannot observe.", notes: null },
]);

insert("integrity_checks", [
  { id: "int-1", asset_id: "asset-sync-service", target: "ghcr.io/hlift/sync-service:1.14.0", expected_hash: "sha256:1f9c2b7d4e8a6c0f3b5d7e9a1c2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b", observed_hash: "sha256:9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b", status: "MISMATCH", checked_at: hoursAgo(3), notes: "Digest differs from the signed build record." },
  { id: "int-2", asset_id: "asset-db", target: "data/hlift.db", expected_hash: "sha256:aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66", observed_hash: "sha256:aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00ee11ff22aa33bb44cc55dd66", status: "MATCH", checked_at: hoursAgo(1), notes: null },
  { id: "int-3", asset_id: "asset-api-gateway", target: "config/gateway.yaml", expected_hash: "sha256:11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff", observed_hash: null, status: "UNKNOWN", checked_at: hoursAgo(30), notes: "Integrity source stale; observation unavailable." },
]);

// ===========================================================================
// Assurance plane: 42 controls, evidence, assessments, findings and POA&M
// ===========================================================================

const FAMILIES = {
  AC: "Access Control",
  IA: "Identification and Authentication",
  AU: "Audit and Accountability",
  CM: "Configuration Management",
  IR: "Incident Response",
  SC: "System and Communications Protection",
  SI: "System and Information Integrity",
  RA: "Risk Assessment",
  CP: "Contingency Planning",
  CA: "Assessment, Authorization, and Monitoring",
};

const controlSpec = [
  ["AC-2", "AC", "Account Management"], ["AC-3", "AC", "Access Enforcement"],
  ["AC-4", "AC", "Information Flow Enforcement"], ["AC-5", "AC", "Separation of Duties"],
  ["AC-6", "AC", "Least Privilege"], ["AC-17", "AC", "Remote Access"],
  ["IA-2", "IA", "Identification and Authentication (Organizational Users)"],
  ["IA-4", "IA", "Identifier Management"], ["IA-5", "IA", "Authenticator Management"],
  ["IA-8", "IA", "Identification and Authentication (Non-Organizational Users)"],
  ["AU-2", "AU", "Event Logging"], ["AU-3", "AU", "Content of Audit Records"],
  ["AU-6", "AU", "Audit Record Review, Analysis, and Reporting"],
  ["AU-9", "AU", "Protection of Audit Information"], ["AU-12", "AU", "Audit Record Generation"],
  ["CM-2", "CM", "Baseline Configuration"], ["CM-3", "CM", "Configuration Change Control"],
  ["CM-6", "CM", "Configuration Settings"], ["CM-8", "CM", "System Component Inventory"],
  ["IR-4", "IR", "Incident Handling"], ["IR-5", "IR", "Incident Monitoring"],
  ["IR-6", "IR", "Incident Reporting"], ["IR-7", "IR", "Incident Response Assistance"],
  ["SC-7", "SC", "Boundary Protection"], ["SC-8", "SC", "Transmission Confidentiality and Integrity"],
  ["SC-12", "SC", "Cryptographic Key Establishment and Management"],
  ["SC-13", "SC", "Cryptographic Protection"], ["SC-28", "SC", "Protection of Information at Rest"],
  ["SI-2", "SI", "Flaw Remediation"], ["SI-3", "SI", "Malicious Code Protection"],
  ["SI-4", "SI", "System Monitoring"], ["SI-5", "SI", "Security Alerts, Advisories, and Directives"],
  ["SI-7", "SI", "Software, Firmware, and Information Integrity"],
  ["RA-3", "RA", "Risk Assessment"], ["RA-5", "RA", "Vulnerability Monitoring and Scanning"],
  ["RA-7", "RA", "Risk Response"], ["CP-2", "CP", "Contingency Plan"],
  ["CP-9", "CP", "System Backup"], ["CP-10", "CP", "System Recovery and Reconstitution"],
  ["CA-2", "CA", "Control Assessments"], ["CA-5", "CA", "Plan of Action and Milestones"],
  ["CA-7", "CA", "Continuous Monitoring"],
];

const controlOverrides = {
  "AC-4": "PARTIAL", "AC-6": "PARTIAL", "IA-5": "PARTIAL", "AU-9": "PARTIAL",
  "CM-8": "PARTIAL", "SC-8": "PARTIAL", "SI-7": "PARTIAL",
  "CP-10": "NOT_IMPLEMENTED", "IR-7": "NOT_IMPLEMENTED",
  "IA-8": "NOT_ASSESSED", "RA-3": "NOT_ASSESSED", "CA-7": "NOT_ASSESSED",
  "SC-13": "NOT_APPLICABLE",
};

const ownerForFamily = (family) =>
  ["AC", "IA", "AU", "IR", "RA"].includes(family)
    ? "cyber.s.lee"
    : ["CM", "SC", "SI", "CP"].includes(family)
      ? "it.a.okoro"
      : "aud.d.wright";

const controls = controlSpec.map(([control_id, family, title], idx) => {
  const status = controlOverrides[control_id] ?? "IMPLEMENTED";
  return {
    id: `ctl-${String(idx + 1).padStart(3, "0")}`,
    control_id,
    family,
    family_name: FAMILIES[family],
    title,
    description: `${title}. Mapped from NIST SP 800-53 Rev. 5 ${family} family for the H-LIFT pilot baseline.`,
    baseline: "MODERATE",
    applicability: status === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "APPLICABLE",
    implementation_status: status,
    owner_subject: ownerForFamily(family),
    assessed_at: status === "NOT_ASSESSED" || status === "NOT_APPLICABLE" ? null : daysAgo(20 + (idx % 40)),
    created_at: daysAgo(120),
  };
});
insert("controls", controls);

const evidenceRows = [];
let evSeq = 0;
for (const c of controls) {
  const addEv = (type, status, name, ageDays, validDays, notes) => {
    evSeq += 1;
    evidenceRows.push({
      id: `cev-${String(evSeq).padStart(3, "0")}`,
      control_id: c.id,
      evidence_type: type,
      name,
      source: type === "CONFIG" ? "config-monitor" : type === "SCAN" ? "scanner" : "assurance-repository",
      status,
      collected_at: ageDays === null ? null : daysAgo(ageDays),
      valid_until: validDays === null ? null : validDays < 0 ? daysAgo(-validDays) : daysAhead(validDays),
      artifact_url: status === "MISSING" ? null : `https://evidence.hlift.dev/${c.control_id.toLowerCase()}/${evSeq}`,
      digest: status === "MISSING" ? null : `sha256:${String(evSeq).padStart(2, "0")}ab${c.family.toLowerCase()}${String(evSeq * 7919).slice(0, 8)}`,
      object_ref: `audit:${c.control_id}`,
      notes,
    });
  };
  if (c.implementation_status === "IMPLEMENTED") {
    addEv("CONFIG", "CURRENT", `${c.control_id} configuration baseline export`, 14, 120, null);
    addEv("LOG", "CURRENT", `${c.control_id} continuous monitoring sample`, 7, 90, null);
  } else if (c.implementation_status === "PARTIAL") {
    addEv("CONFIG", "CURRENT", `${c.control_id} partial implementation record`, 25, 20, "Only part of the control is evidenced.");
    addEv("TEST", "STALE", `${c.control_id} prior assessment evidence`, 140, -15, "Evidence validity lapsed.");
  } else if (c.implementation_status === "NOT_IMPLEMENTED") {
    addEv("POLICY", "MISSING", `${c.control_id} implementation evidence not collected`, null, null, "No evidence object exists.");
  }
}
evidenceRows.push({
  id: `cev-${String(++evSeq).padStart(3, "0")}`,
  control_id: "ctl-003",
  evidence_type: "TEST",
  name: "AC-4 flow-enforcement test with unsigned assertion",
  source: "assurance-repository",
  status: "REJECTED",
  collected_at: daysAgo(5),
  valid_until: daysAhead(30),
  artifact_url: "https://evidence.hlift.dev/ac-4/rejected-1",
  digest: "sha256:rejected0001",
  object_ref: "audit:AC-4",
  notes: "Assessor rejected the test because the negative case was not exercised.",
});
insert("control_evidence", evidenceRows);

const assessments = controls
  .filter((c) => !["NOT_ASSESSED", "NOT_APPLICABLE"].includes(c.implementation_status))
  .map((c, idx) => ({
    id: `asm-${String(idx + 1).padStart(3, "0")}`,
    control_id: c.id,
    assessor_subject: "aud.d.wright",
    method: idx % 4 === 0 ? "TEST" : idx % 3 === 0 ? "INTERVIEW" : "EXAMINE",
    result:
      c.implementation_status === "IMPLEMENTED"
        ? "SATISFIED"
        : c.implementation_status === "PARTIAL"
          ? "PARTIAL"
          : "NOT_SATISFIED",
    assessed_at: daysAgo(20 + (idx % 40)),
    evidence_count: c.implementation_status === "IMPLEMENTED" ? 2 : 1,
    notes: null,
  }));
insert("assessments", assessments);

insert("findings", [
  { id: "fnd-1", code: "FND-2026-001", control_id: "ctl-003", title: "Privileged information-flow review is not evidenced for two accounts", severity: "CRITICAL", status: "OPEN", opened_at: daysAgo(9), closed_at: null, owner_subject: "cyber.s.lee", description: "AC-4 requires enforcement evidence for all privileged flows. Two accounts have no review record.", risk: "Unreviewed privileged flow could bypass boundary policy.", due_at: daysAhead(10), notes: "No write-off." },
  { id: "fnd-2", code: "FND-2026-002", control_id: "ctl-009", title: "Authenticator rotation evidence is stale", severity: "HIGH", status: "REMEDIATION", opened_at: daysAgo(22), closed_at: null, owner_subject: "it.a.okoro", description: "The last IA-5 rotation evidence lapsed 15 days ago.", risk: "Credential exposure window cannot be bounded.", due_at: daysAhead(6), notes: "Rotation scheduled." },
  { id: "fnd-3", code: "FND-2026-003", control_id: "ctl-014", title: "Audit hash chain has not been independently verified", severity: "HIGH", status: "OPEN", opened_at: daysAgo(12), closed_at: null, owner_subject: "cyber.s.lee", description: "AU-9 requires protection and verification of audit information. No independent verification record exists.", risk: "Tampering would not be detected by an independent party.", due_at: daysAhead(4), notes: null },
  { id: "fnd-4", code: "FND-2026-004", control_id: "ctl-019", title: "Container inventory reconciliation is incomplete", severity: "MEDIUM", status: "REMEDIATION", opened_at: daysAgo(17), closed_at: null, owner_subject: "it.a.okoro", description: "CM-8 inventory has three containers without a reconciliation timestamp.", risk: "Unaccounted component could escape baseline control.", due_at: daysAhead(14), notes: "Reconciliation job under repair." },
  { id: "fnd-5", code: "FND-2026-005", control_id: "ctl-025", title: "Partner link lacks current TLS evidence", severity: "MEDIUM", status: "OPEN", opened_at: daysAgo(6), closed_at: null, owner_subject: "cyber.s.lee", description: "SC-8 evidence for the partner link is stale and the listener drifted.", risk: "Transmission confidentiality cannot be demonstrated.", due_at: daysAhead(9), notes: null },
  { id: "fnd-6", code: "FND-2026-006", control_id: "ctl-039", title: "Recovery exercise has not been performed this fiscal year", severity: "HIGH", status: "OPEN", opened_at: daysAgo(30), closed_at: null, owner_subject: "it.a.okoro", description: "CP-10 requires a recovery exercise. None is recorded for FY26.", risk: "Recovery time objective is unproven.", due_at: daysAhead(21), notes: null },
  { id: "fnd-7", code: "FND-2026-007", control_id: "ctl-023", title: "Incident assistance contact list was outdated", severity: "LOW", status: "CLOSED", opened_at: daysAgo(40), closed_at: daysAgo(28), owner_subject: "cyber.s.lee", description: "IR-7 contact list contained two departed points of contact.", risk: "Delayed escalation.", due_at: daysAgo(30), notes: "Contact list corrected and re-issued." },
]);

insert("poam_entries", [
  { id: "poam-1", code: "POAM-2026-001", finding_id: "fnd-1", control_id: "ctl-003", milestone: "Complete privileged flow review for two accounts", status: "IN_PROGRESS", scheduled_at: daysAhead(8), completed_at: null, owner_subject: "cyber.s.lee", residual_risk: "HIGH", notes: null },
  { id: "poam-2", code: "POAM-2026-002", finding_id: "fnd-2", control_id: "ctl-009", milestone: "Rotate authenticators and collect current evidence", status: "IN_PROGRESS", scheduled_at: daysAhead(5), completed_at: null, owner_subject: "it.a.okoro", residual_risk: "MODERATE", notes: null },
  { id: "poam-3", code: "POAM-2026-003", finding_id: "fnd-3", control_id: "ctl-014", milestone: "Independent audit-chain verification with signed report", status: "OPEN", scheduled_at: daysAhead(3), completed_at: null, owner_subject: "aud.d.wright", residual_risk: "HIGH", notes: null },
  { id: "poam-4", code: "POAM-2026-004", finding_id: "fnd-4", control_id: "ctl-019", milestone: "Reconcile three unaccounted containers", status: "DELAYED", scheduled_at: daysAgo(2), completed_at: null, owner_subject: "it.a.okoro", residual_risk: "MODERATE", notes: "Job repair slipped one sprint." },
  { id: "poam-5", code: "POAM-2026-005", finding_id: "fnd-5", control_id: "ctl-025", milestone: "Restore TLS baseline and refresh SC-8 evidence", status: "OPEN", scheduled_at: daysAhead(7), completed_at: null, owner_subject: "cyber.s.lee", residual_risk: "MODERATE", notes: null },
  { id: "poam-6", code: "POAM-2026-006", finding_id: "fnd-6", control_id: "ctl-039", milestone: "Conduct and record FY26 recovery exercise", status: "OPEN", scheduled_at: daysAhead(19), completed_at: null, owner_subject: "it.a.okoro", residual_risk: "HIGH", notes: null },
  { id: "poam-7", code: "POAM-2026-007", finding_id: "fnd-7", control_id: "ctl-023", milestone: "Re-issue incident assistance contact list", status: "COMPLETED", scheduled_at: daysAgo(30), completed_at: daysAgo(28), owner_subject: "cyber.s.lee", residual_risk: "LOW", notes: "Verified." },
]);

insert("tuning_recommendations", [
  { id: "rec-seed-001", created_at: hoursAgo(6), category: "AUTHZ", title: "Review top denial reason: MISSING_CAPABILITY", detail: "Frequent denials cite a missing capability. If legitimate, extend the role grant in role_capabilities (with the command's approval); otherwise the requester is correctly blocked.", severity: "MEDIUM", evidence: JSON.stringify({ top_reason: "MISSING_CAPABILITY", count: 3 }), source: "MANUAL", status: "PROPOSED", policy_id: "pol-002" },
  { id: "rec-seed-002", created_at: hoursAgo(7), category: "INSPECTION", title: "Inspection backlog", detail: "3 return inspection(s) are pending. Unresolved RETURN_HOLD containers cannot be restocked; schedule inspector time or escalate.", severity: "MEDIUM", evidence: JSON.stringify({ pending: 3 }), source: "MANUAL", status: "PROPOSED", policy_id: null },
]);

// ===========================================================================
// Audit bus: operational, cybersecurity, assurance and governance events
// ===========================================================================

const auditInputs = [];
const queueAudit = (e) => auditInputs.push(e);

for (const file of [
  "001_material_identity.sql", "002_container_package.sql", "003_custody_event_model.sql",
  "004_role_capability_model.sql", "005_security_events.sql", "006_assurance_evidence.sql",
]) {
  queueAudit({ occurred_at: daysAgo(1), plane: "TRUSTED_DATA", event_type: "MIGRATION_APPLIED", source: "db.migrator", subject_id: "system", resource_type: "schema_migration", resource_id: file, outcome: "APPLIED", severity: "INFO", payload: { filename: file } });
}

queueAudit({ occurred_at: daysAgo(90), plane: "OPERATIONAL", event_type: "MATERIAL_RECEIVED", source: "hlift.operational", subject_id: "cust.k.rivera", resource_type: "container", resource_id: "ct-hyd-0004", outcome: "AVAILABLE", severity: "INFO", payload: { lot: "L260210B", quantity: "5.000", uom: "GAL", facility_id: "FAC-STORE" } });
queueAudit({ occurred_at: daysAgo(3), plane: "OPERATIONAL", event_type: "MATERIAL_ISSUED", source: "hlift.operational", subject_id: "op.j.mendez", resource_type: "container", resource_id: "ct-hyd-0004", outcome: "IN_USE", severity: "INFO", payload: { request_id: "req-2", quantity: "5.000", uom: "GAL" } });
queueAudit({ occurred_at: daysAgo(2), plane: "OPERATIONAL", event_type: "MATERIAL_RETURNED", source: "hlift.operational", subject_id: "op.j.mendez", resource_type: "container", resource_id: "ct-hyd-0004", outcome: "RETURN_HOLD", severity: "INFO", payload: { returned_quantity: "3.400", uom: "GAL", measured: true } });
queueAudit({ occurred_at: hoursAgo(22), plane: "OPERATIONAL", event_type: "MATERIAL_INSPECTED", source: "hlift.operational", subject_id: "cust.k.rivera", resource_type: "container", resource_id: "ct-tube-014", outcome: "ACCEPT", severity: "INFO", payload: { inspection_id: "insp-3", measured_quantity: "2.000", uom: "H" } });
queueAudit({ occurred_at: daysAgo(1), plane: "OPERATIONAL", event_type: "QUANTITY_VARIANCE_RECORDED", source: "hlift.operational", subject_id: "cust.k.rivera", resource_type: "container", resource_id: "ct-adh-001", outcome: "DISPOSITION_REQUIRED", severity: "HIGH", payload: { variance: "2.000", uom: "OZ", written_off: false } });
queueAudit({ occurred_at: daysAgo(6), plane: "OPERATIONAL", event_type: "CONTAINER_QUARANTINED", source: "hlift.operational", subject_id: "cust.k.rivera", resource_type: "container", resource_id: "ct-dcn-002", outcome: "QUARANTINED", severity: "MEDIUM", payload: { reason: "label illegible; expiry unknown" } });
queueAudit({ occurred_at: daysAgo(20), plane: "OPERATIONAL", event_type: "CONTAINER_DISPOSED", source: "hlift.operational", subject_id: "safety-office", resource_type: "container", resource_id: "ct-dcn-001", outcome: "DISPOSED", severity: "MEDIUM", payload: { quantity: "5.000", uom: "L", route: "hazardous waste contractor" } });
queueAudit({ occurred_at: daysAgo(44), plane: "OPERATIONAL", event_type: "CUSTODY_TRANSFER", source: "hlift.operational", subject_id: "cust.k.rivera", resource_type: "custody_transfer", resource_id: "tr-0001", correlation_id: "corr-deploy-001", outcome: "TRANSFERRED", severity: "MEDIUM", payload: { transfer_group: "tr-group-001", container_id: "ct-nsw-bat-9001", source_command_id: "logsu-2", destination_command_id: "tu-stuttgart-01", deployment_order: "DEPL-2026-003" } });

queueAudit({ occurred_at: hoursAgo(4), plane: "CYBERSECURITY", event_type: "SECURITY_EVENT_INGESTED", source: "api-gateway", subject_id: "op.j.mendez", resource_type: "api_token", resource_id: "tok-8841", correlation_id: "corr-export-01", outcome: "DETECTED", severity: "HIGH", payload: { event_id: "sec-1", event_type: "DATA_EXPORT" } });
queueAudit({ occurred_at: hoursAgo(4), plane: "CYBERSECURITY", event_type: "INCIDENT_OPENED", source: "hlift.security", subject_id: "cyber.s.lee", resource_type: "security_incident", resource_id: "inc-1", correlation_id: "corr-export-01", outcome: "OPEN", severity: "HIGH", payload: { code: "INC-2026-001" } });
queueAudit({ occurred_at: hoursAgo(5), plane: "CYBERSECURITY", event_type: "INCIDENT_OPENED", source: "hlift.security", subject_id: "cyber.s.lee", resource_type: "security_incident", resource_id: "inc-2", correlation_id: "corr-auth-burst-01", outcome: "OPEN", severity: "MEDIUM", payload: { code: "INC-2026-002", correlated_events: 8 } });
queueAudit({ occurred_at: hoursAgo(3), plane: "CYBERSECURITY", event_type: "INTEGRITY_MISMATCH_DETECTED", source: "integrity-monitor", subject_id: "system", resource_type: "container_image", resource_id: "ghcr.io/hlift/sync-service:1.14.0", correlation_id: "corr-integrity-01", outcome: "MISMATCH", severity: "CRITICAL", payload: { check_id: "int-1" } });
queueAudit({ occurred_at: hoursAgo(2), plane: "CYBERSECURITY", event_type: "CONFIGURATION_DRIFT_DETECTED", source: "config-monitor", subject_id: "system", resource_type: "security_asset", resource_id: "asset-api-gateway", correlation_id: "corr-config-01", outcome: "DRIFT", severity: "HIGH", payload: { check_id: "cfg-1", baseline: "TLS1.2", observed: "TLS1.1" } });

queueAudit({ occurred_at: daysAgo(30), plane: "ASSURANCE", event_type: "ASSESSMENT_COMPLETED", source: "hlift.assurance", subject_id: "aud.d.wright", resource_type: "control", resource_id: "ctl-001", outcome: "SATISFIED", severity: "INFO", payload: { control_id: "AC-2", method: "EXAMINE" } });
queueAudit({ occurred_at: daysAgo(20), plane: "ASSURANCE", event_type: "ASSESSMENT_COMPLETED", source: "hlift.assurance", subject_id: "aud.d.wright", resource_type: "control", resource_id: "ctl-029", outcome: "SATISFIED", severity: "INFO", payload: { control_id: "SI-2", method: "TEST" } });
queueAudit({ occurred_at: daysAgo(9), plane: "ASSURANCE", event_type: "FINDING_OPENED", source: "hlift.assurance", subject_id: "aud.d.wright", resource_type: "finding", resource_id: "fnd-1", outcome: "OPEN", severity: "CRITICAL", payload: { code: "FND-2026-001", control_id: "AC-4" } });
queueAudit({ occurred_at: daysAgo(8), plane: "ASSURANCE", event_type: "POAM_ENTRY_CREATED", source: "hlift.assurance", subject_id: "aud.d.wright", resource_type: "poam", resource_id: "poam-1", outcome: "OPEN", severity: "HIGH", payload: { code: "POAM-2026-001", finding_id: "fnd-1" } });

for (const d of seedDecisions) {
  queueAudit({
    occurred_at: d.decided_at,
    plane: "GOVERNANCE",
    event_type: "AUTHORIZATION_DECISION",
    source: "hlift.authz",
    subject_id: d.subject_id,
    resource_type: d.resource_type,
    resource_id: d.resource_id,
    correlation_id: d.correlation_id,
    severity: d.permitted ? "INFO" : "MEDIUM",
    outcome: d.permitted ? "PERMIT" : "DENY",
    payload: {
      decision_id: d.id,
      action: d.action,
      capability: d.capability_code,
      policy_id: d.policy_id,
      reason_code: d.reason_code,
      facility_id: d.facility_id,
      lifecycle_state: d.lifecycle_state,
      credential_assurance: d.credential_assurance,
      obligations: d.obligations,
    },
  });
}

auditInputs.sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
for (const e of auditInputs) addAudit(e);
insert("audit_events", auditRows);

console.log(`Seeded ${dbPath}`);
db.close();


