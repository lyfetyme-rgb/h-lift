import { ok } from "@/lib/http";
import { listApprovals } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(listApprovals());
}
