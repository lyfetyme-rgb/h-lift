/**
 * Zero Trust enforcement helpers (NIST 800-207).
 *
 * This module owns the perimeter gate: a request without a *valid* identity
 * assertion never reaches an API route. In signed mode the proxy verifies the
 * HS256 signature, expiry, issuer and audience at the edge using Web Crypto;
 * `identity.ts` re-verifies before resolving a principal so a direct call that
 * bypasses the proxy is still rejected.
 *
 * Edge-safe: no database or Node-only imports.
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
      try {
        const value = decodeURIComponent(part.slice(idx + 1).trim());
        if (value) return value;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function presentedAssertion(request: Request): string | null {
  return (
    request.headers.get(ASSERTION_HEADER)?.trim() ||
    cookieValue(request.headers.get("cookie"), ASSERTION_COOKIE)
  );
}

/** Read the assertion presented by the caller, without verifying its signature. */
export function assertedSubject(request: Request): string | null {
  if (signedAssertionsRequired()) return presentedAssertion(request);
  return (
    request.headers.get("x-hlift-subject")?.trim() ||
    cookieValue(request.headers.get("cookie"), "hlift_subject")
  );
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function parseObject(value: string): Record<string, unknown> | null {
  const bytes = decodeBase64Url(value);
  if (!bytes) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Verify the compact JWT at the edge; returns the subject or null. */
async function verifySignedAssertion(token: string): Promise<string | null> {
  const secret = process.env.HLIFT_IDP_HMAC_SECRET?.trim();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signaturePart] = parts;
  const header = parseObject(encodedHeader);
  const signature = decodeBase64Url(signaturePart);
  if (!header || !signature || header.alg !== "HS256") return null;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature as BufferSource,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`) as BufferSource,
    );
    if (!valid) return null;
  } catch {
    return null;
  }

  const payload = parseObject(encodedPayload);
  if (!payload) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now) return null;

  const issuer = process.env.HLIFT_IDP_ISSUER?.trim();
  if (issuer && payload.iss !== issuer) return null;
  const audience = process.env.HLIFT_IDP_AUDIENCE?.trim();
  if (audience) {
    const aud = payload.aud;
    if (aud !== audience && !(Array.isArray(aud) && aud.includes(audience))) return null;
  }

  return typeof payload.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;
}

export type ZeroTrustReason = "PERMITTED" | "ASSERTION_REQUIRED" | "INVALID_ASSERTION" | "DISABLED";

export interface ZeroTrustGate {
  permitted: boolean;
  subject: string | null;
  reason_code: ZeroTrustReason;
}

export async function evaluateZeroTrust(request: Request): Promise<ZeroTrustGate> {
  if (!zeroTrustEnabled()) {
    return { permitted: true, subject: assertedSubject(request), reason_code: "DISABLED" };
  }

  if (signedAssertionsRequired()) {
    const token = presentedAssertion(request);
    if (!token) return { permitted: false, subject: null, reason_code: "ASSERTION_REQUIRED" };
    const subject = await verifySignedAssertion(token);
    if (!subject) return { permitted: false, subject: null, reason_code: "INVALID_ASSERTION" };
    return { permitted: true, subject, reason_code: "PERMITTED" };
  }

  const subject = assertedSubject(request);
  if (!subject) return { permitted: false, subject: null, reason_code: "ASSERTION_REQUIRED" };
  return { permitted: true, subject, reason_code: "PERMITTED" };
}
