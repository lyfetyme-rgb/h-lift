import { all, one, run } from "./db";
import { appendAuditEvent } from "./audit";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

/**
 * Assurance plane.
 *
 * RMF status is a projection of the control/evidence/assessment/finding/POA&M
 * repository. There is no target percentage and no manual override: a control
 * is IMPLEMENTED only because its record says so and supporting evidence
 * exists. Stale and missing evidence are counted from their own rows.
 */

export interface RmfSummary {
  applicableControls: number;
  implemented: number;
  partial: number;
  notImplemented: number;
  notAssessed: number;
  notApplicable: number;
  evidenceObjects: number;
  currentEvidence: number;
  staleEvidence: number;
  missingEvidence: number;
  rejectedEvidence: number;
  openFindings: number;
  poamEntries: number;
  openPoam: number;
  assessments: number;
  families: Row[];
}

export function rmfSummary(): RmfSummary {
  const n = (sql: string) => one<{ n: number }>(sql)?.n ?? 0;

  return {
    applicableControls: n("SELECT COUNT(*) AS n FROM controls WHERE applicability = 'APPLICABLE'"),
    implemented: n(
      "SELECT COUNT(*) AS n FROM controls WHERE applicability = 'APPLICABLE' AND implementation_status = 'IMPLEMENTED'"
    ),
    partial: n(
      "SELECT COUNT(*) AS n FROM controls WHERE applicability = 'APPLICABLE' AND implementation_status = 'PARTIAL'"
    ),
    notImplemented: n(
      "SELECT COUNT(*) AS n FROM controls WHERE applicability = 'APPLICABLE' AND implementation_status = 'NOT_IMPLEMENTED'"
    ),
    notAssessed: n(
      "SELECT COUNT(*) AS n FROM controls WHERE applicability = 'APPLICABLE' AND implementation_status = 'NOT_ASSESSED'"
    ),
    notApplicable: n(
      "SELECT COUNT(*) AS n FROM controls WHERE applicability = 'NOT_APPLICABLE'"
    ),
    evidenceObjects: n("SELECT COUNT(*) AS n FROM control_evidence"),
    currentEvidence: n("SELECT COUNT(*) AS n FROM control_evidence WHERE status = 'CURRENT'"),
    staleEvidence: n("SELECT COUNT(*) AS n FROM control_evidence WHERE status = 'STALE'"),
    missingEvidence: n("SELECT COUNT(*) AS n FROM control_evidence WHERE status = 'MISSING'"),
    rejectedEvidence: n("SELECT COUNT(*) AS n FROM control_evidence WHERE status = 'REJECTED'"),
    openFindings: n(
      "SELECT COUNT(*) AS n FROM findings WHERE status IN ('OPEN','REMEDIATION')"
    ),
    poamEntries: n("SELECT COUNT(*) AS n FROM poam_entries"),
    openPoam: n(
      "SELECT COUNT(*) AS n FROM poam_entries WHERE status IN ('OPEN','IN_PROGRESS','DELAYED')"
    ),
    assessments: n("SELECT COUNT(*) AS n FROM assessments"),
    families: all(
      `SELECT family, family_name,
              COUNT(*) AS applicable,
              SUM(CASE WHEN implementation_status = 'IMPLEMENTED' THEN 1 ELSE 0 END) AS implemented,
              SUM(CASE WHEN implementation_status = 'PARTIAL' THEN 1 ELSE 0 END) AS partial,
              SUM(CASE WHEN implementation_status = 'NOT_IMPLEMENTED' THEN 1 ELSE 0 END) AS not_implemented,
              SUM(CASE WHEN implementation_status = 'NOT_ASSESSED' THEN 1 ELSE 0 END) AS not_assessed,
              SUM(CASE WHEN applicability = 'NOT_APPLICABLE' THEN 1 ELSE 0 END) AS not_applicable
         FROM controls
        GROUP BY family, family_name
        ORDER BY family`
    ),
  };
}

export function listControls(family?: string): Row[] {
  const where = family ? "WHERE c.family = ?" : "";
  const params = family ? [family] : [];
  return all(
    `SELECT c.*,
            (SELECT COUNT(*) FROM control_evidence e WHERE e.control_id = c.id) AS evidence_count,
            (SELECT COUNT(*) FROM control_evidence e WHERE e.control_id = c.id AND e.status = 'CURRENT') AS current_evidence,
            (SELECT COUNT(*) FROM findings f WHERE f.control_id = c.id AND f.status IN ('OPEN','REMEDIATION')) AS open_findings,
            (SELECT COUNT(*) FROM assessments a WHERE a.control_id = c.id) AS assessment_count
       FROM controls c
       ${where}
      ORDER BY c.family, c.control_id`,
    ...params
  );
}

