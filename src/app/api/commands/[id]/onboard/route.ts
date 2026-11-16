import { fail, forbidden, ok, readJson, str } from "@/lib/http";
import { all, one, run } from "@/lib/db";
import { requireRequest } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    requireRequest(request, {
      action: "SECURITY_CONFIGURATION_MANAGE",
      resource_type: "command",
      resource_id: id,
    });

    const cmd = one("SELECT id, code, name FROM commands WHERE id = ? OR code = ?", id, id.toUpperCase());
    if (!cmd) return fail(`Unknown command ${id}.`, 404);

    const body = await readJson(request);
    const subjectId = str(body.subject_id);
    const displayName = str(body.display_name);
    const email = str(body.email);
    const roleCode = str(body.role_code)?.toUpperCase();
    const facilityId = str(body.facility_id);
    const assurance = (str(body.credential_assurance) ?? "HIGH").toUpperCase();

    if (!subjectId) return fail("subject_id is required.", 422);
    if (!displayName) return fail("display_name is required.", 422);
    if (!roleCode) return fail("role_code is required.", 422);

    const role = one<{ id: string }>("SELECT id FROM roles WHERE code = ?", roleCode);
    if (!role) return fail(`Unknown role ${roleCode}.`, 422);

    const existing = one("SELECT id FROM principals WHERE subject_id = ?", subjectId);
    if (existing) return fail(`Principal ${subjectId} already exists.`, 409);

    const now = new Date().toISOString();
    const principalId = `pr-${subjectId.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
    run(
      `INSERT INTO principals (id, subject_id, display_name, email, command_id, facility_id, credential_assurance, idp_issuer, status, attributes, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'demo.dod.idp', 'ACTIVE', ?, ?, ?)`,
      principalId,
      subjectId,
      displayName,
      email ?? null,
      cmd.id,
      facilityId ?? null,
      assurance,
      JSON.stringify({ onboarded: true, command: cmd.code }),
      now,
      now
    );
    run(
      `INSERT INTO principal_roles (id, principal_id, role_id, command_id, facility_id, assigned_at, assigned_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      `prr-${Date.now().toString(36)}`,
      principalId,
      role.id,
      cmd.id,
      facilityId ?? null,
      now,
      (await currentPrincipal())?.subject_id ?? "system"
    );

    return ok({ principal_id: principalId, subject_id: subjectId, command_id: cmd.id, role: roleCode });
  } catch (e) {
    if (e && typeof e === "object" && "decision" in e) {
      return forbidden((e as { message?: string }).message ?? "Denied", (e as any).decision);
    }
    return fail(e instanceof Error ? e.message : "Unable to onboard principal.", 422);
  }
}
