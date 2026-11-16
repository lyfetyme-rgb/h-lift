import { ok } from "@/lib/http";
import { expirations } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(expirations());
}
