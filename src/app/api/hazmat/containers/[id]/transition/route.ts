import { fail, forbidden, ok, readJson, str } from "@/lib/http";
import { transitionContainer } from "@/lib/repo";
import { AuthorizationDeniedError, containerScope, requireRequest } from "@/lib/authz";
import { principalFromRequest } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    const to = str(body.to);
    const actor = str(body.actor);
    if (!to) return fail("to is required.", 422);
    if (!actor) return fail("A named actor is required for a lifecycle transition.", 422);

    const principal = principalFromRequest(request);
    const scope = containerScope(id);
    if (!scope) return fail(`Unknown container ${id}.`, 404);
    requireRequest(request, {
      action: "CONTAINER_TRANSITION",
      resource_type: "container",
      resource_id: id,
      facility_id: scope.facility_id ?? principal?.facility_id ?? null,
      resource_command_id: scope.command_id ?? principal?.command_id ?? null,
      lifecycle_state: scope.lifecycle_state,
      expiry_state: scope.expiry_state,
    });

    const container = transitionContainer(id, to, actor, str(body.notes) ?? undefined);
    return ok({ container, note: "Transition recorded in the container ledger." });
  } catch (e) {
    if (e instanceof AuthorizationDeniedError) return forbidden(e.message, e.decision);
    return fail(e instanceof Error ? e.message : "Unable to transition container.", 422);
  }
}
