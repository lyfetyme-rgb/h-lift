import { createHash, randomUUID } from "node:crypto";
import { all, one, run } from "./db";
import { forwardAuditEvent } from "./siem";

/**
 * The shared append-only event / audit bus.
 *
 * All three planes write here. Each row carries the hash of its predecessor,
 * so an edit to an earlier record breaks every later hash. The seed script
 * computes the same material with the same canonical JSON encoder; a divergence
 * is visible through `verifyAuditChain`.
 */

export type AuditPlane =
  | "OPERATIONAL"
  | "CYBERSECURITY"
  | "ASSURANCE"
  | "GOVERNANCE"
  | "TRUSTED_DATA";

export interface AuditInput {
  id?: string;
  occurred_at?: string;
  plane: AuditPlane;
  event_type: string;
  source: string;
  subject_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  correlation_id?: string | null;
  severity?: string | null;
  outcome?: string | null;
  payload?: unknown;
}

export interface AuditRecord {
  seq: number;
  id: string;
  occurred_at: string;
  plane: string;
  event_type: string;
  source: string;
  subject_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  correlation_id: string | null;
  severity: string | null;
  outcome: string | null;
  payload: string | null;
  prev_hash: string | null;
  hash: string;
}

/**
 * Deterministic JSON: object keys sorted, undefined omitted. Both the runtime
 * and the seed use this exact encoder before hashing.
 */
export function canonicalJson(value: unknown): string {
  const enc = (v: unknown): string => {
    if (v === null || v === undefined) return "null";
    if (Array.isArray(v)) return `[${v.map(enc).join(",")}]`;
    if (typeof v === "object") {
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${enc(obj[k])}`).join(",")}}`;
    }
    if (typeof v === "number" && !Number.isFinite(v)) return "null";
    return JSON.stringify(v);
  };
  return enc(value);
}

export interface AuditHashFields {
  id: string;
  occurred_at: string;
  plane: string;
  event_type: string;
  source: string;
  subject_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  correlation_id?: string | null;
  severity?: string | null;
  outcome?: string | null;
  payload?: string | null;
}

/** Canonical hash material. Do not reorder without a migration. */
export function auditHashMaterial(prevHash: string | null, f: AuditHashFields): string {
  return [
    prevHash ?? "",
    f.id,
    f.occurred_at,
    f.plane,
    f.event_type,
    f.source,
    f.subject_id ?? "",
    f.resource_type ?? "",
    f.resource_id ?? "",
    f.correlation_id ?? "",
    f.severity ?? "",
    f.outcome ?? "",
    f.payload ?? "",
  ].join("\n");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function auditHash(prevHash: string | null, f: AuditHashFields): string {
  return sha256Hex(auditHashMaterial(prevHash, f));
}

export function appendAuditEvent(input: AuditInput): AuditRecord {
  const prev = one<{ hash: string }>("SELECT hash FROM audit_events ORDER BY seq DESC LIMIT 1");
  const prevHash = prev?.hash ?? null;
  const record: AuditHashFields & { plane: string } = {
    id: input.id ?? `evt-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    plane: input.plane,
    event_type: input.event_type,
    source: input.source,
    subject_id: input.subject_id ?? null,
    resource_type: input.resource_type ?? null,
    resource_id: input.resource_id ?? null,
    correlation_id: input.correlation_id ?? null,
    severity: input.severity ?? null,
    outcome: input.outcome ?? null,
    payload: input.payload === undefined ? null : canonicalJson(input.payload),
  };
  const hash = auditHash(prevHash, record);
  run(
    `INSERT INTO audit_events
       (id, occurred_at, plane, event_type, source, subject_id, resource_type, resource_id,
        correlation_id, severity, outcome, payload, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.id,
    record.occurred_at,
    record.plane,
    record.event_type,
    record.source,
    record.subject_id,
    record.resource_type,
    record.resource_id,
    record.correlation_id,
    record.severity,
    record.outcome,
    record.payload,
    prevHash,
    hash
  );
  const row = one<AuditRecord>("SELECT * FROM audit_events WHERE id = ?", record.id);
  if (!row) throw new Error("Audit event was not persisted.");
  // Opt-in SIEM forwarding; best-effort, never blocks the local write.
  forwardAuditEvent(row);
  return row;
}

export function recentAudit(limit = 100): AuditRecord[] {
  return all<AuditRecord>("SELECT * FROM audit_events ORDER BY seq DESC LIMIT ?", limit);
}

export function auditCount(): number {
  return one<{ n: number }>("SELECT COUNT(*) AS n FROM audit_events")?.n ?? 0;
}

export interface ChainStatus {
  events: number;
  valid: boolean;
  brokenAt: string | null;
  head: string | null;
}

/** Recompute the chain from genesis; the first mismatch is reported. */
export function verifyAuditChain(): ChainStatus {
  const rows = all<AuditRecord>("SELECT * FROM audit_events ORDER BY seq ASC");
  let prev: string | null = null;
  for (const row of rows) {
    const expected: string = auditHash(prev, {
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
      return { events: rows.length, valid: false, brokenAt: row.id, head: rows.at(-1)?.hash ?? null };
    }
    prev = row.hash;
  }
  return { events: rows.length, valid: true, brokenAt: null, head: prev };
}
