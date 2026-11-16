import { ok } from "@/lib/http";
import { listVulnerabilities, socSummary } from "@/lib/security-plane";

export const dynamic = "force-dynamic";

export function GET() {
  return ok({ summary: socSummary(), vulnerabilities: listVulnerabilities() });
}
