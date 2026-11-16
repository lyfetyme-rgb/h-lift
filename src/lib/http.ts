import { NextResponse } from "next/server";
import { Dec, formatDec, isDec, parseDec } from "./qty";

/**
 * JSON responses must never leak BigInt or IEEE-754 floats as quantities.
 * Dec values are rendered as canonical decimal strings on the way out, so an
 * API consumer sees "3.400", not {"units":"3400","scale":3} or 3.4.
 */
function encode(value: unknown): unknown {
  if (isDec(value)) return formatDec(value);
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = encode(v);
    return out;
  }
  return value;
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(encode(data), { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Authorization denials carry the persisted decision so the caller can audit it. */
export function forbidden(message: string, decision: unknown) {
  return NextResponse.json({ error: message, decision }, { status: 403 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") throw new Error("Body must be a JSON object.");
    return body as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s.length ? s : null;
}

/**
 * Parse a quantity. Accepts only canonical decimal strings (or integers) —
 * "3.400" is fine, "3.4e2", "NaN" and "about 3" are not.
 */
export function dec(value: unknown): Dec | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return parseDec(value);
}

/** Tri-state checklist input: true / false / null (UNKNOWN). */
export function boolOrNull(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}
