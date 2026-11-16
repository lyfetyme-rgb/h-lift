import { ok } from "@/lib/http";
import { listContainers } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(listContainers());
}
