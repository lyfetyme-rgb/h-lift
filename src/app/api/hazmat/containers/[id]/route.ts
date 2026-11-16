import { fail, ok } from "@/lib/http";
import { containerDetail } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const detail = containerDetail(id);
  if (!detail) return fail(`Unknown container ${id}.`, 404);
  return ok(detail);
}
