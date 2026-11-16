import { ok } from "@/lib/http";
import { principalFromRequest, listPrincipals, roleLabel } from "@/lib/identity";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const current = principalFromRequest(request);
  return ok({
    current,
    role_label: roleLabel(current),
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
