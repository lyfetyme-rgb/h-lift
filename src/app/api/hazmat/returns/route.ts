import { dec, fail, forbidden, ok, readJson, str } from "@/lib/http";
import { listInspections, recordReturn } from "@/lib/repo";
import {
  AuthorizationDeniedError,
  containerScope,
  requireRequest,
} from "@/lib/authz";
import { principalFromRequest } from "@/lib/identity";

export const dynamic = "force-dynamic";

const METHODS = ["MEASURED", "ESTIMATED", "DECLARED_UNVERIFIED"];

export function GET() {
  return ok(listInspections());
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const containerId = str(body.container_id);
    const actor = str(body.actor);
    const method = (str(body.measurement_method) ?? "DECLARED_UNVERIFIED").toUpperCase();
    const returned = dec(body.returned_quantity);

    if (!containerId) return fail("container_id is required.", 422);
    if (!actor) return fail("A named actor is required to receive a return.", 422);
    if (!METHODS.includes(method)) {
      return fail(`measurement_method must be one of ${METHODS.join(", ")}.`, 422);
    }
    if (!returned) {
      return fail(
        'returned_quantity must be a decimal string such as "3.400". Floats, blanks and estimates-as-numbers are rejected.',
        422
      );
    }

    const principal = principalFromRequest(request);
    const scope = containerScope(containerId);
    if (!scope) return fail(`Unknown container ${containerId}.`, 404);

    requireRequest(request, {
      action: "MATERIAL_RETURN",
      resource_type: "container",
      resource_id: containerId,
      facility_id: scope.facility_id ?? principal?.facility_id ?? null,
      resource_command_id: scope.command_id ?? principal?.command_id ?? null,
      lifecycle_state: scope.lifecycle_state,
      expiry_state: scope.expiry_state,
    });

    const result = recordReturn({
      container_id: containerId,
      returned_quantity: returned,
      measurement_method: method,
      actor,
      notes: str(body.notes) ?? undefined,
    });

    // A return never re-enters available stock here. It is received into
    // RETURN_HOLD with a pending eight-point inspection.
    return ok(
      {
        ...result,
        state: "RETURN_HOLD",
        verification: method === "MEASURED" ? "MEASURED_NOT_INSPECTED" : "UNVERIFIED",
        note:
          "Return received into RETURN_HOLD. The container cannot become AVAILABLE until an " +
          "inspection is ACCEPTED with all eight checks confirmed and a measured quantity.",
      },
      201
    );
  } catch (e) {
    if (e instanceof AuthorizationDeniedError) return forbidden(e.message, e.decision);
    return fail(e instanceof Error ? e.message : "Unable to record return.", 422);
  }
}
