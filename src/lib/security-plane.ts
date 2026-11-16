import { all, one, run } from "./db";
import { appendAuditEvent } from "./audit";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

/**
 * Cybersecurity plane aggregation.
 *
 * Nothing here manufactures a count. Each KPI is a COUNT over records that an
 * ingest source produced or the application generated. Sources feed one
 * normalization/correlation pipeline: IdP, API gateway, host telemetry,
 * vulnerability scanner, configuration monitoring and integrity checks.
 */

export interface SocSummary {
  retainedEvents: number;
  events24h: number;
  failedLogins: number;
  failedLogins24h: number;
  openVulnerabilities: number;
  criticalVulnerabilities: number;
  activeIncidents: number;
  containedIncidents: number;
  configurationDrift: number;
  integrityMismatches: number;
  unnormalized: number;
  correlatedEvents: number;
  sources: Row[];
  byEventType: { event_type: string; n: number }[];
  bySeverity: { severity: string; n: number }[];
}

export function listSecurityEvents(limit = 250): Row[] {
  return all(
    `SELECT e.*, a.name AS asset_name
       FROM security_events e
       LEFT JOIN security_assets a ON a.id = e.asset_id
      ORDER BY CASE e.status WHEN 'OPEN' THEN 0 WHEN 'UNKNOWN' THEN 1 ELSE 2 END,
               e.occurred_at DESC
      LIMIT ?`,
    limit
  );
}

export function listIncidents(): Row[] {
  return all(
    `SELECT i.*, p.display_name AS owner_name,
            (SELECT COUNT(*) FROM security_event_links l WHERE l.incident_id = i.id) AS linked_events
       FROM security_incidents i
       LEFT JOIN principals p ON p.subject_id = i.owner_subject
      ORDER BY CASE i.status WHEN 'OPEN' THEN 0 WHEN 'INVESTIGATING' THEN 1 WHEN 'CONTAINED' THEN 2 ELSE 3 END,
               i.opened_at DESC`
  );
}

export function listIncidentActions(incidentId: string): Row[] {
  return all(
    "SELECT * FROM incident_actions WHERE incident_id = ? ORDER BY at DESC",
    incidentId
  );
}

export function listVulnerabilities(): Row[] {
  return all(
    `SELECT v.*, a.name AS asset_name, a.criticality AS asset_criticality
       FROM vulnerabilities v
       LEFT JOIN security_assets a ON a.id = v.asset_id
      ORDER BY CASE v.status WHEN 'OPEN' THEN 0 WHEN 'TRIAGED' THEN 1 ELSE 2 END,
               CASE v.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
               v.discovered_at DESC`
  );
}

export function listAssets(): Row[] {
  return all("SELECT * FROM security_assets ORDER BY criticality DESC, name");
}

export function listConfigurationChecks(): Row[] {
  return all(
    `SELECT c.*, a.name AS asset_name
       FROM configuration_checks c
       JOIN security_assets a ON a.id = c.asset_id
      ORDER BY CASE c.status WHEN 'DRIFT' THEN 0 WHEN 'FAIL' THEN 1 WHEN 'UNKNOWN' THEN 2 ELSE 3 END,
               c.checked_at DESC`
  );
}

export function listIntegrityChecks(): Row[] {
  return all(
    `SELECT i.*, a.name AS asset_name
       FROM integrity_checks i
       JOIN security_assets a ON a.id = i.asset_id
      ORDER BY CASE i.status WHEN 'MISMATCH' THEN 0 WHEN 'UNKNOWN' THEN 1 ELSE 2 END,
               i.checked_at DESC`
  );
}

export function listIngestSources(): Row[] {
  return all(
    "SELECT * FROM security_ingest_sources ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'STALE' THEN 1 ELSE 2 END, name"
  );
}

export function linkedEvents(incidentId: string): Row[] {
  return all(
    `SELECT e.*
       FROM security_event_links l
       JOIN security_events e ON e.id = l.event_id
      WHERE l.incident_id = ?
      ORDER BY e.occurred_at DESC`,
    incidentId
  );
}

export function correlationGroups(): Row[] {
  return all(
    `SELECT correlation_id, COUNT(*) AS n,
            MIN(occurred_at) AS first_at, MAX(occurred_at) AS last_at,
            GROUP_CONCAT(DISTINCT source) AS sources,
            MAX(severity) AS max_severity
       FROM security_events
      WHERE correlation_id IS NOT NULL
      GROUP BY correlation_id
      ORDER BY n DESC, last_at DESC`
  );
}

