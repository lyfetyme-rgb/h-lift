import { ok } from "@/lib/http";
import { listMaterials } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(listMaterials());
}
