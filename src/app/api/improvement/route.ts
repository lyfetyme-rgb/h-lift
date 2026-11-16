import { ok } from "@/lib/http";
import { computeEffectiveness, effectivenessSummary, listMetrics, listRecommendations } from "@/lib/effectiveness";
import { requireRequest } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  const principal = await currentPrincipal();
  // Viewing is broad (oversight), not recording decisions.
  const { authorize } = await import("@/lib/authz");
  const decision = authorize({ principal, action: "OVERSIGHT_READ" }, { record: false });
  if (!decision.permitted) {
    const { forbidden } = await import("@/lib/http");
    return forbidden("OVERSIGHT_READ denied: not authorized to view effectiveness.", decision);
  }
  return ok({
    summary: effectivenessSummary(),
    metrics: listMetrics(24),
    recommendations: listRecommendations(),
  });
}

export async function POST(request: Request) {
  try {
    requireRequest(request, {
      action: "EXCEPTION_DECIDE",
      resource_type: "effectiveness",
      resource_id: "recompute",
    });
    const result = computeEffectiveness();
    return ok(result);
  } catch (e) {
    if (e && typeof e === "object" && "decision" in e) {
      const { forbidden } = await import("@/lib/http");
      return forbidden((e as { message?: string }).message ?? "Denied", (e as any).decision);
    }
    return ok({ error: e instanceof Error ? e.message : String(e) });
  }
}
