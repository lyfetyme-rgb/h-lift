import { ok } from "@/lib/http";
import { listInspections } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(listInspections());
}
