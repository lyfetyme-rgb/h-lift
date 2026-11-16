import { ok } from "@/lib/http";
import { listIncidents, socSummary } from "@/lib/security-plane";

export const dynamic = "force-dynamic";

export function GET() {
  return ok({ summary: socSummary(), incidents: listIncidents() });
}
