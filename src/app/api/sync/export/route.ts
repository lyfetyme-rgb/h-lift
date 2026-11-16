import { NextResponse } from "next/server";
import { fail, forbidden, readJson, str } from "@/lib/http";
import { requireRequest } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { exportSnapshot } from "@/lib/sync-snapshot";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await currentPrincipal();
    const actor = principal?.subject_id ?? "UNKNOWN";
    requireRequest(request, {
      action: "SECURITY_CONFIGURATION_MANAGE",
      resource_type: "sync_snapshot",
      resource_id: "export",
    });

    const body = await readJson(request);
    const source = str(body.source_command_id) ?? principal?.command_id ?? null;
    if (!source) return fail("source_command_id is required.", 422);

    const { snapshot_id, snapshot_hash, bundle } = exportSnapshot(source, actor);
    return NextResponse.json(
      { snapshot_id, snapshot_hash, bundle },
      {
        status: 200,
        headers: {
          "Content-Disposition": `attachment; filename="hlift-snapshot-${snapshot_id}.json"`,
        },
      }
    );
  } catch (e) {
    if (e && typeof e === "object" && "decision" in e) {
      return forbidden((e as { message?: string }).message ?? "Denied", (e as any).decision);
    }
    return fail(e instanceof Error ? e.message : "Export failed.", 422);
  }
}
