import { ok } from "@/lib/http";
import { overview } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok({
    service: "h-lift-traceability",
    version: "0.1.0",
    status: "ok",
    time: new Date().toISOString(),
    summary: overview(),
  });
}
