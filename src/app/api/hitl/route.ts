import { ok } from "@/lib/http";
import { listHitl } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(listHitl());
}