export function listEvidence(controlId?: string): Row[] {
  const where = controlId ? "WHERE e.control_id = ?" : "";
  const params = controlId ? [controlId] : [];
  return all(
    `SELECT e.*, c.control_id AS control_code, c.title AS control_title
       FROM control_evidence e
       JOIN controls c ON c.id = e.control_id
       ${where}
      ORDER BY CASE e.status WHEN 'MISSING' THEN 0 WHEN 'STALE' THEN 1 WHEN 'REJECTED' THEN 2 ELSE 3 END,
               e.valid_until`,
    ...params
  );
}

export function listAssessments(): Row[] {
  return all(
    `SELECT a.*, c.control_id AS control_code, c.title AS control_title
       FROM assessments a
       JOIN controls c ON c.id = a.control_id
      ORDER BY a.assessed_at DESC`
  );
}

export function listFindings(): Row[] {
  return all(
    `SELECT f.*, c.control_id AS control_code, c.title AS control_title
       FROM findings f
       LEFT JOIN controls c ON c.id = f.control_id
      ORDER BY CASE f.status WHEN 'OPEN' THEN 0 WHEN 'REMEDIATION' THEN 1 ELSE 2 END,
               CASE f.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
               f.opened_at DESC`
  );
}

export function listPoam(): Row[] {
  return all(
    `SELECT p.*, f.code AS finding_code, f.title AS finding_title, c.control_id AS control_code
       FROM poam_entries p
       LEFT JOIN findings f ON f.id = p.finding_id
       LEFT JOIN controls c ON c.id = p.control_id
      ORDER BY CASE p.status WHEN 'DELAYED' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'OPEN' THEN 2 ELSE 3 END,
               p.scheduled_at`
  );
}

export function controlDetail(id: string): Row | null {
  const control = one<Row>("SELECT * FROM controls WHERE id = ? OR control_id = ?", id, id);
  if (!control) return null;
  return {
    control,
    evidence: listEvidence(control.id),
    assessments: listAssessments().filter((a) => a.control_id === control.id),
    findings: listFindings().filter((f) => f.control_id === control.id),
    poam: listPoam().filter((p) => p.control_id === control.id),
  };
}

const FINDING_STATES = ["OPEN", "REMEDIATION", "CLOSED", "ACCEPTED"] as const;
export type FindingStatus = (typeof FINDING_STATES)[number];

/**
 * Advance a finding. Closing is not a normal management action: the route
 * requires ASSURANCE_FINDING_CLOSE, which only command oversight holds, and
 * the decision carries a COMMAND_ACKNOWLEDGEMENT obligation.
 */
export function updateFinding(input: {
  id: string;
  status: FindingStatus;
  actor: string;
  note?: string;
}) {
  const finding = one<Row>("SELECT * FROM findings WHERE id = ?", input.id);
  if (!finding) throw new Error(`Unknown finding ${input.id}`);
  if (!FINDING_STATES.includes(input.status)) {
    throw new Error(`status must be one of ${FINDING_STATES.join(", ")}.`);
  }
  if (!input.actor?.trim()) throw new Error("A named actor is required.");
  if (finding.status === "CLOSED") throw new Error(`Finding ${finding.code} is already closed.`);

  const now = new Date().toISOString();
  run(
    `UPDATE findings
        SET status = ?, closed_at = ?, notes = COALESCE(?, notes)
      WHERE id = ?`,
    input.status,
    input.status === "CLOSED" || input.status === "ACCEPTED" ? now : null,
    input.note ?? null,
    input.id
  );

  if (input.status === "CLOSED" || input.status === "ACCEPTED") {
    run(
      `UPDATE poam_entries
          SET status = 'COMPLETED', completed_at = ?
        WHERE finding_id = ? AND status != 'COMPLETED'`,
      now,
      input.id
    );
  }

  appendAuditEvent({
    plane: "ASSURANCE",
    event_type: "FINDING_STATUS_CHANGED",
    source: "hlift.assurance",
    subject_id: input.actor.trim(),
    resource_type: "finding",
    resource_id: input.id,
    severity: finding.severity,
    outcome: input.status,
    payload: { code: finding.code, from: finding.status, to: input.status, note: input.note ?? null },
  });

  return listFindings().find((f) => f.id === input.id);
}

export function evidenceExposure() {
  return all(
    `SELECT c.control_id, c.title,
            COUNT(e.id) AS evidence_count,
            SUM(CASE WHEN e.status = 'CURRENT' THEN 1 ELSE 0 END) AS current_count,
            SUM(CASE WHEN e.status = 'STALE' THEN 1 ELSE 0 END) AS stale_count,
            SUM(CASE WHEN e.status = 'MISSING' THEN 1 ELSE 0 END) AS missing_count
       FROM controls c
       LEFT JOIN control_evidence e ON e.control_id = c.id
      GROUP BY c.id
     HAVING evidence_count = 0 OR missing_count > 0 OR stale_count > 0
      ORDER BY missing_count DESC, stale_count DESC, c.control_id`
  );
}
