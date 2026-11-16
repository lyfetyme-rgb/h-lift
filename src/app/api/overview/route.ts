import { ok } from "@/lib/http";
import { overview } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(overview());
}
