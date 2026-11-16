import { ok } from "@/lib/http";
import { listSyncNodes } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(listSyncNodes());
}
