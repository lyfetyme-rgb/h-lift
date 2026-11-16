import { ok } from "@/lib/http";
import { inventoryByMaterial } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(inventoryByMaterial());
}
