import { boolOrNull, dec, fail, forbidden, ok, readJson, str } from "@/lib/http";
import { CHECKLIST_FIELDS, INSPECTION_OUTCOMES } from "@/lib/lifecycle";
import { decideInspection } from "@/lib/repo";
import {
  AuthorizationDeniedError,
  containerScope,
  requireRequest,
} from "@/lib/authz";
import { one } from "@/lib/db";
import { principalFromRequest } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    const inspector = str(body.inspector);
    const outcome = str(body.outcome)?.toUpperCase();

    if (!inspector) return fail("A named inspector is required.", 422);
    if (!outcome || !(INSPECTION_OUTCOMES as readonly string[]).includes(outcome)) {
      return fail(`outcome must be one of ${INSPECTION_OUTCOMES.join(", ")}.`, 422);
    }

    const rawChecks = (body.checks ?? {}) as Record<string, unknown>;
    const checks: Record<string, boolean | null> = {};
    for (const [key] of CHECKLIST_FIELDS) checks[key] = boolOrNull(rawChecks[key]);

    const measuredRaw = body.measured_quantity;
    const measured = measuredRaw === null || measuredRaw === undefined || measuredRaw === ""
      ? null
      : dec(measuredRaw);
    if (measuredRaw !== null && measuredRaw !== undefined && measuredRaw !== "" && measured === null) {
      return fail("measured_quantity must be a decimal string such as \"3.400\".", 422);
    }

    const insp = one<{ container_id: string }>(
      "SELECT container_id FROM return_inspections WHERE id = ?",
      id
    );
    if (!insp) return fail(`Unknown inspection ${id}.`, 404);
    const principal = principalFromRequest(request);
    const scope = containerScope(insp.container_id);
    requireRequest(request, {
      action: "MATERIAL_INSPECT",
      resource_type: "container",
      resource_id: insp.container_id,
      facility_id: scope?.facility_id ?? principal?.facility_id ?? null,
      resource_command_id: scope?.command_id ?? principal?.command_id ?? null,
      lifecycle_state: scope?.lifecycle_state ?? null,
      expiry_state: scope?.expiry_state ?? null,
    });

    const result = decideInspection({
      inspection_id: id,
      inspector,
      outcome: outcome as "ACCEPT" | "RELABEL" | "QUARANTINE" | "DISPOSITION",
      checks,
      measured_quantity: measured,
      measurement_method: str(body.measurement_method),
      notes: str(body.notes) ?? undefined,
    });

    return ok(result);
  } catch (e) {
    if (e instanceof AuthorizationDeniedError) return forbidden(e.message, e.decision);
    return fail(e instanceof Error ? e.message : "Unable to decide inspection.", 422);
  }
}
