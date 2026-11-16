/**
 * Status vocabulary and display rules.
 *
 * Core rule of this platform: never infer a status. Missing, contradictory or
 * uninspected data is rendered as UNKNOWN / UNVERIFIED, not as a guess.
 */

export const UNKNOWN = "UNKNOWN";
export const UNVERIFIED = "UNVERIFIED";

export type Tone = "ok" | "warn" | "bad" | "info" | "muted" | "unknown";

const TONES: Record<string, Tone> = {
  // requirement / generic lifecycle
  VERIFIED: "ok",
  APPROVED: "ok",
  RELEASED: "ok",
  VALIDATED: "ok",
  COMPLETE: "ok",
  PASS: "ok",
  RESOLVED: "ok",
  MITIGATED: "ok",
  BUILT: "ok",
  DONE: "ok",
  SYNCED: "ok",
  MERGED: "ok",
  PASSING: "ok",
  ONLINE: "ok",
  IN_SERVICE: "ok",
  AVAILABLE: "ok",
  RESTOCK_APPROVED: "ok",
  ACCEPT: "ok",
  SEALED: "ok",
  SERVICEABLE: "ok",
  MEASURED: "ok",
  FULL_CONTAINER: "ok",

  // cybersecurity / assurance verdicts
  IMPLEMENTED: "ok",
  CURRENT: "ok",
  MATCH: "ok",
  SATISFIED: "ok",
  PERMIT: "ok",
  CONTAINED: "ok",
  COMPLETED: "ok",
  APPLICABLE: "ok",
  REMEDIATED: "ok",
  ACTIVE: "ok",

  // in-flight
  IN_PROGRESS: "info",
  INVESTIGATING: "info",
  REMEDIATION: "info",
  IN_REVIEW: "info",
  TODO: "info",
  DRAFT: "info",
  PENDING: "warn",
  DUE: "warn",
  OPEN: "warn",
  TRIAGED: "info",
  REQUESTED: "warn",
  QUEUED: "warn",
  PARTIAL: "warn",
  EXPIRING_30D: "warn",
  HELD: "warn",
  MEDIUM: "warn",
  HIGH: "warn",
  RESERVED: "info",
  ISSUED: "info",
  IN_CUSTODY: "info",
  IN_USE: "info",
  INSPECTED: "info",
  RETURN_INITIATED: "warn",
  RETURN_RECEIVED: "warn",
  RETURN_HOLD: "warn",
  RELABEL_REQUIRED: "warn",
  RELABEL: "warn",
  OPENED: "warn",
  ESTIMATED: "warn",
  MEASURED_REMAINDER: "warn",
  DRIFT: "warn",
  STALE: "warn",
  DELAYED: "warn",
  ACCEPTED: "warn",
  ACKNOWLEDGED: "warn",

  // bad
  FAILED: "bad",
  FAIL: "bad",
  MISSING: "bad",
  MISMATCH: "bad",
  NOT_IMPLEMENTED: "bad",
  NOT_SATISFIED: "bad",
  DENY: "bad",
  FAILING: "bad",
  REJECTED: "bad",
  BLOCKED: "bad",
  EXPIRED: "bad",
  OVERDUE: "bad",
  QUARANTINED: "bad",
  QUARANTINE: "bad",
  OFFLINE: "bad",
  CRITICAL: "bad",
  CONFLICT: "bad",
  URGENT: "bad",
  DISPOSITION_REQUIRED: "bad",
  DISPOSITION: "bad",
  DAMAGED: "bad",
  SUSPECT: "bad",

  // neutral / unknown
  UNKNOWN: "unknown",
  UNVERIFIED: "unknown",
  NOT_ASSESSED: "unknown",
  NOT_APPLICABLE: "muted",
  DECLARED_UNVERIFIED: "unknown",
  CANCELED: "muted",
  CANCELLED: "muted",
  DISPOSED: "muted",
  FULLY_CONSUMED: "muted",
  CLOSED: "muted",
  LOW: "muted",
  NORMAL: "muted",
  BACKLOG: "muted",
  OPEN_ITEM: "muted",
};

export function tone(status?: string | null): Tone {
  if (!status) return "unknown";
  return TONES[status.toUpperCase()] ?? "unknown";
}

/** Render a value, preserving UNKNOWN rather than substituting a guess. */
export function display(value?: string | number | null, suffix = ""): string {
  if (value === null || value === undefined) return UNKNOWN;
  const s = String(value).trim();
  if (!s) return UNKNOWN;
  return s + suffix;
}

/** Compare ISO timestamps to now; a missing timestamp is UNKNOWN, never "ok". */
export function shelfState(
  expiresAt?: string | null,
  now: Date = new Date()
): "EXPIRED" | "EXPIRING_30D" | "OK" | typeof UNKNOWN {
  if (!expiresAt) return UNKNOWN;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return UNKNOWN;
  const days = (t - now.getTime()) / 864e5;
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "EXPIRING_30D";
  return "OK";
}

export function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / 864e5);
}

export function percent(fraction?: number | null): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return UNKNOWN;
  return `${Math.round(fraction * 1000) / 10}%`;
}
