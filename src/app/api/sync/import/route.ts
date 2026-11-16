import { fail, forbidden, ok, readJson, str } from "@/lib/http";
import { requireRequest } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { importSnapshot } from "@/lib/sync-snapshot";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await currentPrincipal();
    const actor = principal?.subject_id ?? "UNKNOWN";
    requireRequest(request, {
      action: "SECURITY_CONFIGURATION_MANAGE",
      resource_type: "sync_snapshot",
      resource_id: "import",
    });

    const body = (await readJson(request)) as any;
    const bundle = body?.bundle ?? body;
    const target = str(body?.target_command_id) ?? principal?.command_id ?? null;
    if (!target) return fail("target_command_id is required.", 422);

    return ok(importSnapshot(bundle, target, actor));
  } catch (e) {
    if (e && typeof e === "object" && "decision" in e) {
      return forbidden((e as { message?: string }).message ?? "Denied", (e as any).decision);
    }
    return fail(e instanceof Error ? e.message : "Import failed.", 400);
  }
}