export function socSummary(): SocSummary {
  const n = (sql: string, ...params: unknown[]) =>
    one<{ n: number }>(sql, ...params)?.n ?? 0;

  const failedWhere =
    "event_type = 'AUTHENTICATION' AND outcome = 'FAILURE'";

  return {
    retainedEvents: n("SELECT COUNT(*) AS n FROM security_events"),
    events24h: n(
      "SELECT COUNT(*) AS n FROM security_events WHERE occurred_at >= datetime('now','-1 day')"
    ),
    failedLogins: n(`SELECT COUNT(*) AS n FROM security_events WHERE ${failedWhere}`),
    failedLogins24h: n(
      `SELECT COUNT(*) AS n FROM security_events WHERE ${failedWhere} AND occurred_at >= datetime('now','-1 day')`
    ),
    openVulnerabilities: n(
      "SELECT COUNT(*) AS n FROM vulnerabilities WHERE status IN ('OPEN','TRIAGED')"
    ),
    criticalVulnerabilities: n(
      "SELECT COUNT(*) AS n FROM vulnerabilities WHERE status IN ('OPEN','TRIAGED') AND severity = 'CRITICAL'"
    ),
    activeIncidents: n(
      "SELECT COUNT(*) AS n FROM security_incidents WHERE status IN ('OPEN','INVESTIGATING')"
    ),
    containedIncidents: n(
      "SELECT COUNT(*) AS n FROM security_incidents WHERE status = 'CONTAINED'"
    ),
    configurationDrift: n(
      "SELECT COUNT(*) AS n FROM configuration_checks WHERE status IN ('DRIFT','FAIL')"
    ),
    integrityMismatches: n(
      "SELECT COUNT(*) AS n FROM integrity_checks WHERE status = 'MISMATCH'"
    ),
    unnormalized: n("SELECT COUNT(*) AS n FROM security_events WHERE normalized = 0"),
    correlatedEvents: n(
      "SELECT COUNT(*) AS n FROM security_events WHERE correlation_id IS NOT NULL"
    ),
    sources: listIngestSources(),
    byEventType: all(
      `SELECT COALESCE(event_type,'UNCLASSIFIED') AS event_type, COUNT(*) AS n
         FROM security_events GROUP BY event_type ORDER BY n DESC`
    ),
    bySeverity: all(
      `SELECT COALESCE(severity,'UNKNOWN') AS severity, COUNT(*) AS n
         FROM security_events GROUP BY severity ORDER BY n DESC`
    ),
  };
}

const INCIDENT_STATES = ["OPEN", "INVESTIGATING", "CONTAINED", "CLOSED"] as const;
export type IncidentStatus = (typeof INCIDENT_STATES)[number];

export function manageIncident(input: {
  id: string;
  status: IncidentStatus;
  actor: string;
  note?: string;
}) {
  const incident = one<Row>("SELECT * FROM security_incidents WHERE id = ?", input.id);
  if (!incident) throw new Error(`Unknown incident ${input.id}`);
  if (!input.actor?.trim()) throw new Error("A named actor is required.");
  if (!INCIDENT_STATES.includes(input.status)) {
    throw new Error(`status must be one of ${INCIDENT_STATES.join(", ")}.`);
  }
  const now = new Date().toISOString();
  run(
    `UPDATE security_incidents
        SET status = ?, closed_at = ?, notes = COALESCE(?, notes)
      WHERE id = ?`,
    input.status,
    input.status === "CLOSED" ? now : null,
    input.note ?? null,
    input.id
  );
  run(
    `INSERT INTO incident_actions (id, incident_id, action, actor_subject, at, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    `ia-${Date.now().toString(36)}`,
    input.id,
    `STATUS_${input.status}`,
    input.actor.trim(),
    now,
    input.note ?? null
  );
  appendAuditEvent({
    plane: "CYBERSECURITY",
    event_type: "INCIDENT_STATUS_CHANGED",
    source: "hlift.security",
    subject_id: input.actor.trim(),
    resource_type: "security_incident",
    resource_id: input.id,
    severity: incident.severity,
    outcome: input.status,
    payload: { from: incident.status, to: input.status, note: input.note ?? null },
  });
  return listIncidents().find((i) => i.id === input.id);
}

/** Normalize an inbound source record into the shared event table. */
export function ingestSecurityEvent(input: {
  code?: string;
  title: string;
  category: string;
  event_type: string;
  severity: string;
  outcome?: string | null;
  source: string;
  subject_id?: string | null;
  source_ip?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  asset_id?: string | null;
  correlation_id?: string | null;
  occurred_at?: string | null;
  notes?: string | null;
}): Row {
  const now = new Date().toISOString();
  const id = `sec-${Date.now().toString(36)}`;
  const code = input.code ?? `SEC-${id.slice(-6).toUpperCase()}`;
  run(
    `INSERT INTO security_events
       (id, code, title, category, severity, status, source, occurred_at, notes,
        event_type, outcome, subject_id, source_ip, resource_type, resource_id,
        correlation_id, normalized, ingested_at, asset_id)
     VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    id,
    code,
    input.title,
    input.category,
    input.severity,
    input.source,
    input.occurred_at ?? now,
    input.notes ?? null,
    input.event_type,
    input.outcome ?? null,
    input.subject_id ?? null,
    input.source_ip ?? null,
    input.resource_type ?? null,
    input.resource_id ?? null,
    input.correlation_id ?? null,
    now,
    input.asset_id ?? null
  );
  appendAuditEvent({
    plane: "CYBERSECURITY",
    event_type: "SECURITY_EVENT_INGESTED",
    source: input.source,
    subject_id: input.subject_id ?? null,
    resource_type: input.resource_type ?? null,
    resource_id: input.resource_id ?? null,
    correlation_id: input.correlation_id ?? null,
    severity: input.severity,
    outcome: input.outcome ?? null,
    payload: { event_id: id, event_type: input.event_type, category: input.category },
  });
  return one<Row>("SELECT * FROM security_events WHERE id = ?", id) ?? {};
}
