import { all, one, run, transaction } from "./db";
import { canonicalJson, appendAuditEvent } from "./audit";

export type Row = Record<string, any>;

/**
 * Feedback-driven policy-tuning loop.
 *
 * H-LIFT measures what actually happened and proposes improvements. It never
 * applies them. A named human decides; the decision is recorded with its
 * evidence and appended to the audit bus.
 */

const AUTO_CATEGORIES = new Set(["AUTHZ", "INSPECTION", "SECURITY", "ASSURANCE", "EXPIRY"]);

function deleteOldAutoRecommendations() {
  run("DELETE FROM tuning_recommendations WHERE status = 'PROPOSED' AND source = 'AUTO'");
}

function addAutoRecommendation(rec: {
  category: string;
  title: string;
  detail: string;
  severity: string;
  evidence: unknown;
}) {
  run(
    `INSERT INTO tuning_recommendations
       (id, created_at, category, title, detail, severity, evidence, source, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'AUTO', 'PROPOSED')`,
    `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    new Date().toISOString(),
    rec.category,
    rec.title,
    rec.detail,
    rec.severity,
    canonicalJson(rec.evidence)
  );
}

export function computeEffectiveness() {
  const now = new Date().toISOString();

  // Compute from records — never estimates.
  const authz = one<{ total: number; permitted: number; denied: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN permitted = 1 THEN 1 ELSE 0 END) AS permitted,
            SUM(CASE WHEN permitted = 0 THEN 1 ELSE 0 END) AS denied
       FROM authorization_decisions`
  ) ?? { total: 0, permitted: 0, denied: 0 };

  const topDeny = all<{ reason_code: string; n: number }>(
    `SELECT reason_code, COUNT(*) AS n
       FROM authorization_decisions
      WHERE permitted = 0
      GROUP BY reason_code
      ORDER BY n DESC
      LIMIT 1`
  )[0] ?? null;

  const expiryBlocks = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM authorization_decisions WHERE reason_code IN ('EXPIRY_BLOCKED','EXPIRY_UNKNOWN')"
  )?.n ?? 0;

  const inspections = one<{ total: number; accepts: number; pending: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN outcome = 'ACCEPT' THEN 1 ELSE 0 END) AS accepts,
            SUM(CASE WHEN outcome = 'PENDING' THEN 1 ELSE 0 END) AS pending
       FROM return_inspections`
  ) ?? { total: 0, accepts: 0, pending: 0 };

  const openIncidents = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM security_incidents WHERE status IN ('OPEN','INVESTIGATING')"
  )?.n ?? 0;

  const openFindings = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM findings WHERE status IN ('OPEN','REMEDIATION')"
  )?.n ?? 0;

  const metrics = [
    { metric: "AUTHZ_PERMIT_RATE", value: authz.total ? authz.permitted / authz.total : 0, sample: authz.total, context: { total: authz.total, permitted: authz.permitted } },
    { metric: "AUTHZ_DENY_RATE", value: authz.total ? authz.denied / authz.total : 0, sample: authz.total, context: { total: authz.total, denied: authz.denied } },
    { metric: "AUTHZ_TOP_DENY_REASON", value: topDeny?.n ?? 0, sample: topDeny?.n ?? 0, context: { reason_code: topDeny?.reason_code ?? null } },
    { metric: "EXPIRY_BLOCKED_TOTAL", value: expiryBlocks, sample: expiryBlocks, context: {} },
    { metric: "INSPECTION_ACCEPT_RATE", value: inspections.total ? inspections.accepts / inspections.total : 0, sample: inspections.total, context: { total: inspections.total, accepts: inspections.accepts } },
    { metric: "INSPECTION_PENDING_TOTAL", value: inspections.pending, sample: inspections.pending, context: {} },
    { metric: "SECURITY_OPEN_INCIDENTS", value: openIncidents, sample: openIncidents, context: {} },
    { metric: "ASSURANCE_OPEN_FINDINGS", value: openFindings, sample: openFindings, context: {} },
  ];

  transaction(() => {
    // Local snapshots are a projection; keep only today's computation.
    run("DELETE FROM effectiveness_metrics WHERE computed_at = ?", now);
    for (const m of metrics) {
      run(
        `INSERT INTO effectiveness_metrics (id, computed_at, metric, value, context, sample_size)
         VALUES (?, ?, ?, ?, ?, ?)`,
        `em-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        now,
        m.metric,
        m.value,
        canonicalJson(m.context),
        m.sample
      );
    }

    deleteOldAutoRecommendations();

    if (topDeny && topDeny.n > 0) {
      const detail =
        topDeny.reason_code === "MISSING_CAPABILITY"
          ? "Frequent denials cite a missing capability. If legitimate, extend the role grant in role_capabilities (with the command's approval); otherwise the requester is correctly blocked."
          : topDeny.reason_code === "FACILITY_SCOPE_MISMATCH"
            ? "Frequent facility-scope denials. Verify the demo principals are assigned to the correct facilities, or review whether facility scoping is too strict for distributed operations."
            : topDeny.reason_code === "LIFECYCLE_STATE_BLOCKED"
              ? "Frequent lifecycle-state denials. Review the allowed-state guard for the affected action and confirm containers are not being operated in illegal states."
              : `Frequent denials cite ${topDeny.reason_code}. Review the policy and input data quality feeding it.`;
      addAutoRecommendation({
        category: "AUTHZ",
        title: `Review top denial reason: ${topDeny.reason_code}`,
        detail,
        severity: "MEDIUM",
        evidence: { top_reason: topDeny.reason_code, count: topDeny.n },
      });
    }

    if (inspections.total > 0 && inspections.accepts / inspections.total < 0.5) {
      addAutoRecommendation({
        category: "INSPECTION",
        title: "Low inspection acceptance rate",
        detail: "More than half of return inspections are not accepted. Check inspector capacity, measurement quality and the eight-point checklist documentation before relaxing any gate.",
        severity: "HIGH",
        evidence: { total: inspections.total, accepts: inspections.accepts, pending: inspections.pending },
      });
    } else if (inspections.pending > 0) {
      addAutoRecommendation({
        category: "INSPECTION",
        title: "Inspection backlog",
        detail: `${inspections.pending} return inspection(s) are pending. Unresolved RETURN_HOLD containers cannot be restocked; schedule inspector time or escalate.`,
        severity: "MEDIUM",
        evidence: { pending: inspections.pending },
      });
    }

    if (expiryBlocks > 0) {
      addAutoRecommendation({
        category: "EXPIRY",
        title: "Expiry guard is blocking actions",
        detail: "Some requests were denied because expiry state is EXPIRED or UNKNOWN. Refresh expiry capture at intake rather than relaxing the time-based rule.",
        severity: "MEDIUM",
        evidence: { blocked: expiryBlocks },
      });
    }

    if (openIncidents > 0) {
      addAutoRecommendation({
        category: "SECURITY",
        title: "Open security incidents unresolved",
        detail: `${openIncidents} incident(s) remain open or investigating. Confirm owners, containment notes and linkage to vulnerabilities before closure.`,
        severity: "HIGH",
        evidence: { open_incidents: openIncidents },
      });
    }

    if (openFindings > 0) {
      addAutoRecommendation({
        category: "ASSURANCE",
        title: "Open assurance findings",
        detail: `${openFindings} finding(s) are open. Track POA&M milestones and re-assess the owning controls before closing.`,
        severity: "HIGH",
        evidence: { open_findings: openFindings },
      });
    }
  });

  appendAuditEvent({
    plane: "ASSURANCE",
    event_type: "EFFECTIVENESS_RECOMPUTED",
    source: "hlift.effectiveness",
    subject_id: "system",
    resource_type: "effectiveness",
    resource_id: "latest",
    severity: "INFO",
    outcome: "COMPUTED",
    payload: { metrics: metrics.map((m) => m.metric) },
  });

  return { computed_at: now, metrics };
}

