import { NextResponse } from "next/server";

/**
 * Minimal crash sink: logs one redacted JSON line for Google Cloud Logging /
 * Error Reporting. It deliberately stores nothing — no database, no PII.
 */

const MAX_BODY_BYTES = 8_192;

const REDACTIONS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /(?:\+?\d[\d\s().-]{7,}\d)/g,
];

function redact(value: string): string {
  return REDACTIONS.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), value).slice(0, 2_000);
}

function field(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request): Promise<NextResponse> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    payload = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const message = field(payload, "message");
  if (!message) return NextResponse.json({ error: "MISSING_MESSAGE" }, { status: 400 });

  console.error(
    JSON.stringify({
      severity: "ERROR",
      event: "client_error",
      source: redact(field(payload, "source") ?? "client"),
      message: redact(message),
      stack: field(payload, "stack") ? redact(field(payload, "stack")!) : undefined,
      digest: field(payload, "digest") ? redact(field(payload, "digest")!) : undefined,
      request_id: field(payload, "requestId") ? redact(field(payload, "requestId")!) : "-",
      path: field(payload, "path") ? redact(field(payload, "path")!) : undefined,
      user_agent: redact(request.headers.get("user-agent") ?? ""),
    }),
  );

  return new NextResponse(null, { status: 204 });
}
