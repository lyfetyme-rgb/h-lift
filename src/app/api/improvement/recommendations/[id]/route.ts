import { fail, forbidden, ok, readJson, str } from "@/lib/http";
import { requireRequest } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { decideRecommendation, DecisionState } from "@/lib/effectiveness";

export const dynamic = "force-dynamic";

const STATES: DecisionState[] = ["APPROVED", "REJECTED", "DISMISSED"];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const principal = await currentPrincipal();
    const actor = principal?.subject_id ?? "UNKNOWN";
    requireRequest(request, {
      action: "EXCEPTION_DECIDE",
      resource_type: "tuning_recommendation",
      resource_id: id,
    });

    const body = await readJson(request);
    const decision = str(body.decision)?.toUpperCase() as DecisionState | undefined;
    if (!decision || !STATES.includes(decision)) {
      return fail(`decision must be one of ${STATES.join(", ")}.`, 422);
    }

    return ok(decideRecommendation({
      id,
      decision,
      actor,
      note: str(body.note) ?? undefined,
    }));
  } catch (e) {
    if (e && typeof e === "object" && "decision" in e) {
      return forbidden((e as { message?: string }).message ?? "Denied", (e as any).decision);
    }
    return fail(e instanceof Error ? e.message : "Unable to decide.", 422);
  }
}
