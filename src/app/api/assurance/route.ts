import { ok } from "@/lib/http";
import {
  listAssessments,
  listControls,
  listEvidence,
  listFindings,
  listPoam,
  rmfSummary,
} from "@/lib/assurance";

export const dynamic = "force-dynamic";

export function GET() {
  return ok({
    summary: rmfSummary(),
    controls: listControls(),
    evidence: listEvidence(),
    assessments: listAssessments(),
    findings: listFindings(),
    poam: listPoam(),
  });
}
