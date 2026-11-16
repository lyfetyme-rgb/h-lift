import { forbidden, ok } from "@/lib/http";
import { authorize } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { listVulnerabilities, socSummary } from "@/lib/security-plane";

export const dynamic = "force-dynamic";

export async function GET() {
  const principal = await currentPrincipal();
  const decision = authorize({ principal, action: "SECURITY_EVENTS_READ" }, { record: false });
  if (!decision.permitted) {
    return forbidden("SECURITY_EVENTS_READ denied: not authorized.", decision);
  }
  return ok({ summary: socSummary(), vulnerabilities: listVulnerabilities() });
}
