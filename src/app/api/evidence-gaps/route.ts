import { ok } from "@/lib/http";
import { evidenceGaps } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(evidenceGaps());
}
