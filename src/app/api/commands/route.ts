import { fail, forbidden, ok, readJson, str } from "@/lib/http";
import { all, one, run } from "@/lib/db";
import { authorize, requireRequest } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";

export const dynamic = "force-dynamic";

const LEVELS = ["HQ", "TYPE_COMMAND", "REGION", "INSTALLATION", "TENANT", "UNIT"];

export function GET() {
  const commands = all<Record<string, unknown>>(
    `SELECT c.id, c.code, c.name, c.level, c.parent_id, p.name AS parent_name
       FROM commands c
       LEFT JOIN commands p ON p.id = c.parent_id
      ORDER BY c.level, c.code`
  );
  return ok({ commands });
}

export async function POST(request: Request) {
  try {
    const principal = await currentPrincipal();
    requireRequest(request, {
      action: "SECURITY_CONFIGURATION_MANAGE",
      resource_type: "command",
      resource_id: "new",
    });

    const body = await readJson(request);
    const code = str(body.code)?.toUpperCase();
    const name = str(body.name);
    const level = str(body.level)?.toUpperCase();
    const parentId = str(body.parent_id);
    const description = str(body.description);

    if (!code) return fail("code is required.", 422);
    if (!name) return fail("name is required.", 422);
    if (!level || !LEVELS.includes(level)) {
      return fail(`level must be one of ${LEVELS.join(", ")}.`, 422);
    }
    if (parentId) {
      const parent = one("SELECT id FROM commands WHERE id = ?", parentId);
      if (!parent) return fail(`Unknown parent command ${parentId}.`, 404);
    }
    const existing = one("SELECT id FROM commands WHERE code = ? OR id = ?", code, code.toLowerCase());
    if (existing) return fail(`Command ${code} already exists.`, 409);

    const id = code.toLowerCase();
    const now = new Date().toISOString();
    run(
      `INSERT INTO commands (id, code, name, level, parent_id, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      code,
      name,
      level,
      parentId ?? null,
      description ?? null,
      now
    );

    return ok({ id, code, name, level, parent_id: parentId ?? null });
  } catch (e) {
    if (e && typeof e === "object" && "decision" in e) {
      return (await import("@/lib/http")).forbidden((e as { message?: string }).message ?? "Denied", (e as any).decision);
    }
    return fail(e instanceof Error ? e.message : "Unable to create command.", 422);
  }
}
