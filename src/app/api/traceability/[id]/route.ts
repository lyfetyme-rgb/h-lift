import { fail, ok } from "@/lib/http";
import { missionDetail } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const detail = missionDetail(id);
  if (!detail) return fail(`Mission requirement ${id} not found.`, 404);
  return ok(detail);
}
