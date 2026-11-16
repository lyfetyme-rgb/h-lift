import { forbidden, ok } from "@/lib/http";
import { authorize } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import {
  listAssessments,
  listControls,
  listEvidence,
  listFindings,
  listPoam,
  rmfSummary,
} from "@/lib/assurance";

export const dynamic = "force-dynamic";

export async function GET() {
  const principal = await currentPrincipal();
  const decision = authorize({ principal, action: "ASSURANCE_CONTROLS_READ" }, { record: false });
  if (!decision.permitted) {
    return forbidden("ASSURANCE_CONTROLS_READ denied: not authorized.", decision);
  }
  return ok({
    summary: rmfSummary(),
    controls: listControls(),
    evidence: listEvidence(),
    assessments: listAssessments(),
    findings: listFindings(),
    poam: listPoam(),
  });
}
