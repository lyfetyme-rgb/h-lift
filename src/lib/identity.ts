import { createHmac, timingSafeEqual } from "node:crypto";
import { all, one } from "./db";

/**
 * H-LIFT identity adapter.
 *
 * H-LIFT never sees or stores credentials. A DoD-approved identity service
 * authenticates the principal and supplies a stable subject plus organizational
 * claims. This adapter maps that subject onto a local principal record, roles
 * and credential assurance. In this pilot the assertion is carried by
 * `x-hlift-subject` (automation) or the `hlift_subject` cookie (console).
 */

export const DEFAULT_SUBJECT = "cust.k.rivera";
export const SUBJECT_HEADER = "x-hlift-subject";
export const SUBJECT_COOKIE = "hlift_subject";
export const ASSERTION_HEADER = "x-hlift-assertion";
export const ASSERTION_COOKIE = "hlift_assertion";

/**
 * Signed assertion mode. When HLIFT_IDP_HMAC_SECRET is configured, the subject
 * is taken only from a verified HS256 JWT, never from a plain header/cookie.
 * Production deployments should replace this shared-secret verifier with their
 * IdP's asymmetric (JWKS/RS256) assertion validation.
 */
export function signedAssertionsRequired(): boolean {
  return Boolean(process.env.HLIFT_IDP_HMAC_SECRET?.trim());
}

function base64UrlDecode(value: string): Buffer | null {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

/** Verify a compact HS256 JWT and return its `sub` claim, or null. */
export function verifyAssertion(token: string | null | undefined): string | null {
  const secret = process.env.HLIFT_IDP_HMAC_SECRET?.trim();
  if (!secret || !token) return null;

  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  const headerBytes = base64UrlDecode(encodedHeader);
  const payloadBytes = base64UrlDecode(encodedPayload);
  if (!headerBytes || !payloadBytes) return null;

  let header: { alg?: string; typ?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(headerBytes.toString("utf8"));
    payload = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  const expected = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const now = Math.floor(Date.now() / 1000);
  // exp is mandatory: an assertion without it must never be accepted.
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

export interface RoleRef {
  code: string;
  name: string;
  command_id: string | null;
  facility_id: string | null;
}

export interface Principal {
  id: string;
  subject_id: string;
  display_name: string;
  email: string | null;
  command_id: string | null;
  facility_id: string | null;
  credential_assurance: string;
  idp_issuer: string | null;
  status: string;
  attributes: string | null;
  command_name: string | null;
  command_level: string | null;
  command_parent_id: string | null;
  roles: RoleRef[];
  capabilities: string[];
}

interface PrincipalRow {
  id: string;
  subject_id: string;
  display_name: string;
  email: string | null;
  command_id: string | null;
  facility_id: string | null;
  credential_assurance: string;
  idp_issuer: string | null;
  status: string;
  attributes: string | null;
}

/** Parse a Cookie header without a framework dependency. */
export function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function principalSubjectFromRequest(request: Request): string | null {
  if (signedAssertionsRequired()) {
    const assertion =
      request.headers.get(ASSERTION_HEADER)?.trim() ||
      cookieValue(request.headers.get("cookie"), ASSERTION_COOKIE);
    return verifyAssertion(assertion);
  }
  const header = request.headers.get(SUBJECT_HEADER);
  if (header?.trim()) return header.trim();
  return cookieValue(request.headers.get("cookie"), SUBJECT_COOKIE);
}

export function getPrincipal(subjectId: string): Principal | null {
  const row = one<PrincipalRow>("SELECT * FROM principals WHERE subject_id = ?", subjectId);
  if (!row) return null;

  const cmd = row.command_id
    ? one<{ name: string; level: string; parent_id: string | null }>(
        "SELECT name, level, parent_id FROM commands WHERE id = ?",
        row.command_id
      )
    : null;

  const roles = all<RoleRef>(
    `SELECT r.code, r.name, pr.command_id, pr.facility_id
       FROM principal_roles pr
       JOIN roles r ON r.id = pr.role_id
      WHERE pr.principal_id = ? AND pr.status = 'ACTIVE'
      ORDER BY r.code`,
    row.id
  );

  const capabilities = all<{ capability_code: string }>(
    `SELECT DISTINCT rc.capability_code
       FROM principal_roles pr
       JOIN role_capabilities rc ON rc.role_id = pr.role_id
      WHERE pr.principal_id = ? AND pr.status = 'ACTIVE'
      ORDER BY rc.capability_code`,
    row.id
  ).map((r) => r.capability_code);

  return {
    ...row,
    command_name: cmd?.name ?? null,
    command_level: cmd?.level ?? null,
    command_parent_id: cmd?.parent_id ?? null,
    roles,
    capabilities,
  };
}

/** Resolve a subject, falling back to the demo console principal. */
export function resolvePrincipal(subjectId?: string | null): Principal | null {
  if (subjectId) {
    const exact = getPrincipal(subjectId);
    if (exact) return exact;
  }
  return getPrincipal(DEFAULT_SUBJECT);
}

export function principalFromRequest(request: Request): Principal | null {
  if (signedAssertionsRequired()) {
    const subject = principalSubjectFromRequest(request);
    // No demo fallback in signed mode: an unverified caller is never a principal.
    return subject ? getPrincipal(subject) : null;
  }
  return resolvePrincipal(principalSubjectFromRequest(request));
}

/**
 * Server-component identity. Next resolves headers/cookies asynchronously in
 * the App Router; absence of an assertion is not an authentication success in
 * production, but the pilot needs a named demo console identity.
 */
export async function currentPrincipal(): Promise<Principal | null> {
  const { headers, cookies } = await import("next/headers");
  const h = await headers();
  const c = await cookies();
  if (signedAssertionsRequired()) {
    const assertion = h.get(ASSERTION_HEADER)?.trim() || c.get(ASSERTION_COOKIE)?.value?.trim() || null;
    const subject = verifyAssertion(assertion);
    return subject ? getPrincipal(subject) : null;
  }
  const subject = h.get(SUBJECT_HEADER)?.trim() || c.get(SUBJECT_COOKIE)?.value?.trim() || null;
  return resolvePrincipal(subject);
}

export function listPrincipals(): Principal[] {
  const rows = all<PrincipalRow>("SELECT * FROM principals ORDER BY display_name");
  return rows
    .map((r) => getPrincipal(r.subject_id))
    .filter((p): p is Principal => p !== null);
}

export function roleLabel(principal: Principal | null): string {
  if (!principal) return "UNKNOWN";
  return principal.roles.map((r) => r.code).join(" + ") || "NO_ROLE";
}
