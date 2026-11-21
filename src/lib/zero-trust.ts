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
export const ASSERTION_HEADER = "x-hlift-assertion";
export const ASSERTION_COOKIE = "hlift_assertion";

export function zeroTrustEnabled(): boolean {
  const raw = (process.env[ZERO_TRUST_ENV] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Signed-assertion mode is configured via an IdP shared secret. */
export function signedAssertionsRequired(): boolean {
  return Boolean(process.env.HLIFT_IDP_HMAC_SECRET?.trim());
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      if (value) return value;
    }
  }
  return null;
}

/**
 * Read the assertion presented by the caller, without touching the database or
 * verifying its signature (verification happens in `identity.ts`). In signed
 * mode a plain `x-hlift-subject` header is not an assertion at all.
 */
export function assertedSubject(request: Request): string | null {
  if (signedAssertionsRequired()) {
    return request.headers.get(ASSERTION_HEADER)?.trim() ||
      cookieValue(request.headers.get("cookie"), ASSERTION_COOKIE);
  }
  return request.headers.get("x-hlift-subject")?.trim() ||
    cookieValue(request.headers.get("cookie"), "hlift_subject");
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
