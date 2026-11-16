import { ok } from "@/lib/http";
import { listConflicts } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(listConflicts());
}
