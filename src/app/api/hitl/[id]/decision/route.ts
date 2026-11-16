import { fail, forbidden, ok, readJson, str } from "@/lib/http";
import { decideHitl } from "@/lib/repo";
import { AuthorizationDeniedError, requireRequest } from "@/lib/authz";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = await readJson(request);
    const action = str(body.action);
    const decidedBy = str(body.decided_by);
    if (action !== "approve" && action !== "reject") {
      return fail("action must be 'approve' or 'reject'.", 422);
    }
    if (!decidedBy) return fail("decided_by is required; anonymous decisions are not accepted.", 422);

    const hx = one<{ status: string; requested_by: string | null }>(
      "SELECT status, requested_by FROM hitl_exceptions WHERE id = ?",
      id
    );
    if (!hx) return fail(`Unknown exception ${id}.`, 404);
    requireRequest(request, {
      action: "EXCEPTION_DECIDE",
      resource_type: "hitl_exception",
      resource_id: id,
      lifecycle_state: hx.status,
      requested_by: hx.requested_by,
    });

    return ok(decideHitl(id, action, decidedBy, str(body.note) ?? undefined));
  } catch (e) {
    if (e instanceof AuthorizationDeniedError) return forbidden(e.message, e.decision);
    return fail(e instanceof Error ? e.message : "Unable to decide exception.", 422);
  }
}
