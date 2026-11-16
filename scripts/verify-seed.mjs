// Integrity check used after reseeding. Run: node scripts/verify-seed.mjs
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(join(root, "data", "hlift.db"));
const q = (sql) => db.prepare(sql).all();
const scalar = (sql) => Object.values(q(sql)[0])[0];

const apr3 = q("SELECT status, approver FROM deployment_approvals WHERE id = 'apr-3'")[0];
const cf4 = q("SELECT status FROM conflicts WHERE id = 'cf-4'")[0];

const tables = q("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((r) => r.name);
const legacyTables = ["hazmat_items", "hazmat_events", "hazmat_checks"].filter((t) => tables.includes(t));

const materials = scalar("SELECT COUNT(*) FROM materials");
const containers = scalar("SELECT COUNT(*) FROM containers");
const pending = scalar("SELECT COUNT(*) FROM return_inspections WHERE outcome = 'PENDING'");
const accepted = scalar("SELECT COUNT(*) FROM return_inspections WHERE outcome = 'ACCEPT'");

const pail = q("SELECT current_quantity, state FROM containers WHERE id = 'ct-hyd-0004'")[0];
const pailTxn = q("SELECT issued_quantity, consumed_quantity, returned_quantity, status FROM issue_transactions WHERE id = 'txn-3'")[0];
const tube18 = q("SELECT current_quantity, state FROM containers WHERE id = 'ct-tube-018'")[0];
const adhesive = q("SELECT issued_quantity, consumed_quantity, returned_quantity FROM issue_transactions WHERE id = 'txn-7'")[0];
const adhesiveVariance = (
  Number(adhesive.issued_quantity) -
  Number(adhesive.consumed_quantity) -
  Number(adhesive.returned_quantity)
).toFixed(3);

// A container must never be AVAILABLE while a non-accepted inspection exists.
const illegalAvailable = scalar(
  `SELECT COUNT(*) FROM containers c
   WHERE c.state = 'AVAILABLE'
     AND EXISTS (
       SELECT 1 FROM return_inspections i
       WHERE i.container_id = c.id AND i.outcome IN ('PENDING', 'DISPOSITION', 'QUARANTINE')
     )`
);

// Quantity columns must be TEXT, never REAL (SQLite REAL is IEEE-754).
const realColumns = [];
for (const table of ["materials", "containers", "issue_requests", "issue_transactions", "return_inspections"]) {
  for (const col of q(`PRAGMA table_info(${table})`)) {
    if (String(col.type).toUpperCase() === "REAL") realColumns.push(`${table}.${col.name}`);
  }
}

// ---- three-plane invariants ------------------------------------------------
const migrations = scalar("SELECT COUNT(*) FROM schema_migrations");
const commandCount = scalar("SELECT COUNT(*) FROM commands");
const jurisdictionCount = scalar("SELECT COUNT(*) FROM commands WHERE jurisdiction_tag IS NOT NULL");

const failedLogins = scalar(
  "SELECT COUNT(*) FROM security_events WHERE event_type = 'AUTHENTICATION' AND outcome = 'FAILURE'"
);
const openVulns = scalar("SELECT COUNT(*) FROM vulnerabilities WHERE status IN ('OPEN','TRIAGED')");
const activeIncidents = scalar(
  "SELECT COUNT(*) FROM security_incidents WHERE status IN ('OPEN','INVESTIGATING')"
);
const configDrift = scalar(
  "SELECT COUNT(*) FROM configuration_checks WHERE status IN ('DRIFT','FAIL')"
);
const integrityMismatch = scalar("SELECT COUNT(*) FROM integrity_checks WHERE status = 'MISMATCH'");
const unnormalized = scalar("SELECT COUNT(*) FROM security_events WHERE normalized = 0");

const controls = scalar("SELECT COUNT(*) FROM controls");
const implemented = scalar(
  "SELECT COUNT(*) FROM controls WHERE applicability = 'APPLICABLE' AND implementation_status = 'IMPLEMENTED'"
);
const evidence = scalar("SELECT COUNT(*) FROM control_evidence");
const currentEvidence = scalar("SELECT COUNT(*) FROM control_evidence WHERE status = 'CURRENT'");
const staleEvidence = scalar("SELECT COUNT(*) FROM control_evidence WHERE status = 'STALE'");
const missingEvidence = scalar("SELECT COUNT(*) FROM control_evidence WHERE status = 'MISSING'");
const openFindings = scalar(
  "SELECT COUNT(*) FROM findings WHERE status IN ('OPEN','REMEDIATION')"
);
const poam = scalar("SELECT COUNT(*) FROM poam_entries");

const decisions = scalar("SELECT COUNT(*) FROM authorization_decisions");
const denied = scalar("SELECT COUNT(*) FROM authorization_decisions WHERE permitted = 0");
const auditEvents = scalar("SELECT COUNT(*) FROM audit_events");

// Recompute the audit chain exactly as src/lib/audit.ts does.
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

let chainValid = true;
let chainBrokenAt = null;
let prev = null;
for (const row of q("SELECT * FROM audit_events ORDER BY seq ASC")) {
  const material = [
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
  ].join("\n");
  const expected = sha256(material);
  if (row.prev_hash !== prev || row.hash !== expected) {
    chainValid = false;
    chainBrokenAt = row.id;
    break;
  }
  prev = row.hash;
}

console.log(`tables:               ${tables.length}${legacyTables.length ? ` (legacy: ${legacyTables.join(", ")})` : ""}`);
console.log(`migrations:           ${migrations}`);
console.log(`commands/jurisdiction:${commandCount} / ${jurisdictionCount}`);
console.log(`apr-3:                ${apr3.status} (approver ${apr3.approver ?? "none"})`);
console.log(`cf-4:                 ${cf4.status}`);
console.log(`materials/containers: ${materials} / ${containers}`);
console.log(`inspections:          ${pending} pending, ${accepted} accepted`);
console.log(`returned pail:        ${pail.current_quantity} GAL Â· ${pail.state}`);
console.log(`pail txn:             issued ${pailTxn.issued_quantity} - consumed ${pailTxn.consumed_quantity} - returned ${pailTxn.returned_quantity} (${pailTxn.status})`);
console.log(`declared tube:        current ${tube18.current_quantity ?? "NULL (UNKNOWN)"} Â· ${tube18.state}`);
console.log(`adhesive variance:    ${adhesiveVariance} OZ`);
console.log(`illegal available:    ${illegalAvailable}`);
console.log(`REAL quantity cols:   ${realColumns.length ? realColumns.join(", ") : "none"}`);
console.log(`failed logins:        ${failedLogins}`);
console.log(`open vulnerabilities: ${openVulns}`);
console.log(`active incidents:     ${activeIncidents}`);
console.log(`config drift:         ${configDrift}`);
console.log(`integrity mismatch:   ${integrityMismatch}`);
console.log(`unnormalized events:  ${unnormalized}`);
console.log(`controls:             ${controls} (${implemented} implemented)`);
console.log(`evidence:             ${evidence} (${currentEvidence} current, ${staleEvidence} stale, ${missingEvidence} missing)`);
console.log(`findings / POA&M:     ${openFindings} open / ${poam} entries`);
console.log(`auth decisions:       ${decisions} (${denied} denied)`);
console.log(`audit events:         ${auditEvents} (chain ${chainValid ? "VALID" : `BROKEN at ${chainBrokenAt}`})`);

const pristine =
  apr3.status === "pending" &&
  cf4.status === "UNKNOWN" &&
  legacyTables.length === 0 &&
  migrations === 8 &&
  commandCount === 24 &&
  jurisdictionCount === 24 &&
  materials === 11 &&
  containers === 41 &&
  pending === 3 &&
  accepted === 1 &&
  pail.current_quantity === "3.400" &&
  pail.state === "RETURN_HOLD" &&
  pailTxn.issued_quantity === "5.000" &&
  pailTxn.consumed_quantity === "1.600" &&
  pailTxn.returned_quantity === "3.400" &&
  tube18.current_quantity === null &&
  adhesiveVariance === "2.000" &&
  illegalAvailable === 0 &&
  realColumns.length === 0 &&
  failedLogins === 14 &&
  openVulns === 7 &&
  activeIncidents === 2 &&
  configDrift === 2 &&
  integrityMismatch === 1 &&
  unnormalized === 0 &&
  controls === 42 &&
  implemented === 29 &&
  evidence === 75 &&
  currentEvidence === 65 &&
  staleEvidence === 7 &&
  missingEvidence === 2 &&
  openFindings === 6 &&
  poam === 7 &&
  decisions === 9 &&
  denied === 5 &&
  auditEvents === 32 &&
  chainValid;

console.log(pristine ? "PRISTINE SEED OK" : "SEED NOT PRISTINE");
db.close();
process.exit(pristine ? 0 : 1);

