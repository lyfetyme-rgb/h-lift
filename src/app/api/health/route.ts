import { ok } from "@/lib/http";
import { getDb, getSchemaError } from "@/lib/db";
import { overview } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Liveness + dependency health. A broken schema or unreadable database is
 * reported as degraded with HTTP 503, so monitors and operators never mistake
 * an empty/unseeded data layer for a healthy "zero counts" dashboard.
 */
export function GET() {
  const checks: { db: boolean; schema: boolean; detail?: string } = { db: false, schema: false };
  let detail: string | null = null;

  try {
    getDb().prepare("SELECT 1").get();
    checks.db = true;
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }

  const schemaError = getSchemaError();
  checks.schema = !schemaError;
  if (schemaError && !detail) detail = schemaError;
  if (detail) checks.detail = detail;

  const healthy = checks.db && checks.schema;
  let summary: unknown = null;
  if (healthy) {
    try {
      summary = overview();
    } catch (error) {
      // A query failure after the schema check still means degraded.
      checks.db = false;
      checks.detail = error instanceof Error ? error.message : String(error);
    }
  }

  const status = checks.db && checks.schema ? "ok" : "degraded";
  return ok(
    {
      service: "h-lift-traceability",
      version: "0.1.0",
      status,
      time: new Date().toISOString(),
      checks,
      summary,
    },
    status === "ok" ? 200 : 503,
  );
}
