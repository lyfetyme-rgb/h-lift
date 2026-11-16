import { ok } from "@/lib/http";
import { decisionSummary } from "@/lib/authz";
import { auditCount, recentAudit, verifyAuditChain } from "@/lib/audit";

export const dynamic = "force-dynamic";

export function GET() {
  return ok({
    chain: verifyAuditChain(),
    count: auditCount(),
    events: recentAudit(120),
    decisions: decisionSummary(),
  });
}
