import { fail, forbidden, ok, readJson, str } from "@/lib/http";
import { AuthorizationDeniedError, requireRequest } from "@/lib/authz";
import { FindingStatus, updateFinding } from "@/lib/assurance";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATES: FindingStatus[] = ["OPEN", "REMEDIATION", "CLOSED", "ACCEPTED"];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    const status = str(body.status)?.toUpperCase() as FindingStatus | undefined;
    const actor = str(body.actor);
    if (!status || !STATES.includes(status)) {
      return fail(`status must be one of ${STATES.join(", ")}.`, 422);
    }
    if (!actor) return fail("A named actor is required.", 422);

    const finding = one<{ status: string }>("SELECT status FROM findings WHERE id = ?", id);
    if (!finding) return fail(`Unknown finding ${id}.`, 404);

    // Closing is a distinct capability, held only by command oversight and
    // carrying a COMMAND_ACKNOWLEDGEMENT obligation. It is not part of the
    // everyday assessor workflow.
    requireRequest(request, {
      action: status === "CLOSED" ? "ASSURANCE_FINDING_CLOSE" : "ASSURANCE_FINDING_MANAGE",
      resource_type: "finding",
      resource_id: id,
      lifecycle_state: finding.status,
    });

    return ok(updateFinding({ id, status, actor, note: str(body.note) ?? undefined }));
  } catch (e) {
    if (e instanceof AuthorizationDeniedError) return forbidden(e.message, e.decision);
    return fail(e instanceof Error ? e.message : "Unable to update finding.", 422);
  }
}
