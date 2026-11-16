import { fail, forbidden, ok, readJson, str } from "@/lib/http";
import { resolveConflict } from "@/lib/repo";
import { AuthorizationDeniedError, requireRequest } from "@/lib/authz";
import { principalFromRequest } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = await readJson(request);
    const resolution = str(body.resolution);
    if (!resolution) return fail("resolution is required.", 422);

    const principal = principalFromRequest(request);
    requireRequest(request, {
      action: "CONFLICT_RESOLVE",
      resource_type: "conflict",
      resource_id: id,
      facility_id: principal?.facility_id ?? null,
    });

    return ok(resolveConflict(id, resolution, principal?.subject_id));
  } catch (e) {
    if (e instanceof AuthorizationDeniedError) return forbidden(e.message, e.decision);
    return fail(e instanceof Error ? e.message : "Unable to resolve conflict.", 422);
  }
}
