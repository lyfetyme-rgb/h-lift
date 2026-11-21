/**
 * Zero Trust enforcement helpers (NIST 800-207).
 *
 * Zero Trust is a posture, not a single switch, but this module owns the one
 * hard gate the pilot can enforce today: a request without an identity
 * assertion is never allowed to reach an API route. Every other Zero Trust
 * property the platform implements (per-request authorization, facility and
 * command micro-segmentation, continuous decision recording, assume-breach
 * audit) lives in `authz.ts`, `identity.ts` and `audit.ts`.
 */

export const ZERO_TRUST_ENV = "HLIFT_ZERO_TRUST";

export function zeroTrustEnabled(): boolean {
  const raw = (process.env[ZERO_TRUST_ENV] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Read an assertion from the request without touching the database. */
export function assertedSubject(request: Request): string | null {
  const header = request.headers.get("x-hlift-subject")?.trim();
  if (header) return header;
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === "hlift_subject") {
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      if (value) return value;
    }
  }
  return null;
}

export interface ZeroTrustGate {
  permitted: boolean;
  subject: string | null;
  reason_code: "PERMITTED" | "ASSERTION_REQUIRED" | "DISABLED";
}

export function evaluateZeroTrust(request: Request): ZeroTrustGate {
  if (!zeroTrustEnabled()) return { permitted: true, subject: assertedSubject(request), reason_code: "DISABLED" };
  const subject = assertedSubject(request);
  if (!subject) return { permitted: false, subject: null, reason_code: "ASSERTION_REQUIRED" };
  return { permitted: true, subject, reason_code: "PERMITTED" };
}
