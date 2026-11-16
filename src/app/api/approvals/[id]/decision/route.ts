import { fail, forbidden, ok, readJson, str } from "@/lib/http";
import { decideApproval } from "@/lib/repo";
import { AuthorizationDeniedError, requireRequest } from "@/lib/authz";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = await readJson(request);
    const action = str(body.action);
    const approver = str(body.approver);
    if (action !== "approve" && action !== "reject") {
      return fail("action must be 'approve' or 'reject'.", 422);
    }
    if (!approver) return fail("approver is required; anonymous approvals are not accepted.", 422);

    const apr = one<{ status: string; requested_by: string | null; artifact_id: string }>(
      "SELECT status, requested_by, artifact_id FROM deployment_approvals WHERE id = ?",
      id
    );
    if (!apr) return fail(`Unknown approval ${id}.`, 404);
    requireRequest(request, {
      action: "RELEASE_APPROVE",
      resource_type: "deployment_approval",
      resource_id: id,
      lifecycle_state: apr.status,
      requested_by: apr.requested_by,
    });

    return ok(decideApproval(id, action, approver, str(body.note) ?? undefined));
  } catch (e) {
    if (e instanceof AuthorizationDeniedError) return forbidden(e.message, e.decision);
    return fail(e instanceof Error ? e.message : "Unable to decide approval.", 422);
  }
}
