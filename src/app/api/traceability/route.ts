import { ok } from "@/lib/http";
import { missionSummaries } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(missionSummaries());
}
