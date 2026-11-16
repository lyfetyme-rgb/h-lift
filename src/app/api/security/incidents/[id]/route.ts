import { fail, forbidden, ok, readJson, str } from "@/lib/http";
import { AuthorizationDeniedError, requireRequest } from "@/lib/authz";
import { one } from "@/lib/db";
import { IncidentStatus, manageIncident } from "@/lib/security-plane";

export const dynamic = "force-dynamic";

const STATES: IncidentStatus[] = ["OPEN", "INVESTIGATING", "CONTAINED", "CLOSED"];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    const status = str(body.status)?.toUpperCase() as IncidentStatus | undefined;
    const actor = str(body.actor);
    if (!status || !STATES.includes(status)) {
      return fail(`status must be one of ${STATES.join(", ")}.`, 422);
    }
    if (!actor) return fail("A named actor is required.", 422);

    const incident = one<{ status: string; severity: string }>(
      "SELECT status, severity FROM security_incidents WHERE id = ?",
      id
    );
    if (!incident) return fail(`Unknown incident ${id}.`, 404);

    requireRequest(request, {
      action: "SECURITY_INCIDENT_MANAGE",
      resource_type: "security_incident",
      resource_id: id,
      lifecycle_state: incident.status,
    });

    return ok(manageIncident({ id, status, actor, note: str(body.note) ?? undefined }));
  } catch (e) {
    if (e instanceof AuthorizationDeniedError) return forbidden(e.message, e.decision);
    return fail(e instanceof Error ? e.message : "Unable to update incident.", 422);
  }
}