export function listMetrics(limit = 40): Row[] {
  return all(
    `SELECT * FROM effectiveness_metrics
       ORDER BY computed_at DESC, metric
       LIMIT ?`,
    limit
  );
}

export function listRecommendations(status?: string): Row[] {
  const where = status ? "WHERE status = ?" : "";
  const params = status ? [status] : [];
  return all(
    `SELECT * FROM tuning_recommendations ${where}
      ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, created_at DESC`,
    ...params
  );
}

const DECISION_STATES = ["APPROVED", "REJECTED", "DISMISSED"] as const;
export type DecisionState = (typeof DECISION_STATES)[number];

export function decideRecommendation(input: {
  id: string;
  decision: DecisionState;
  actor: string;
  note?: string;
}) {
  const rec = one<Row>("SELECT * FROM tuning_recommendations WHERE id = ?", input.id);
  if (!rec) throw new Error(`Unknown recommendation ${input.id}`);
  if (!DECISION_STATES.includes(input.decision)) {
    throw new Error(`decision must be one of ${DECISION_STATES.join(", ")}.`);
  }
  if (!input.actor?.trim()) throw new Error("A named actor is required.");

  const now = new Date().toISOString();
  run(
    `UPDATE tuning_recommendations
        SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?
      WHERE id = ?`,
    input.decision,
    input.actor.trim(),
    now,
    input.note ?? null,
    input.id
  );

  appendAuditEvent({
    plane: "ASSURANCE",
    event_type: "TUNING_DECISION",
    source: "hlift.effectiveness",
    subject_id: input.actor.trim(),
    resource_type: "tuning_recommendation",
    resource_id: input.id,
    severity: rec.severity,
    outcome: input.decision,
    payload: { title: rec.title, category: rec.category, note: input.note ?? null },
  });

  return one<Row>("SELECT * FROM tuning_recommendations WHERE id = ?", input.id);
}

export function effectivenessSummary() {
  const totalRec = one<{ n: number }>("SELECT COUNT(*) AS n FROM tuning_recommendations")?.n ?? 0;
  const proposed = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM tuning_recommendations WHERE status = 'PROPOSED'"
  )?.n ?? 0;
  const approved = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM tuning_recommendations WHERE status = 'APPROVED'"
  )?.n ?? 0;
  const latest = all<Row>(
    `SELECT * FROM effectiveness_metrics
      WHERE computed_at = (SELECT MAX(computed_at) FROM effectiveness_metrics)
      ORDER BY metric`
  );
  return { totalRec, proposed, approved, latest };
}
