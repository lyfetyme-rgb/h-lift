import { ok } from "@/lib/http";
import { quarterlyChecks } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(quarterlyChecks());
}
