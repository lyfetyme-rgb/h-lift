import type { AuditRecord } from "./audit";

/**
 * Optional SIEM forwarder.
 *
 * When SIEM_WEBHOOK_URL is set, every append-only audit event is also POSTed
 * to the configured SIEM/collector. Forwarding is best-effort and never blocks
 * or fails the local write: the hash chain is the source of truth, and a SIEM
 * outage must not stop operations. Set SIEM_WEBHOOK_SECRET to authenticate the
 * forward with a shared header.
 *
 * For STIX/TAXII consumers, prefer polling `/api/security/stix` or the TAXII
 * endpoints instead of this push path.
 */

export function siemConfigured(): boolean {
  return Boolean(process.env.SIEM_WEBHOOK_URL?.trim());
}

export function forwardAuditEvent(record: AuditRecord): void {
  const url = process.env.SIEM_WEBHOOK_URL?.trim();
  if (!url) return;
  const secret = process.env.SIEM_WEBHOOK_SECRET?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-hlift-siem-secret"] = secret;
  const body = JSON.stringify({
    type: "hlift.audit_event",
    spec_version: "1.0",
    seq: record.seq,
    id: record.id,
    occurred_at: record.occurred_at,
    plane: record.plane,
    event_type: record.event_type,
    source: record.source,
    subject_id: record.subject_id,
    resource_type: record.resource_type,
    resource_id: record.resource_id,
    correlation_id: record.correlation_id,
    severity: record.severity,
    outcome: record.outcome,
    payload: record.payload,
    prev_hash: record.prev_hash,
    hash: record.hash,
  });
  try {
    void fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // best effort by design
    });
  } catch {
    // never let a forwarding error affect the audit write
  }
}
