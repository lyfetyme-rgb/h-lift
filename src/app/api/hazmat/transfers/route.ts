import { fail, forbidden, ok, readJson, str } from "@/lib/http";
import {
  AuthorizationDeniedError,
  authorize,
  requireRequest,
} from "@/lib/authz";
import { one } from "@/lib/db";
import { currentPrincipal } from "@/lib/identity";
import {
  createTransfer,
  destinationCommands,
  listPackoutCandidates,
  listTransfers,
  listTransferGroups,
  recordUnusedReturn,
} from "@/lib/transfers";

export const dynamic = "force-dynamic";

export async function GET() {
  const principal = await currentPrincipal();
  const canView =
    authorize({ principal, action: "MATERIAL_TRANSFER" }, { record: false }).permitted ||
    authorize({ principal, action: "OVERSIGHT_READ" }, { record: false }).permitted;
  if (!canView) {
    return forbidden(
      "MATERIAL_TRANSFER denied: not authorized to view transfers.",
      authorize({ principal, action: "MATERIAL_TRANSFER" }, { record: false })
    );
  }
  const source = principal?.command_id ?? null;
  return ok({
    transfers: listTransfers(),
    groups: listTransferGroups(),
    candidates: source ? listPackoutCandidates(source) : [],
    destinations: destinationCommands(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const action = (str(body.action) ?? "TRANSFER").toUpperCase();
    const principal = await currentPrincipal();

    if (action === "UNUSED_RETURN") {
      const transferId = str(body.transfer_id);
      const qty = str(body.returned_unused_quantity);
      if (!transferId) return fail("transfer_id is required.", 422);
      if (!qty) return fail("returned_unused_quantity is required.", 422);

      const source = one<{ source_command_id: string }>(
        "SELECT source_command_id FROM custody_transfers WHERE id = ?",
        transferId
      );
      if (!source) return fail(`Unknown transfer ${transferId}.`, 404);
      requireRequest(request, {
        action: "CUSTODY_UNUSED_RETURN",
        resource_type: "custody_transfer",
        resource_id: transferId,
        resource_command_id: source.source_command_id,
        facility_id: principal?.facility_id ?? null,
        lifecycle_state: "ISSUED",
      });

      return ok(recordUnusedReturn({
        transfer_id: transferId,
        returned_unused_quantity: qty,
        actor: principal?.subject_id ?? str(body.actor) ?? "UNKNOWN",
        notes: str(body.notes) ?? undefined,
      }));
    }

    if (action === "TRANSFER") {
      const containerIds = Array.isArray(body.container_ids)
        ? body.container_ids.map(String)
        : [];
      const destination = str(body.destination_command_id);
      if (containerIds.length === 0) return fail("container_ids must be a non-empty array.", 422);
      if (!destination) return fail("destination_command_id is required.", 422);

      // Source command is derived from the containers before authorization.
      const first = one<{ owning_command: string; state: string }>(
        "SELECT owning_command, state FROM containers WHERE id = ?",
        containerIds[0]
      );
      if (!first) return fail(`Unknown container ${containerIds[0]}.`, 404);
      requireRequest(request, {
        action: "MATERIAL_TRANSFER",
        resource_type: "custody_transfer",
        resource_id: "new",
        resource_command_id: first.owning_command,
        facility_id: principal?.facility_id ?? null,
        lifecycle_state: first.state,
      });

      return ok(
        createTransfer({
          container_ids: containerIds,
          destination_command_id: destination,
          actor: principal?.subject_id ?? str(body.actor) ?? "UNKNOWN",
          deployment_order: str(body.deployment_order) ?? undefined,
          due_at: str(body.due_at) ?? undefined,
          notes: str(body.notes) ?? undefined,
        })
      );
    }

    return fail("action must be TRANSFER or UNUSED_RETURN.", 422);
  } catch (e) {
    if (e instanceof AuthorizationDeniedError) return forbidden(e.message, e.decision);
    return fail(e instanceof Error ? e.message : "Transfer failed.", 422);
  }
}
