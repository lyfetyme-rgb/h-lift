import { forbidden, ok } from "@/lib/http";
import { decisionSummary, authorize, canRead } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { auditCount, recentAudit, verifyAuditChain } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const principal = await currentPrincipal();
  const allowed =
    canRead(principal, "OVERSIGHT_READ") ||
    canRead(principal, "ASSURANCE_CONTROLS_READ") ||
    canRead(principal, "SECURITY_EVENTS_READ");

  if (!allowed) {
    const decision = authorize({ principal, action: "OVERSIGHT_READ" }, { record: false });
    return forbidden("OVERSIGHT_READ denied: not authorized.", decision);
  }
  return ok({
    chain: verifyAuditChain(),
    count: auditCount(),
    events: recentAudit(120),
    decisions: decisionSummary(),
  });
}
