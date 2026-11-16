import { ok } from "@/lib/http";
import { listTransactions } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(listTransactions());
}
