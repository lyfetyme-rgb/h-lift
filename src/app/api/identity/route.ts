import { ok } from "@/lib/http";
import { principalFromRequest, listPrincipals, roleLabel, signedAssertionsRequired } from "@/lib/identity";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const current = principalFromRequest(request);
  return ok({
    current,
    role_label: roleLabel(current),
    // With signed assertions the subject comes from the IdP token, not a
    // browser-writable cookie, so the console must not offer principal switching.
    switchable: !signedAssertionsRequired(),
    principals: listPrincipals().map((p) => ({
      subject_id: p.subject_id,
      display_name: p.display_name,
      role_label: roleLabel(p),
      command_id: p.command_id,
      facility_id: p.facility_id,
      credential_assurance: p.credential_assurance,
      capabilities: p.capabilities,
    })),
  });
}
